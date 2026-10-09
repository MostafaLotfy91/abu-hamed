// Driver cash and earnings: the append-only ledger, delivery entries, settlements, adjustments, reversals,
// COD mismatch review, balances and access rules.
import type { PGlite } from "@electric-sql/pglite";
import { beforeEach, describe, expect, it } from "vitest";
import {
  anon,
  as,
  createAddress,
  createProduct,
  createUser,
  freshDb,
  one,
  service,
  tryAs,
  user,
} from "./harness";

let db: PGlite;
let customer: string, addr: string, admin: string, staff: string, d1: string, d2: string;
let productId: string, variantId: string;

beforeEach(async () => {
  db = await freshDb();
  // Product 100 + delivery 30 = order total 130 (no free delivery).
  await db.query(
    `update public.store_settings set min_order_amount = 0, delivery_fee = 30, free_delivery_threshold = null,
       driver_commission_type = 'fixed', driver_commission_value = 20,
       features = features || '{"delivery_tracking": true, "online_payment": true}'::jsonb where id = 1`,
  );
  customer = await createUser(db, "fc@test.local");
  addr = await createAddress(db, customer);
  admin = await createUser(db, "fa@test.local", ["admin"]);
  staff = await createUser(db, "fs@test.local", ["staff"]);
  d1 = await createUser(db, "fd1@test.local", ["driver"]);
  d2 = await createUser(db, "fd2@test.local", ["driver"]);
  ({ productId, variantId } = await createProduct(db, { price: 100, stock: 100 }));
});

async function order(payment: "cod" | "online" = "cod", driver = d1) {
  const id = await as(db, user(customer), async (tx) => {
    const { rows } = await tx.query<{ id: string }>(
      `select public.place_order($1::jsonb, $2, 'asap', $3, '', null) as id`,
      [
        JSON.stringify([{ product_id: productId, variant_id: variantId, quantity: 1 }]),
        addr,
        payment,
      ],
    );
    return rows[0].id;
  });
  await db.query(`update public.orders set status = 'confirmed', driver_id = $2 where id = $1`, [
    id,
    driver,
  ]);
  await as(db, user(driver), (tx) =>
    tx.query(`select public.driver_set_status($1, 'out_for_delivery')`, [id]),
  );
  return id;
}

const markDelivered = (
  driver: string,
  orderId: string,
  collected: number | null,
  reason?: string,
) =>
  as(db, user(driver), async (tx) => {
    const { rows } = await tx.query<{ r: string }>(
      `select public.driver_mark_delivered($1, $2, $3) as r`,
      [orderId, collected, reason ?? null],
    );
    return rows[0].r;
  });

async function delivered(payment: "cod" | "online" = "cod", driver = d1) {
  const id = await order(payment, driver);
  await markDelivered(driver, id, payment === "cod" ? 130 : null);
  return id;
}

type Entry = { type: string; amount: string; affects_cash: boolean };
const entries = async (orderId: string) =>
  (
    await db.query<Entry>(
      `select type, amount::text, affects_cash from public.driver_ledger where order_id = $1 order by created_at, type`,
      [orderId],
    )
  ).rows;

const balance = (driver: string, who = driver) =>
  as(db, user(who), async (tx) => {
    const { rows } = await tx.query<Record<string, string>>(
      `select cash_collected::text, commission_earned::text, settlements_paid::text, adjustments::text,
              cash_held::text, owed_to_store::text, commission_payable::text
         from public.driver_balance where driver_id = $1`,
      [driver],
    );
    return rows[0];
  });

const settle = (who: string, driver: string, amount: number, note?: string) =>
  as(db, user(who), async (tx) => {
    const { rows } = await tx.query<Record<string, string>>(
      `select settlement_id, expected_amount::text, received_amount::text, difference::text, balance_after::text
         from public.admin_record_settlement($1, $2, $3)`,
      [driver, amount, note ?? null],
    );
    return rows[0];
  });

