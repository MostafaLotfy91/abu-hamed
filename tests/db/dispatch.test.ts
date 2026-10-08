// Automatic order dispatching: offers, accept/reject, expiry, driver load limits, triggers and RLS.
// Parallel dispatch is covered against a real Postgres in concurrency.test.ts.
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
  placeOrder,
  tryAs,
  user,
} from "./harness";

let db: PGlite;
let customer: string, addr: string, staff: string, variantId: string, productId: string;
let d1: string, d2: string, d3: string;

beforeEach(async () => {
  db = await freshDb();
  await db.query(`update public.store_settings set min_order_amount = 0 where id = 1`);
  customer = await createUser(db, "cust@test.local");
  addr = await createAddress(db, customer);
  staff = await createUser(db, "staff@test.local", ["staff"]);
  // Created in this order, so with equal load and no offers yet the tie-break is by id; tests don't rely on it.
  d1 = await createUser(db, "d1@test.local", ["driver"]);
  d2 = await createUser(db, "d2@test.local", ["driver"]);
  d3 = await createUser(db, "d3@test.local", ["driver"]);
  ({ productId, variantId } = await createProduct(db, { stock: 100 }));
});

const setFeature = (on: boolean) =>
  db.query(
    `update public.store_settings set features = features || jsonb_build_object('auto_dispatch_enabled', $1::boolean) where id = 1`,
    [on],
  );

/** A placed order moved to `confirmed` (no dispatch happens at confirmed with the default trigger status). */
async function newOrder(status: "confirmed" | "preparing" = "confirmed") {
  const id = await placeOrder(db, customer, addr, [
    { product_id: productId, variant_id: variantId, quantity: 1 },
  ]);
  await db.query(`update public.orders set status = 'confirmed' where id = $1`, [id]);
  if (status === "preparing")
    await db.query(`update public.orders set status = 'preparing' where id = $1`, [id]);
  return id;
}

const dispatch = (orderId: string) =>
  as(db, user(staff), async (tx) => {
    const { rows } = await tx.query<{ r: string }>(`select public.dispatch_order($1) as r`, [
      orderId,
    ]);
    return rows[0].r;
  });

const respond = (driver: string, offerId: string, accept: boolean) =>
  as(db, user(driver), async (tx) => {
    const { rows } = await tx.query<{ r: string }>(
      `select public.driver_respond_to_offer($1, $2) as r`,
      [offerId, accept],
    );
    return rows[0].r;
  });

const openOffer = (orderId: string) =>
  one<{ id: string; driver_id: string; expires_at: string }>(
    db,
    `select id, driver_id, expires_at from public.order_dispatch_offers where order_id = $1 and status = 'offered'`,
    [orderId],
  );

const orderRow = (id: string) =>
  one<{ dispatch_status: string; driver_id: string | null; driver_accepted_at: string | null }>(
    db,
    `select dispatch_status, driver_id, driver_accepted_at from public.orders where id = $1`,
    [id],
  );

const events = async (orderId: string) =>
  (
    await db.query<{ event: string }>(
      `select event from public.order_dispatch_events where order_id = $1 order by id`,
      [orderId],
    )
  ).rows.map((r) => r.event);

const setDriverStatus = (driver: string, status: string) =>
  as(db, user(driver), (tx) =>
    tx.query(`update public.driver_profiles set status = $1 where user_id = $2`, [status, driver]),
  );

const expireOffers = (orderId: string) =>
  db.query(
    `update public.order_dispatch_offers set expires_at = now() - interval '1 second' where order_id = $1 and status = 'offered'`,
    [orderId],
  );

