/**
 * One place that decides which backends the test suites may touch.
 *
 * Allowed: localhost, OR — only with E2E_ALLOW_REMOTE=staging — the single Supabase project whose ref is in
 * supabase/config.toml (the staging/dev project). Every other host is refused. Never prints keys.
 */
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
export const ENV_TEST_FILE = path.join(ROOT, ".env.test");

/** Loads .env.test (KEY=VALUE, quotes and # comments) into process.env; existing env vars win. Never reads .env. */
export function loadEnvTest() {
  if (!existsSync(ENV_TEST_FILE)) return false;
  for (const raw of readFileSync(ENV_TEST_FILE, "utf8").split(/\r?\n/)) {
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

/** The staging project ref from supabase/config.toml (project_id = "..."). */
export function stagingProjectRef(): string | null {
  try {
    const toml = readFileSync(path.join(ROOT, "supabase", "config.toml"), "utf8");
    const ref = /^\s*project_id\s*=\s*"([a-z0-9]{20})"/m.exec(toml)?.[1];
    return ref ?? null;
  } catch {
    return null;
  }
}

const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "::1", "[::1]", "0.0.0.0", "host.docker.internal"]);
export const remoteAllowed = () => (process.env["E2E_ALLOW_REMOTE"] ?? "").trim() === "staging";

function hostOf(url: string) {
  try {
    return new URL(url).hostname.toLowerCase();
  } catch {
    return null;
  }
}

export const isLocalUrl = (url: string) => LOCAL_HOSTS.has(hostOf(url) ?? "");

/** Supabase API URL: local, or https://<staging-ref>.supabase.co when remote use is switched on. */
export function isAllowedSupabaseUrl(url: string) {
  if (isLocalUrl(url)) return true;
  const ref = stagingProjectRef();
  if (!remoteAllowed() || !ref) return false;
  try {
    const u = new URL(url);
    return u.protocol === "https:" && u.hostname.toLowerCase() === `${ref}.supabase.co` && !u.port;
  } catch {
    return false;
  }
}

/**
 * Postgres connection string: local, or (remote switched on) the staging project's database — either the direct
 * host db.<ref>.supabase.co, or the Supabase pooler (*.pooler.supabase.com) with user postgres.<ref>.
 */
export function isAllowedDbUrl(url: string) {
  let u: URL;
  try {
    u = new URL(url);
  } catch {
    return false;
  }
  const host = u.hostname.toLowerCase();
  if (LOCAL_HOSTS.has(host)) return true;
  const ref = stagingProjectRef();
  if (!remoteAllowed() || !ref) return false;
  if (host === `db.${ref}.supabase.co`) return true;
  return /\.pooler\.supabase\.com$/.test(host) && decodeURIComponent(u.username) === `postgres.${ref}`;
}

/** Throws a clear error unless the URL is allowed. `kind` picks the API or database rule. */
export function assertAllowed(url: string, what: string, kind: "app" | "supabase" | "db") {
  if (!url) return;
  const ok = kind === "app" ? isLocalUrl(url) : kind === "supabase" ? isAllowedSupabaseUrl(url) : isAllowedDbUrl(url);
  if (ok) return;
  const ref = stagingProjectRef();
  throw new Error(
    `[test safety] ${what} (${hostOf(url) ?? "invalid URL"}) is not allowed. Tests create users, orders and change ` +
      `store settings. Allowed: localhost` +
      (kind === "app" ? " only (run the app locally)." : `, or the staging project ${ref ?? "(no ref in supabase/config.toml)"} with E2E_ALLOW_REMOTE=staging.`),
  );
}
