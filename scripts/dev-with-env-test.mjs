#!/usr/bin/env node
// Starts `vite dev` for tests against the backend in .env.test (local stack or the allowlisted staging project).
// Variables from .env.test are put in the process environment, which Vite ranks above `.env`, so the app never
// falls back to whatever `.env` contains. (`vite --mode test` no longer mounts the TanStack Start server.)
//   node scripts/dev-with-env-test.mjs [port]
import { spawn } from "node:child_process";
import { assertAllowed, loadEnvTest } from "../tests/safety.ts";

if (!loadEnvTest()) {
  console.error("No .env.test found. Create it first: node scripts/make-env-test.mjs [--staging]");
  process.exit(1);
}
for (const k of ["VITE_SUPABASE_URL", "SUPABASE_URL"]) {
  const v = (process.env[k] ?? "").trim();
  if (!v) {
    console.error(`${k} must be set in .env.test`);
    process.exit(1);
  }
  assertAllowed(v, k, "supabase");
}
const port =
  process.argv[2] ?? new URL(process.env.E2E_BASE_URL || "http://localhost:8080").port ?? "8080";
const child = spawn("npx", ["vite", "dev", "--port", String(port), "--strictPort"], {
  stdio: "inherit",
  shell: process.platform === "win32",
  env: process.env,
});
child.on("exit", (code) => process.exit(code ?? 0));
for (const sig of ["SIGINT", "SIGTERM"]) process.on(sig, () => child.kill(sig));