const adjust = (who: string, driver: string, amount: number, reason: string, orderId?: string) =>
  as(db, user(who), (tx) =>
    tx.query(`select public.admin_add_adjustment($1, $2, $3, $4)`, [
      driver,
      amount,
      reason,
      orderId ?? null,
    ]),
  );

describe("delivery entries", () => {
  it("a delivered COD order writes one COD entry (order total) and one commission entry", async () => {
    const o = await delivered();
    expect(await entries(o)).toEqual([
      { type: "cod_collected", amount: "130.00", affects_cash: true },
      { type: "commission_earned", amount: "-20.00", affects_cash: true },
    ]);
  });

  it("exactly one of each even if the delivered event runs twice", async () => {
    const o = await delivered();
    const again = await one<{ r: string }>(db, `select public.record_delivery_financials($1) r`, [
      o,
    ]);
    expect(again.r).toBe("already_recorded");
    // The trigger itself firing again (a no-op status write) changes nothing either.
    await db.query(`update public.orders set status = 'delivered' where id = $1`, [o]);
    expect((await entries(o)).length).toBe(2);
    // And the unique index rejects a direct duplicate.
    await expect(
      db.query(
        `insert into public.driver_ledger(driver_id, order_id, type, amount) values ($1, $2, 'cod_collected', 130)`,
        [d1, o],
      ),
    ).rejects.toThrow(/duplicate key/);
  });

  it("paid-online orders: COD entry of 0, commission still earned", async () => {
    const o = await delivered("online");
    expect(await entries(o)).toEqual([
      { type: "cod_collected", amount: "0.00", affects_cash: true },
      { type: "commission_earned", amount: "-20.00", affects_cash: true },
    ]);
    expect((await balance(d1)).owed_to_store).toBe("-20.00"); // the store owes the driver
  });

  it("cancelled orders (before delivery) create no entries", async () => {
    const o = await order();
    await db.query(`update public.orders set status = 'cancelled' where id = $1`, [o]);
    expect(await entries(o)).toEqual([]);
  });

  it("commission: percent of the delivery fee, rounded to 2 decimals; per-driver override wins", async () => {
    await db.query(
      `update public.store_settings set driver_commission_type = 'percent_of_delivery_fee', driver_commission_value = 33.33`,
    );
    const a = await delivered();
    // 30 * 33.33% = 9.999 -> 10.00
    expect((await entries(a))[1]).toMatchObject({ amount: "-10.00" });
    await as(db, user(admin), (tx) =>
      tx.query(
        `insert into public.driver_payout_settings(driver_id, commission_type, commission_value) values ($1, 'fixed', 12.5)`,
        [d1],
      ),
    );
    const b = await delivered();
    expect((await entries(b))[1]).toMatchObject({ amount: "-12.50" });
    const r = await one<{ a: string; b: string; c: string }>(
      db,
      `select public.driver_commission('percent_of_delivery_fee', 12.5, 25)::text a,
              public.driver_commission('percent_of_delivery_fee', 10, 0.05)::text b,
              public.driver_commission('fixed', 7.005, 0)::text c`,
    );
    expect(r).toEqual({ a: "3.13", b: "0.01", c: "7.01" }); // 3.125 -> 3.13, 0.005 -> 0.01 (half away from 0)
  });

  it("commission not kept from cash: recorded but payable separately", async () => {
    await db.query(`update public.store_settings set driver_keeps_commission_from_cash = false`);
    const o = await delivered();
    expect((await entries(o))[1]).toEqual({
      type: "commission_earned",
      amount: "-20.00",
      affects_cash: false,
    });
    expect(await balance(d1)).toMatchObject({
      owed_to_store: "130.00",
      commission_payable: "20.00",
      cash_held: "130.00",
    });
  });

  it("an order delivered by the store without a driver writes nothing", async () => {
    const id = await order();
    await db.query(`update public.orders set driver_id = null where id = $1`, [id]);
    await db.query(`update public.orders set status = 'delivered' where id = $1`, [id]);
    expect(await entries(id)).toEqual([]);
  });
});

