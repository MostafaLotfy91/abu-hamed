/** Restores store_settings from the snapshot taken by global-setup, then deletes the snapshot. */
import { existsSync, readFileSync, rmSync } from "node:fs";
import { E2E_READY } from "./fixtures/env";
import { restoreSettings, type SettingsRow } from "./fixtures/seed";
import { SNAPSHOT } from "./global-setup";

export default async function globalTeardown() {
  if (!E2E_READY || !existsSync(SNAPSHOT)) return;
  const snapshot = JSON.parse(readFileSync(SNAPSHOT, "utf8")) as SettingsRow;
  await restoreSettings(snapshot);
  rmSync(SNAPSHOT);
}
