// Driver notifications: who is notified when an order reaches the start status (preparing), manual
// assignment, and the notification_log rows that make every attempt and failure visible.
// pg_net and Vault are stood in by a fake net.http_post that records calls, so the queue path is covered.
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
let customer: string, addr: string, staff: string, d1: string, d2: string, variantId: string;
let productId: string;

const FAKE_PUSH = `
  create schema if not exists net;
  create table net.calls(id bigint generated always as identity, url text, headers jsonb, body jsonb);
  create function net.http_post(url text, body jsonb default '{}', params jsonb default '{}',
                                headers jsonb default '{}', timeout_milliseconds int default 5000)
  returns bigint language sql as $$
    insert into net.calls(url, headers, body) values (url, headers, body) returning id $$;
  create schema if not exists vault;
  create table vault.decrypted_secrets(name text primary key, decrypted_secret text);
  insert into vault.decrypted_secrets values
    ('driver_push_url', 'https://fn.example/send-driver-push'), ('driver_push_secret', 'hook');
`;

beforeEach(async () => {
  db = await freshDb();
  await db.query(`update public.store_settings set min_order_amount = 0 where id = 1`);
  customer = await createUser(db, "nc@test.local");
  addr = await createAddress(db, customer);
  staff = await createUser(db, "ns@test.local", ["staff"]);
  d1 = await createUser(db, "nd1@test.local", ["driver"]);
  d2 = await createUser(db, "nd2@test.local", ["driver"]);
  ({ productId, variantId } = await createProduct(db, { stock: 100 }));
});

const autoDispatch = (on: boolean) =>
  db.query(
    `update public.store_settings set features = features || jsonb_build_object('auto_dispatch_enabled', $1::boolean, 'delivery_tracking', true) where id = 1`,
    [on],
  );

async function confirmedOrder() {
  const id = await placeOrder(db, customer, addr, [
    { product_id: productId, variant_id: variantId, quantity: 1 },
  ]);
  await db.query(`update public.orders set status = 'confirmed' where id = $1`, [id]);
  return id;
}

/** Order status change as staff (the admin screen's update). */
const setStatus = (orderId: string, status: string) =>
  as(db, user(staff), (tx) =>
    tx.query(`update public.orders set status = $1 where id = $2`, [status, orderId]),
  );
const assign = (orderId: string, driver: string | null) =>
  as(db, user(staff), (tx) =>
    tx.query(`update public.orders set driver_id = $1 where id = $2`, [driver, orderId]),
  );

type Log = {
  event: string;
  recipient: string | null;
  status: string;
  error: string | null;
  offer_id: string | null;
};
const logs = async (orderId: string) =>
  (
    await db.query<Log>(
      `select event, recipient, status, error, offer_id from public.notification_log where order_id = $1 order by created_at, id`,
      [orderId],
    )
  ).rows;

describe("start status", () => {
  it("defaults to preparing and stays configurable (confirmed | preparing)", async () => {
    const s = await one<{ s: string }>(
      db,
      `select dispatch_trigger_status s from public.store_settings where id = 1`,
    );
    expect(s.s).toBe("preparing");
    await db.query(`update public.store_settings set dispatch_trigger_status = 'confirmed'`);
    await expect(
      db.query(`update public.store_settings set dispatch_trigger_status = 'delivered'`),
    ).rejects.toThrow(/check/);
  });
});

describe("status -> preparing", () => {
  it("offers the order to an available driver and logs a push for that driver", async () => {
    await autoDispatch(true);
    await db.query(`update public.driver_profiles set status = 'offline' where user_id = $1`, [d2]);
    const o = await confirmedOrder();
    expect(await logs(o)).toEqual([]); // nothing at confirmed
    await setStatus(o, "preparing");
    const offer = await one<{ id: string; driver_id: string }>(
      db,
      `select id, driver_id from public.order_dispatch_offers where order_id = $1 and status = 'offered'`,
      [o],
    );
    expect(offer.driver_id).toBe(d1);
    expect(await logs(o)).toEqual([
      {
        event: "offer_created",
        recipient: d1,
        status: "not_configured",
        error: "pg_net or Vault is not installed",
        offer_id: offer.id,
      },
    ]);
  });

  it("with pg_net and Vault: queues the call with only the log id (and offer id)", async () => {
    await db.exec(FAKE_PUSH);
    await autoDispatch(true);
    const o = await confirmedOrder();
    await setStatus(o, "preparing");
    const [log] = await logs(o);
    expect(log).toMatchObject({ event: "offer_created", status: "queued", error: null });
    const id = await one<{ id: string; request_id: number }>(
      db,
      `select id, request_id from public.notification_log where order_id = $1`,
      [o],
    );
    const call = await one<{ url: string; headers: Record<string, string>; body: unknown }>(
      db,
      `select url, headers, body from net.calls order by id desc limit 1`,
    );
    expect(call.url).toBe("https://fn.example/send-driver-push");
    expect(call.headers.authorization).toBe("Bearer hook");
    expect(call.body).toEqual({ log_id: id.id, offer_id: log.offer_id });
    expect(id.request_id).toBeGreaterThan(0);
  });

  it("no available driver: the status still changes and a skipped row says why", async () => {
    await autoDispatch(true);
    await db.query(`update public.driver_profiles set status = 'offline'`);
    const o = await confirmedOrder();
    await setStatus(o, "preparing");
    expect(
      (await one<{ status: string }>(db, `select status from public.orders where id = $1`, [o]))
        .status,
    ).toBe("preparing");
    expect(await logs(o)).toEqual([
      {
        event: "offer_created",
        recipient: null,
        status: "skipped",
        error: "no_driver_available",
        offer_id: null,
      },
    ]);
  });

  it("auto dispatch off: no offer, and the log says so", async () => {
    await autoDispatch(false);
    const o = await confirmedOrder();
    await setStatus(o, "preparing");
    expect(
      (
        await one<{ n: number }>(
          db,
          `select count(*)::int n from public.order_dispatch_offers where order_id = $1`,
          [o],
        )
      ).n,
    ).toBe(0);
    expect((await logs(o)).map((l) => [l.status, l.error])).toEqual([
      ["skipped", "auto_dispatch_off"],
    ]);
  });

  it("a pre-assigned driver is notified directly at preparing (no offer)", async () => {
    await autoDispatch(true);
    const o = await confirmedOrder();
    await assign(o, d2);
    await setStatus(o, "preparing");
    expect((await logs(o)).map((l) => [l.event, l.recipient])).toEqual([
      ["order_assigned", d2],
      ["order_status", d2],
    ]);
    expect(
      (
        await one<{ n: number }>(
          db,
          `select count(*)::int n from public.order_dispatch_offers where order_id = $1`,
          [o],
        )
      ).n,
    ).toBe(0);
  });

  it("follows the setting: start status confirmed notifies at confirmed", async () => {
    await db.query(`update public.store_settings set dispatch_trigger_status = 'confirmed'`);
    await autoDispatch(true);
    const o = await confirmedOrder();
    const offer = await one<{ driver_id: string }>(
      db,
      `select driver_id from public.order_dispatch_offers where order_id = $1`,
      [o],
    );
    expect((await logs(o)).map((l) => [l.event, l.recipient])).toEqual([
      ["offer_created", offer.driver_id],
    ]);
  });
});

