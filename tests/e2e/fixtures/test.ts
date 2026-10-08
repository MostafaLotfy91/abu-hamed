/**
 * Shared Playwright fixtures.
 *  - `lang`: "ar" (default, RTL) or "en"; stored in localStorage "app.lang" before any page script runs
 *    (same key src/lib/i18n.tsx reads).
 *  - Network guards on every context: AI endpoints are mocked, wa.me is never opened, map tiles and web
 *    fonts are stubbed, and any Supabase host other than the configured one is blocked.
 *  - `accounts` / `catalog`: per-worker seeded data (see seed.ts), cleaned up when the worker ends.
 */
import { test as base, expect, type BrowserContext } from "@playwright/test";
import { SUPABASE_URL, runTag } from "./env";
import { cleanupTag, createCatalog, ensureAccounts, type AccountIds, type Catalog } from "./seed";
import { assistantStream, insightsStream, ONE_PX_PNG } from "./mocks";
import { alignClock } from "./clock";

export type Lang = "ar" | "en";

type TestFx = { lang: Lang; guards: void };
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
    route.fulfill({ status: 200, contentType: "application/x-ndjson", body: assistantStream([{ type: "text", delta: "(mock)" }, { type: "products", items: [] }]) }),
  );
  await context.route("**/api/admin-insights", async (route) => {
    const body = (route.request().postDataJSON() ?? {}) as { mode?: string };
    if (body.mode === "weekly") return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ text: "ملخص تجريبي (mock)", created_at: new Date().toISOString(), cached: true }) });
    return route.fulfill({ status: 200, contentType: "application/x-ndjson", body: insightsStream([{ type: "text", delta: "(mock)" }]) });
  });
  // WhatsApp links are only asserted, never opened.
  await context.route(/^https?:\/\/(wa\.me|api\.whatsapp\.com|web\.whatsapp\.com)\//, (route) => route.abort("blockedbyclient"));
  // Map tiles and web fonts: keep tests offline-friendly and deterministic.
  await context.route(/tile\.openstreetmap\.org/, (route) => route.fulfill({ status: 200, contentType: "image/png", body: ONE_PX_PNG }));
  await context.route(/fonts\.(googleapis|gstatic)\.com/, (route) => route.abort("blockedbyclient"));
  // Only the configured Supabase project may be reached (protects against a stray production URL in the app build).
  if (SUPABASE_URL) {
    const allowed = new URL(SUPABASE_URL).host;
    await context.route(/\.supabase\.(co|in)\//, (route) =>
      new URL(route.request().url()).host === allowed ? route.fallback() : route.abort("blockedbyclient"),
    );
  }
}

export const test = base.extend<TestFx, WorkerFx>({
  lang: ["ar", { option: true }],

  guards: [
    async ({ context, lang }, use) => {
      await installGuards(context);
      await context.addInitScript(setInitialLang, lang);
      await use();
    },
    { auto: true },
  ],

  accounts: [
    async ({}, use) => {
      await use(await ensureAccounts());
    },
    { scope: "worker" },
  ],

  catalog: [
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
