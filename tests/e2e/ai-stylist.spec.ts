import type { Page } from "@playwright/test";
import { test, expect } from "./fixtures/test";
import { E2E_READY, SKIP_REASON } from "./fixtures/env";
import { T, toast } from "./fixtures/helpers";
import { assistantProductFor, assistantStream } from "./fixtures/mocks";
import { applyBaselineSettings, readSettings, updateSettings, type Catalog } from "./fixtures/seed";

test.skip(!E2E_READY, SKIP_REASON);

type Sent = { messages: { role: string; content: string }[] };

/** Mocks POST /api/assistant with the NDJSON stream the real route produces. No real AI call is ever made. */
async function mockAssistant(page: Page, cat: Catalog) {
  const requests: Sent[] = [];
  await page.route("**/api/assistant", async (route) => {
    expect(route.request().method()).toBe("POST");
    requests.push(route.request().postDataJSON() as Sent);
    await route.fulfill({
      status: 200,
      contentType: "application/x-ndjson",
      headers: { "cache-control": "no-store" },
      body: assistantStream([
        { type: "text", delta: "رشحتلك " },
        { type: "text", delta: "**قميص** مناسب، اختار المقاس من الكارت." },
        { type: "products", items: [assistantProductFor(cat)] },
      ]),
    });
  });
  return requests;
}

const card = (page: Page, cat: Catalog, viewLabel: string) =>
  page
    .locator("div")
    .filter({ has: page.getByRole("link", { name: viewLabel }) })
    .filter({ hasText: cat.product.ar })
    .last();

test.describe("AI stylist (mocked)", () => {
  test.use({ lang: "ar" });
  const s = T.ar;

  test("chat opens, product cards render and add to cart works", async ({ page, catalog }) => {
    const requests = await mockAssistant(page, catalog);
    await page.goto("/");
    await page.getByRole("button", { name: s.stylist, exact: true }).click();
    await expect(page.getByText(s.stylistSub)).toBeVisible();

    await page.getByPlaceholder(s.stylistInput).fill("عايز قميص أسود مقاس M");
    await page.getByRole("button", { name: s.send, exact: true }).click();

    await expect.poll(() => requests.length).toBe(1);
    expect(requests[0].messages.at(-1)).toEqual({ role: "user", content: "عايز قميص أسود مقاس M" });
    await expect(page.getByText(/رشحتلك/)).toBeVisible();
    await expect(page.locator("strong", { hasText: "قميص" })).toBeVisible(); // markdown rendered

    const c = card(page, catalog, s.viewProduct);
    await expect(c).toBeVisible();
    // Single colour is pre-selected; size still required.
    await expect(c.getByRole("button", { name: "اختار المقاس" })).toBeDisabled();
    await expect(c.getByRole("button", { name: "S", exact: true })).toHaveCount(0); // out-of-stock sizes are never sent
    await c.getByRole("button", { name: "M", exact: true }).click();
    await c.getByRole("button", { name: s.addToCart }).click();
    await expect(toast(page, s.stylistAdded)).toBeVisible();

    await page.getByRole("button", { name: "إغلاق" }).click();
    await page.goto("/cart");
    await expect(page.getByRole("link", { name: catalog.product.ar }).first()).toBeVisible();
    await expect(page.getByText(`${s.size}: M`)).toBeVisible();
  });

  test("suggestion chip sends a message and 'view product' opens the product page", async ({
    page,
    catalog,
  }) => {
    const requests = await mockAssistant(page, catalog);
    await page.goto("/");
    await page.getByRole("button", { name: s.stylist, exact: true }).click();
    // Chips are the store's top-level departments (no hardcoded phrases); the seed's department sorts first.
    await page.getByRole("button", { name: catalog.category.ar, exact: true }).click();
    await expect.poll(() => requests.at(-1)?.messages.at(-1)?.content).toBe(catalog.category.ar);
    await card(page, catalog, s.viewProduct).getByRole("link", { name: s.viewProduct }).click();
    await expect(page).toHaveURL(new RegExp(`/product/${catalog.productId}$`));
    await expect(page.getByText(s.stylistSub)).toHaveCount(0);
  });

  test("rate-limit response shows a friendly error", async ({ page }) => {
    await page.route("**/api/assistant", (route) =>
      route.fulfill({
        status: 429,
        contentType: "application/json",
        body: '{"error":"rate_limited"}',
      }),
    );
    await page.goto("/");
    await page.getByRole("button", { name: s.stylist, exact: true }).click();
    await page.getByPlaceholder(s.stylistInput).fill("مرحبا");
    await page.keyboard.press("Enter");
    await expect(page.getByText("بعت رسايل كتير، استنى شوية وجرب تاني.")).toBeVisible();
  });

  test("hidden when the ai_assistant flag is off", async ({ page }) => {
    const before = await readSettings();
    try {
      await updateSettings({ features: { ...(before.features ?? {}), ai_assistant: false } });
      await page.goto("/");
      await expect(page.getByRole("heading", { name: T.ar.shopByDept })).toBeVisible();
      await expect(page.getByRole("button", { name: s.stylist, exact: true })).toHaveCount(0);
    } finally {
      await applyBaselineSettings();
    }
  });
});

test.describe("AI stylist (mocked, English)", () => {
  test.use({ lang: "en" });

  test("English chat uses English labels and product names", async ({ page, catalog }) => {
    await mockAssistant(page, catalog);
    await page.goto("/");
    await page.getByRole("button", { name: T.en.stylist, exact: true }).click();
    await page.getByPlaceholder(T.en.stylistInput).fill("black shirt size L");
    await page.getByRole("button", { name: T.en.send, exact: true }).click();
    await expect(page.getByText(catalog.product.en)).toBeVisible();
    await expect(page.getByRole("link", { name: T.en.viewProduct })).toBeVisible();
  });
});
