// category_display_images: own image, else a real product photo from the subtree, else none.
import type { PGlite } from "@electric-sql/pglite";
import { beforeAll, describe, expect, it } from "vitest";
import { anon, as, freshDb } from "./harness";

let db: PGlite;
let root: string, sub: string, empty: string, legacy: string;

const cat = async (name: string, parent: string | null, image: string | null) =>
  (
    await db.query<{ id: string }>(
      `insert into public.categories(name_ar, name_en, parent_id, image_url) values ($1, $1, $2, $3) returning id`,
      [name, parent, image],
    )
  ).rows[0].id;
const product = async (category: string, images: string[], extra: Record<string, unknown> = {}) => {
  const cols = { name_ar: "م", name_en: "P", price: 100, category_id: category, images, ...extra };
  const keys = Object.keys(cols);
  await db.query(
    `insert into public.products(${keys.join(",")}) values (${keys.map((_, i) => `$${i + 1}`).join(",")})`,
    Object.values(cols),
  );
};

beforeAll(async () => {
  db = await freshDb();
  root = await cat("رجالي", null, "https://cdn.example/men.jpg");
  sub = await cat("قمصان", root, null);
  empty = await cat("بدل", root, "");
  legacy = await cat("قديم", root, "/__l5e/assets-v1/x/old.jpg");
  const subsub = await cat("قمصان كتان", sub, null);
  // Photos only in a deeper subcategory; the best seller wins over the newer one.
  await product(subsub, ["https://cdn.example/linen-best.jpg"], { sold_count: 50 });
  await product(subsub, ["https://cdn.example/linen-new.jpg"], { sold_count: 1 });
  // Inactive products and products without usable photos never count.
  await product(legacy, ["https://cdn.example/hidden.jpg"], { is_active: false, sold_count: 999 });
  await product(legacy, ["/__l5e/old-product.jpg"], { sold_count: 999 });
});

const rows = async () =>
  new Map(
    (
      await as(db, anon, (tx) =>
        tx.query<{ category_id: string; image_url: string | null; source: string }>(
          `select category_id, image_url, source from public.category_display_images`,
        ),
      )
    ).rows.map((r) => [r.category_id, r]),
  );

describe("category_display_images", () => {
  it("keeps a category's own image", async () => {
    expect((await rows()).get(root)).toMatchObject({
      image_url: "https://cdn.example/men.jpg",
      source: "own",
    });
  });

  it("uses the best-selling active product photo from the whole subtree", async () => {
    expect((await rows()).get(sub)).toMatchObject({
      image_url: "https://cdn.example/linen-best.jpg",
      source: "product",
    });
  });

  it("prefers the product thumbnail", async () => {
    const c = await cat("ثمب", null, null);
    await product(c, ["https://cdn.example/full.jpg"], {
      thumbnails: ["https://cdn.example/thumb.jpg"],
    });
    expect((await rows()).get(c)?.image_url).toBe("https://cdn.example/thumb.jpg");
  });

  it("never invents an image: empty, old paths, inactive or photo-less products give none", async () => {
    const r = await rows();
    expect(r.get(empty)).toMatchObject({ image_url: null, source: "none" });
    expect(r.get(legacy)).toMatchObject({ image_url: null, source: "none" });
  });
});