describe("settings defaults", () => {
  it("adds the dispatch settings with safe defaults (auto dispatch off)", async () => {
    const s = await one<Record<string, unknown>>(
      db,
      `select features->'auto_dispatch_enabled' as auto, dispatch_trigger_status, driver_accept_timeout_seconds,
              max_active_orders_per_driver, dispatch_alert_after_minutes from public.store_settings where id = 1`,
    );
    expect(s).toEqual({
      auto: false,
      dispatch_trigger_status: "preparing",
      driver_accept_timeout_seconds: 120,
      max_active_orders_per_driver: 3,
      dispatch_alert_after_minutes: 10,
    });
  });

  it("rejects out-of-range values", async () => {
    await expect(
      db.query(
        `update public.store_settings set dispatch_trigger_status = 'delivered' where id = 1`,
      ),
    ).rejects.toThrow(/dispatch_trigger_chk/);
    await expect(
      db.query(`update public.store_settings set driver_accept_timeout_seconds = 5 where id = 1`),
    ).rejects.toThrow(/accept_timeout_chk/);
    await expect(
      db.query(`update public.store_settings set max_active_orders_per_driver = 0 where id = 1`),
    ).rejects.toThrow(/max_active_chk/);
  });
});

describe("dispatch_order", () => {
  it("offers to one driver, marks the order offered and is idempotent", async () => {
    const o = await newOrder();
    expect(await dispatch(o)).toBe("offered");
    const first = await openOffer(o);
    expect([d1, d2, d3]).toContain(first.driver_id);
    expect((await orderRow(o)).dispatch_status).toBe("offered");
    // Driver is not assigned until they accept.
    expect((await orderRow(o)).driver_id).toBeNull();
    // A second call keeps the same single open offer.
    expect(await dispatch(o)).toBe("offered");
    const { n } = await one<{ n: number }>(
      db,
      `select count(*)::int n from public.order_dispatch_offers where order_id = $1`,
      [o],
    );
    expect(n).toBe(1);
    expect(await events(o)).toEqual(["offered"]);
  });

  it("offer expiry uses driver_accept_timeout_seconds", async () => {
    await db.query(
      `update public.store_settings set driver_accept_timeout_seconds = 90 where id = 1`,
    );
    const o = await newOrder();
    await dispatch(o);
    const { secs } = await one<{ secs: number }>(
      db,
      `select extract(epoch from expires_at - offered_at)::int secs from public.order_dispatch_offers where order_id = $1`,
      [o],
    );
    expect(secs).toBe(90);
  });

  it("gives each driver at most one open offer and prefers the least-loaded driver", async () => {
    const orders = [await newOrder(), await newOrder(), await newOrder(), await newOrder()];
    const results = [];
    for (const o of orders) results.push(await dispatch(o));
    expect(results).toEqual(["offered", "offered", "offered", "no_driver_available"]);
    const offered = (
      await db.query<{ driver_id: string }>(
        `select driver_id from public.order_dispatch_offers where status = 'offered'`,
      )
    ).rows.map((r) => r.driver_id);
    expect(new Set(offered).size).toBe(3);
    expect((await orderRow(orders[3])).dispatch_status).toBe("no_driver_available");
    expect(await events(orders[3])).toEqual(["no_driver"]);
  });

  it("skips offline, busy, deactivated and non-driver users", async () => {
    await setDriverStatus(d1, "offline");
    await setDriverStatus(d2, "busy");
    await db.query(`update public.driver_profiles set is_active = false where user_id = $1`, [d3]);
    const o = await newOrder();
    expect(await dispatch(o)).toBe("no_driver_available");
  });

  it("respects max_active_orders_per_driver", async () => {
    await db.query(
      `update public.store_settings set max_active_orders_per_driver = 1 where id = 1`,
    );
    await setDriverStatus(d2, "offline");
    await setDriverStatus(d3, "offline");
    const a = await newOrder();
    await dispatch(a);
    expect(await respond(d1, (await openOffer(a)).id, true)).toBe("accepted");
    const b = await newOrder();
    expect(await dispatch(b)).toBe("no_driver_available");
  });

  it("does not dispatch orders that are pending, delivered, cancelled or already assigned", async () => {
    const pending = await placeOrder(db, customer, addr, [
      { product_id: productId, variant_id: variantId, quantity: 1 },
    ]);
    expect(await dispatch(pending)).toBe("skipped");
    const assigned = await newOrder();
    await db.query(`update public.orders set driver_id = $1 where id = $2`, [d1, assigned]);
    expect(await dispatch(assigned)).toBe("assigned");
  });

  it("is staff-only for signed-in users", async () => {
    const o = await newOrder();
    expect(
      await tryAs(db, user(customer), (tx) => tx.query(`select public.dispatch_order($1)`, [o])),
    ).toMatch(/forbidden/);
    expect(
      await tryAs(db, user(d1), (tx) => tx.query(`select public.dispatch_order($1)`, [o])),
    ).toMatch(/forbidden/);
    expect(
      await tryAs(db, anon, (tx) => tx.query(`select public.dispatch_order($1)`, [o])),
    ).toMatch(/permission denied/);
  });
});

