#!/usr/bin/env node
// Stores the two Vault secrets the database needs to call send-driver-push when an offer is created:
//   driver_push_url     <SUPABASE_URL>/functions/v1/send-driver-push
//   driver_push_secret  DRIVER_PUSH_WEBHOOK_SECRET from supabase/.env.push (same value the function checks)
// Target database: TEST_DATABASE_URL in .env.test (same allowlist as the tests). Creates or updates; never
// prints secret values. For production, run the two vault.create_secret lines from docs/dispatch.md instead.
//   node scripts/setup-push-vault.mjs
import { readFileSync } from "node:fs";
import postgres from "postgres";
import { assertAllowed, isLocalUrl, loadEnvTest } from "../tests/safety.ts";

loadEnvTest();
const DB = (process.env.TEST_DATABASE_URL ?? "").trim();
const API = (process.env.SUPABASE_URL ?? "").trim();
assertAllowed(DB, "TEST_DATABASE_URL", "db");
assertAllowed(API, "SUPABASE_URL", "supabase");
const env = Object.fromEntries(
  readFileSync("supabase/.env.push", "utf8")
    .split(/\r?\n/)
    .map((l) => /^([A-Z_]+)=(.*)$/.exec(l))
    .filter(Boolean)
    .map((m) => [m[1], m[2]]),
);
const secret = env.DRIVER_PUSH_WEBHOOK_SECRET;
if (!secret) {
  console.error("DRIVER_PUSH_WEBHOOK_SECRET missing in supabase/.env.push");
  process.exit(1);
}
const values = {
  driver_push_url: `${API.replace(/\/$/, "")}/functions/v1/send-driver-push`,
  driver_push_secret: secret,
};

const sql = postgres(DB, { max: 1, ssl: isLocalUrl(DB) ? false : "require", onnotice: () => {} });
try {
  const [{ net }] =
    await sql`select exists(select 1 from pg_extension where extname = 'pg_net') as net`;
  console.log(`pg_net installed: ${net}`);
  for (const [name, value] of Object.entries(values)) {
    const [row] = await sql`select id from vault.secrets where name = ${name}`;
    if (row) await sql`select vault.update_secret(${row.id}, ${value})`;
    else await sql`select vault.create_secret(${value}, ${name})`;
    console.log(`${row ? "updated" : "created"} vault secret ${name}`);
  }
} finally {
  await sql.end();
}
