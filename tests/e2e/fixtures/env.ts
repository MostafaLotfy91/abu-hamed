/**
 * E2E environment. Reads ONLY `.env.test` (repo root) and real environment variables.
 * Never falls back to `.env` (that file may point at production).
 *
 * Safety (tests/safety.ts): the app under test must run on localhost. Supabase must be local, or — only with
 * E2E_ALLOW_REMOTE=staging — the one staging project whose ref is in supabase/config.toml. Everything else throws.
 */
import { assertAllowed, isLocalUrl, loadEnvTest, remoteAllowed } from "../../safety";

export const envFileLoaded = loadEnvTest();

/** Env value, with unfilled `PASTE_…` placeholders from scripts/make-env-test.mjs treated as missing. */
const e = (k: string) => {
  const v = (process.env[k] ?? "").trim();
  return v.includes("PASTE_") ? "" : v;
};

export { isLocalUrl };
export const allowRemote = remoteAllowed();

/** Throws unless a Supabase URL is local or the allowed staging project. */
export function assertSafeTarget(url: string, what: string) {
  assertAllowed(url, what, "supabase");
}

export const BASE_URL = e("E2E_BASE_URL") || "http://localhost:8080";
// Supabase used by the seed helper (service role). Accept the app's names as fallbacks, but only from .env.test / env.
export const SUPABASE_URL = e("E2E_SUPABASE_URL") || e("SUPABASE_URL") || e("VITE_SUPABASE_URL");
export const SUPABASE_ANON_KEY =
  e("E2E_SUPABASE_ANON_KEY") || e("SUPABASE_PUBLISHABLE_KEY") || e("VITE_SUPABASE_PUBLISHABLE_KEY");
export const SUPABASE_SERVICE_ROLE_KEY = e("SUPABASE_SERVICE_ROLE_KEY");

// Supabase the app itself talks to. `vite --mode test` still loads `.env` as a fallback, so .env.test must set this
// explicitly; otherwise the app under test would point at whatever `.env` holds.
export const APP_SUPABASE_URL = e("VITE_SUPABASE_URL");

assertAllowed(BASE_URL, "E2E_BASE_URL", "app");
assertSafeTarget(SUPABASE_URL, "Supabase URL");
assertSafeTarget(APP_SUPABASE_URL, "VITE_SUPABASE_URL");
if (
  SUPABASE_URL &&
  APP_SUPABASE_URL &&
  new URL(SUPABASE_URL).host !== new URL(APP_SUPABASE_URL).host
) {
  throw new Error(
    "[test safety] SUPABASE_URL and VITE_SUPABASE_URL must be the same project (seed and app must match).",
  );
}

export type Role = "admin" | "customer" | "driver";
export const ACCOUNTS: Record<Role, { email: string; password: string }> = {
  admin: { email: e("E2E_ADMIN_EMAIL"), password: e("E2E_ADMIN_PASSWORD") },
  customer: { email: e("E2E_CUSTOMER_EMAIL"), password: e("E2E_CUSTOMER_PASSWORD") },
  driver: { email: e("E2E_DRIVER_EMAIL"), password: e("E2E_DRIVER_PASSWORD") },
};

const REQUIRED = [
  "E2E_ADMIN_EMAIL",
  "E2E_ADMIN_PASSWORD",
  "E2E_CUSTOMER_EMAIL",
  "E2E_CUSTOMER_PASSWORD",
  "E2E_DRIVER_EMAIL",
  "E2E_DRIVER_PASSWORD",
] as const;

const missing = [
  ...REQUIRED.filter((k) => !e(k)),
  ...(SUPABASE_URL ? [] : ["SUPABASE_URL (or E2E_SUPABASE_URL / VITE_SUPABASE_URL)"]),
  ...(SUPABASE_ANON_KEY
    ? []
    : ["SUPABASE_PUBLISHABLE_KEY (or E2E_SUPABASE_ANON_KEY / VITE_SUPABASE_PUBLISHABLE_KEY)"]),
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
