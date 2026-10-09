import { test, expect } from "./fixtures/test";
import { E2E_READY, SKIP_REASON } from "./fixtures/env";
import { T, login } from "./fixtures/helpers";
import { createAssignedOrder, driverLocations, driverProfile, getOrder } from "./fixtures/seed";

test.skip(!E2E_READY, SKIP_REASON);

const CAIRO = { latitude: 30.0444, longitude: 31.2357 };

test.describe("driver app", () => {
  test.use({ lang: "ar", permissions: ["geolocation"], geolocation: CAIRO });
  const s = T.ar;

  test("sees the assigned order, accepts, starts delivery (location saved) and marks it delivered", async ({
    page,
    catalog,
    accounts,
  }) => {
    const order = await createAssignedOrder(catalog);
    await login(page, "driver", "/driver");
    // The site header also has a (phone-hidden) "تطبيق المندوب" shortcut; the app's own title is the h1.
    await expect(page.getByRole("heading", { level: 1, name: "تطبيق المندوب" })).toBeVisible();
    await expect(page.getByText("حالتي")).toBeVisible();

    const card = page.locator("article").filter({ hasText: `#${order.order_number}` });
    await page.getByRole("tab", { name: new RegExp(s.driverNew) }).click();
    await expect(card).toBeVisible();
    await expect(card).toContainText("شارع الاختبار");
    await expect(card).toContainText("المطلوب تحصيله"); // cash on delivery

    await card.getByRole("button", { name: s.accept }).click();
    await expect.poll(async () => (await getOrder(order.id)).driver_accepted_at).not.toBeNull();

    await page.getByRole("tab", { name: new RegExp(s.driverActive) }).click();
    await card.getByRole("button", { name: s.start }).click();
    await expect.poll(async () => (await getOrder(order.id)).status).toBe("out_for_delivery");
    await expect(page.getByText(/يتم مشاركة موقعك مع العميل/)).toBeVisible();

    // The tracker sends the first position ~1.5s after the delivery starts, then every 10s.
    await expect
      .poll(async () => (await driverLocations(order.id)).length, { timeout: 30_000 })
      .toBeGreaterThan(0);
    const [loc] = await driverLocations(order.id);
    expect(loc.driver_id).toBe(accounts.driver);
    expect(loc.lat).toBeCloseTo(CAIRO.latitude, 3);
    expect(loc.lng).toBeCloseTo(CAIRO.longitude, 3);

    await card.getByRole("button", { name: s.delivered }).click();
    // Cash on delivery: the amount collected is confirmed (prefilled with the order total).
    await page.getByRole("dialog").getByRole("button", { name: s.confirmDelivered }).click();
    await expect.poll(async () => (await getOrder(order.id)).status).toBe("delivered");
    await page.getByRole("tab", { name: new RegExp(s.driverDone) }).click();
    await expect(card).toBeVisible();
    await expect(card.getByRole("button")).toHaveCount(0);
    // Today's summary counts it (at least this one).
    await expect(page.getByRole("region", { name: "ملخص اليوم" })).not.toContainText("لا طلبات");
    // The driver app is its own screen: no shop navigation or floating buttons.
    await expect(page.getByRole("link", { name: "الرئيسية" })).toHaveCount(0);
    await expect(page.getByRole("button", { name: "الستايلست", exact: true })).toHaveCount(0);
  });

  test("availability status buttons update the driver profile", async ({ page, accounts }) => {
    await login(page, "driver", "/driver");
    try {
      await page.getByRole("button", { name: "مشغول", exact: true }).click();
      await expect.poll(async () => (await driverProfile(accounts.driver)).status).toBe("busy");
    } finally {
      await page.getByRole("button", { name: "متاح", exact: true }).click();
      await expect
        .poll(async () => (await driverProfile(accounts.driver)).status)
        .toBe("available");
    }
  });
});
