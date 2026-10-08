import AxeBuilder from "@axe-core/playwright";
import type { Page } from "@playwright/test";
import { test, expect } from "./fixtures/test";
import { E2E_READY, SKIP_REASON } from "./fixtures/env";
import { T, login, toast, visible } from "./fixtures/helpers";

test.skip(!E2E_READY, SKIP_REASON);

/** WCAG 2.0 A/AA scan; only serious/critical violations fail the test (listed with their selectors). */
async function seriousViolations(page: Page) {
  const result = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa"]).analyze();
  return result.violations
    .filter((v) => v.impact === "serious" || v.impact === "critical")
    .map((v) => ({
      id: v.id,
      impact: v.impact,
      help: v.help,
      targets: v.nodes.slice(0, 5).map((n) => n.target.join(" ")),
    }));
}

for (const lang of ["ar", "en"] as const) {
  test.describe(`accessibility (${lang})`, () => {
    test.use({ lang });
    const s = T[lang];

    test("home page has no serious/critical WCAG A/AA violations", async ({ page }) => {
      await page.goto("/");
      await expect(page.getByRole("heading", { name: s.shopByDept })).toBeVisible();
      expect(await seriousViolations(page)).toEqual([]);
    });

    test("product page has no serious/critical WCAG A/AA violations", async ({ page, catalog }) => {
      await page.goto(`/product/${catalog.productId}`);
      await expect(
        page.getByRole("heading", { level: 1, name: catalog.product[lang] }),
      ).toBeVisible();
      expect(await seriousViolations(page)).toEqual([]);
    });

    test("checkout page has no serious/critical WCAG A/AA violations", async ({
      page,
      catalog,
    }) => {
      await login(page, "customer", `/product/${catalog.productId}`);
      await page.getByRole("button", { name: "M", exact: true }).click();
      await visible(page.getByRole("button", { name: new RegExp(`^${s.addToCart}`) })).click();
      await expect(toast(page, s.addedToCart)).toBeVisible();
      await page.goto("/checkout");
      await expect(page.getByRole("heading", { level: 1, name: s.checkout })).toBeVisible();
      expect(await seriousViolations(page)).toEqual([]);
    });
  });
}
