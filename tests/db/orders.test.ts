// place_order pricing, stock, coupons and the order status flow.
import type { PGlite } from "@electric-sql/pglite";
import { beforeAll, describe, expect, it } from "vitest";
import {
  as,
  createAddress,
  createProduct,
  createUser,
  freshDb,
  one,
  placeOrder,
  tryAs,
  user,
} from "./harness";

let db: PGlite;
let alice: string, aliceAddr: string, staff: string;

beforeAll(async () => {
  db = await freshDb();
  // Known settings for the money assertions.
  await db.query(`update public.store_settings set delivery_fee = 25, free_delivery_threshold = 1000, min_order_amount = 50,
    delivery_slots = '["10:00-12:00"]'::jsonb where id = 1`);
  alice = await createUser(db, "alice@test.local");
  aliceAddr = await createAddress(db, alice);
  staff = await createUser(db, "staff@test.local", ["staff"]);
});

const order = (id: string) =>
  one<{
    subtotal: string;
    delivery_fee: string;
    discount: string;
    total: string;
    status: string;
    coupon_code: string | null;
  }>(
    db,
    `select subtotal, delivery_fee, discount, total, status, coupon_code from public.orders where id = $1`,
    [id],
  );
const stockOf = async (variantId: string) =>
  Number(
    (
      await one<{ stock: number }>(db, `select stock from public.product_variants where id = $1`, [
        variantId,
      ])
    ).stock,
  );
const coupon = async (code: string, extra: Record<string, unknown> = {}) => {
  const cols = { code, discount_type: "fixed", value: 10, min_order: 0, ...extra };
  const keys = Object.keys(cols);
  await db.query(
    `insert into public.coupons(${keys.join(",")}) values (${keys.map((_, i) => `$${i + 1}`).join(",")})`,
    Object.values(cols),
  );
};

describe("place_order computes money on the server", () => {
  it("ignores client-sent prices and totals", async () => {
    const { productId, variantId } = await createProduct(db, { price: 200, stock: 10 });
    const id = await placeOrder(db, alice, aliceAddr, [
      {
        product_id: productId,
        variant_id: variantId,
        quantity: 2,
        price: 1,
        unit_price: 1,
        line_total: 1,
        total: 1,
        discount: 999,
      },
    ]);
    expect(await order(id)).toMatchObject({
      subtotal: "400.00",
      delivery_fee: "25.00",
      discount: "0.00",
      total: "425.00",
    });
    const item = await one<{ unit_price: string; line_total: string }>(
      db,
      `select unit_price, line_total from public.order_items where order_id = $1`,
      [id],
    );
    expect(item).toEqual({ unit_price: "200.00", line_total: "400.00" });
  });

  it("uses the variant price override and an active flash price", async () => {
    const v = await createProduct(db, { price: 200, variantPrice: 150, stock: 10 });
    const a = await placeOrder(db, alice, aliceAddr, [
      { product_id: v.productId, variant_id: v.variantId, quantity: 1 },
    ]);
    expect((await order(a)).subtotal).toBe("150.00");
    const f = await createProduct(db, { price: 200, stock: 10 });
    await db.query(
      `update public.products set flash_price = 120, flash_ends_at = now() + interval '1 day' where id = $1`,
      [f.productId],
    );
    const b = await placeOrder(db, alice, aliceAddr, [
      { product_id: f.productId, variant_id: f.variantId, quantity: 1 },
    ]);
    expect((await order(b)).subtotal).toBe("120.00");
  });

  it("applies free delivery above the threshold and rejects orders under the minimum", async () => {
    const { productId, variantId } = await createProduct(db, { price: 600, stock: 10 });
    const id = await placeOrder(db, alice, aliceAddr, [
      { product_id: productId, variant_id: variantId, quantity: 2 },
    ]);
    expect((await order(id)).delivery_fee).toBe("0.00");
    const cheap = await createProduct(db, { price: 10, stock: 10 });
    await expect(
      placeOrder(db, alice, aliceAddr, [
        { product_id: cheap.productId, variant_id: cheap.variantId, quantity: 1 },
      ]),
    ).rejects.toThrow(/below_min_order/);
  });

  it("rejects bad input: fractional/huge quantities, unknown slot, too many lines", async () => {
    const { productId, variantId } = await createProduct(db, { price: 100, stock: 500 });
    for (const q of [0, -1, 1.5, 100, "abc"]) {
      await expect(
        placeOrder(db, alice, aliceAddr, [
          { product_id: productId, variant_id: variantId, quantity: q },
        ]),
        String(q),
      ).rejects.toThrow(/invalid_quantity/);
    }
    const slot = await tryAs(db, user(alice), (tx) =>
      tx.query(`select public.place_order($1::jsonb, $2, '03:00-04:00', 'cod', '', null)`, [
        JSON.stringify([{ product_id: productId, variant_id: variantId, quantity: 1 }]),
        aliceAddr,
      ]),
    );
    expect(slot).toMatch(/invalid_slot/);
    const many = Array.from({ length: 51 }, () => ({
      product_id: productId,
      variant_id: variantId,
      quantity: 1,
    }));
    await expect(placeOrder(db, alice, aliceAddr, many)).rejects.toThrow(/too_many_items/);
  });

  it("rejects online payment while the online_payment flag is off", async () => {
    const { productId, variantId } = await createProduct(db, { price: 100, stock: 5 });
    const err = await tryAs(db, user(alice), (tx) =>
      tx.query(`select public.place_order($1::jsonb, $2, 'asap', 'online', '', null)`, [
        JSON.stringify([{ product_id: productId, variant_id: variantId, quantity: 1 }]),
        aliceAddr,
      ]),
    );
    expect(err).toMatch(/payment_unavailable/);
  });

  it("refuses another customer's address", async () => {
    const bob = await createUser(db, "bob-addr@test.local");
    const bobAddr = await createAddress(db, bob);
    const { productId, variantId } = await createProduct(db, { price: 100, stock: 5 });
    await expect(
      placeOrder(db, alice, bobAddr, [
        { product_id: productId, variant_id: variantId, quantity: 1 },
      ]),
    ).rejects.toThrow(/invalid_address/);
  });
});

