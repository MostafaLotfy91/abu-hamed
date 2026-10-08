import type { Locator, Page } from "@playwright/test";
import { test, expect } from "./fixtures/test";
import { E2E_READY, SKIP_REASON, runTag } from "./fixtures/env";
import { T } from "./fixtures/helpers";
import { cleanupTag, createProfileCatalog, type ProfileCatalog } from "./fixtures/seed";

test.skip(!E2E_READY, SKIP_REASON);

/**
 * Filters and product pages follow the category profile (product_profiles): perfumes have no size/colour
 * filters or size guide, accessories have no clothing sizes, and filters a category doesn't offer are dropped.
 */
const L = {
  size: "المقاس",
  color: "اللون",
  concentration: "التركيز",
  volume: "الحجم",
  type: "النوع",
  material: "الخامة",
};

let tag: string;
let pc: ProfileCatalog;
test.beforeAll(async () => {
  tag = runTag();
  pc = await createProfileCatalog(tag);
});
test.afterAll(async () => {
  if (tag) await cleanupTag(tag);
});

/** The filter panel: desktop sidebar, or the bottom sheet on mobile (opened here). */
async function filterPanel(page: Page, isMobile: boolean): Promise<Locator> {
  if (!isMobile) return page.getByRole("complementary", { name: T.ar.filters });
  await page
    .getByRole("button", { name: new RegExp(T.ar.filters) })
    .filter({ visible: true })
    .first()
    .click();
  return page.getByRole("dialog");
}

test.describe("category profiles", () => {
  test.use({ lang: "ar" });

  test("perfumes: concentration and volume filters, no size or colour filters", async ({
    page,
    isMobile,
  }) => {
    await page.goto(`/category/${pc.perfume.categoryId}`);
    await expect(page.getByRole("heading", { level: 1, name: pc.perfume.name.ar })).toBeVisible();
    const panel = await filterPanel(page, isMobile);
    await expect(panel.getByText(L.concentration, { exact: true })).toBeVisible();
    await expect(panel.getByRole("button", { name: /EDP/ })).toBeVisible();
    await expect(panel.getByText(L.volume, { exact: true })).toBeVisible();
    await expect(panel.getByText(L.size, { exact: true })).toHaveCount(0);
    await expect(panel.getByText(L.color, { exact: true })).toHaveCount(0);
  });

  test("perfume product page: fragrance details, no size selector or size guide", async ({
    page,
  }) => {
    await page.goto(`/product/${pc.perfume.productId}`);
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    await expect(page.getByText(T.ar.size, { exact: true })).toHaveCount(0);
    await expect(page.getByRole("button", { name: /دليل المقاسات|Size guide/ })).toHaveCount(0);
    await expect(page.getByRole("button", { name: /العطر|Fragrance/ })).toBeVisible();
    // No variants: adds to cart directly.
    await page
      .getByRole("button", { name: new RegExp(`^${T.ar.addToCart}`) })
      .filter({ visible: true })
      .first()
      .click();
    await expect(
      page.locator("[data-sonner-toast]").filter({ hasText: T.ar.addedToCart }),
    ).toBeVisible();
  });

  test("accessories: type, colour and material filters, no clothing sizes", async ({
    page,
    isMobile,
  }) => {
    await page.goto(`/category/${pc.accessories.categoryId}`);
    const panel = await filterPanel(page, isMobile);
    await expect(panel.getByText(L.type, { exact: true })).toBeVisible();
    await expect(
      panel.getByRole("button", { name: new RegExp(`ساعات اختبار ${tag}`) }),
    ).toBeVisible();
    await expect(panel.getByText(L.material, { exact: true })).toBeVisible();
    await expect(panel.getByText(L.size, { exact: true })).toHaveCount(0);
    for (const size of ["S", "M", "L", "XL"])
      await expect(panel.getByRole("button", { name: size, exact: true })).toHaveCount(0);
  });

  test("accessory product page: colour options from its variants, no size guide", async ({
    page,
  }) => {
    await page.goto(`/product/${pc.accessories.productId}`);
    await expect(page.getByRole("button", { name: "ذهبي", exact: true })).toBeVisible();
    await expect(page.getByRole("button", { name: /دليل المقاسات|Size guide/ })).toHaveCount(0);
  });

  test("switching category drops filters the new category doesn't offer", async ({
    page,
    catalog,
  }) => {
    // Size and colour carried over from a clothing listing are removed; brand (universal) is kept.
    await page.goto(`/category/${catalog.categoryId}?size=M&color=Black&brand=X`);
    await expect(page).toHaveURL(/size=M/);
    await page.goto(
      `/category/${pc.perfume.categoryId}?size=M&color=Black&brand=${encodeURIComponent(`E2E ${tag}`)}`,
    );
    await expect(page).not.toHaveURL(/size=|color=/);
    await expect(page).toHaveURL(/brand=/);
    await expect(
      page.getByRole("link", { name: new RegExp(`عطر اختبار ${tag}`) }).first(),
    ).toBeVisible();
  });

  test("search results only offer the universal filters", async ({ page, isMobile }) => {
    await page.goto(`/products?q=${encodeURIComponent(tag)}`);
    const panel = await filterPanel(page, isMobile);
    await expect(panel.getByRole("spinbutton", { name: T.ar.min, exact: true })).toBeVisible();
    for (const label of [L.size, L.color, L.concentration, L.type])
      await expect(panel.getByText(label, { exact: true })).toHaveCount(0);
  });
});
