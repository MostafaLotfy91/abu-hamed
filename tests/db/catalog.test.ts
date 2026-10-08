// Category profiles and the single SQL definition of catalogue search / count / filter options.
import type { PGlite } from "@electric-sql/pglite";
import { beforeAll, describe, expect, it } from "vitest";
import { anon, as, freshDb, one } from "./harness";

type Opt = { value: string; count: number };
type Options = {
  sizes: Opt[];
  colors: { en: string; count: number }[];
  concentrations: Opt[];
  volumes: { value: number; count: number }[];
  categories: Opt[];
  materials: Opt[];
  discounted: number;
  price: { min: number | null; max: number | null };
};

let db: PGlite;
const ids: Record<string, string> = {};

async function cat(key: string, name: string, parent: string | null, profile: string | null) {
  ids[key] = (
    await one<{ id: string }>(
      db,
      `insert into public.categories(name_ar, name_en, parent_id, profile) values ($1, $1, $2, $3) returning id`,
      [name, parent, profile],
    )
  ).id;
}
async function product(
  key: string,
  o: Record<string, unknown>,
  variants: { size?: string; color?: string; stock: number; active?: boolean }[] = [],
) {
  const cols = { name_ar: key, name_en: key, price: 100, stock: 0, is_active: true, ...o };
  const k = Object.keys(cols);
  ids[key] = (
    await one<{ id: string }>(
      db,
      `insert into public.products(${k.join(",")}) values (${k.map((_, i) => `$${i + 1}`).join(",")}) returning id`,
      Object.values(cols),
    )
  ).id;
  for (const v of variants) {
    await db.query(
      `insert into public.product_variants(product_id, name_ar, name_en, size, color_en, color_ar, stock, is_active) values ($1, 'v', 'v', $2, $3, $3, $4, $5)`,
      [ids[key], v.size ?? null, v.color ?? null, v.stock, v.active ?? true],
    );
  }
}
const search = async (f: Record<string, unknown>, sort = "newest") =>
  as(db, anon, async (tx) =>
    (
      await tx.query<{ name_en: string }>(
        `select name_en from public.catalog_search($1::jsonb, $2, 100, 0)`,
        [JSON.stringify(f), sort],
      )
    ).rows.map((r) => r.name_en),
  );
const count = async (f: Record<string, unknown>) =>
  as(
    db,
    anon,
    async (tx) =>
      (
        await tx.query<{ n: number }>(`select public.catalog_count($1::jsonb) n`, [
          JSON.stringify(f),
        ])
      ).rows[0].n,
  );
const options = async (f: Record<string, unknown>) =>
  as(
    db,
    anon,
    async (tx) =>
      (
        await tx.query<{ o: Options }>(`select public.catalog_filter_options($1::jsonb) o`, [
          JSON.stringify(f),
        ])
      ).rows[0].o,
  );

beforeAll(async () => {
  db = await freshDb();
  await cat("men", "Men", null, "clothes");
  await cat("shirts", "Shirts", ids.men, null);
  await cat("perfumes", "Perfumes", null, "perfume");
  await cat("acc", "Accessories", null, "accessories");
  await cat("watches", "Watches", ids.acc, null);
  await cat("bags", "Bags", ids.acc, null);
  await cat("misc", "Misc", null, null);

  await product("shirt-red-m", { category_id: ids.shirts, brand: "A", gender: "men" }, [
    { size: "M", color: "Red", stock: 3 },
    { size: "L", color: "Blue", stock: 0 },
  ]);
  await product(
    "shirt-flash",
    {
      category_id: ids.shirts,
      brand: "B",
      price: 200,
      flash_price: 120,
      flash_ends_at: new Date(Date.now() + 86_400_000).toISOString(),
    },
    [{ size: "L", color: "Red", stock: 2 }],
  );
  await product(
    "shirt-expired-flash",
    {
      category_id: ids.shirts,
      price: 200,
      flash_price: 120,
      flash_ends_at: new Date(Date.now() - 86_400_000).toISOString(),
    },
    [{ size: "S", stock: 1 }],
  );
  await product("shirt-fake-discount", { category_id: ids.shirts, price: 100, old_price: 90 }, [
    { size: "S", stock: 1 },
  ]);
  await product("shirt-inactive-xl", { category_id: ids.shirts, price: 100 }, [
    { size: "XL", stock: 5, active: false },
    { size: "S", stock: 1 },
  ]);
  await product("perfume-edp", {
    category_id: ids.perfumes,
    brand: "P",
    concentration: "EDP",
    volume_ml: 100,
    stock: 4,
  });
  await product("perfume-edt", {
    category_id: ids.perfumes,
    brand: "P",
    concentration: "EDT",
    volume_ml: 50,
    stock: 0,
  });
  await product("watch", { category_id: ids.watches, material_ar: "ستانلس", stock: 2 }, [
    { color: "Gold", stock: 2 },
  ]);
  await product("bag", { category_id: ids.bags, material_ar: "جلد", stock: 1 });
  await product("odd 100% name", { category_id: ids.misc, stock: 1 });
  await product("hidden", { category_id: ids.shirts, is_active: false, stock: 9 });
});