describe("COD amount confirmation", () => {
  it("the driver must give the collected amount; a different amount needs a reason and flags the order", async () => {
    const o = await order();
    expect(
      await tryAs(db, user(d1), (tx) => tx.query(`select public.driver_mark_delivered($1)`, [o])),
    ).toMatch(/amount_required/);
    expect(
      await tryAs(db, user(d1), (tx) =>
        tx.query(`select public.driver_mark_delivered($1, 100)`, [o]),
      ),
    ).toMatch(/reason_required/);
    expect(await markDelivered(d1, o, 100, "العميل دفع 100 بس")).toBe("flagged");
    const c = await one(
      db,
      `select expected_amount::text, collected_amount::text, review_status from public.cod_collections where order_id = $1`,
      [o],
    );
    expect(c).toEqual({
      expected_amount: "130.00",
      collected_amount: "100.00",
      review_status: "pending_review",
    });
    // The ledger keeps the expected amount until an admin decides.
    expect((await entries(o))[0]).toMatchObject({ type: "cod_collected", amount: "130.00" });
  });

  it("admin resolves the review with an adjustment for the order", async () => {
    const o = await order();
    await markDelivered(d1, o, 100, "العميل دفع 100 بس");
    expect(
      await tryAs(db, user(staff), (tx) =>
        tx.query(`select public.admin_resolve_cod_review($1, -30, 'ok')`, [o]),
      ),
    ).toMatch(/forbidden/);
    await as(db, user(admin), (tx) =>
      tx.query(`select public.admin_resolve_cod_review($1, -30, 'خصم متفق عليه')`, [o]),
    );
    expect((await entries(o)).map((e) => [e.type, e.amount])).toContainEqual([
      "adjustment",
      "-30.00",
    ]);
    expect((await balance(d1)).owed_to_store).toBe("80.00"); // 130 - 20 - 30
    const c = await one<{ review_status: string }>(
      db,
      `select review_status from public.cod_collections where order_id = $1`,
      [o],
    );
    expect(c.review_status).toBe("resolved");
  });

  it("only the assigned driver, only out for delivery", async () => {
    const o = await order();
    expect(
      await tryAs(db, user(d2), (tx) =>
        tx.query(`select public.driver_mark_delivered($1, 130)`, [o]),
      ),
    ).toMatch(/invalid_transition/);
    expect(await markDelivered(d1, o, 130)).toBe("delivered");
    expect(
      await tryAs(db, user(d1), (tx) =>
        tx.query(`select public.driver_mark_delivered($1, 130)`, [o]),
      ),
    ).toMatch(/invalid_transition/);
  });
});

describe("append-only", () => {
  it("ledger and settlement rows cannot be updated or deleted, even by the service role", async () => {
    const o = await delivered();
    await settle(admin, d1, 110);
    for (const sql of [
      `update public.driver_ledger set amount = 0`,
      `delete from public.driver_ledger`,
      `update public.driver_settlements set received_amount = 0`,
      `delete from public.driver_settlements`,
    ]) {
      await expect(db.query(sql)).rejects.toThrow(/append-only/);
      expect(await tryAs(db, service, (tx) => tx.query(sql))).toMatch(
        /append-only|permission denied/,
      );
    }
    await expect(db.query(`truncate public.driver_ledger cascade`)).rejects.toThrow(/append-only/);
    expect((await entries(o)).length).toBe(2);
  });

  it("clients cannot write entries directly; reversals must mirror their entry", async () => {
    const o = await delivered();
    for (const who of [user(d1), user(admin), anon])
      expect(
        await tryAs(db, who, (tx) =>
          tx.query(
            `insert into public.driver_ledger(driver_id, type, amount, note) values ($1, 'adjustment', -999, 'free money')`,
            [d1],
          ),
        ),
      ).toMatch(/permission denied/);
    const cod = await one<{ id: string }>(
      db,
      `select id from public.driver_ledger where order_id = $1 and type = 'cod_collected'`,
      [o],
    );
    await expect(
      db.query(
        `insert into public.driver_ledger(driver_id, order_id, type, amount, reverses_id) values ($1, $2, 'reversal', -100, $3)`,
        [d1, o, cod.id],
      ),
    ).rejects.toThrow(/invalid_reversal/);
  });
});

