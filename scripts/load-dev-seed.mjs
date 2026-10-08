#!/usr/bin/env node
// DEVELOPMENT ONLY. Loads supabase/seed.sql into the database in TEST_DATABASE_URL (.env.test; same allowlist
// as the tests: localhost or the staging project) and attaches demo images that already exist in the
// store-media bucket (catalog/*.jpg). Skips if the demo catalogue is already there. Never run against production.
import { readFileSync } from "node:fs";
import postgres from "postgres";
import { assertAllowed, isLocalUrl, loadEnvTest } from "../tests/safety.ts";

loadEnvTest();
const DB = (process.env.TEST_DATABASE_URL ?? "").trim();
const API = (process.env.SUPABASE_URL ?? "").trim();
if (!DB || DB.includes("PASTE_") || !API) {
  console.error("TEST_DATABASE_URL and SUPABASE_URL must be set in .env.test.");
  process.exit(1);
}
assertAllowed(DB, "TEST_DATABASE_URL", "db");
assertAllowed(API, "SUPABASE_URL", "supabase");

const img = (file) => `${API}/storage/v1/object/public/store-media/catalog/${file}`;
// Top-level demo category id -> image already uploaded to store-media/catalog.
const CATEGORY_IMAGES = {
  "a277259a-ec31-54fb-bada-cca3b5d78ceb": "8e4e48b7-b801-4d08-85aa-84513a7ed31a-ah-men.jpg",
  "c2f13de9-250f-5d38-ac58-e7d24181eba0": "5cb54b9f-0497-4ca3-9789-8fb6b42bcd46-ah-women.jpg",
  "bfa3823d-a7f8-5fdc-b47b-659b1d556785": "6ab388f5-5f8d-4572-b90f-3080b0739187-ah-kids.jpg",
  "0e6e2c4e-2df5-5215-8531-7c2ef764c4a7": "7820cc72-3be9-49f5-b677-059a05160255-ah-shoes.jpg",
  "6cbfea30-7cd2-5390-b30b-07d2ce138402": "144e6561-49ca-4541-9d51-a29ca8f5f0ff-ah-sneakers.jpg",
  "f92c33fe-fa44-5dcd-afa3-6435c8deb0b4": "578000cc-a224-4de4-8c83-a5cd03123724-ah-slippers.jpg",
  "3d6b6055-f692-5d8e-a2a3-49d4951c2269": "66f13a93-d10d-4e6a-8975-f7714624933e-ah-galabiya.jpg",
  "931393f1-f194-5733-8323-6c1a56f80516": "dde59da9-35bc-43c5-ba90-3a1b58e71076-ah-abaya.jpg",
  "b9b87a06-eb54-5210-8dac-9e64e5259be0": "d5b4de43-6a9f-48c0-b023-736494147dc3-ah-perfume.jpg",
  "736a95ca-d315-564a-8e99-9c7189ccde43": "d991d5c1-7876-48dc-8e6a-be68cadbcfca-ah-accessories.jpg",
};
const BANNERS = [
  {
    file: "dc0510dc-5a2a-4497-97c9-5f327a7ec261-ah-banner1.jpg",
    ar: "كوليكشن الموسم الجديد",
    en: "New season collection",
    sar: "أحدث التصميمات لكل العيلة",
    sen: "The latest styles for the whole family",
  },
  {
    file: "1414e9cb-edeb-421f-8638-837442ebfdfe-ah-banner2.jpg",
    ar: "عبايات وعطور",
    en: "Abayas & perfumes",
    sar: "اكتشف التشكيلة",
    sen: "Discover the range",
  },
];

const sql = postgres(DB, { max: 1, ssl: isLocalUrl(DB) ? false : "require", onnotice: () => {} });
try {
  const [{ n }] = await sql`select count(*)::int n from public.products where sku like 'DEMO-%'`;
  if (n > 0) {
    console.log(`demo catalogue already present (${n} products); nothing to do.`);
  } else {
    await sql.begin(async (tx) => {
      await tx.unsafe(readFileSync("supabase/seed.sql", "utf8"));
      for (const [id, file] of Object.entries(CATEGORY_IMAGES)) {
        await tx`update public.categories set image_url = ${img(file)} where id = ${id}`;
        // Products get their department's image (category or its parent).
        await tx`update public.products p set images = array[${img(file)}]
                  where p.sku like 'DEMO-%' and p.category_id in (select id from public.categories where id = ${id} or parent_id = ${id})`;
      }
      for (const [i, b] of BANNERS.entries()) {
        await tx`insert into public.banners (image_url, title_ar, title_en, subtitle_ar, subtitle_en, link, sort_order)
                 values (${img(b.file)}, ${b.ar}, ${b.en}, ${b.sar}, ${b.sen}, '/products', ${i})`;
      }
    });
    const [c] =
      await sql`select (select count(*) from public.products where sku like 'DEMO-%')::int products,
      (select count(*) from public.product_variants v join public.products p on p.id = v.product_id where p.sku like 'DEMO-%')::int variants,
      (select count(*) from public.categories)::int categories, (select count(*) from public.banners)::int banners`;
    console.log("loaded dev seed:", c);
  }
} finally {
  await sql.end();
}
