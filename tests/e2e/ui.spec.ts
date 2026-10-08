import { test, expect } from "./fixtures/test";
import { E2E_READY, SKIP_REASON } from "./fixtures/env";

test.skip(!E2E_READY, SKIP_REASON);

/* UI improvements: dark mode, number formatting, mini-cart, floating help, etc. */
test.describe("dark mode", () => {
  test.use({ lang: "ar" });

  test("toggle switches to dark and the choice survives a reload", async ({ page }) => {
    await page.goto("/");
    const html = page.locator("html");
    await expect(html).not.toHaveClass(/\bdark\b/);
    await page.getByRole("button", { name: "الوضع الداكن" }).first().click();
    await expect(html).toHaveClass(/\bdark\b/);
    await page.reload();
    await expect(html).toHaveClass(/\bdark\b/);
    await page.getByRole("button", { name: "الوضع الفاتح" }).first().click();
    await expect(html).not.toHaveClass(/\bdark\b/);
  });

  test.describe("device in dark mode", () => {
    test.use({ colorScheme: "dark" });
    test("follows the device setting from the first paint", async ({ page }) => {
      // Checked on the server HTML before any app script: the head script alone sets the class.
      await page.goto("/", { waitUntil: "commit" });
      await expect(page.locator("html")).toHaveClass(/\bdark\b/);
      // The page background really is dark.
      const bg = await page.evaluate(() => getComputedStyle(document.body).backgroundColor);
      const [r, g, b] = (bg.match(/\d+(\.\d+)?/g) ?? []).map(Number);
      expect(r + g + b).toBeLessThan(150);
    });
  });
});

test.describe("listings in the server HTML", () => {
  test("category and search pages arrive with their products (before any script runs)", async ({
    request,
    catalog,
  }) => {
    for (const path of [`/category/${catalog.categoryId}`, `/products?q=${catalog.tag}`]) {
      const html = await (await request.get(path)).text();
      expect(html, path).toContain(`/product/${catalog.productId}`);
    }
  });
});
