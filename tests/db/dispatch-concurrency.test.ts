// Parallel dispatching on a real multi-connection Postgres (same gating and allowlist as concurrency.test.ts):
// 10 orders, 3 drivers, max 3 active orders each. Every call runs on its own connection at the same time.
// Other drivers that happen to be available on the target database are set offline for the test and restored after.
// Everything created is deleted afterwards.
import postgres from "postgres";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { assertAllowed, isLocalUrl, loadEnvTest } from "../safety";

loadEnvTest();
const raw = (process.env["TEST_DATABASE_URL"] ?? "").trim();
const url = raw.includes("PASTE_") ? "" : raw;
if (url) assertAllowed(url, "TEST_DATABASE_URL", "db");

describe.skipIf(!url)("parallel dispatch on a real Supabase database", () => {
  let sql: postgres.Sql;
  const stamp = Date.now();
  let customer: string, address: string, productId: string, variantId: string;
  const drivers: string[] = [];
  const orders: string[] = [];
  let pausedDrivers: { user_id: string; status: string }[] = [];
  let settingsBackup: Record<string, unknown> | null = null;

  beforeAll(async () => {
    const target = new URL(url);
    const txPooler = /\.pooler\.supabase\.com$/.test(target.hostname) && target.port === "5432";
    if (txPooler) target.port = "6543";
    sql = postgres(target.toString(), {
      max: 25,
      prepare: !txPooler,
      ssl: isLocalUrl(url) ? false : "require",
      onnotice: () => {},
    });
    const [m] = await sql`select to_regclass('public.order_dispatch_offers') is not null as ok`;
    if (!m.ok)
      throw new Error(
        "Dispatch migration (20261008140000_order_dispatch.sql) is not applied here.",
      );

    const [s] =
      await sql`select min_order_amount, max_active_orders_per_driver, driver_accept_timeout_seconds,
      features->'auto_dispatch_enabled' as auto from public.store_settings where id = 1`;
    settingsBackup = s;
    await sql`update public.store_settings set min_order_amount = 0, max_active_orders_per_driver = 3,
      driver_accept_timeout_seconds = 300,
      features = features || '{"auto_dispatch_enabled": false}'::jsonb where id = 1`;
    pausedDrivers =
      await sql`select user_id, status from public.driver_profiles where status <> 'offline'`;
    if (pausedDrivers.length)
      await sql`update public.driver_profiles set status = 'offline' where user_id = any(${pausedDrivers.map((d) => d.user_id)})`;

    const [c] =
      await sql`insert into auth.users(id, email) values (gen_random_uuid(), ${`disp-c-${stamp}@test.local`}) returning id`;
    customer = c.id;
    const [a] =
      await sql`insert into public.addresses(user_id, city, area, street) values (${customer}, 'Cairo', 'Nasr City', 'St') returning id`;
    address = a.id;
    for (let i = 0; i < 3; i++) {
      const [d] =
        await sql`insert into auth.users(id, email) values (gen_random_uuid(), ${`disp-d${i}-${stamp}@test.local`}) returning id`;
      await sql`insert into public.user_roles(user_id, role) values (${d.id}, 'driver')`;
      await sql`insert into public.driver_profiles(user_id, status) values (${d.id}, 'available')`;
      drivers.push(d.id);
    }
    const [p] =
      await sql`insert into public.products(name_ar, name_en, price, sku) values ('م', 'P', 100, ${`DISP-${stamp}`}) returning id`;
    productId = p.id;
    const [v] =
      await sql`insert into public.product_variants(product_id, name_ar, name_en, stock) values (${productId}, 'L', 'L', 100) returning id`;
    variantId = v.id;
    for (let i = 0; i < 10; i++) {
      const id = await sql.begin(async (tx) => {
        await tx`select set_config('request.jwt.claims', ${JSON.stringify({ sub: customer, role: "authenticated" })}, true)`;
        await tx`set local role authenticated`;
        const items = tx.json([{ product_id: productId, variant_id: variantId, quantity: 1 }]);
        const [r] =
          await tx`select public.place_order(${items}, ${address}, 'asap', 'cod', '', null) as id`;
        return r.id as string;
      });
      orders.push(id);
    }
    await sql`update public.orders set status = 'confirmed' where id = any(${orders})`;
  }, 120_000);

  afterAll(async () => {
    if (!sql) return;
    try {
      if (orders.length) await sql`delete from public.orders where id = any(${orders})`;
      if (productId) await sql`delete from public.products where id = ${productId}`;
      const users = [customer, ...drivers].filter(Boolean);
      if (users.length) {
        await sql`delete from public.driver_profiles where user_id = any(${users})`;
        await sql`delete from public.user_roles where user_id = any(${users})`;
        // A driver with money history (a delivered order) cannot be deleted: the append-only driver ledger
        // keeps it (driver_ledger_driver_id_fkey, on delete restrict). Without roles or profile it shows nowhere.
        await sql`delete from auth.users u where u.id = any(${users})
                    and not exists (select 1 from public.driver_ledger l where l.driver_id = u.id)`;
      }
      for (const d of pausedDrivers)
        await sql`update public.driver_profiles set status = ${d.status} where user_id = ${d.user_id}`;
      if (settingsBackup)
        await sql`update public.store_settings set min_order_amount = ${settingsBackup.min_order_amount as string},
          max_active_orders_per_driver = ${settingsBackup.max_active_orders_per_driver as number},
          driver_accept_timeout_seconds = ${settingsBackup.driver_accept_timeout_seconds as number},
          features = features || jsonb_build_object('auto_dispatch_enabled', ${(settingsBackup.auto as boolean | null) ?? false}::boolean)
          where id = 1`;
    } finally {
      await sql.end();
    }
  }, 120_000);

  /** dispatch_order on its own connection (service context: no JWT). */
  const dispatch = (orderId: string) =>
    sql
      .begin(async (tx) => {
        const [r] = await tx`select public.dispatch_order(${orderId}) as r`;
        return r.r as string;
      })
      .catch((e: Error) => `error: ${e.message}`);

  const respond = (driver: string, offerId: string, accept: boolean) =>
    sql
      .begin(async (tx) => {
        await tx`select set_config('request.jwt.claims', ${JSON.stringify({ sub: driver, role: "authenticated" })}, true)`;
        await tx`set local role authenticated`;
        const [r] = await tx`select public.driver_respond_to_offer(${offerId}, ${accept}) as r`;
        return r.r as string;
      })
      .catch((e: Error) => `error: ${e.message}`);

  const openOffers = () =>
    sql<{ id: string; order_id: string; driver_id: string }[]>`
      select id, order_id, driver_id from public.order_dispatch_offers
       where order_id = any(${orders}) and status = 'offered'`;

  const invariants = async () => {
    const offers = await openOffers();
    expect(new Set(offers.map((o) => o.order_id)).size, "one open offer per order").toBe(
      offers.length,
    );
    expect(new Set(offers.map((o) => o.driver_id)).size, "one open offer per driver").toBe(
      offers.length,
    );
    const loads = await sql<{ driver_id: string; n: number }[]>`
      select driver_id, count(*)::int n from public.orders
       where driver_id = any(${drivers}) and status in ('confirmed','preparing','out_for_delivery') group by 1`;
    for (const l of loads) expect(l.n, "driver load within max").toBeLessThanOrEqual(3);
    const accepted = await sql<{ order_id: string; n: number }[]>`
      select order_id, count(*)::int n from public.order_dispatch_offers
       where order_id = any(${orders}) and status = 'accepted' group by 1 having count(*) > 1`;
    expect(accepted, "an order accepted more than once").toEqual([]);
    return offers;
  };

  it("10 parallel dispatches to 3 drivers: exactly 3 offers, one per driver", async () => {
    const results = await Promise.all(orders.map(dispatch));
    const errors = results.filter((r) => r.startsWith("error"));
    expect(errors, errors.join(" | ")).toEqual([]);
    expect(results.filter((r) => r === "offered")).toHaveLength(3);
    expect(results.filter((r) => r === "no_driver_available")).toHaveLength(7);
    const offers = await invariants();
    expect(new Set(offers.map((o) => o.driver_id))).toEqual(new Set(drivers));
  }, 60_000);

  it("repeated parallel dispatch of the same orders never creates a second offer", async () => {
    const results = await Promise.all([...orders, ...orders, ...orders].map(dispatch));
    expect(results.filter((r) => r.startsWith("error"))).toEqual([]);
    expect(await invariants()).toHaveLength(3);
  }, 60_000);

  it("parallel duplicate accepts: each order is assigned once; drivers fill up to the limit and no further", async () => {
    for (let round = 0; round < 4; round++) {
      const offers = await openOffers();
      if (!offers.length) break;
      // Each driver taps "accept" twice at the same moment.
      const answers = await Promise.all(
        offers.flatMap((o) => [respond(o.driver_id, o.id, true), respond(o.driver_id, o.id, true)]),
      );
      expect(answers.filter((a) => a.startsWith("error"))).toEqual([]);
      expect(answers.every((a) => a === "accepted")).toBe(true);
      await invariants();
      // Waiting orders are dispatched again, all at once.
      const waiting = await sql<{ id: string }[]>`
        select id from public.orders where id = any(${orders}) and driver_id is null`;
      await Promise.all(waiting.map((w) => dispatch(w.id)));
      await invariants();
    }
    const assigned = await sql<{ driver_id: string; n: number }[]>`
      select driver_id, count(*)::int n from public.orders where id = any(${orders}) and driver_id is not null group by 1`;
    expect(assigned.map((a) => a.n).sort()).toEqual([3, 3, 3]);
    const [left] = await sql`
      select dispatch_status from public.orders where id = any(${orders}) and driver_id is null`;
    expect(left.dispatch_status).toBe("no_driver_available");
  }, 120_000);

  it("parallel reject and expiry move orders on without double offers", async () => {
    // Free one driver: deliver one of their orders, then offer the last order to them and race reject vs expiry.
    const [one] =
      await sql`select id, driver_id from public.orders where id = any(${orders}) and driver_id = ${drivers[0]} limit 1`;
    await sql`update public.orders set status = 'out_for_delivery' where id = ${one.id}`;
    await sql`update public.orders set status = 'delivered' where id = ${one.id}`;
    const [last] =
      await sql`select id from public.orders where id = any(${orders}) and driver_id is null`;
    expect(await dispatch(last.id)).toBe("offered");
    const [offer] = await openOffers();
    expect(offer.driver_id).toBe(drivers[0]);
    await sql`update public.order_dispatch_offers set expires_at = now() - interval '1 second' where id = ${offer.id}`;
    const [reject, expire] = await Promise.all([
      respond(offer.driver_id, offer.id, false),
      sql`select public.expire_stale_offers() as n`.then((r) => String(r[0].n)),
    ]);
    expect(["expired", "rejected"]).toContain(reject);
    expect(expire).toMatch(/^[01]$/);
    const [o] = await sql`select status from public.order_dispatch_offers where id = ${offer.id}`;
    expect(["expired", "rejected"]).toContain(o.status);
    await invariants();
  }, 60_000);
});
