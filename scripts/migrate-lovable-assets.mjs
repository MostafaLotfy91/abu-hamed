#!/usr/bin/env node
// Moves catalogue images stored as Lovable-hosted relative paths (/__l5e/assets-v1/...) into the store-media
// Supabase bucket and points the data at the public storage URLs, so images load on every domain (localhost,
// staging, other white-label deployments), not only on the Lovable site.
//
//   node scripts/migrate-lovable-assets.mjs            # dry run: lists what would move
//   node scripts/migrate-lovable-assets.mjs --apply    # uploads, then rewrites URLs in one transaction
//   node scripts/migrate-lovable-assets.mjs --undo scripts/backups/lovable-assets-<stamp>.json
//
// Source of the files: LOVABLE_ASSET_ORIGIN (default https://abu-hamed.lovable.app). Targets come from .env.test
// and must pass tests/safety.ts (localhost or the staging project). A backup of every changed value is written
// before anything is updated. Never prints keys.
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import postgres from "postgres";
import { assertAllowed, isLocalUrl, loadEnvTest } from "../tests/safety.ts";

loadEnvTest();
const API = (process.env.SUPABASE_URL ?? "").trim();
const KEY = (process.env.SUPABASE_SERVICE_ROLE_KEY ?? "").trim();
const DB = (process.env.TEST_DATABASE_URL ?? "").trim();
if (!API || !KEY || !DB || [API, KEY, DB].some((v) => v.includes("PASTE_"))) {
  console.error("SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY and TEST_DATABASE_URL must be set in .env.test.");
  process.exit(1);
}
assertAllowed(API, "SUPABASE_URL", "supabase");
assertAllowed(DB, "TEST_DATABASE_URL", "db");
const ORIGIN = (process.env.LOVABLE_ASSET_ORIGIN ?? "https://abu-hamed.lovable.app").replace(/\/$/, "");
const BUCKET = "store-media";
const PREFIX = "catalog";
const mode = process.argv.includes("--apply") ? "apply" : process.argv.includes("--undo") ? "undo" : "dry";

const sql = postgres(DB, { max: 1, ssl: isLocalUrl(DB) ? false : "require", onnotice: () => {} });
const LOVABLE = "/__l5e/%";

/** Every row/column that holds an image URL. */
async function snapshot(tx) {
  return {
    products: await tx`select id, images, thumbnails from public.products where exists (select 1 from unnest(images || thumbnails) u where u like ${LOVABLE})`,
    categories: await tx`select id, image_url from public.categories where image_url like ${LOVABLE}`,
    banners: await tx`select id, image_url from public.banners where image_url like ${LOVABLE}`,
    order_items: await tx`select id, image_url from public.order_items where image_url like ${LOVABLE}`,
  };
}

const publicUrl = (key) => `${API}/storage/v1/object/public/${BUCKET}/${key}`;
const keyFor = (p) => `${PREFIX}/${p.split("/").filter(Boolean).slice(-2).join("-")}`; // <asset-id>-<file>

async function upload(p) {
  const res = await fetch(ORIGIN + p);
  const type = (res.headers.get("content-type") ?? "").split(";")[0];
  if (!res.ok || !type.startsWith("image/")) throw new Error(`${p}: source returned HTTP ${res.status} ${type}`);
  const body = Buffer.from(await res.arrayBuffer());
  const key = keyFor(p);
  const up = await fetch(`${API}/storage/v1/object/${BUCKET}/${key}`, {
    method: "POST",
    headers: { apikey: KEY, Authorization: `Bearer ${KEY}`, "content-type": type, "x-upsert": "true", "cache-control": "31536000" },
    body,
  });
  if (!up.ok) throw new Error(`${p}: upload failed HTTP ${up.status} ${(await up.text()).slice(0, 120)}`);
  const check = await fetch(publicUrl(key), { method: "HEAD" });
  if (!check.ok) throw new Error(`${p}: uploaded but public URL returns HTTP ${check.status}`);
  return { key, bytes: body.length, type };
}

try {
  if (mode === "undo") {
    const file = process.argv[process.argv.indexOf("--undo") + 1];
    const b = JSON.parse(readFileSync(file, "utf8"));
    await sql.begin(async (tx) => {
      for (const r of b.products) await tx`update public.products set images = ${r.images}, thumbnails = ${r.thumbnails} where id = ${r.id}`;
      for (const r of b.categories) await tx`update public.categories set image_url = ${r.image_url} where id = ${r.id}`;
      for (const r of b.banners) await tx`update public.banners set image_url = ${r.image_url} where id = ${r.id}`;
      for (const r of b.order_items) await tx`update public.order_items set image_url = ${r.image_url} where id = ${r.id}`;
    });
    console.log(`restored ${b.products.length} products, ${b.categories.length} categories, ${b.banners.length} banners, ${b.order_items.length} order items from ${file}`);
    process.exit(0);
  }

  const snap = await snapshot(sql);
  const paths = new Set();
  for (const r of snap.products) for (const u of [...r.images, ...r.thumbnails]) if (u.startsWith("/__l5e/")) paths.add(u);
  for (const t of ["categories", "banners", "order_items"]) for (const r of snap[t]) paths.add(r.image_url);
  console.log(`rows: ${snap.products.length} products, ${snap.categories.length} categories, ${snap.banners.length} banners, ${snap.order_items.length} order items; distinct files: ${paths.size}`);
  if (mode === "dry") {
    for (const p of paths) console.log(`  ${p}  ->  ${BUCKET}/${keyFor(p)}`);
    console.log("dry run. Re-run with --apply.");
    process.exit(0);
  }

  // 1) Upload everything first; nothing in the database changes unless every file made it.
  const map = new Map();
  for (const p of paths) {
    const r = await upload(p);
    map.set(p, publicUrl(r.key));
    console.log(`uploaded ${r.key} (${r.type}, ${Math.round(r.bytes / 1024)} KB)`);
  }

  // 2) Backup, then rewrite all references in one transaction.
  mkdirSync("scripts/backups", { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const backupFile = path.join("scripts", "backups", `lovable-assets-${stamp}.json`);
  writeFileSync(backupFile, JSON.stringify(snap, null, 2));
  console.log(`backup written: ${backupFile}`);

  const swap = (u) => map.get(u) ?? u;
  await sql.begin(async (tx) => {
    for (const r of snap.products) {
      await tx`update public.products set images = ${r.images.map(swap)}, thumbnails = ${r.thumbnails.map(swap)} where id = ${r.id}`;
    }
    for (const r of snap.categories) await tx`update public.categories set image_url = ${swap(r.image_url)} where id = ${r.id}`;
    for (const r of snap.banners) await tx`update public.banners set image_url = ${swap(r.image_url)} where id = ${r.id}`;
    for (const r of snap.order_items) await tx`update public.order_items set image_url = ${swap(r.image_url)} where id = ${r.id}`;
  });
  const left = await snapshot(sql);
  const remaining = left.products.length + left.categories.length + left.banners.length + left.order_items.length;
  console.log(`done. rows still pointing at /__l5e/: ${remaining}. Undo: node scripts/migrate-lovable-assets.mjs --undo ${backupFile}`);
} finally {
  await sql.end();
}