describe("reversals", () => {
  it("admin reverses a delivery: both entries mirrored once, nothing deleted", async () => {
    const o = await delivered();
    expect(
      await tryAs(db, user(staff), (tx) =>
        tx.query(`select public.admin_reverse_delivery($1, 'رفض الاستلام')`, [o]),
      ),
    ).toMatch(/forbidden/);
    const n = await as(db, user(admin), async (tx) => {
      const { rows } = await tx.query<{ n: number }>(
        `select public.admin_reverse_delivery($1, 'العميل رفض الاستلام') n`,
        [o],
      );
      return rows[0].n;
    });
    expect(n).toBe(2);
    const again = await as(db, user(admin), async (tx) => {
      const { rows } = await tx.query<{ n: number }>(
        `select public.admin_reverse_delivery($1, 'مرة تانية') n`,
        [o],
      );
      return rows[0].n;
    });
    expect(again).toBe(0);
    expect((await entries(o)).map((e) => [e.type, e.amount])).toEqual([
      ["cod_collected", "130.00"],
      ["commission_earned", "-20.00"],
      ["reversal", "-130.00"],
      ["reversal", "20.00"],
    ]);
    expect(await balance(d1)).toMatchObject({
      cash_collected: "0.00",
      commission_earned: "0.00",
      owed_to_store: "0.00",
    });
  });
});

describe("settlements", () => {
  it("admin receives the balance: settlement row + ledger entry, balance zero", async () => {
    await delivered();
    await delivered();
    const s = await settle(admin, d1, 220);
    expect(s).toMatchObject({
      expected_amount: "220.00",
      received_amount: "220.00",
      difference: "0.00",
      balance_after: "0.00",
    });
    const row = await one(
      db,
      `select expected_amount::text, received_amount::text, difference::text, received_by from public.driver_settlements`,
    );
    expect(row).toEqual({
      expected_amount: "220.00",
      received_amount: "220.00",
      difference: "0.00",
      received_by: admin,
    });
  });

  it("a short payment needs a note and the difference stays owed", async () => {
    await delivered();
    expect(
      await tryAs(db, user(admin), (tx) =>
        tx.query(`select * from public.admin_record_settlement($1, 100)`, [d1]),
      ),
    ).toMatch(/note_required/);
    const s = await settle(admin, d1, 100, "ناقص 10 هيدفعهم بكرة");
    expect(s).toMatchObject({
      expected_amount: "110.00",
      difference: "-10.00",
      balance_after: "10.00",
    });
  });

  it("staff cannot record settlements unless the store allows it; drivers never", async () => {
    await delivered();
    expect(
      await tryAs(db, user(staff), (tx) =>
        tx.query(`select * from public.admin_record_settlement($1, 110)`, [d1]),
      ),
    ).toMatch(/forbidden/);
    expect(
      await tryAs(db, user(d1), (tx) =>
        tx.query(`select * from public.admin_record_settlement($1, 110)`, [d1]),
      ),
    ).toMatch(/forbidden/);
    await db.query(`update public.store_settings set staff_can_record_settlements = true`);
    expect((await settle(staff, d1, 110)).balance_after).toBe("0.00");
    // Adjustments stay admin-only.
    expect(
      await tryAs(db, user(staff), (tx) =>
        tx.query(`select public.admin_add_adjustment($1, 5, 'x y z')`, [d1]),
      ),
    ).toMatch(/forbidden/);
  });

  it("validates amounts", async () => {
    await delivered();
    for (const bad of [0, 10.005])
      expect(
        await tryAs(db, user(admin), (tx) =>
          tx.query(`select * from public.admin_record_settlement($1, $2, 'note here')`, [d1, bad]),
        ),
      ).toMatch(/invalid_amount/);
    expect(
      await tryAs(db, user(admin), (tx) =>
        tx.query(`select * from public.admin_record_settlement($1, 10, 'note here')`, [customer]),
      ),
    ).toMatch(/not_a_driver/);
  });
});

