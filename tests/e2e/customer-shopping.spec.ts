import { test, expect } from "./fixtures/test";
import { E2E_READY, SKIP_REASON } from "./fixtures/env";
import { T, escapeRe, expectDir, login, toast, visible } from "./fixtures/helpers";
import { clearWishlist, getOrder, latestOrderFor, wishlistHas } from "./fixtures/seed";

test.skip(!E2E_READY, SKIP_REASON);

const s = T.ar;

test.describe("customer shopping (Arabic, RTL)", () => {
  test.use({ lang: "ar" });

  test("home shows departments in RTL and opens a department", async ({ page, catalog }) => {
    await page.goto("/");
    await expectDir(page, "ar");
    await expect(page.getByRole("heading", { name: s.shopByDept })).toBeVisible();
    await page.getByRole("link", { name: catalog.category.ar }).first().click();
    await expect(page).toHaveURL(new RegExp(`/category/${catalog.categoryId}$`));
    await expect(page.getByRole("heading", { level: 1, name: catalog.category.ar })).toBeVisible();
    await expect(page.getByRole("link", { name: catalog.product.ar }).first()).toBeVisible();
  });

  test("categories page lists departments and links to all products of one", async ({ page, catalog }) => {
    await page.goto("/categories");
    await page.getByRole("button", { name: catalog.category.ar }).click();
    await page.getByRole("link", { name: new RegExp(`${escapeRe(s.allProducts)}.*${escapeRe(catalog.category.ar)}`) }).click();
    await expect(page).toHaveURL(new RegExp(`/category/${catalog.categoryId}$`));
    await expect(page.getByText("1 منتج", { exact: true })).toBeVisible();
  });

  test("filters narrow the listing and chips clear them", async ({ page, catalog, isMobile }) => {
    await page.goto(`/category/${catalog.categoryId}`);
    const product = page.getByRole("link", { name: catalog.product.ar }).first();
    await expect(product).toBeVisible();

    // Price filter above the product price -> empty state.
    if (isMobile) {
      await visible(page.getByRole("button", { name: new RegExp(s.filters) })).click();
      const sheet = page.getByRole("dialog");
      await sheet.getByPlaceholder(s.min, { exact: true }).fill(String(catalog.price + 1000));
      await sheet.getByRole("button", { name: /^عرض .* منتج$/ }).click();
    } else {
      await visible(page.getByPlaceholder(s.min, { exact: true })).fill(String(catalog.price + 1000));
    }
    await expect(page.getByRole("heading", { name: s.noProducts })).toBeVisible();
    await page.getByRole("button", { name: s.clearAll }).click();
    await expect(product).toBeVisible();

    // Size filter: M is stocked, XXXL does not exist for this product.
    const pickSize = async (size: string) => {
      if (isMobile) {
        await visible(page.getByRole("button", { name: new RegExp(s.filters) })).click();
        const sheet = page.getByRole("dialog");
        await sheet.getByRole("button", { name: size, exact: true }).click();
        await sheet.getByRole("button", { name: /^عرض .* منتج$/ }).click();
      } else {
        await visible(page.locator("aside").getByRole("button", { name: size, exact: true })).click();
      }
    };
    await pickSize("XXXL");
    await expect(page.getByRole("heading", { name: s.noProducts })).toBeVisible();
    await page.getByRole("button", { name: s.clearAll }).click();
    await pickSize("M");
    await expect(product).toBeVisible();
  });

  test("search submits to the results page and suggestions open the product", async ({ page, catalog }) => {
    await page.goto("/");
    const box = visible(page.getByPlaceholder(s.searchPlaceholder));
    await box.fill(catalog.tag);
    // Suggestion dropdown (debounced query on name_ar/name_en/brand).
    await expect(page.getByRole("button", { name: catalog.product.ar })).toBeVisible();
    await box.press("Enter");
    await expect(page).toHaveURL(new RegExp(`/products\\?q=${catalog.tag}`));
    await expect(page.getByRole("heading", { level: 1, name: `${s.resultsFor} "${catalog.tag}"` })).toBeVisible();
    await expect(page.getByRole("link", { name: catalog.product.ar }).first()).toBeVisible();

    await box.fill(catalog.tag);
    await page.getByRole("button", { name: catalog.product.ar }).click();
    await expect(page).toHaveURL(new RegExp(`/product/${catalog.productId}$`));
  });

  test("product page: colour auto-selected, out-of-stock size disabled, size selectable", async ({ page, catalog }) => {
    await page.goto(`/product/${catalog.productId}`);
    await expect(page.getByRole("heading", { level: 1, name: catalog.product.ar })).toBeVisible();
    await expect(page.getByRole("button", { name: catalog.color.ar, exact: true })).toHaveAttribute("aria-pressed", "true");
    const sizeS = page.getByRole("button", { name: "S", exact: true });
    const sizeM = page.getByRole("button", { name: "M", exact: true });
    await expect(sizeS).toBeDisabled();
    await expect(sizeM).toBeEnabled();
    await sizeM.click();
    await expect(sizeM).toHaveAttribute("aria-pressed", "true");
    await expect(page.getByText(s.inStock, { exact: true })).toBeVisible();
    await visible(page.getByRole("button", { name: new RegExp(`^${s.addToCart}`) })).click();
    await expect(toast(page, s.addedToCart)).toBeVisible();
  });

  test("wishlist toggle on a product card persists for the signed-in customer", async ({ page, catalog, accounts }) => {
    await clearWishlist(accounts.customer, catalog.productId);
    await login(page, "customer", `/category/${catalog.categoryId}`);
    const heart = page.getByRole("button", { name: s.wishlist }).first();
    await expect(heart).toHaveAttribute("aria-pressed", "false");
    await heart.click();
    await expect(heart).toHaveAttribute("aria-pressed", "true");
    await expect.poll(() => wishlistHas(accounts.customer, catalog.productId)).toBe(true);

    await page.goto("/account");
    await page.getByRole("tab", { name: s.wishlist }).click();
    await expect(page.getByRole("link", { name: catalog.product.ar }).first()).toBeVisible();
    await page.getByRole("tabpanel").getByRole("button", { name: s.wishlist }).first().click();
    await expect.poll(() => wishlistHas(accounts.customer, catalog.productId)).toBe(false);
  });

  test("cart, coupon and cash-on-delivery checkout end on the order timeline", async ({ page, catalog, accounts }) => {
    await login(page, "customer", `/product/${catalog.productId}`);
    await page.getByRole("button", { name: "M", exact: true }).click();
    await visible(page.getByRole("button", { name: new RegExp(`^${s.addToCart}`) })).click();
    await expect(toast(page, s.addedToCart)).toBeVisible();

    await page.goto("/cart");
    await expect(page.getByRole("heading", { level: 1, name: new RegExp(s.cart) })).toBeVisible();
    await expect(page.getByRole("link", { name: catalog.product.ar }).first()).toBeVisible();
    await expect(page.getByText(`${s.size}: M`)).toBeVisible();
    await page.getByRole("link", { name: s.checkout }).click();

    await expect(page).toHaveURL(/\/checkout$/);
    await expect(page.getByRole("heading", { level: 1, name: s.checkout })).toBeVisible();
    // Seeded address is pre-selected.
    await expect(page.getByRole("button", { name: /E2E/ })).toBeVisible();
    // Cash on delivery only: online payment is disabled ("coming soon").
    await expect(page.getByRole("button", { name: s.cod })).toBeEnabled();
    await expect(page.getByRole("button", { name: new RegExp(s.online) })).toBeDisabled();
    await expect(page.getByRole("button", { name: new RegExp(s.online) })).toContainText(s.comingSoon);

    await page.getByPlaceholder(s.coupon).fill(catalog.couponCode);
    await page.getByRole("button", { name: s.apply, exact: true }).click();
    await expect(toast(page, s.discount)).toBeVisible();
    await expect(page.locator("aside").getByText(s.discount, { exact: true })).toBeVisible();

    await visible(page.getByRole("button", { name: s.placeOrder })).click();
    await expect(page).toHaveURL(/\/orders\/[0-9a-f-]{36}$/, { timeout: 20_000 });
    await expect(toast(page, s.orderPlaced)).toBeVisible();
    await expect(page.getByRole("heading", { level: 1, name: new RegExp(`${s.order} #\\d+`) })).toBeVisible();
    for (const label of Object.values(s.timeline).filter((l) => l !== s.timeline.cancelled)) {
      await expect(page.getByRole("listitem").filter({ hasText: label }).first()).toBeVisible();
    }

    const orderId = await latestOrderFor(accounts.customer, catalog.productId);
    expect(orderId).toBeTruthy();
    const order = await getOrder(orderId!);
    expect(order.payment_method).toBe("cod");
    expect(order.status).toBe("pending");
    expect(order.coupon_code?.toUpperCase()).toBe(catalog.couponCode.toUpperCase());
    expect(Number(order.discount)).toBeCloseTo((catalog.price * catalog.couponPercent) / 100, 2);
  });
});

test.describe("customer shopping (English, LTR)", () => {
  test.use({ lang: "en" });
  const e = T.en;

  test("home and product page render in English with dir=ltr", async ({ page, catalog }) => {
    await page.goto("/");
    await expectDir(page, "en");
    await expect(page.getByRole("heading", { name: e.shopByDept })).toBeVisible();
    await page.goto(`/product/${catalog.productId}`);
    await expect(page.getByRole("heading", { level: 1, name: catalog.product.en })).toBeVisible();
    await expect(page.getByText(e.size, { exact: true })).toBeVisible();
    await expect(page.getByRole("button", { name: catalog.color.en, exact: true })).toBeVisible();
  });
});

test.describe("language toggle", () => {
  test.use({ lang: "ar" });

  test("header toggle switches to English/LTR and persists across reloads", async ({ page }) => {
    await page.goto("/");
    await expectDir(page, "ar");
    await page.getByRole("button", { name: "language" }).click();
    await expectDir(page, "en");
    expect(await page.evaluate(() => localStorage.getItem("app.lang"))).toBe("en");
    await page.reload();
    await expectDir(page, "en");
    await expect(page.getByRole("heading", { name: T.en.shopByDept })).toBeVisible();
  });
});