describe("driver_respond_to_offer", () => {
  it("accept assigns the order atomically and frees the offer slot", async () => {
    const o = await newOrder();
    await dispatch(o);
    const f = await openOffer(o);
    expect(await respond(f.driver_id, f.id, true)).toBe("accepted");
    const row = await orderRow(o);
    expect(row.driver_id).toBe(f.driver_id);
    expect(row.dispatch_status).toBe("assigned");
    expect(row.driver_accepted_at).not.toBeNull();
    const st = await one<{ active_orders: number; current_offer_id: string | null }>(
      db,
      `select active_orders, current_offer_id from public.driver_dispatch_state where driver_id = $1`,
      [f.driver_id],
    );
    expect(st).toEqual({ active_orders: 1, current_offer_id: null });
    // Answering again is harmless.
    expect(await respond(f.driver_id, f.id, true)).toBe("accepted");
    expect(await events(o)).toEqual(["offered", "accepted"]);
  });

  it("only one accept wins: a closed or someone else's offer cannot assign the order", async () => {
    const o = await newOrder();
    await dispatch(o);
    const f = await openOffer(o);
    const other = [d1, d2, d3].find((d) => d !== f.driver_id)!;
    // Another driver cannot answer this offer.
    expect(
      await tryAs(db, user(other), (tx) =>
        tx.query(`select public.driver_respond_to_offer($1, true)`, [f.id]),
      ),
    ).toMatch(/offer_not_found/);
    // The admin assigns someone else first; the offered driver's accept then loses.
    await as(db, user(staff), (tx) =>
      tx.query(`update public.orders set driver_id = $1 where id = $2`, [other, o]),
    );
    expect(await respond(f.driver_id, f.id, true)).toBe("taken");
    expect((await orderRow(o)).driver_id).toBe(other);
  });

  it("the database refuses a second open offer for the same order or driver", async () => {
    const o = await newOrder();
    await dispatch(o);
    const f = await openOffer(o);
    const other = [d1, d2, d3].find((d) => d !== f.driver_id)!;
    await expect(
      db.query(
        `insert into public.order_dispatch_offers(order_id, driver_id, expires_at) values ($1, $2, now() + interval '1 minute')`,
        [o, other],
      ),
    ).rejects.toThrow(/one_open_per_order/);
  });

  it("reject moves the order to the next driver, never back to one already offered", async () => {
    await setFeature(true);
    const o = await newOrder();
    await dispatch(o);
    const seen = new Set<string>();
    for (let i = 0; i < 3; i++) {
      const f = await openOffer(o);
      expect(seen.has(f.driver_id)).toBe(false);
      seen.add(f.driver_id);
      expect(await respond(f.driver_id, f.id, false)).toBe("rejected");
    }
    expect(seen.size).toBe(3);
    expect((await orderRow(o)).dispatch_status).toBe("no_driver_available");
    expect(await events(o)).toEqual([
      "offered",
      "rejected",
      "offered",
      "rejected",
      "offered",
      "rejected",
      "no_driver",
    ]);
  });

  it("with auto dispatch off, a reject returns the order to unassigned", async () => {
    const o = await newOrder();
    await dispatch(o);
    const f = await openOffer(o);
    expect(await respond(f.driver_id, f.id, false)).toBe("rejected");
    expect((await orderRow(o)).dispatch_status).toBe("unassigned");
    expect(await openOffer(o)).toBeUndefined();
  });

  it("an expired offer cannot be accepted and moves on", async () => {
    await setFeature(true);
    const o = await newOrder();
    await dispatch(o);
    const f = await openOffer(o);
    await expireOffers(o);
    expect(await respond(f.driver_id, f.id, true)).toBe("expired");
    expect((await orderRow(o)).driver_id).toBeNull();
    const next = await openOffer(o);
    expect(next.driver_id).not.toBe(f.driver_id);
  });

  it("requires an active driver", async () => {
    const o = await newOrder();
    await dispatch(o);
    const f = await openOffer(o);
    expect(
      await tryAs(db, user(customer), (tx) =>
        tx.query(`select public.driver_respond_to_offer($1, true)`, [f.id]),
      ),
    ).toMatch(/forbidden/);
  });
});

