/**
 * Playwright E2E config. See tests/e2e/README.md.
 *
 * Reads ONLY .env.test + process env (tests/e2e/fixtures/env.ts) — never .env.
 * Throws if E2E_BASE_URL / the Supabase URL is not local, unless E2E_ALLOW_REMOTE=staging.
 */
import { defineConfig, devices } from "@playwright/test";
import { BASE_URL, isLocalUrl } from "./tests/e2e/fixtures/env";

const startServer = process.env.E2E_WEB_SERVER === "1";
const port = (() => {
  try { return Number(new URL(BASE_URL).port) || 8080; } catch { return 8080; }
})();

export default defineConfig({
  testDir: "./tests/e2e",
  testMatch: /.*\.spec\.ts$/,
  tsconfig: "./tests/e2e/tsconfig.json",
  outputDir: "./tests/e2e/.results",
  globalSetup: "./tests/e2e/global-setup.ts",
  globalTeardown: "./tests/e2e/global-teardown.ts",
  // The suite shares one database and one store_settings row: run serially by default.
  fullyParallel: false,
  workers: Number(process.env.E2E_WORKERS ?? 1),
  retries: process.env.CI ? 1 : 0,
  forbidOnly: !!process.env.CI,
  timeout: 60_000,
  expect: { timeout: 10_000 },
  reporter: [["list"], ["html", { outputFolder: "./tests/e2e/.report", open: "never" }]],
  use: {
    baseURL: BASE_URL,
    locale: "ar-EG",
    timezoneId: "Africa/Cairo",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    video: "retain-on-failure",
    actionTimeout: 15_000,
    navigationTimeout: 30_000,
    serviceWorkers: "block",
  },
  projects: [
    {
      name: "desktop-chromium",
      use: { ...devices["Desktop Chrome"], viewport: { width: 1280, height: 800 } },
    },
    {
      name: "mobile-chromium",
      use: {
        ...devices["Desktop Chrome"],
        viewport: { width: 375, height: 812 },
        deviceScaleFactor: 3,
        isMobile: true,
        hasTouch: true,
        userAgent: devices["Pixel 7"].userAgent,
      },
    },
  ],
  // Opt-in: E2E_WEB_SERVER=1 starts the app via scripts/dev-with-env-test.mjs, which puts .env.test in the server's
  // environment (ranked above .env) after the allowlist check. Only allowed for a local base URL.
  webServer: startServer && isLocalUrl(BASE_URL)
    ? {
        command: `node scripts/dev-with-env-test.mjs ${port}`,
        url: BASE_URL,
        reuseExistingServer: true,
        timeout: 180_000,
        stdout: "ignore",
        stderr: "pipe",
      }
    : undefined,
});