describe("stock", () => {
  it("never oversells: stock 5, six one-unit orders -> five succeed, stock 0", async () => {
    const { productId, variantId } = await createProduct(db, { price: 100, stock: 5 });
    const results = [];
    for (let i = 0; i < 6; i++) {
      results.push(
        await placeOrder(db, alice, aliceAddr, [
          { product_id: productId, variant_id: variantId, quantity: 1 },
        ]).then(
          () => "ok",
          (e) => String(e.message),
        ),
      );
    }
    expect(results.filter((r) => r === "ok")).toHaveLength(5);
    expect(results[5]).toMatch(/out_of_stock/);
    expect(await stockOf(variantId)).toBe(0);
  });

  it("merges duplicate lines before checking stock", async () => {
    const { productId, variantId } = await createProduct(db, { price: 100, stock: 5 });
    const line = { product_id: productId, variant_id: variantId, quantity: 3 };
    await expect(placeOrder(db, alice, aliceAddr, [line, line])).rejects.toThrow(/out_of_stock/);
    expect(await stockOf(variantId)).toBe(5);
  });

  it("stock can never be set negative", async () => {
    const { variantId } = await createProduct(db, { stock: 1 });
    await expect(
      db.query(`update public.product_variants set stock = -1 where id = $1`, [variantId]),
    ).rejects.toThrow(/stock_nonneg/);
  });

  it("keeps the product stock total in sync with its variants", async () => {
    const { productId, variantId } = await createProduct(db, { price: 100, stock: 7 });
    await placeOrder(db, alice, aliceAddr, [
      { product_id: productId, variant_id: variantId, quantity: 2 },
    ]);
    const p = await one<{ stock: number }>(db, `select stock from public.products where id = $1`, [
      productId,
    ]);
    expect(Number(p.stock)).toBe(5);
  });
});

describe("coupons", () => {
  it("max_uses = 3 -> exactly three orders get the discount", async () => {
    await coupon("THREE", { max_uses: 3 });
    const { productId, variantId } = await createProduct(db, { price: 100, stock: 50 });
    const results = [];
    for (let i = 0; i < 5; i++) {
      results.push(
        await placeOrder(
          db,
          alice,
          aliceAddr,
          [{ product_id: productId, variant_id: variantId, quantity: 1 }],
          "three",
        ).then(
          () => "ok",
          (e) => String(e.message),
        ),
      );
    }
    expect(results.filter((r) => r === "ok")).toHaveLength(3);
    expect(results[3]).toMatch(/invalid_coupon: exhausted/);
    expect(
      (
        await one<{ used_count: number }>(
          db,
          `select used_count from public.coupons where code = 'THREE'`,
        )
      ).used_count,
    ).toBe(3);
  });

  it("per_user_limit = 1 blocks a second use by the same customer", async () => {
    await coupon("ONCE", { per_user_limit: 1 });
    const { productId, variantId } = await createProduct(db, { price: 100, stock: 50 });
    const line = [{ product_id: productId, variant_id: variantId, quantity: 1 }];
    const first = await placeOrder(db, alice, aliceAddr, line, "ONCE");
    expect((await order(first)).discount).toBe("10.00");
    await expect(placeOrder(db, alice, aliceAddr, line, "ONCE")).rejects.toThrow(/per_user_limit/);
  });

  it("caps percent discounts at max_discount and never exceeds the subtotal", async () => {
    await coupon("HALF", { discount_type: "percent", value: 50, max_discount: 30 });
    await coupon("HUGE", { discount_type: "fixed", value: 5000 });
    const { productId, variantId } = await createProduct(db, { price: 100, stock: 50 });
    const line = [{ product_id: productId, variant_id: variantId, quantity: 1 }];
    expect((await order(await placeOrder(db, alice, aliceAddr, line, "HALF"))).discount).toBe(
      "30.00",
    );
    const huge = await order(await placeOrder(db, alice, aliceAddr, line, "HUGE"));
    expect(huge.discount).toBe("100.00");
    expect(Number(huge.total)).toBeGreaterThanOrEqual(0);
  });

  it("expired and inactive coupons are rejected", async () => {
    await coupon("OLD", { ends_at: new Date(Date.now() - 86_400_000).toISOString() });
    await coupon("OFF", { is_active: false });
    const { productId, variantId } = await createProduct(db, { price: 100, stock: 50 });
    const line = [{ product_id: productId, variant_id: variantId, quantity: 1 }];
    await expect(placeOrder(db, alice, aliceAddr, line, "OLD")).rejects.toThrow(/invalid_coupon/);
    await expect(placeOrder(db, alice, aliceAddr, line, "OFF")).rejects.toThrow(/invalid_coupon/);
  });

  it("validate_coupon is rate limited after 10 wrong guesses", async () => {
    const guesser = await createUser(db, "guesser@test.local");
    const reasons = [];
    for (let i = 0; i < 11; i++) {
      reasons.push(
        await as(
          db,
          user(guesser),
          async (tx) =>
            (
              await tx.query<{ r: string }>(`select public.validate_coupon($1, 100)->>'reason' r`, [
                `NOPE${i}`,
              ])
            ).rows[0].r,
        ),
      );
    }
    expect(reasons.slice(0, 10).every((r) => r === "not_found")).toBe(true);
    expect(reasons[10]).toBe("rate_limited");
  });
});