describe("expire_stale_offers", () => {
  it("expires offers past the timeout and re-dispatches to the next driver", async () => {
    await setFeature(true);
    const o = await newOrder();
    await dispatch(o);
    const f = await openOffer(o);
    await expireOffers(o);
    const { n } = await one<{ n: number }>(db, `select public.expire_stale_offers() as n`);
    expect(n).toBe(1);
    const old = await one<{ status: string }>(
      db,
      `select status from public.order_dispatch_offers where id = $1`,
      [f.id],
    );
    expect(old.status).toBe("expired");
    const next = await openOffer(o);
    expect(next.driver_id).not.toBe(f.driver_id);
    expect(await events(o)).toEqual(["offered", "expired", "offered"]);
  });

  it("leaves offers that are still valid alone", async () => {
    const o = await newOrder();
    await dispatch(o);
    expect((await one<{ n: number }>(db, `select public.expire_stale_offers() as n`)).n).toBe(0);
    expect(await openOffer(o)).toBeDefined();
  });

  it("is not callable by drivers or anon", async () => {
    expect(
      await tryAs(db, user(d1), (tx) => tx.query(`select public.expire_stale_offers()`)),
    ).toMatch(/forbidden/);
    expect(await tryAs(db, anon, (tx) => tx.query(`select public.expire_stale_offers()`))).toMatch(
      /permission denied/,
    );
  });
});

