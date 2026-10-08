// Row-level security and function privileges, exercised as anon / customer / staff / driver / admin.
import type { PGlite } from "@electric-sql/pglite";
import { beforeAll, describe, expect, it } from "vitest";
import {
  anon,
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
let alice: string, bob: string, staff: string, admin: string, driver: string, otherDriver: string;
let aliceAddr: string, bobAddr: string, bobOrder: string, aliceOrder: string;

beforeAll(async () => {
  db = await freshDb();
  alice = await createUser(db, "alice@test.local");
  bob = await createUser(db, "bob@test.local");
  staff = await createUser(db, "staff@test.local", ["staff"]);
  admin = await createUser(db, "admin@test.local", ["admin"]);
  driver = await createUser(db, "driver@test.local", ["driver"]);
  otherDriver = await createUser(db, "driver2@test.local", ["driver"]);
  aliceAddr = await createAddress(db, alice);
  bobAddr = await createAddress(db, bob);
  const { productId, variantId } = await createProduct(db, { price: 200, stock: 50 });
  const items = [{ product_id: productId, variant_id: variantId, quantity: 1 }];
  aliceOrder = await placeOrder(db, alice, aliceAddr, items);
  bobOrder = await placeOrder(db, bob, bobAddr, items);
  // Bob's order is delivered (for return tests) and Alice's is assigned to the driver.
  for (const s of ["confirmed", "preparing", "out_for_delivery", "delivered"]) {
    await db.query(`update public.orders set status = $1 where id = $2`, [s, bobOrder]);
  }
  await db.query(`update public.orders set status = 'confirmed', driver_id = $1 where id = $2`, [
    driver,
    aliceOrder,
  ]);
  await as(db, user(bob), (tx) =>
    tx.query(`select public.request_return($1, null, 'return', 'too small', null, null)`, [
      bobOrder,
    ]),
  );
});

describe("customer isolation", () => {
  it("cannot read another customer's orders, items, history", async () => {
    const r = await as(db, user(alice), async (tx) => ({
      orders: (await tx.query(`select id from public.orders where id = $1`, [bobOrder])).rows
        .length,
      items: (await tx.query(`select id from public.order_items where order_id = $1`, [bobOrder]))
        .rows.length,
      history: (
        await tx.query(`select id from public.order_status_history where order_id = $1`, [bobOrder])
      ).rows.length,
      own: (await tx.query(`select id from public.orders`)).rows.map(
        (x) => (x as { id: string }).id,
      ),
    }));
    expect(r).toEqual({ orders: 0, items: 0, history: 0, own: [aliceOrder] });
  });

  it("cannot modify another customer's order", async () => {
    const n = await as(
      db,
      user(alice),
      async (tx) =>
        (await tx.query(`update public.orders set notes = 'x' where id = $1`, [bobOrder]))
          .affectedRows,
    );
    expect(n ?? 0).toBe(0);
  });

  it("cannot insert orders directly (must go through place_order)", async () => {
    const err = await tryAs(db, user(alice), (tx) =>
      tx.query(
        `insert into public.orders(user_id, address, subtotal, total) values ($1, '{}'::jsonb, 1, 1)`,
        [alice],
      ),
    );
    expect(err).toMatch(/row-level security|permission denied/);
  });

  it("cannot read, update or delete another customer's addresses", async () => {
    const r = await as(db, user(alice), async (tx) => ({
      read: (await tx.query(`select id from public.addresses where id = $1`, [bobAddr])).rows
        .length,
      upd:
        (await tx.query(`update public.addresses set city = 'x' where id = $1`, [bobAddr]))
          .affectedRows ?? 0,
      del:
        (await tx.query(`delete from public.addresses where id = $1`, [bobAddr])).affectedRows ?? 0,
    }));
    expect(r).toEqual({ read: 0, upd: 0, del: 0 });
  });

  it("cannot create an address owned by someone else", async () => {
    const err = await tryAs(db, user(alice), (tx) =>
      tx.query(`insert into public.addresses(user_id, city, street) values ($1, 'c', 's')`, [bob]),
    );
    expect(err).toMatch(/row-level security/);
  });

  it("cannot read another customer's return requests or file one on their order", async () => {
    const seen = await as(
      db,
      user(alice),
      async (tx) => (await tx.query(`select id from public.return_requests`)).rows.length,
    );
    expect(seen).toBe(0);
    const err = await tryAs(db, user(alice), (tx) =>
      tx.query(`select public.request_return($1, null, 'return', 'x', null, null)`, [bobOrder]),
    );
    expect(err).toMatch(/not_returnable/);
  });

  it("cannot read other profiles", async () => {
    const n = await as(
      db,
      user(alice),
      async (tx) =>
        (await tx.query(`select id from public.profiles where id <> $1`, [alice])).rows.length,
    );
    expect(n).toBe(0);
  });

  it("cannot grant itself a role", async () => {
    const err = await tryAs(db, user(alice), (tx) =>
      tx.query(`insert into public.user_roles(user_id, role) values ($1, 'admin')`, [alice]),
    );
    expect(err).toMatch(/row-level security/);
  });

  it("cannot read coupons or coupon redemptions of others", async () => {
    const r = await as(db, user(alice), async (tx) => ({
      coupons: (await tx.query(`select id from public.coupons`)).rows.length,
      redemptions: (
        await tx.query(`select id from public.coupon_redemptions where user_id <> $1`, [alice])
      ).rows.length,
    }));
    expect(r).toEqual({ coupons: 0, redemptions: 0 });
  });

  it("has no payments table to protect (cash on delivery only)", async () => {
    const r = await one<{ n: number }>(
      db,
      `select count(*)::int n from pg_tables where schemaname = 'public' and tablename ilike '%payment%'`,
    );
    expect(r.n).toBe(0);
  });

  it("cannot learn whether another user is an admin via has_role", async () => {
    const r = await as(
      db,
      user(alice),
      async (tx) =>
        (await tx.query<{ v: boolean }>(`select public.has_role($1, 'admin') v`, [admin])).rows[0]
          .v,
    );
    expect(r).toBe(false);
  });
});

describe("staff limits", () => {
  it("cannot change order totals or other money fields", async () => {
    for (const col of ["total", "subtotal", "discount", "delivery_fee"]) {
      const err = await tryAs(db, user(staff), (tx) =>
        tx.query(`update public.orders set ${col} = 1 where id = $1`, [aliceOrder]),
      );
      expect(err, col).toMatch(/immutable_field/);
    }
  });

  it("cannot reassign an order to another customer", async () => {
    const err = await tryAs(db, user(staff), (tx) =>
      tx.query(`update public.orders set user_id = $1 where id = $2`, [bob, aliceOrder]),
    );
    expect(err).toMatch(/immutable_field/);
  });

  it("can update status and driver of an order", async () => {
    const err = await tryAs(db, user(staff), (tx) =>
      tx.query(`update public.orders set driver_id = $1 where id = $2`, [driver, aliceOrder]),
    );
    expect(err).toBeNull();
  });

  it("cannot manage coupons or banners (admin only)", async () => {
    const r = await as(db, user(staff), async (tx) => ({
      coupons: (await tx.query(`update public.coupons set value = 99`)).affectedRows ?? 0,
    }));
    expect(r.coupons).toBe(0);
    const err = await tryAs(db, user(staff), (tx) =>
      tx.query(`insert into public.banners(image_url, link) values ('/x.jpg', '/products')`),
    );
    expect(err).toMatch(/row-level security/);
  });

  it("cannot add drivers (admin only)", async () => {
    const err = await tryAs(db, user(staff), (tx) =>
      tx.query(`select public.admin_add_driver('alice@test.local')`),
    );
    expect(err).toMatch(/forbidden/);
  });
});

describe("privileged functions", () => {
  const anonDenied: [string, string][] = [
    ["place_order", `select public.place_order('[]'::jsonb, null, 'asap', 'cod', '', null)`],
    ["cancel_my_order", `select public.cancel_my_order(gen_random_uuid())`],
    ["admin_stats", `select public.admin_stats()`],
    ["admin_insight", `select public.admin_insight('avg_order_value', '{}'::jsonb)`],
    [
      "admin_import_batch",
      `select public.admin_import_batch(gen_random_uuid(), '[]'::jsonb, false)`,
    ],
    ["admin_add_driver", `select public.admin_add_driver('x@y.z')`],
    ["admin_remove_driver", `select public.admin_remove_driver(gen_random_uuid())`],
    ["grant_admin_by_email", `select public.grant_admin_by_email('x@y.z')`],
    ["validate_coupon", `select public.validate_coupon('WELCOME10', 1000)`],
    ["ai_rate_check", `select public.ai_rate_check(repeat('a', 32), 1)`],
    ["driver_set_status", `select public.driver_set_status(gen_random_uuid(), 'delivered')`],
    [
      "request_return",
      `select public.request_return(gen_random_uuid(), null, 'return', 'x', null, null)`,
    ],
    ["driver_order_customers", `select * from public.driver_order_customers()`],
  ];
  it.each(anonDenied)("anon cannot execute %s", async (_name, sql) => {
    const err = await tryAs(db, anon, (tx) => tx.query(sql));
    expect(err).toMatch(/permission denied/);
  });

  it("claim_first_admin no longer exists", async () => {
    const r = await one<{ n: number }>(
      db,
      `select count(*)::int n from pg_proc where proname = 'claim_first_admin'`,
    );
    expect(r.n).toBe(0);
  });

  it.each([
    ["admin_stats", `select public.admin_stats()`],
    ["admin_insight", `select public.admin_insight('avg_order_value', '{}'::jsonb)`],
    [
      "admin_import_batch",
      `select public.admin_import_batch(gen_random_uuid(), '[]'::jsonb, false)`,
    ],
    ["admin_add_driver", `select public.admin_add_driver('bob@test.local')`],
  ])("a customer gets forbidden from %s", async (_name, sql) => {
    const err = await tryAs(db, user(alice), (tx) => tx.query(sql));
    expect(err).toMatch(/forbidden/);
  });

  it("a customer cannot grant admin (service role only)", async () => {
    const err = await tryAs(db, user(alice), (tx) =>
      tx.query(`select public.grant_admin_by_email('alice@test.local')`),
    );
    expect(err).toMatch(/permission denied/);
  });

  it("the service role can grant the first admin by email", async () => {
    const fresh = await createUser(db, "owner@test.local");
    await as(db, { role: "service_role" }, (tx) =>
      tx.query(`select public.grant_admin_by_email('owner@test.local')`),
    );
    const r = await one<{ n: number }>(
      db,
      `select count(*)::int n from public.user_roles where user_id = $1 and role = 'admin'`,
      [fresh],
    );
    expect(r.n).toBe(1);
  });

  it("the last admin role cannot be removed", async () => {
    const solo = await freshDb();
    const onlyAdmin = await createUser(solo, "solo@test.local", ["admin"]);
    const err = await tryAs(solo, user(onlyAdmin), (tx) =>
      tx.query(`delete from public.user_roles where user_id = $1 and role = 'admin'`, [onlyAdmin]),
    );
    expect(err).toMatch(/last_admin/);
  });
});

describe("drivers", () => {
  it("see only orders assigned to them", async () => {
    const mine = await as(db, user(driver), async (tx) =>
      (await tx.query<{ id: string }>(`select id from public.orders`)).rows.map((r) => r.id),
    );
    const theirs = await as(
      db,
      user(otherDriver),
      async (tx) => (await tx.query(`select id from public.orders`)).rows.length,
    );
    expect(mine).toEqual([aliceOrder]);
    expect(theirs).toBe(0);
  });

  it("cannot update orders directly", async () => {
    const n = await as(
      db,
      user(driver),
      async (tx) =>
        (
          await tx.query(`update public.orders set status = 'delivered' where id = $1`, [
            aliceOrder,
          ])
        ).affectedRows ?? 0,
    );
    expect(n).toBe(0);
  });

  it("cannot move an order that isn't theirs", async () => {
    const err = await tryAs(db, user(otherDriver), (tx) =>
      tx.query(`select public.driver_set_status($1, 'out_for_delivery')`, [aliceOrder]),
    );
    expect(err).toMatch(/invalid_transition/);
  });

  it("only see customer contact details for active deliveries", async () => {
    const r = await as(
      db,
      user(driver),
      async (tx) => (await tx.query(`select * from public.driver_order_customers()`)).rows.length,
    );
    expect(r).toBe(1);
    const none = await as(
      db,
      user(otherDriver),
      async (tx) => (await tx.query(`select * from public.driver_order_customers()`)).rows.length,
    );
    expect(none).toBe(0);
  });

  it("can deliver their order and save a location row while out for delivery", async () => {
    await as(db, user(driver), (tx) =>
      tx.query(`select public.driver_accept_order($1)`, [aliceOrder]),
    );
    await as(db, user(driver), (tx) =>
      tx.query(`select public.driver_set_status($1, 'out_for_delivery')`, [aliceOrder]),
    );
    await as(db, user(driver), (tx) =>
      tx.query(
        `insert into public.driver_locations(driver_id, order_id, lat, lng) values ($1, $2, 30.05, 31.23)`,
        [driver, aliceOrder],
      ),
    );
    const seenByCustomer = await as(
      db,
      user(alice),
      async (tx) =>
        (await tx.query(`select id from public.driver_locations where order_id = $1`, [aliceOrder]))
          .rows.length,
    );
    expect(seenByCustomer).toBe(1);
    const spoof = await tryAs(db, user(otherDriver), (tx) =>
      tx.query(
        `insert into public.driver_locations(driver_id, order_id, lat, lng) values ($1, $2, 0, 0)`,
        [otherDriver, aliceOrder],
      ),
    );
    expect(spoof).toMatch(/row-level security/);
    await as(db, user(driver), (tx) =>
      tx.query(`select public.driver_set_status($1, 'delivered')`, [aliceOrder]),
    );
    const o = await one<{ status: string; payment_status: string }>(
      db,
      `select status, payment_status from public.orders where id = $1`,
      [aliceOrder],
    );
    expect(o).toEqual({ status: "delivered", payment_status: "paid" });
  });
});

describe("storage bucket policies", () => {
  it("anon cannot upload or list files", async () => {
    const up = await tryAs(db, anon, (tx) =>
      tx.query(`insert into storage.objects(bucket_id, name) values ('store-media', 'a.png')`),
    );
    expect(up).toMatch(/row-level security/);
    const list = await as(
      db,
      anon,
      async (tx) => (await tx.query(`select id from storage.objects`)).rows.length,
    );
    expect(list).toBe(0);
  });

  it("staff can upload images but not HTML, and cannot rename an image to .html", async () => {
    expect(
      await tryAs(db, user(staff), (tx) =>
        tx.query(
          `insert into storage.objects(bucket_id, name) values ('store-media', 'products/x.html')`,
        ),
      ),
    ).toMatch(/row-level security/);
    expect(
      await tryAs(db, user(staff), (tx) =>
        tx.query(
          `insert into storage.objects(bucket_id, name) values ('store-media', 'products/ok.webp')`,
        ),
      ),
    ).toBeNull();
    expect(
      await tryAs(db, user(staff), (tx) =>
        tx.query(
          `update storage.objects set name = 'products/ok.html' where name = 'products/ok.webp'`,
        ),
      ),
    ).toMatch(/row-level security/);
  });

  it("customers cannot upload", async () => {
    const err = await tryAs(db, user(alice), (tx) =>
      tx.query(
        `insert into storage.objects(bucket_id, name) values ('store-media', 'products/c.png')`,
      ),
    );
    expect(err).toMatch(/row-level security/);
  });
});
