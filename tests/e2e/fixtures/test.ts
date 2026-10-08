/**
 * Shared Playwright fixtures.
 *  - `lang`: "ar" (default, RTL) or "en"; stored in localStorage "app.lang" before any page script runs
 *    (same key src/lib/i18n.tsx reads).
 *  - Network guards on every context: AI endpoints are mocked, wa.me is never opened, map tiles and web
 *    fonts are stubbed, and any Supabase host other than the configured one is blocked.
 *  - `accounts` / `catalog`: per-worker seeded data (see seed.ts), cleaned up when the worker ends.
 */
import { test as base, expect, type BrowserContext, type Page } from "@playwright/test";
import { SUPABASE_URL, runTag } from "./env";
import { cleanupTag, createCatalog, ensureAccounts, type AccountIds, type Catalog } from "./seed";
import { assistantStream, insightsStream, ONE_PX_PNG } from "./mocks";
import { alignClock } from "./clock";

export type Lang = "ar" | "en";

type TestFx = { lang: Lang; guards: void };

/**
 * Pages are server-rendered, so controls are visible before React attaches their handlers; a click in that
 * window does nothing. After every app navigation, wait until the root marks the page hydrated.
 */
async function waitForHydration(page: Page) {
  if (!new URL(page.url()).pathname.startsWith("/storage/"))
    await page.locator("html[data-hydrated]").waitFor({ state: "attached", timeout: 30_000 });
}
type WorkerFx = { accounts: AccountIds; catalog: Catalog };

/**
 * Sets the starting language once per context (first load on the origin), so an in-app toggle later
 * survives reloads exactly as it would for a real user. Runs in the browser.
 */
export function setInitialLang(l: Lang) {
  try {
    if (window.localStorage.getItem("e2e.langSet")) return;
    window.localStorage.setItem("app.lang", l);
    window.localStorage.setItem("e2e.langSet", "1");
  } catch {
    /* opaque origins such as about:blank */
  }
}

async function installGuards(context: BrowserContext) {
  await alignClock(context);
  // AI is always mocked. Specs override with page.route (page routes win over context routes).
  await context.route("**/api/assistant", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/x-ndjson",
      body: assistantStream([
        { type: "text", delta: "(mock)" },
        { type: "products", items: [] },
      ]),
    }),
  );
  await context.route("**/api/admin-insights", async (route) => {
    const body = (route.request().postDataJSON() ?? {}) as { mode?: string };
    if (body.mode === "weekly")
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          text: "ملخص تجريبي (mock)",
          created_at: new Date().toISOString(),
          cached: true,
        }),
      });
    return route.fulfill({
      status: 200,
      contentType: "application/x-ndjson",
      body: insightsStream([{ type: "text", delta: "(mock)" }]),
    });
  });
  // WhatsApp links are only asserted, never opened.
  await context.route(/^https?:\/\/(wa\.me|api\.whatsapp\.com|web\.whatsapp\.com)\//, (route) =>
    route.abort("blockedbyclient"),
  );
  // Map tiles and web fonts: keep tests offline-friendly and deterministic.
  await context.route(/tile\.openstreetmap\.org/, (route) =>
    route.fulfill({ status: 200, contentType: "image/png", body: ONE_PX_PNG }),
  );
  await context.route(/fonts\.(googleapis|gstatic)\.com/, (route) =>
    route.abort("blockedbyclient"),
  );
  // Only the configured Supabase project may be reached (protects against a stray production URL in the app build).
  if (SUPABASE_URL) {
    const allowed = new URL(SUPABASE_URL).host;
    await context.route(/\.supabase\.(co|in)\//, (route) =>
      new URL(route.request().url()).host === allowed
        ? route.fallback()
        : route.abort("blockedbyclient"),
    );
  }
}

/** Makes goto/reload on this page also wait for hydration (unless waitUntil is "commit"). */
export function waitForHydrationOnNavigation(page: Page) {
  const goto = page.goto.bind(page);
  const reload = page.reload.bind(page);
  page.goto = async (url, opts) => {
    const res = await goto(url, opts);
    if (opts?.waitUntil !== "commit") await waitForHydration(page);
    return res;
  };
  page.reload = async (opts) => {
    const res = await reload(opts);
    if (opts?.waitUntil !== "commit") await waitForHydration(page);
    return res;
  };
}

export const test = base.extend<TestFx, WorkerFx>({
  lang: ["ar", { option: true }],

  page: async ({ page }, provide) => {
    waitForHydrationOnNavigation(page);
    await provide(page);
  },

  guards: [
    async ({ context, lang }, use) => {
      await installGuards(context);
      await context.addInitScript(setInitialLang, lang);
      await use();
    },
    { auto: true },
  ],

  accounts: [
    // eslint-disable-next-line no-empty-pattern -- Playwright requires the destructuring form
    async ({}, use) => {
      await use(await ensureAccounts());
    },
    { scope: "worker" },
  ],

  catalog: [
    // eslint-disable-next-line no-empty-pattern -- Playwright requires the destructuring form
    async ({}, use) => {
      const tag = runTag();
      const cat = await createCatalog(tag);
      try {
        await use(cat);
      } finally {
        await cleanupTag(tag);
      }
    },
    { scope: "worker", timeout: 60_000 },
  ],
});

export { expect, installGuards };
