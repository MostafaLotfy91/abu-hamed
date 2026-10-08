import { test, expect } from "./fixtures/test";
import { E2E_READY, SKIP_REASON } from "./fixtures/env";
import { adminRow, login, pngFile, toast } from "./fixtures/helpers";
import { categoryImage, setCategoryImage, setProductImages, storedImages } from "./fixtures/seed";

test.skip(!E2E_READY, SKIP_REASON);

/*
 * Category pictures: own image > a real product photo from the category > designed fallback (never a gray box,
 * never an invented picture). The test category is a top-level department, shown as a home tile.
 */
test.describe("category images (storefront)", () => {
  test.use({ lang: "ar" });

  test("fallback, then product photo, then own image", async ({ page, catalog }) => {
    const [ownUrl, productUrl] = await storedImages();
    test.skip(!ownUrl || !productUrl, "needs two stored images in the project");
    const tile = page.locator(`[data-category-card="${catalog.categoryId}"]`);
    try {
      // No own image and the product has no photo: designed fallback.
      await page.goto("/");
      await expect(tile.locator('[data-category-image="fallback"]')).toBeVisible();
      await expect(tile.locator('[data-category-image="photo"]')).toHaveCount(0);

      // A real product photo from the category is used next.
      await setProductImages(catalog.productId, [productUrl]);
      await page.reload();
      await expect(tile.locator('[data-category-image="photo"]')).toHaveAttribute(
        "src",
        productUrl,
      );

      // The category's own image wins.
      await setCategoryImage(catalog.categoryId, ownUrl);
      await page.reload();
      await expect(tile.locator('[data-category-image="photo"]')).toHaveAttribute("src", ownUrl);

      // An old Lovable path counts as no image (falls back to the product photo).
      await setCategoryImage(catalog.categoryId, "/__l5e/assets-v1/old/dept.jpg");
      await page.reload();
      await expect(tile.locator('[data-category-image="photo"]')).toHaveAttribute(
        "src",
        productUrl,
      );
    } finally {
      await setCategoryImage(catalog.categoryId, null);
      await setProductImages(catalog.productId, []);
    }
  });
});

test.describe("category images (admin)", () => {
  test.use({ lang: "ar" });

  test("missing-image badge, upload in the form, bulk upload by file name", async ({
    page,
    catalog,
  }) => {
    try {
      await login(page, "admin", "/admin/categories");
      await page.getByPlaceholder("بحث").fill(catalog.tag);
      const row = adminRow(page, catalog.category.ar);
      await expect(row.locator("[data-missing-image]")).toBeVisible();
      await expect(page.getByRole("status").filter({ hasText: "بدون صورة" })).toBeVisible();

      // Upload in the edit form: compressed to WebP, stored, saved.
      await row.getByRole("button", { name: "تعديل" }).click();
      const dialog = page.getByRole("dialog");
      await dialog.locator('input[type="file"]').first().setInputFiles(pngFile());
      await expect(toast(page, "تم رفع الصورة")).toBeVisible({ timeout: 30_000 });
      await dialog.getByRole("button", { name: "حفظ" }).click();
      await expect(toast(page, "✓")).toBeVisible();
      await expect
        .poll(() => categoryImage(catalog.categoryId))
        .toMatch(/\/storage\/v1\/object\/public\/store-media\/categories\/.+\.webp$/);
      await expect(row.locator("[data-missing-image]")).toHaveCount(0);

      // Bulk: one file named after the category (English name as a slug), one that matches nothing.
      await setCategoryImage(catalog.categoryId, null);
      await page.getByRole("button", { name: "رفع صور مجمّع" }).click();
      const slug = catalog.category.en.toLowerCase().replace(/[^a-z0-9]+/g, "-");
      await page
        .getByLabel("رفع صور الأقسام")
        .setInputFiles([pngFile(`${slug}.png`), pngFile("no-such-category.png")]);
      const result = page.getByRole("list", { name: "نتيجة الرفع" });
      await expect(result.getByText(`${slug}.png`)).toBeVisible({ timeout: 30_000 });
      await expect(result.locator("li").filter({ hasText: `${slug}.png` })).toContainText("✓");
      await expect(result.locator("li").filter({ hasText: "no-such-category.png" })).toContainText(
        "لا يوجد قسم بهذا الاسم",
      );
      await expect.poll(() => categoryImage(catalog.categoryId)).toMatch(/\.webp$/);
    } finally {
      await setCategoryImage(catalog.categoryId, null);
    }
  });
});
