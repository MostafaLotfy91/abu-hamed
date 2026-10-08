// Builds a throwaway Postgres (PGlite, in-process) from supabase/migrations and runs queries as
// the Supabase API roles. No network, no real Supabase project.
import { PGlite, type Transaction } from "@electric-sql/pglite";
import { pg_trgm } from "@electric-sql/pglite/contrib/pg_trgm";
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";

const ROOT = path.resolve(__dirname, "../..");
const MIGRATIONS = path.join(ROOT, "supabase/migrations");

export const migrationFiles = () =>
  readdirSync(MIGRATIONS)
    .filter((f) => f.endsWith(".sql"))
    .sort();

/** Applies migration files (in order) whose version is >= `from` and < `before`. */
export async function applyMigrations(db: PGlite, opts: { from?: string; before?: string } = {}) {
  for (const f of migrationFiles()) {
    const v = f.split("_")[0];
    if ((opts.from && v < opts.from) || (opts.before && v >= opts.before)) continue;
    try {
      await db.exec(readFileSync(path.join(MIGRATIONS, f), "utf8"));
    } catch (e) {
      throw new Error(`migration ${f} failed: ${(e as Error).message}`);
    }
  }
}

/** Fresh database with the Supabase shim and every migration (or those before `before`) applied in order. */
export async function freshDb(opts: { before?: string } = {}) {
  const db = new PGlite({ extensions: { pg_trgm } });
  await db.exec(readFileSync(path.join(__dirname, "supabase-shim.sql"), "utf8"));
  await applyMigrations(db, { before: opts.before });
  return db;
}

export type Who =
  { role: "anon" } | { role: "authenticated"; id: string } | { role: "service_role" };

export const anon: Who = { role: "anon" };
export const service: Who = { role: "service_role" };
export const user = (id: string): Who => ({ role: "authenticated", id });

/** Runs fn inside a transaction as the given API role with matching JWT claims; rolls back on error. */
export async function as<T>(db: PGlite, who: Who, fn: (tx: Transaction) => Promise<T>): Promise<T> {
  return db.transaction(async (tx) => {
    const claims =
      who.role === "authenticated" ? { sub: who.id, role: who.role } : { role: who.role };
    await tx.query(`select set_config('request.jwt.claims', $1, true)`, [JSON.stringify(claims)]);
    await tx.exec(`set local role ${who.role}`);
    return fn(tx);
  });
}

/** Same as `as`, but returns the error message (or null) instead of throwing. */
export async function tryAs(db: PGlite, who: Who, fn: (tx: Transaction) => Promise<unknown>) {
  try {
    await as(db, who, fn);
    return null;
  } catch (e) {
    return (e as Error).message;
  }
}

/** Creates an auth user (plus profile) and optional roles, as the database owner. */
export async function createUser(db: PGlite, email: string, roles: string[] = []) {
  const { rows } = await db.query<{ id: string }>(
    `insert into auth.users(email) values ($1) returning id`,
    [email],
  );
  const id = rows[0].id;
  await db.query(
    `insert into public.profiles(id, full_name, phone, email) values ($1, $2, '01000000000', $3)`,
    [id, email.split("@")[0], email],
  );
  for (const r of roles)
    await db.query(`insert into public.user_roles(user_id, role) values ($1, $2)`, [id, r]);
  if (roles.includes("driver"))
    await db.query(`insert into public.driver_profiles(user_id, status) values ($1, 'available')`, [
      id,
    ]);
  return id;
}

export async function createAddress(db: PGlite, userId: string) {
  const { rows } = await db.query<{ id: string }>(
    `insert into public.addresses(user_id, city, street, phone) values ($1, 'Cairo', 'Street 1', '01000000000') returning id`,
    [userId],
  );
  return rows[0].id;
}

/** A product with one variant, as the database owner. */
export async function createProduct(
  db: PGlite,
  opts: { price?: number; stock?: number; variantPrice?: number | null } = {},
) {
  const sku = `T-${Math.random().toString(36).slice(2, 10)}`;
  const { rows } = await db.query<{ id: string }>(
    `insert into public.products(name_ar, name_en, price, stock, sku) values ('منتج', 'Product', $1, 0, $2) returning id`,
    [opts.price ?? 100, sku],
  );
  const productId = rows[0].id;
  const v = await db.query<{ id: string }>(
    `insert into public.product_variants(product_id, name_ar, name_en, size, color_ar, color_en, price, stock, sku)
     values ($1, 'L / أسود', 'L / Black', 'L', 'أسود', 'Black', $2, $3, $4) returning id`,
    [productId, opts.variantPrice ?? null, opts.stock ?? 10, `${sku}-L`],
  );
  return { productId, variantId: v.rows[0].id };
}

/** Calls place_order as the given customer; returns the order id. */
export async function placeOrder(
  db: PGlite,
  userId: string,
  addressId: string,
  items: Record<string, unknown>[],
  coupon = "",
) {
  return as(db, user(userId), async (tx) => {
    const { rows } = await tx.query<{ id: string }>(
      `select public.place_order($1::jsonb, $2, 'asap', 'cod', $3, null) as id`,
      [JSON.stringify(items), addressId, coupon],
    );
    return rows[0].id;
  });
}

export async function one<T = Record<string, unknown>>(
  db: PGlite,
  sql: string,
  params: unknown[] = [],
) {
  return (await db.query<T>(sql, params)).rows[0];
}
