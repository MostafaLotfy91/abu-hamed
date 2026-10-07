#!/usr/bin/env node
// Applies supabase/migrations to the database in TEST_DATABASE_URL (.env.test), which must pass the same
// allowlist as the tests (localhost, or the staging project from supabase/config.toml with E2E_ALLOW_REMOTE=staging).
//
//   node scripts/apply-migrations.mjs           # dry run: shows what is applied/pending and pre-flight checks
//   node scripts/apply-migrations.mjs --apply   # applies pending migrations, one transaction each, stops on error
//
// "Applied" comes from supabase_migrations.schema_migrations when present; for the audit migrations (A, B, C)
// a schema marker is also checked, so a migration applied some other way is never run twice.
// Never prints credentials.
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import postgres from "postgres";
import { assertAllowed, isLocalUrl, loadEnvTest } from "../tests/safety.ts";

loadEnvTest();
const url = (process.env.TEST_DATABASE_URL ?? "").trim();
if (!url || url.includes("PASTE_")) {
  console.error("TEST_DATABASE_URL is not set in .env.test (still a PASTE_ placeholder?).");
  process.exit(1);
}
assertAllowed(url, "TEST_DATABASE_URL", "db");
const apply = process.argv.includes("--apply");

const DIR = "supabase/migrations";
const files = readdirSync(DIR).filter((f) => f.endsWith(".sql")).sort();
const version = (f) => f.split("_")[0];

// Schema markers for migrations whose effect can be checked directly.
const MARKERS = {
  "20261007120000": `select to_regclass('public.coupon_redemptions') is not null as ok`,
  "20261007130000": `select exists(select 1 from pg_proc where proname = 'grant_admin_by_email') as ok`,
  "20261008100000": `select to_regclass('public.products_name_ar_trgm_idx') is not null as ok`,
};

const sql = postgres(url, { max: 1, ssl: isLocalUrl(url) ? false : "require", onnotice: () => {} });
try {
  const [{ has }] = await sql`select to_regclass('supabase_migrations.schema_migrations') is not null as has`;
  const recorded = new Set(has ? (await sql`select version from supabase_migrations.schema_migrations`).map((r) => r.version) : []);
  const status = [];
  for (const f of files) {
    const v = version(f);
    let applied = recorded.has(v);
    if (MARKERS[v]) applied = applied || (await sql.unsafe(MARKERS[v]))[0].ok;
    status.push({ f, v, applied });
  }
  console.log(`migration history table: ${has ? "present" : "absent"}`);
  for (const s of status) console.log(`${s.applied ? "applied " : "PENDING "} ${s.f}`);

  // Pre-flight checks for the order-integrity migration.
  const dupes = await sql`select upper(code) c, count(*)::int n from public.coupons group by 1 having count(*) > 1`;
  const negStock = await sql`select (select count(*) from public.products where stock < 0)::int + (select count(*) from public.product_variants where stock < 0)::int as n`;
  console.log(`pre-flight: coupon codes differing only by case: ${dupes.length}; rows with negative stock (will be set to 0): ${negStock[0].n}`);

  const pending = status.filter((s) => !s.applied);
  // Never apply a later migration while an earlier one is missing.
  const firstGap = status.findIndex((s) => !s.applied);
  if (firstGap >= 0 && status.slice(firstGap).some((s) => s.applied)) {
    console.error("A migration is pending before one that is already applied; refusing to guess. Review manually.");
    process.exit(1);
  }
  if (!apply) {
    console.log(pending.length ? `dry run: ${pending.length} pending. Re-run with --apply.` : "nothing pending.");
    process.exit(0);
  }
  if (dupes.length) {
    console.error("Refusing to apply: rename coupon codes that differ only by letter case first.");
    process.exit(1);
  }
  for (const s of pending) {
    const body = readFileSync(path.join(DIR, s.f), "utf8");
    try {
      await sql.begin(async (tx) => {
        await tx.unsafe(body);
        if (has) {
          await tx`insert into supabase_migrations.schema_migrations(version, name) values (${s.v}, ${s.f.replace(/^\d+_|\.sql$/g, "")}) on conflict do nothing`;
        }
      });
      console.log(`applied  ${s.f}`);
    } catch (e) {
      console.error(`FAILED   ${s.f}: ${e.message} (rolled back; later migrations not attempted)`);
      process.exit(1);
    }
  }
  console.log("done.");
} finally {
  await sql.end();
}
