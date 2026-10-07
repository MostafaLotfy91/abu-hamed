import { test, expect } from "./fixtures/test";
import { E2E_READY, SKIP_REASON } from "./fixtures/env";
import { T, fill, login, parseWa } from "./fixtures/helpers";
import { WA, createPendingOrder, readSettings } from "./fixtures/seed";

test.skip(!E2E_READY, SKIP_REASON);

/** Floating button: never clicked (wa.me is also blocked by the fixtures); only its href is asserted. */
for (const lang of ["ar", "en"] as const) {
  test.describe(`WhatsApp floating button (${lang})`, () => {
    test.use({ lang });
    const s = T[lang];

    test("general message on the home page", async ({ page }) => {
      const st = await readSettings();
      await page.goto("/");
      const link = page.getByRole("link", { name: s.waFloat });
      await expect(link).toHaveAttribute("target", "_blank");
      await expect(link).toHaveAttribute("rel", /noopener/);
      const wa = parseWa(await link.getAttribute("href"));
      expect(wa.number).toBe(WA.number);
      expect(wa.text).toBe(fill(WA.general[lang], { store_name: String(st[`name_${lang}`] || st.name_ar) }));
    });

    test("product message includes product name, chosen size and colour", async ({ page, catalog }) => {
      await page.goto(`/product/${catalog.productId}`);
      const link = page.getByRole("link", { name: s.waFloat });
      const text = async () => parseWa(await link.getAttribute("href")).text;
      // Before any click the page auto-selects the only colour, and the message already names it.
      // Several sizes exist, so no size is selected yet ("-").
      await expect(page.getByRole("button", { name: catalog.color[lang], exact: true })).toHaveAttribute("aria-pressed", "true");
      await expect.poll(text).toBe(fill(WA.product[lang], { product_name: catalog.product[lang], size: "", color: catalog.color[lang] }));
      await page.getByRole("button", { name: "M", exact: true }).click();
      await expect.poll(text).toBe(fill(WA.product[lang], { product_name: catalog.product[lang], size: "M", color: catalog.color[lang] }));
    });

    test("order page message includes the order number", async ({ page, catalog }) => {
      const order = await createPendingOrder(catalog);
      await login(page, "customer", `/orders/${order.id}`);
      const expected = fill(WA.order[lang], { order_number: order.order_number });
      const floating = page.getByRole("link", { name: s.waFloat });
      await expect.poll(async () => parseWa(await floating.getAttribute("href")).text).toBe(expected);
      const inline = page.getByRole("link", { name: s.waOrder });
      expect(parseWa(await inline.getAttribute("href")).text).toBe(expected);
    });
  });
}

test.describe("WhatsApp button visibility", () => {
  test.use({ lang: "ar" });

  test("hidden on /admin", async ({ page }) => {
    await login(page, "admin", "/admin");
    await expect(page.getByRole("link", { name: "الطلبات", exact: true })).toBeVisible();
    await expect(page.locator('a[href^="https://wa.me/"]')).toHaveCount(0);
  });

  test("hidden on /driver", async ({ page }) => {
    await login(page, "driver", "/driver");
    await expect(page.getByText("حالتي")).toBeVisible();
    await expect(page.locator('a[href^="https://wa.me/"]')).toHaveCount(0);
  });
});

test.describe("branches", () => {
  test.fixme("branches page shows a map and an open/closed label", () => {
    // Feature not present: the storefront has no branches route/page and no open/closed logic
    // (the `branches` table exists in the DB but nothing in src/routes or src/components reads it).
  });
});
