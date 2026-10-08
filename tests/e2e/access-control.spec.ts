import { test, expect } from "./fixtures/test";
import { E2E_READY, SKIP_REASON } from "./fixtures/env";
import { T, login } from "./fixtures/helpers";

test.skip(!E2E_READY, SKIP_REASON);

/*
 * Note on behaviour: /admin and /driver are inside the signed-in area (/_authenticated). A signed-out visitor is
 * redirected to /auth. A signed-in user without the right role is NOT redirected: the route renders an
 * access-denied screen and none of the protected UI (RLS is the real boundary). The tests assert exactly that.
 */
test.describe("access control", () => {
  test.use({ lang: "ar" });
  const s = T.ar;
  const adminNav = ["المنتجات", "الكوبونات", "إعدادات المتجر"];

  for (const path of ["/checkout", "/admin", "/driver", "/orders", "/account"]) {
    test(`signed-out visitor opening ${path} is redirected to /auth`, async ({ page }) => {
      await page.goto(path);
      await expect(page).toHaveURL(new RegExp(`/auth\\?redirect=(%2F|/)${path.slice(1)}$`));
      await expect(page.locator('input[type="email"]')).toBeVisible();
    });
  }

  test("customer opening /admin gets the access-denied screen, no admin UI", async ({ page }) => {
    await login(page, "customer", "/admin");
    await expect(page.getByRole("heading", { name: s.noAccess })).toBeVisible();
    for (const label of adminNav)
      await expect(page.getByRole("link", { name: label, exact: true })).toHaveCount(0);
    await page.goto("/admin/products");
    await expect(page.getByRole("heading", { name: s.noAccess })).toBeVisible();
    await expect(page.getByRole("button", { name: "إضافة" })).toHaveCount(0);
  });

  test("customer opening /driver gets the drivers-only screen", async ({ page }) => {
    await login(page, "customer", "/driver");
    await expect(page.getByRole("heading", { name: s.driversOnly })).toBeVisible();
    await expect(page.getByRole("tab")).toHaveCount(0);
  });

  test("driver cannot open /admin", async ({ page }) => {
    await login(page, "driver", "/admin");
    await expect(page.getByRole("heading", { name: s.noAccess })).toBeVisible();
    for (const label of adminNav)
      await expect(page.getByRole("link", { name: label, exact: true })).toHaveCount(0);
  });

  test("customer does not see the admin or driver shortcuts in the header", async ({ page }) => {
    await login(page, "customer", "/");
    await expect(page.getByRole("link", { name: "لوحة التحكم" })).toHaveCount(0);
    await expect(page.getByRole("link", { name: "تطبيق المندوب" })).toHaveCount(0);
  });
});