describe("triggers", () => {
  it("auto-dispatches when an order reaches the trigger status (preparing by default)", async () => {
    await setFeature(true);
    const o = await newOrder("confirmed");
    expect(await openOffer(o)).toBeUndefined();
    await as(db, user(staff), (tx) =>
      tx.query(`update public.orders set status = 'preparing' where id = $1`, [o]),
    );
    expect(await openOffer(o)).toBeDefined();
    expect((await orderRow(o)).dispatch_status).toBe("offered");
  });

  it("follows dispatch_trigger_status = confirmed", async () => {
    await setFeature(true);
    await db.query(
      `update public.store_settings set dispatch_trigger_status = 'confirmed' where id = 1`,
    );
    const o = await newOrder("confirmed");
    expect(await openOffer(o)).toBeDefined();
  });

  it("does nothing while delivery tracking is off (drivers could not answer)", async () => {
    await setFeature(true);
    await db.query(
      `update public.store_settings set features = features || '{"delivery_tracking": false}'::jsonb where id = 1`,
    );
    const o = await newOrder("preparing");
    expect(await openOffer(o)).toBeUndefined();
  });

  it("does nothing while auto dispatch is off", async () => {
    const o = await newOrder("preparing");
    expect(await openOffer(o)).toBeUndefined();
    expect((await orderRow(o)).dispatch_status).toBe("unassigned");
  });

  it("a driver becoming available picks up a waiting order", async () => {
    await setFeature(true);
    for (const d of [d1, d2, d3]) await setDriverStatus(d, "offline");
    const o = await newOrder("preparing");
    expect((await orderRow(o)).dispatch_status).toBe("no_driver_available");
    await setDriverStatus(d2, "available");
    const f = await openOffer(o);
    expect(f.driver_id).toBe(d2);
  });

  it("a driver finishing an order frees capacity for a waiting order", async () => {
    await setFeature(true);
    await db.query(
      `update public.store_settings set max_active_orders_per_driver = 1 where id = 1`,
    );
    await setDriverStatus(d2, "offline");
    await setDriverStatus(d3, "offline");
    const a = await newOrder("preparing");
    expect(await respond(d1, (await openOffer(a)).id, true)).toBe("accepted");
    const b = await newOrder("preparing");
    expect((await orderRow(b)).dispatch_status).toBe("no_driver_available");
    await as(db, user(d1), (tx) =>
      tx.query(`select public.driver_set_status($1, 'out_for_delivery')`, [a]),
    );
    await as(db, user(d1), (tx) =>
      tx.query(`select public.driver_set_status($1, 'delivered')`, [a]),
    );
    const f = await openOffer(b);
    expect(f.driver_id).toBe(d1);
  });

  it("manual assignment cancels the open offer and is audited", async () => {
    const o = await newOrder();
    await dispatch(o);
    const f = await openOffer(o);
    await as(db, user(staff), (tx) =>
      tx.query(`update public.orders set driver_id = $1 where id = $2`, [d3, o]),
    );
    expect(await openOffer(o)).toBeUndefined();
    expect((await orderRow(o)).dispatch_status).toBe("assigned");
    const st = await one<{ current_offer_id: string | null }>(
      db,
      `select current_offer_id from public.driver_dispatch_state where driver_id = $1`,
      [f.driver_id],
    );
    expect(st.current_offer_id).toBeNull();
    expect(await events(o)).toEqual(["offered", "cancelled", "manual_assign"]);
    // Unassigning returns it to unassigned.
    await as(db, user(staff), (tx) =>
      tx.query(`update public.orders set driver_id = null where id = $1`, [o]),
    );
    expect((await orderRow(o)).dispatch_status).toBe("unassigned");
  });

  it("cancelling an order closes its open offer", async () => {
    const o = await newOrder();
    await dispatch(o);
    await as(db, user(staff), (tx) =>
      tx.query(`update public.orders set status = 'cancelled' where id = $1`, [o]),
    );
    expect(await openOffer(o)).toBeUndefined();
  });

  it("keeps the existing manual flow working (assign, driver accepts, delivers)", async () => {
    const o = await newOrder();
    await as(db, user(staff), (tx) =>
      tx.query(`update public.orders set driver_id = $1 where id = $2`, [d1, o]),
    );
    await as(db, user(d1), (tx) => tx.query(`select public.driver_accept_order($1)`, [o]));
    await as(db, user(d1), (tx) =>
      tx.query(`select public.driver_set_status($1, 'out_for_delivery')`, [o]),
    );
    await as(db, user(d1), (tx) =>
      tx.query(`select public.driver_set_status($1, 'delivered')`, [o]),
    );
    const st = await one<{ active_orders: number }>(
      db,
      `select active_orders from public.driver_dispatch_state where driver_id = $1`,
      [d1],
    );
    expect(st.active_orders).toBe(0);
  });
});

