import { test, expect } from "./fixtures/test";
import { E2E_READY, SKIP_REASON } from "./fixtures/env";
import { T, toast, visible } from "./fixtures/helpers";
import { setVariantStock } from "./fixtures/seed";

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

test.describe("product page buying", () => {
  test.use({ lang: "ar" });

  test("add to cart without a size points to the size row instead of doing nothing", async ({
    page,
    catalog,
  }) => {
    await page.goto(`/product/${catalog.productId}`);
    const buy = visible(page.getByRole("button", { name: /^(أضف للسلة|اختار المقاس)/ }));
    await expect(buy).toBeEnabled();
    await buy.click();
    const sizes = page.getByRole("group", { name: "المقاس" });
    await expect(sizes).toHaveAttribute("data-nudge", "true");
    await expect(toast(page, "اختار المقاس واللون الأول")).toBeVisible();
    await sizes.getByRole("button", { name: "M", exact: true }).click();
    await visible(page.getByRole("button", { name: /^أضف للسلة/ })).click();
    await expect(toast(page, T.ar.addedToCart)).toBeVisible();
  });

  test("a product with little stock says so on its card", async ({ page, catalog }) => {
    // M and L have 50 each; bring the product down to 2 pieces in total.
    await setVariantStock(catalog.variants.M, 1);
    await setVariantStock(catalog.variants.L, 1);
    try {
      await page.goto(`/category/${catalog.categoryId}`);
      await expect(page.getByText("باقي قطعتان بس!").first()).toBeVisible();
    } finally {
      await setVariantStock(catalog.variants.M, 50);
      await setVariantStock(catalog.variants.L, 50);
    }
  });
});
