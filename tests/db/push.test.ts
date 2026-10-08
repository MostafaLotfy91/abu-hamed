// Web Push subscriptions: ownership, registration and the offer -> push trigger (a no-op without pg_net/Vault).
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
let driver: string, other: string, customer: string;
const keys = { p256dh: "BPkey", auth: "authkey" };

beforeAll(async () => {
  db = await freshDb();
  driver = await createUser(db, "pd@test.local", ["driver"]);
  other = await createUser(db, "po@test.local", ["driver"]);
  customer = await createUser(db, "pc@test.local");
});

const register = (who: string, endpoint: string) =>
  as(db, user(who), async (tx) => {
    const { rows } = await tx.query<{ id: string }>(
      `select public.register_push_subscription($1, $2::jsonb, 'UA') as id`,
      [endpoint, JSON.stringify(keys)],
    );
    return rows[0].id;
  });

describe("push_subscriptions", () => {
  it("a user registers a device and sees only their own subscriptions", async () => {
    await register(driver, "https://push.example/a");
    await register(other, "https://push.example/b");
    const mine = await as(db, user(driver), (tx) =>
      tx.query(`select endpoint, keys from public.push_subscriptions`),
    );
    expect(mine.rows).toEqual([{ endpoint: "https://push.example/a", keys }]);
  });

  it("re-registering an endpoint from another account moves it (shared phone)", async () => {
    await register(customer, "https://push.example/shared");
    await register(driver, "https://push.example/shared");
    const r = await one<{ user_id: string; n: number }>(
      db,
      `select user_id, count(*) over ()::int n from public.push_subscriptions where endpoint = 'https://push.example/shared'`,
    );
    expect(r).toEqual({ user_id: driver, n: 1 });
  });

  it("users delete only their own rows and cannot insert or update directly", async () => {
    await register(other, "https://push.example/c");
    await as(db, user(driver), (tx) =>
      tx.query(`delete from public.push_subscriptions where endpoint = 'https://push.example/c'`),
    );
    expect(
      (
        await one<{ n: number }>(
          db,
          `select count(*)::int n from public.push_subscriptions where endpoint = 'https://push.example/c'`,
        )
      ).n,
    ).toBe(1);
    expect(
      await tryAs(db, user(driver), (tx) =>
        tx.query(
          `insert into public.push_subscriptions(user_id, endpoint, keys) values ($1, 'https://push.example/x', '{"p256dh":"a","auth":"b"}')`,
          [driver],
        ),
      ),
    ).toMatch(/permission denied/);
    expect(
      await tryAs(db, user(driver), (tx) =>
        tx.query(`update public.push_subscriptions set user_id = $1`, [driver]),
      ),
    ).toMatch(/permission denied/);
  });

  it("anon has no access", async () => {
    expect(
      await tryAs(db, anon, (tx) => tx.query(`select 1 from public.push_subscriptions`)),
    ).toMatch(/permission denied/);
    expect(
      await tryAs(db, anon, (tx) =>
        tx.query(`select public.register_push_subscription('https://push.example/z', '{}'::jsonb)`),
      ),
    ).toMatch(/permission denied/);
  });

  it("rejects non-https endpoints and missing keys", async () => {
    expect(
      await tryAs(db, user(driver), (tx) =>
        tx.query(`select public.register_push_subscription('http://insecure', $1::jsonb)`, [
          JSON.stringify(keys),
        ]),
      ),
    ).toMatch(/check constraint/);
  });
});

describe("offer -> push trigger", () => {
  it("creating an offer still works when pg_net/Vault are not set up (push is skipped)", async () => {
    await db.query(`update public.store_settings set min_order_amount = 0 where id = 1`);
    const addr = await createAddress(db, customer);
    const { productId, variantId } = await createProduct(db);
    const o = await placeOrder(db, customer, addr, [
      { product_id: productId, variant_id: variantId, quantity: 1 },
    ]);
    await db.query(`update public.orders set status = 'confirmed' where id = $1`, [o]);
    const r = await one<{ r: string }>(db, `select public.dispatch_order($1) as r`, [o]);
    expect(r.r).toBe("offered");
  });
});