describe("order status flow", () => {
  const newOrder = async (stock = 10, couponCode = "") => {
    const p = await createProduct(db, { price: 100, stock });
    const id = await placeOrder(
      db,
      alice,
      aliceAddr,
      [{ product_id: p.productId, variant_id: p.variantId, quantity: 2 }],
      couponCode,
    );
    return { id, ...p };
  };
  const setStatus = (id: string, s: string) =>
    tryAs(db, user(staff), (tx) =>
      tx.query(`update public.orders set status = $1 where id = $2`, [s, id]),
    );

  it("allows the forward flow", async () => {
    const { id } = await newOrder();
    for (const s of ["confirmed", "preparing", "out_for_delivery", "delivered"])
      expect(await setStatus(id, s), s).toBeNull();
  });

  it.each([
    ["pending", "delivered"],
    ["pending", "out_for_delivery"],
    ["delivered", "pending"],
    ["cancelled", "confirmed"],
  ])("rejects %s -> %s", async (from, to) => {
    const { id } = await newOrder();
    const path: Record<string, string[]> = {
      pending: [],
      delivered: ["confirmed", "preparing", "out_for_delivery", "delivered"],
      cancelled: ["cancelled"],
    };
    for (const s of path[from]) expect(await setStatus(id, s)).toBeNull();
    expect(await setStatus(id, to)).toMatch(/invalid_transition/);
  });

  it("cancelling restores variant stock, product stock, sold_count and coupon use", async () => {
    await coupon("BACK", { max_uses: 1 });
    const { id, productId, variantId } = await newOrder(10, "BACK");
    expect(await stockOf(variantId)).toBe(8);
    expect(await setStatus(id, "confirmed")).toBeNull();
    expect(await setStatus(id, "cancelled")).toBeNull();
    expect(await stockOf(variantId)).toBe(10);
    const p = await one<{ stock: number; sold_count: number }>(
      db,
      `select stock, sold_count from public.products where id = $1`,
      [productId],
    );
    expect({ stock: Number(p.stock), sold: Number(p.sold_count) }).toEqual({ stock: 10, sold: 0 });
    expect(
      (
        await one<{ used_count: number }>(
          db,
          `select used_count from public.coupons where code = 'BACK'`,
        )
      ).used_count,
    ).toBe(0);
    expect(
      (
        await one<{ n: number }>(
          db,
          `select count(*)::int n from public.coupon_redemptions where order_id = $1`,
          [id],
        )
      ).n,
    ).toBe(0);
  });

  it("customers can cancel only their own pending orders", async () => {
    const { id } = await newOrder();
    const mallory = await createUser(db, "mallory@test.local");
    expect(
      await tryAs(db, user(mallory), (tx) => tx.query(`select public.cancel_my_order($1)`, [id])),
    ).toMatch(/cannot_cancel/);
    expect(await setStatus(id, "confirmed")).toBeNull();
    expect(
      await tryAs(db, user(alice), (tx) => tx.query(`select public.cancel_my_order($1)`, [id])),
    ).toMatch(/cannot_cancel/);
  });

  it("logs every status change in the history", async () => {
    const { id } = await newOrder();
    await setStatus(id, "confirmed");
    const h = await db.query<{ status: string }>(
      `select status from public.order_status_history where order_id = $1 order by created_at, status`,
      [id],
    );
    expect(h.rows.map((r) => r.status).sort()).toEqual(["confirmed", "pending"]);
  });
});
