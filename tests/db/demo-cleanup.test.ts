// The demo-data removal migration: removes only the template's sample data, keeps real data and settings.
import type { PGlite } from "@electric-sql/pglite";
import { beforeAll, describe, expect, it } from "vitest";
import { applyMigrations, createAddress, createUser, freshDb, one, placeOrder } from "./harness";

const CLEANUP = "20261008120000";
const DEMO_CAT = "a277259a-ec31-54fb-bada-cca3b5d78ceb"; // "Men's clothing" from the seed
const DEMO_SUB = "3b35b1f0-f0b2-52b1-9859-219a86c2e469"; // its "T-shirts" child

describe("on a fresh project", () => {
  let db: PGlite;
  beforeAll(async () => {
    db = await freshDb();
  });

  it("leaves no demo catalogue, banners, branch or WELCOME10", async () => {
    const r = await one<Record<string, number>>(
      db,
      `select
      (select count(*) from public.products)::int products,
      (select count(*) from public.product_variants)::int variants,
      (select count(*) from public.categories)::int categories,
      (select count(*) from public.banners)::int banners,
      (select count(*) from public.branches)::int branches,
      (select count(*) from public.coupons)::int coupons`,
    );
    expect(r).toEqual({
      products: 0,
      variants: 0,
      categories: 0,
      banners: 0,
      branches: 0,
      coupons: 0,
    });
  });

  it("resets store settings to neutral defaults, keeping the singleton row", async () => {
    const s = await one<Record<string, unknown>>(
      db,
      `select name_ar, name_en, tagline_ar, primary_color, contact_phone, whatsapp_number, delivery_fee::float, min_order_amount::float from public.store_settings`,
    );
    expect(s).toMatchObject({
      name_ar: "متجري",
      name_en: "My Store",
      tagline_ar: null,
      primary_color: "#111111",
      contact_phone: null,
      whatsapp_number: null,
      delivery_fee: 0,
      min_order_amount: 0,
    });
  });

  it("drops the grocery-era order_items.unit column", async () => {
    const r = await one<{ n: number }>(
      db,
      `select count(*)::int n from information_schema.columns where table_name = 'order_items' and column_name = 'unit'`,
    );
    expect(r.n).toBe(0);
  });
});

describe("on a store that already has real data", () => {
  let db: PGlite;
  let realProduct: string, realOrder: string, demoOrder: string, customer: string;

  beforeAll(async () => {
    db = await freshDb({ before: CLEANUP });
    customer = await createUser(db, "real@shop.test");
    const addr = await createAddress(db, customer);
    await db.query(
      `update public.store_settings set name_ar = 'متجر حقيقي', name_en = 'Real Shop', primary_color = '#aa0000', min_order_amount = 0 where id = 1`,
    );
    // A real product placed in a demo sub-category, and a real coupon.
    realProduct = (
      await one<{ id: string }>(
        db,
        `insert into public.products(name_ar, name_en, price, sku, category_id) values ('حقيقي', 'Real', 50, 'REAL-1', $1) returning id`,
        [DEMO_SUB],
      )
    ).id;
    await db.query(
      `insert into public.product_variants(product_id, name_ar, name_en, size, stock) values ($1, 'M', 'M', 'M', 5)`,
      [realProduct],
    );
    await db.query(
      `insert into public.coupons(code, discount_type, value) values ('REAL5', 'fixed', 5)`,
    );
    const realVariant = (
      await one<{ id: string }>(
        db,
        `select id from public.product_variants where product_id = $1`,
        [realProduct],
      )
    ).id;
    realOrder = await placeOrder(db, customer, addr, [
      { product_id: realProduct, variant_id: realVariant, quantity: 1 },
    ]);
    const demo = await one<{ pid: string; vid: string }>(
      db,
      `select p.id pid, v.id vid from public.products p join public.product_variants v on v.product_id = p.id where p.sku = 'AH001' and v.stock > 0 limit 1`,
    );
    demoOrder = await placeOrder(db, customer, addr, [
      { product_id: demo.pid, variant_id: demo.vid, quantity: 1 },
    ]);
    await applyMigrations(db, { from: CLEANUP });
  });

  it("removes demo products and demo-only orders", async () => {
    expect(
      (
        await one<{ n: number }>(
          db,
          `select count(*)::int n from public.products where sku like 'AH0%'`,
        )
      ).n,
    ).toBe(0);
    expect(
      (
        await one<{ n: number }>(db, `select count(*)::int n from public.orders where id = $1`, [
          demoOrder,
        ])
      ).n,
    ).toBe(0);
  });

  it("keeps real products, their orders, coupons, users and roles", async () => {
    expect(
      (
        await one<{ n: number }>(db, `select count(*)::int n from public.products where id = $1`, [
          realProduct,
        ])
      ).n,
    ).toBe(1);
    expect(
      (
        await one<{ n: number }>(db, `select count(*)::int n from public.orders where id = $1`, [
          realOrder,
        ])
      ).n,
    ).toBe(1);
    expect(
      (
        await one<{ n: number }>(
          db,
          `select count(*)::int n from public.coupons where code = 'REAL5'`,
        )
      ).n,
    ).toBe(1);
    expect(
      (
        await one<{ n: number }>(db, `select count(*)::int n from auth.users where id = $1`, [
          customer,
        ])
      ).n,
    ).toBe(1);
  });

  it("keeps demo categories that real products still use (and their parents)", async () => {
    const ids = (
      await db.query<{ id: string }>(
        `select id from public.categories where id = any($1::uuid[])`,
        [[DEMO_CAT, DEMO_SUB]],
      )
    ).rows
      .map((r) => r.id)
      .sort();
    expect(ids).toEqual([DEMO_CAT, DEMO_SUB].sort());
    // Unused demo categories are gone.
    expect((await one<{ n: number }>(db, `select count(*)::int n from public.categories`)).n).toBe(
      2,
    );
  });

  it("keeps store settings the owner changed", async () => {
    const s = await one(db, `select name_ar, name_en, primary_color from public.store_settings`);
    expect(s).toEqual({ name_ar: "متجر حقيقي", name_en: "Real Shop", primary_color: "#aa0000" });
  });

  it("catalog_facets reports what exists on active products", async () => {
    const f = await one<{ f: { sizes: { value: string; count: number }[]; brands: unknown[] } }>(
      db,
      `select public.catalog_facets() f`,
    );
    expect(f.f.sizes).toEqual([{ value: "M", count: 1 }]);
    expect(f.f.brands).toEqual([]);
  });
});
