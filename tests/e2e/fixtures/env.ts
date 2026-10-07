/**
 * E2E environment. Reads ONLY `.env.test` (repo root) and real environment variables.
 * Never falls back to `.env` (that file may point at production).
 *
 * Safety: refuses to run against a non-local app or Supabase unless E2E_ALLOW_REMOTE=staging.
 */
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

const ROOT = process.cwd();
export const ENV_FILE = path.join(ROOT, ".env.test");

/** Minimal KEY=VALUE parser (supports quotes and # comments). Existing env vars win. */
function loadEnvTest() {
  if (!existsSync(ENV_FILE)) return false;
  for (const raw of readFileSync(ENV_FILE, "utf8").split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith("#")) continue;
    const m = /^(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/.exec(line);
    if (!m) continue;
    let v = m[2].trim();
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
    else v = v.replace(/\s+#.*$/, "");
    if (process.env[m[1]] === undefined) process.env[m[1]] = v;
  }
  return true;
}

export const envFileLoaded = loadEnvTest();

const e = (k: string) => (process.env[k] ?? "").trim();

const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "::1", "[::1]", "0.0.0.0", "host.docker.internal"]);
export const allowRemote = e("E2E_ALLOW_REMOTE") === "staging";

export function isLocalUrl(url: string) {
  try {
    return LOCAL_HOSTS.has(new URL(url).hostname);
  } catch {
    return false;
  }
}

/** Throws unless the URL is local, or remote use was explicitly allowed for a staging project. */
export function assertSafeTarget(url: string, what: string) {
  if (!url || isLocalUrl(url) || allowRemote) return;
  throw new Error(
    `[e2e safety] ${what} (${url}) is not localhost/127.0.0.1. ` +
      `E2E tests create users, orders and change store settings, so they must never run against production. ` +
      `If this is a STAGING project, set E2E_ALLOW_REMOTE=staging in .env.test.`,
  );
}

export const BASE_URL = e("E2E_BASE_URL") || "http://localhost:8080";
// Supabase used by the seed helper (service role). Accept the app's names as fallbacks, but only from .env.test / env.
export const SUPABASE_URL = e("E2E_SUPABASE_URL") || e("SUPABASE_URL") || e("VITE_SUPABASE_URL");
export const SUPABASE_ANON_KEY = e("E2E_SUPABASE_ANON_KEY") || e("SUPABASE_PUBLISHABLE_KEY") || e("VITE_SUPABASE_PUBLISHABLE_KEY");
export const SUPABASE_SERVICE_ROLE_KEY = e("SUPABASE_SERVICE_ROLE_KEY");

// Supabase the app itself talks to. `vite --mode test` still loads `.env` as a fallback, so .env.test must set this
// explicitly; otherwise the app under test would point at whatever `.env` holds (possibly production).
export const APP_SUPABASE_URL = e("VITE_SUPABASE_URL");

assertSafeTarget(BASE_URL, "E2E_BASE_URL");
assertSafeTarget(SUPABASE_URL, "Supabase URL");
assertSafeTarget(APP_SUPABASE_URL, "VITE_SUPABASE_URL");

export type Role = "admin" | "customer" | "driver";
export const ACCOUNTS: Record<Role, { email: string; password: string }> = {
  admin: { email: e("E2E_ADMIN_EMAIL"), password: e("E2E_ADMIN_PASSWORD") },
  customer: { email: e("E2E_CUSTOMER_EMAIL"), password: e("E2E_CUSTOMER_PASSWORD") },
  driver: { email: e("E2E_DRIVER_EMAIL"), password: e("E2E_DRIVER_PASSWORD") },
};

const REQUIRED = [
  "E2E_ADMIN_EMAIL", "E2E_ADMIN_PASSWORD",
  "E2E_CUSTOMER_EMAIL", "E2E_CUSTOMER_PASSWORD",
  "E2E_DRIVER_EMAIL", "E2E_DRIVER_PASSWORD",
] as const;

const missing = [
  ...REQUIRED.filter((k) => !e(k)),
  ...(SUPABASE_URL ? [] : ["SUPABASE_URL (or E2E_SUPABASE_URL / VITE_SUPABASE_URL)"]),
  ...(SUPABASE_ANON_KEY ? [] : ["SUPABASE_PUBLISHABLE_KEY (or E2E_SUPABASE_ANON_KEY / VITE_SUPABASE_PUBLISHABLE_KEY)"]),
  ...(SUPABASE_SERVICE_ROLE_KEY ? [] : ["SUPABASE_SERVICE_ROLE_KEY"]),
  ...(APP_SUPABASE_URL ? [] : ["VITE_SUPABASE_URL (the app's Supabase, must be set in .env.test)"]),
  ...(e("VITE_SUPABASE_PUBLISHABLE_KEY") ? [] : ["VITE_SUPABASE_PUBLISHABLE_KEY"]),
];

/** True when every required variable is present. Specs skip otherwise. */
export const E2E_READY = missing.length === 0;
export const SKIP_REASON = E2E_READY
  ? ""
  : `E2E environment not configured (${envFileLoaded ? ".env.test found" : "no .env.test"}); missing: ${missing.join(", ")}. See tests/e2e/README.md.`;

/** A short random tag so parallel/duplicate runs never collide and cleanup can find their rows. */
export const runTag = () => Math.random().toString(36).slice(2, 8).toUpperCase();