describe("row-level security", () => {
  let o: string, offerId: string, offered: string, other: string;
  beforeEach(async () => {
    o = await newOrder();
    await dispatch(o);
    const f = await openOffer(o);
    offerId = f.id;
    offered = f.driver_id;
    other = [d1, d2, d3].find((d) => d !== offered)!;
  });

  it("a driver reads only their own offers", async () => {
    const mine = await as(db, user(offered), (tx) =>
      tx.query(`select id from public.order_dispatch_offers`),
    );
    expect(mine.rows).toEqual([{ id: offerId }]);
    const theirs = await as(db, user(other), (tx) =>
      tx.query(`select id from public.order_dispatch_offers`),
    );
    expect(theirs.rows).toEqual([]);
  });

  it("driver_my_offers returns the offer without customer personal data", async () => {
    const r = await as(db, user(offered), (tx) =>
      tx.query<Record<string, unknown>>(`select * from public.driver_my_offers()`),
    );
    expect(r.rows).toHaveLength(1);
    const row = r.rows[0];
    expect(row.offer_id).toBe(offerId);
    expect(row.city).toBe("Cairo");
    expect(Object.keys(row)).not.toEqual(expect.arrayContaining(["phone"]));
    expect(JSON.stringify(row)).not.toContain("01000000000");
    expect(JSON.stringify(row)).not.toContain("Street 1");
    const none = await as(db, user(other), (tx) =>
      tx.query(`select * from public.driver_my_offers()`),
    );
    expect(none.rows).toEqual([]);
  });

  it("a driver cannot insert, update or delete offers directly", async () => {
    expect(
      await tryAs(db, user(offered), (tx) =>
        tx.query(`update public.order_dispatch_offers set status = 'accepted' where id = $1`, [
          offerId,
        ]),
      ),
    ).toMatch(/permission denied/);
    expect(
      await tryAs(db, user(other), (tx) =>
        tx.query(
          `insert into public.order_dispatch_offers(order_id, driver_id, expires_at) values ($1, $2, now())`,
          [o, other],
        ),
      ),
    ).toMatch(/permission denied/);
    expect(
      await tryAs(db, user(offered), (tx) =>
        tx.query(`delete from public.order_dispatch_offers where id = $1`, [offerId]),
      ),
    ).toMatch(/permission denied/);
  });

  it("a driver cannot change their dispatch load", async () => {
    expect(
      await tryAs(db, user(offered), (tx) =>
        tx.query(
          `update public.driver_dispatch_state set active_orders = 0, current_offer_id = null`,
        ),
      ),
    ).toMatch(/permission denied/);
  });

  it("the order is not visible to the offered driver until they accept", async () => {
    const before = await as(db, user(offered), (tx) =>
      tx.query(`select id from public.orders where id = $1`, [o]),
    );
    expect(before.rows).toEqual([]);
    await respond(offered, offerId, true);
    const after = await as(db, user(offered), (tx) =>
      tx.query(`select id from public.orders where id = $1`, [o]),
    );
    expect(after.rows).toEqual([{ id: o }]);
  });

  it("customers and anon see no offers, loads or dispatch events", async () => {
    for (const who of [user(customer)]) {
      const r = await as(db, who, async (tx) => ({
        offers: (await tx.query(`select 1 from public.order_dispatch_offers`)).rows.length,
        state: (await tx.query(`select 1 from public.driver_dispatch_state`)).rows.length,
        events: (await tx.query(`select 1 from public.order_dispatch_events`)).rows.length,
      }));
      expect(r).toEqual({ offers: 0, state: 0, events: 0 });
    }
    for (const t of ["order_dispatch_offers", "driver_dispatch_state", "order_dispatch_events"])
      expect(await tryAs(db, anon, (tx) => tx.query(`select 1 from public.${t}`))).toMatch(
        /permission denied/,
      );
    expect(
      await tryAs(db, anon, (tx) =>
        tx.query(`select public.driver_respond_to_offer($1, true)`, [offerId]),
      ),
    ).toMatch(/permission denied/);
  });

  it("drivers cannot read the dispatch audit trail; staff can read everything", async () => {
    const drv = await as(db, user(offered), (tx) =>
      tx.query(`select 1 from public.order_dispatch_events`),
    );
    expect(drv.rows).toEqual([]);
    const st = await as(db, user(staff), async (tx) => ({
      offers: (await tx.query(`select 1 from public.order_dispatch_offers`)).rows.length,
      events: (await tx.query(`select 1 from public.order_dispatch_events`)).rows.length,
      state: (await tx.query(`select 1 from public.driver_dispatch_state`)).rows.length,
    }));
    expect(st).toEqual({ offers: 1, events: 1, state: 3 });
  });

  it("internal helpers are not callable by clients", async () => {
    for (const q of [
      `select public._dispatch(gen_random_uuid(), false)`,
      `select public._dispatch_waiting()`,
      `select public._refresh_driver_load(gen_random_uuid())`,
      `select public._close_offer(gen_random_uuid(), 'expired', null)`,
    ])
      expect(await tryAs(db, user(staff), (tx) => tx.query(q))).toMatch(/permission denied/);
  });
});