describe("category profiles", () => {
  it("seeds the seven profiles; perfumes and accessories have no size filter", async () => {
    const rows = (
      await db.query<{ key: string; filters: string[]; sizes: string[] | null }>(
        `select key, filters, sizes from public.product_profiles order by sort_order`,
      )
    ).rows;
    expect(rows.map((r) => r.key)).toEqual([
      "clothes",
      "shoes",
      "kids",
      "modest",
      "perfume",
      "accessories",
      "general",
    ]);
    for (const k of ["perfume", "accessories"]) {
      const r = rows.find((x) => x.key === k)!;
      expect(r.filters, k).not.toContain("size");
      expect(r.sizes, k).toBeNull();
    }
    expect(rows.find((x) => x.key === "perfume")!.filters).not.toContain("color");
    expect(rows.find((x) => x.key === "general")!.filters).toEqual([
      "brand",
      "price",
      "discount",
      "in_stock",
    ]);
  });

  it("subcategories inherit their parent's profile; categories without one are general", async () => {
    const p = async (k: string) =>
      (await one<{ p: string }>(db, `select public.category_profile($1) p`, [ids[k]])).p;
    expect(await p("shirts")).toBe("clothes");
    expect(await p("watches")).toBe("accessories");
    expect(await p("misc")).toBe("general");
  });

  it("anyone can read profiles; customers cannot change them", async () => {
    expect(
      (
        await as(
          db,
          anon,
          async (tx) => (await tx.query(`select key from public.product_profiles`)).rows,
        )
      ).length,
    ).toBe(7);
  });
});

describe("catalog search", () => {
  it("never returns inactive products", async () => {
    expect(await search({})).not.toContain("hidden");
  });

  it("price filter and price sort use the active flash price", async () => {
    expect(await search({ category_ids: [ids.shirts], max_price: 150 })).toContain("shirt-flash");
    expect(await search({ category_ids: [ids.shirts], max_price: 150 })).not.toContain(
      "shirt-expired-flash",
    );
    // Three shirts cost 100, the flash shirt is 120 now (base 200), the expired-flash shirt is 200.
    const asc = await search({ category_ids: [ids.shirts] }, "price_asc");
    expect(asc.slice(-2)).toEqual(["shirt-flash", "shirt-expired-flash"]);
    const desc = await search({ category_ids: [ids.shirts] }, "price_desc");
    expect(desc.slice(0, 2)).toEqual(["shirt-expired-flash", "shirt-flash"]);
  });

  it("'discounted' means a real reduction (active flash price or old_price above the current price)", async () => {
    expect((await search({ discounted: true })).sort()).toEqual(["shirt-flash"]);
  });

  it("size + colour + in stock must hold on the same active variant", async () => {
    expect(await search({ size: "M", color: "Red" })).toEqual(["shirt-red-m"]);
    expect(await search({ size: "L", color: "Blue" })).toEqual(["shirt-red-m"]);
    expect(await search({ size: "L", color: "Blue", in_stock: true })).toEqual([]);
    expect(await search({ size: "XL" })).toEqual([]); // only an inactive variant has XL
  });

  it("in stock works for products without variants", async () => {
    expect(await search({ category_ids: [ids.perfumes], in_stock: true })).toEqual(["perfume-edp"]);
  });

  it("type narrows an accessories listing to one subcategory", async () => {
    expect(
      await search({ category_ids: [ids.acc, ids.watches, ids.bags], type_ids: [ids.bags] }),
    ).toEqual(["bag"]);
  });

  it("text search treats % and _ literally", async () => {
    expect(await search({ q: "100%" })).toEqual(["odd 100% name"]);
    expect(await search({ q: "%" })).toEqual(["odd 100% name"]);
  });

  it("count always equals the number of matching products", async () => {
    for (const f of [
      {},
      { category_ids: [ids.shirts] },
      { size: "L" },
      { discounted: true },
      { category_ids: [ids.perfumes], in_stock: true },
      { q: "shirt", max_price: 150 },
    ]) {
      expect(await count(f), JSON.stringify(f)).toBe((await search(f)).length);
    }
  });
});

describe("filter options", () => {
  it("only lists values that exist in the current result set, with counts", async () => {
    const o = await options({ category_ids: [ids.perfumes] });
    expect(o.sizes).toEqual([]);
    expect(o.colors).toEqual([]);
    expect(o.concentrations.map((c) => c.value).sort()).toEqual(["EDP", "EDT"]);
    expect(o.volumes).toEqual([
      { value: 50, count: 1 },
      { value: 100, count: 1 },
    ]);
  });

  it("each filter's counts apply all the other filters but not itself", async () => {
    const o = await options({ category_ids: [ids.shirts], color: "Red" });
    // Sizes available in red: M (shirt-red-m) and L (shirt-flash); colours still list every colour of the shirts.
    expect(o.sizes.map((s) => `${s.value}:${s.count}`).sort()).toEqual(["L:1", "M:1"]);
    expect(o.colors.map((c) => c.en).sort()).toEqual(["Blue", "Red"]);
  });

  it("inactive variants never produce options", async () => {
    const o = await options({ category_ids: [ids.shirts] });
    expect(o.sizes.map((s) => s.value)).not.toContain("XL");
  });

  it("reports subcategory counts for the type filter and toggle counts", async () => {
    const o = await options({ category_ids: [ids.acc, ids.watches, ids.bags] });
    expect(
      o.categories.map((c) => `${c.value === ids.watches ? "watches" : "bags"}:${c.count}`).sort(),
    ).toEqual(["bags:1", "watches:1"]);
    expect(o.materials.map((m) => m.value).sort()).toEqual(["جلد", "ستانلس"]);
    const all = await options({});
    expect(all.discounted).toBe(1);
    expect(all.price.min).toBeDefined();
  });
});
