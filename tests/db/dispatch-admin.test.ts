// admin_dispatch_alerts: orders waiting for a driver (no driver available, or unassigned too long).
import type { PGlite } from "@electric-sql/pglite";
import { beforeAll, describe, expect, it } from "vitest";
import {
  as,
  anon,
  createAddress,
  createProduct,
  createUser,
  freshDb,
  placeOrder,
  tryAs,
  user,
} from "./harness";

let db: PGlite;
let staff: string, customer: string, driver: string, addr: string;
let productId: string, variantId: string;

beforeAll(async () => {
  db = await freshDb();
  await db.query(
    `update public.store_settings set min_order_amount = 0, dispatch_alert_after_minutes = 10 where id = 1`,
  );
  staff = await createUser(db, "s@test.local", ["staff"]);
  customer = await createUser(db, "c@test.local");
  driver = await createUser(db, "d@test.local", ["driver"]);
  addr = await createAddress(db, customer);
  ({ productId, variantId } = await createProduct(db, { stock: 50 }));
});

const order = async (status: "confirmed" | "preparing") => {
  const id = await placeOrder(db, customer, addr, [
    { product_id: productId, variant_id: variantId, quantity: 1 },
  ]);
  await db.query(`update public.orders set status = 'confirmed' where id = $1`, [id]);
  if (status === "preparing")
    await db.query(`update public.orders set status = 'preparing' where id = $1`, [id]);
  return id;
};
/** Moves the moment the order entered its current status into the past. */
const ageMinutes = (id: string, mins: number) =>
  db.query(
    `update public.order_status_history set created_at = now() - make_interval(mins => $2)
      where order_id = $1 and status = (select status from public.orders where id = $1)`,
    [id, mins],
  );
const alerts = () =>
  as(
    db,
    user(staff),
    async (tx) =>
      (
        await tx.query<{ order_id: string; reason: string; waited_minutes: number }>(
          `select order_id, reason, waited_minutes from public.admin_dispatch_alerts()`,
        )
      ).rows,
  );

describe("admin_dispatch_alerts", () => {
  it("flags orders with no available driver and orders unassigned longer than the setting", async () => {
    const fresh = await order("confirmed");
    const old = await order("preparing");
    await ageMinutes(old, 11);
    const stuck = await order("confirmed");
    await db.query(
      `update public.orders set dispatch_status = 'no_driver_available' where id = $1`,
      [stuck],
    );
    const assigned = await order("confirmed");
    await ageMinutes(assigned, 30);
    await db.query(`update public.orders set driver_id = $1 where id = $2`, [driver, assigned]);

    const r = await alerts();
    const byId = new Map(r.map((x) => [x.order_id, x.reason]));
    expect(byId.get(old)).toBe("waiting");
    // Minutes are computed by the database (a wrong clock on the admin PC cannot change them).
    expect(r.find((x) => x.order_id === old)?.waited_minutes).toBe(11);
    expect(byId.get(stuck)).toBe("no_driver");
    expect(byId.has(fresh)).toBe(false);
    expect(byId.has(assigned)).toBe(false);
  });

  it("follows dispatch_alert_after_minutes", async () => {
    const o = await order("confirmed");
    await ageMinutes(o, 4);
    expect((await alerts()).some((x) => x.order_id === o)).toBe(false);
    await db.query(
      `update public.store_settings set dispatch_alert_after_minutes = 3 where id = 1`,
    );
    expect((await alerts()).some((x) => x.order_id === o)).toBe(true);
  });

  it("returns nothing to non-staff and is closed to anon", async () => {
    const rows = await as(
      db,
      user(customer),
      async (tx) => (await tx.query(`select * from public.admin_dispatch_alerts()`)).rows,
    );
    expect(rows).toEqual([]);
    expect(
      await tryAs(db, anon, (tx) => tx.query(`select * from public.admin_dispatch_alerts()`)),
    ).toMatch(/permission denied/);
  });
});
