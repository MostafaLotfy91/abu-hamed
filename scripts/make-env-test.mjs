#!/usr/bin/env node
// Writes the git-ignored .env.test for the test suites. Never prints keys and never reads or touches .env.
//
//   node scripts/make-env-test.mjs             # LOCAL stack: reads `npx supabase status` (must be running)
//   node scripts/make-env-test.mjs --staging   # the staging project from supabase/config.toml; you paste the keys
//   add --force to overwrite an existing .env.test
import { execSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import { existsSync, readFileSync, writeFileSync } from "node:fs";

const OUT = ".env.test";
const staging = process.argv.includes("--staging");
if (existsSync(OUT) && !process.argv.includes("--force")) {
  console.error(`${OUT} already exists. Re-run with --force to overwrite.`);
  process.exit(1);
}

const pw = () => randomBytes(12).toString("base64url");
const accounts = [
  "E2E_ADMIN_EMAIL=e2e-admin@example.test",
  `E2E_ADMIN_PASSWORD=${pw()}`,
  "E2E_CUSTOMER_EMAIL=e2e-customer@example.test",
  `E2E_CUSTOMER_PASSWORD=${pw()}`,
  "E2E_DRIVER_EMAIL=e2e-driver@example.test",
  `E2E_DRIVER_PASSWORD=${pw()}`,
  `RATE_LIMIT_SALT=${pw()}`,
  "E2E_BASE_URL=http://localhost:8080",
  "E2E_WEB_SERVER=1",
];

let lines;
if (staging) {
  const ref = /^\s*project_id\s*=\s*"([a-z0-9]{20})"/m.exec(
    readFileSync("supabase/config.toml", "utf8"),
  )?.[1];
  if (!ref) {
    console.error("No project_id in supabase/config.toml.");
    process.exit(1);
  }
  const api = `https://${ref}.supabase.co`;
  lines = [
    `# STAGING project ${ref} (from supabase/config.toml). Git-ignored. The suites refuse any other project.`,
    "# Paste the three values below from Supabase Dashboard > Project Settings (API keys / Database).",
    "E2E_ALLOW_REMOTE=staging",
    `VITE_SUPABASE_URL=${api}`,
    `SUPABASE_URL=${api}`,
    "VITE_SUPABASE_PUBLISHABLE_KEY=PASTE_ANON_OR_PUBLISHABLE_KEY",
    "SUPABASE_PUBLISHABLE_KEY=PASTE_ANON_OR_PUBLISHABLE_KEY",
    "SUPABASE_SERVICE_ROLE_KEY=PASTE_SERVICE_ROLE_KEY",
    `# Direct connection (Database settings), used by the concurrency tests:`,
    `TEST_DATABASE_URL=postgresql://postgres:PASTE_DB_PASSWORD@db.${ref}.supabase.co:5432/postgres`,
    ...accounts,
    "",
  ];
} else {
  let raw;
  try {
    raw = execSync("npx supabase status -o env", {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    });
  } catch {
    console.error(
      "Could not read `supabase status`. Start the local stack first: npx supabase start (needs Docker).",
    );
    process.exit(1);
  }
  const vars = Object.fromEntries(
    raw
      .split(/\r?\n/)
      .map((l) => /^([A-Z_]+)="?(.*?)"?$/.exec(l.trim()))
      .filter(Boolean)
      .map((m) => [m[1], m[2]]),
  );
  const api = vars.API_URL;
  const anon = vars.ANON_KEY ?? vars.PUBLISHABLE_KEY;
  const service = vars.SERVICE_ROLE_KEY ?? vars.SECRET_KEY;
  if (!api || !anon || !service) {
    console.error("supabase status did not report API_URL, ANON_KEY and SERVICE_ROLE_KEY.");
    process.exit(1);
  }
  const host = new URL(api).hostname;
  if (!["localhost", "127.0.0.1", "::1"].includes(host)) {
    console.error(`Refusing: API_URL host "${host}" is not local.`);
    process.exit(1);
  }
  lines = [
    "# LOCAL Supabase stack (generated from `supabase status`). Git-ignored.",
    `VITE_SUPABASE_URL=${api}`,
    `VITE_SUPABASE_PUBLISHABLE_KEY=${anon}`,
    `SUPABASE_URL=${api}`,
    `SUPABASE_PUBLISHABLE_KEY=${anon}`,
    `SUPABASE_SERVICE_ROLE_KEY=${service}`,
    `TEST_DATABASE_URL=${vars.DB_URL ?? "postgresql://postgres:postgres@127.0.0.1:54322/postgres"}`,
    ...accounts,
    "",
  ];
}

writeFileSync(OUT, lines.join("\n"), { mode: 0o600 });
console.log(
  staging
    ? `Wrote ${OUT} for the staging project. Now open it and replace the three PASTE_ placeholders (keys are never printed).`
    : `Wrote ${OUT} for the local stack (keys not shown).`,
);
