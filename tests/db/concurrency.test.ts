// True concurrency needs a real multi-connection Postgres (PGlite has a single connection).
// Runs only when TEST_DATABASE_URL points at a LOCAL Supabase database (e.g. after `supabase start`:
// postgresql://postgres:postgres@127.0.0.1:54322/postgres). Refuses anything that isn't localhost.
import postgres from "postgres";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const url = process.env["TEST_DATABASE_URL"];
const isLocal = !!url && /@(localhost|127\.0\.0\.1)(:\d+)?\//.test(url);

describe.skipIf(!isLocal)("concurrency on a local Supabase database", () => {
  let sql: postgres.Sql;
  const users: string[] = [];
  const addresses: string[] = [];
  let productId: string, variantId: string;

  beforeAll(async () => {
    sql = postgres(url!, { max: 25 });
    await sql`update public.store_settings set min_order_amount = 0 where id = 1`;
    for (let i = 0; i < 20; i++) {
      const [u] = await sql`insert into auth.users(id, email) values (gen_random_uuid(), ${`conc${i}-${Date.now()}@test.local`}) returning id`;
      users.push(u.id);
      const [a] = await sql`insert into public.addresses(user_id, city, street) values (${u.id}, 'Cairo', 'St') returning id`;
      addresses.push(a.id);
    }
    const [p] = await sql`insert into public.products(name_ar, name_en, price, sku) values ('م', 'P', 100, ${`CONC-${Date.now()}`}) returning id`;
    productId = p.id;
    const [v] = await sql`insert into public.product_variants(product_id, name_ar, name_en, stock) values (${productId}, 'L', 'L', 5) returning id`;
    variantId = v.id;
  });

  afterAll(async () => sql?.end());

  /** place_order as user i on its own connection, in parallel. */
  const place = (i: number, coupon = "") =>
    sql.begin(async (tx) => {
      await tx`select set_config('request.jwt.claims', ${JSON.stringify({ sub: users[i], role: "authenticated" })}, true)`;
      await tx`set local role authenticated`;
      const items = JSON.stringify([{ product_id: productId, variant_id: variantId, quantity: 1 }]);
      await tx`select public.place_order(${items}::jsonb, ${addresses[i]}, 'asap', 'cod', ${coupon}, null)`;
    }).then(() => "ok", (e: Error) => e.message);

  it("20 parallel orders on stock 5 -> exactly 5 succeed and stock ends at 0", async () => {
    const results = await Promise.all(users.map((_, i) => place(i)));
    expect(results.filter((r) => r === "ok")).toHaveLength(5);
    const [v] = await sql`select stock from public.product_variants where id = ${variantId}`;
    expect(v.stock).toBe(0);
  });

  it("20 parallel orders with a max_uses = 3 coupon -> exactly 3 succeed", async () => {
    await sql`update public.product_variants set stock = 100 where id = ${variantId}`;
    const code = `PAR${Date.now()}`;
    await sql`insert into public.coupons(code, discount_type, value, max_uses) values (${code}, 'fixed', 10, 3)`;
    const results = await Promise.all(users.map((_, i) => place(i, code)));
    expect(results.filter((r) => r === "ok")).toHaveLength(3);
    const [c] = await sql`select used_count from public.coupons where code = ${code}`;
    expect(c.used_count).toBe(3);
  });
});