describe("adjustments", () => {
  it("admin only, reason required, non-zero amount", async () => {
    expect(
      await tryAs(db, user(admin), (tx) =>
        tx.query(`select public.admin_add_adjustment($1, 5, '  ')`, [d1]),
      ),
    ).toMatch(/reason_required/);
    expect(
      await tryAs(db, user(admin), (tx) =>
        tx.query(`select public.admin_add_adjustment($1, 0, 'reason')`, [d1]),
      ),
    ).toMatch(/invalid_amount/);
    expect(
      await tryAs(db, user(d1), (tx) =>
        tx.query(`select public.admin_add_adjustment($1, -5, 'reason')`, [d1]),
      ),
    ).toMatch(/forbidden/);
    await adjust(admin, d1, -15.5, "بنزين");
    expect((await balance(d1)).adjustments).toBe("-15.50");
  });
});

describe("balance math", () => {
  it("is correct across a mix of orders, settlements, adjustments and reversals", async () => {
    await delivered(); //             +130 -20  -> 110
    await delivered("online"); //     +0   -20  -> 90
    const c = await delivered(); //   +130 -20  -> 200
    await settle(admin, d1, 150, "دفعة أولى"); // -150 -> 50
    await adjust(admin, d1, 25.25, "عجز في الطلب"); // -> 75.25
    await as(db, user(admin), (tx) =>
      tx.query(`select public.admin_reverse_delivery($1, 'مرتجع على الباب')`, [c]),
    ); //                             -130 +20  -> -34.75
    await delivered("cod", d2); //    other driver: not counted
    expect(await balance(d1)).toEqual({
      cash_collected: "130.00", // 130 + 0 + 130 - 130 (reversed)
      commission_earned: "40.00", // 20 + 20 + 20 - 20 (reversed)
      settlements_paid: "150.00",
      adjustments: "25.25",
      cash_held: "-20.00", // collected 130 - handed over 150
      owed_to_store: "-34.75", // 130 - 40 - 150 + 25.25: the store owes the driver
      commission_payable: "0.00",
    });
    // The view is the ledger sum, never a stored number.
    const sum = await one<{ s: string }>(
      db,
      `select sum(amount)::text s from public.driver_ledger where driver_id = $1`,
      [d1],
    );
    expect(sum.s).toBe("-34.75");
  });
});

