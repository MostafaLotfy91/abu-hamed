// True concurrency needs a real multi-connection Postgres (PGlite has a single connection).
// Runs only when TEST_DATABASE_URL (env or .env.test) points at a local Supabase database
// (postgresql://postgres:postgres@127.0.0.1:54322/postgres after `supabase start`) or, with
// E2E_ALLOW_REMOTE=staging, at the staging project from supabase/config.toml. Anything else is refused.
// Everything it creates is deleted afterwards and store_settings.min_order_amount is restored.
import postgres from "postgres";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { assertAllowed, isLocalUrl, loadEnvTest } from "../safety";

loadEnvTest();
const raw = (process.env["TEST_DATABASE_URL"] ?? "").trim();
const url = raw.includes("PASTE_") ? "" : raw; // unfilled placeholder from scripts/make-env-test.mjs
if (url) assertAllowed(url, "TEST_DATABASE_URL", "db");

describe.skipIf(!url)("concurrency on a real Supabase database", () => {
  let sql: postgres.Sql;
  const users: string[] = [];
  const addresses: string[] = [];
  let productId: string, variantId: string;
  let originalMinOrder: string | null = null;
  const couponCodes: string[] = [];

  beforeAll(async () => {
    // Supabase's session pooler (port 5432) caps clients at the pool size (15), below the 20 parallel orders, so
    // use its transaction mode (6543) instead. All per-request state here is transaction-scoped (set local /
    // set_config(..., true)), which is exactly what transaction mode supports; it needs prepare: false.
    const target = new URL(url);
    const txPooler = /\.pooler\.supabase\.com$/.test(target.hostname) && target.port === "5432";
    if (txPooler) target.port = "6543";
    sql = postgres(target.toString(), {
      max: 25,
      prepare: !txPooler,
      ssl: isLocalUrl(url) ? false : "require",
    });
    const [s] = await sql`select min_order_amount from public.store_settings where id = 1`;
    originalMinOrder = s.min_order_amount;
    await sql`update public.store_settings set min_order_amount = 0 where id = 1`;
    for (let i = 0; i < 20; i++) {
      const [u] =
        await sql`insert into auth.users(id, email) values (gen_random_uuid(), ${`conc${i}-${Date.now()}@test.local`}) returning id`;
      users.push(u.id);
      const [a] =
        await sql`insert into public.addresses(user_id, city, street) values (${u.id}, 'Cairo', 'St') returning id`;
      addresses.push(a.id);
    }
    const [p] =
      await sql`insert into public.products(name_ar, name_en, price, sku) values ('م', 'P', 100, ${`CONC-${Date.now()}`}) returning id`;
    productId = p.id;
    const [v] =
      await sql`insert into public.product_variants(product_id, name_ar, name_en, stock) values (${productId}, 'L', 'L', 5) returning id`;
    variantId = v.id;
  });

  afterAll(async () => {
    if (!sql) return;
    try {
      if (users.length) await sql`delete from public.orders where user_id = any(${users})`;
      if (productId) await sql`delete from public.products where id = ${productId}`;
      if (couponCodes.length)
        await sql`delete from public.coupons where code = any(${couponCodes})`;
      if (users.length) await sql`delete from auth.users where id = any(${users})`;
      if (originalMinOrder !== null)
        await sql`update public.store_settings set min_order_amount = ${originalMinOrder} where id = 1`;
    } finally {
      await sql.end();
    }
  });

  /** place_order as user i on its own connection, in parallel. */
  const place = (i: number, coupon = "") =>
    sql
      .begin(async (tx) => {
        await tx`select set_config('request.jwt.claims', ${JSON.stringify({ sub: users[i], role: "authenticated" })}, true)`;
        await tx`set local role authenticated`;
        // Pass the array itself: postgres.js serializes json params, so a pre-stringified value would arrive as a JSON string.
        const items = tx.json([{ product_id: productId, variant_id: variantId, quantity: 1 }]);
        await tx`select public.place_order(${items}, ${addresses[i]}, 'asap', 'cod', ${coupon}, null)`;
      })
      .then(
        () => "ok",
        (e: Error) => e.message,
      );

  it("20 parallel orders on stock 5 -> exactly 5 succeed and stock ends at 0", async () => {
    const results = await Promise.all(users.map((_, i) => place(i)));
    const why = [...new Set(results.filter((r) => r !== "ok"))].join(" | ");
    expect(
      results.filter((r) => r === "ok"),
      why,
    ).toHaveLength(5);
    const [v] = await sql`select stock from public.product_variants where id = ${variantId}`;
    expect(v.stock).toBe(0);
  });

  it("20 parallel orders with a max_uses = 3 coupon -> exactly 3 succeed", async () => {
    await sql`update public.product_variants set stock = 100 where id = ${variantId}`;
    const code = `PAR${Date.now()}`;
    couponCodes.push(code);
    await sql`insert into public.coupons(code, discount_type, value, max_uses) values (${code}, 'fixed', 10, 3)`;
    const results = await Promise.all(users.map((_, i) => place(i, code)));
    const why = [...new Set(results.filter((r) => r !== "ok"))].join(" | ");
    expect(
      results.filter((r) => r === "ok"),
      why,
    ).toHaveLength(3);
    const [c] = await sql`select used_count from public.coupons where code = ${code}`;
    expect(c.used_count).toBe(3);
  });
});