describe("manual assignment", () => {
  it("notifies the assigned driver even with auto dispatch off", async () => {
    await autoDispatch(false);
    const o = await confirmedOrder();
    await assign(o, d1);
    expect((await logs(o)).map((l) => [l.event, l.recipient])).toEqual([["order_assigned", d1]]);
  });

  it("an accepted offer is not reported again as a manual assignment", async () => {
    await autoDispatch(true);
    const o = await confirmedOrder();
    await setStatus(o, "preparing");
    const offer = await one<{ id: string; driver_id: string }>(
      db,
      `select id, driver_id from public.order_dispatch_offers where order_id = $1`,
      [o],
    );
    await as(db, user(offer.driver_id), (tx) =>
      tx.query(`select public.driver_respond_to_offer($1, true)`, [offer.id]),
    );
    expect((await logs(o)).map((l) => l.event)).toEqual(["offer_created"]);
  });

  it("unassigning or finished orders notify nobody", async () => {
    const o = await confirmedOrder();
    await assign(o, d1);
    await assign(o, null);
    await setStatus(o, "cancelled");
    expect((await logs(o)).map((l) => l.event)).toEqual(["order_assigned"]);
  });
});

describe("notification_log access", () => {
  it("drivers read only their own rows, staff read all, nobody writes", async () => {
    const o = await confirmedOrder();
    await assign(o, d1);
    const mine = await as(db, user(d1), (tx) =>
      tx.query(`select event from public.notification_log`),
    );
    expect(mine.rows).toEqual([{ event: "order_assigned" }]);
    const other = await as(db, user(d2), (tx) => tx.query(`select 1 from public.notification_log`));
    expect(other.rows).toEqual([]);
    const all = await as(db, user(staff), (tx) =>
      tx.query(`select 1 from public.notification_log`),
    );
    expect(all.rows.length).toBe(1);
    for (const sql of [
      `insert into public.notification_log(event) values ('test')`,
      `update public.notification_log set status = 'sent'`,
      `delete from public.notification_log`,
    ])
      expect(await tryAs(db, user(d1), (tx) => tx.query(sql))).toMatch(/permission denied/);
    expect(
      await tryAs(db, anon, (tx) => tx.query(`select 1 from public.notification_log`)),
    ).toMatch(/permission denied/);
  });
});

describe("my_push_device", () => {
  const register = (who: string, endpoint: string) =>
    as(db, user(who), (tx) =>
      tx.query(
        `select public.register_push_subscription($1, '{"p256dh":"p","auth":"a"}'::jsonb, 'UA')`,
        [endpoint],
      ),
    );
  const device = (who: string, endpoint: string) =>
    as(
      db,
      user(who),
      async (tx) => (await tx.query(`select * from public.my_push_device($1)`, [endpoint])).rows[0],
    );

  it("reports registered / other account / missing, with age and last result for the owner only", async () => {
    await register(d1, "https://push.example/dev1");
    await db.query(
      `update public.push_subscriptions set last_failure_at = now(), last_error = '403 VAPID key mismatch' where endpoint = 'https://push.example/dev1'`,
    );
    expect(await device(d1, "https://push.example/dev1")).toMatchObject({
      registered: true,
      other_account: false,
      last_error: "403 VAPID key mismatch",
    });
    expect(await device(d2, "https://push.example/dev1")).toMatchObject({
      registered: false,
      other_account: true,
      created_at: null,
      last_error: null,
    });
    expect(await device(d1, "https://push.example/gone")).toMatchObject({
      registered: false,
      other_account: false,
    });
    // Re-registering clears the old failure.
    await register(d1, "https://push.example/dev1");
    expect((await device(d1, "https://push.example/dev1")).last_error).toBeNull();
    expect(
      await tryAs(db, anon, (tx) => tx.query(`select * from public.my_push_device('x')`)),
    ).toMatch(/permission denied/);
  });
});