describe("access", () => {
  it("a driver reads only their own ledger, settlements and balance; staff read all; anon nothing", async () => {
    await delivered("cod", d1);
    await delivered("cod", d2);
    await settle(admin, d2, 110);
    const seen = await as(db, user(d1), async (tx) => ({
      ledger: (
        await tx.query<{ driver_id: string }>(`select distinct driver_id from public.driver_ledger`)
      ).rows,
      settlements: (await tx.query(`select 1 from public.driver_settlements`)).rows.length,
      balances: (
        await tx.query<{ driver_id: string }>(`select driver_id from public.driver_balance`)
      ).rows,
      otherEntries: (await tx.query(`select * from public.driver_ledger_entries($1)`, [d2])).rows
        .length,
      otherDays: (await tx.query(`select * from public.driver_daily_summary($1)`, [d2])).rows
        .length,
      cash: (await tx.query(`select * from public.admin_driver_cash()`)).rows.length,
    }));
    expect(seen).toEqual({
      ledger: [{ driver_id: d1 }],
      settlements: 0,
      balances: [{ driver_id: d1 }],
      otherEntries: 0,
      otherDays: 0,
      cash: 0,
    });
    const staffSees = await as(
      db,
      user(staff),
      async (tx) =>
        (await tx.query(`select distinct driver_id from public.driver_ledger`)).rows.length,
    );
    expect(staffSees).toBe(2);
    for (const sql of [
      `select 1 from public.driver_ledger`,
      `select 1 from public.driver_settlements`,
      `select 1 from public.driver_balance`,
      `select 1 from public.cod_collections`,
    ])
      expect(await tryAs(db, anon, (tx) => tx.query(sql))).toMatch(/permission denied/);
  });

  it("payout overrides: driver reads own, only admins write", async () => {
    expect(
      await tryAs(db, user(staff), (tx) =>
        tx.query(
          `insert into public.driver_payout_settings(driver_id, commission_type, commission_value) values ($1, 'fixed', 5)`,
          [d1],
        ),
      ),
    ).toMatch(/row-level security/);
    await as(db, user(admin), (tx) =>
      tx.query(
        `insert into public.driver_payout_settings(driver_id, commission_type, commission_value) values ($1, 'fixed', 5)`,
        [d1],
      ),
    );
    const own = await as(
      db,
      user(d1),
      async (tx) =>
        (await tx.query(`select commission_value::text v from public.driver_payout_settings`)).rows,
    );
    expect(own).toEqual([{ v: "5.00" }]);
    const other = await as(
      db,
      user(d2),
      async (tx) => (await tx.query(`select 1 from public.driver_payout_settings`)).rows,
    );
    expect(other).toEqual([]);
  });
});

describe("reports", () => {
  it("daily summary and the admin cash table use the store's day and flag limits and carry-overs", async () => {
    await db.query(`update public.store_settings set driver_cash_limit = 200`);
    await delivered();
    await delivered();
    const days = await as(
      db,
      user(d1),
      async (tx) =>
        (
          await tx.query<Record<string, unknown>>(
            `select orders_delivered, cash_collected::text, commission_earned::text, net_to_store::text
             from public.driver_daily_summary($1)`,
            [d1],
          )
        ).rows,
    );
    expect(days).toEqual([
      {
        orders_delivered: 2,
        cash_collected: "260.00",
        commission_earned: "40.00",
        net_to_store: "220.00",
      },
    ]);
    const rows = await as(
      db,
      user(staff),
      async (tx) =>
        (
          await tx.query<Record<string, unknown>>(
            `select driver_id, orders_delivered, cod_total::text, commission_earned::text, cash_held::text,
                  owed_to_store::text, over_limit, unsettled_from_before
             from public.admin_driver_cash()`,
          )
        ).rows,
    );
    expect(rows.find((r) => r.driver_id === d1)).toEqual({
      driver_id: d1,
      orders_delivered: 2,
      cod_total: "260.00",
      commission_earned: "40.00",
      cash_held: "260.00",
      owed_to_store: "220.00",
      over_limit: true, // 260 > 200
      unsettled_from_before: false,
    });
    expect(rows.find((r) => r.driver_id === d2)).toMatchObject({
      owed_to_store: "0.00",
      over_limit: false,
    });
    // Tomorrow, today's balance is a carry-over until settled.
    const tomorrow = await as(
      db,
      user(staff),
      async (tx) =>
        (
          await tx.query<{ unsettled_from_before: boolean; orders_delivered: number }>(
            `select unsettled_from_before, orders_delivered from public.admin_driver_cash(public.store_today() + 1) where driver_id = $1`,
            [d1],
          )
        ).rows[0],
    );
    expect(tomorrow).toEqual({ unsettled_from_before: true, orders_delivered: 0 });
  });

  it("rejects an unknown timezone", async () => {
    await expect(
      db.query(`update public.store_settings set timezone = 'Mars/Olympus' where id = 1`),
    ).rejects.toThrow(/invalid_timezone/);
    await db.query(`update public.store_settings set timezone = 'Asia/Riyadh' where id = 1`);
  });
});
