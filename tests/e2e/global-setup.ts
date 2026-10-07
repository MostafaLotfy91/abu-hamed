/**
 * Runs once before the suite (not for `--list`). Creates the test accounts and puts store_settings into the
 * baseline the specs expect, after saving a snapshot that global-teardown restores.
 * Does nothing when the environment is not configured: the specs skip themselves in that case.
 */
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { E2E_READY, SKIP_REASON } from "./fixtures/env";
import { applyBaselineSettings, ensureAccounts, readSettings } from "./fixtures/seed";

export const STATE_DIR = path.join(process.cwd(), "tests", "e2e", ".state");
export const SNAPSHOT = path.join(STATE_DIR, "settings-snapshot.json");

export default async function globalSetup() {
  if (!E2E_READY) {
    console.warn(`[e2e] ${SKIP_REASON}`);
    return;
  }
  mkdirSync(STATE_DIR, { recursive: true });
  const current = await readSettings();
  // Keep the oldest snapshot: if a previous run crashed before teardown, its snapshot is the real original.
  if (!existsSync(SNAPSHOT)) writeFileSync(SNAPSHOT, JSON.stringify(current, null, 2));
  await ensureAccounts();
  await applyBaselineSettings(current);
}
