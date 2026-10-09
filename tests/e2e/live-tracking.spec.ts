import { test, expect } from "./fixtures/test";
import { E2E_READY, SKIP_REASON } from "./fixtures/env";
import { T, login, newGuardedContext } from "./fixtures/helpers";
import { assignDriver, createAssignedOrder } from "./fixtures/seed";

test.skip(!E2E_READY, SKIP_REASON);

test.describe("live order tracking", () => {
  test.use({ lang: "ar" });
  const s = T.ar;

  test("customer order page updates without reload as the driver progresses", async ({
    page,
    browser,
    catalog,
    accounts,
    lang,
    viewport,
    isMobile,
  }) => {
    const order = await createAssignedOrder(catalog);
    await assignDriver(order.id, accounts.driver, true); // already accepted -> "Start delivery" is available

    // Customer context (the test's own page).
    await login(page, "customer", `/orders/${order.id}`);
    await expect(
      page.getByRole("heading", { level: 1, name: `${s.order} #${order.order_number}` }),
    ).toBeVisible();
    await expect(page.getByText("مباشر", { exact: true })).toBeVisible();
    await expect(page.getByRole("heading", { name: s.liveTracking })).toHaveCount(0);

    // Driver context, with a fixed GPS position.
    const driverCtx = await newGuardedContext(browser, lang, {
      permissions: ["geolocation"],
      geolocation: { latitude: 30.05, longitude: 31.24 },
      viewport: viewport ?? undefined,
      isMobile,
      hasTouch: isMobile,
    });
    try {
      const driver = await driverCtx.newPage();
      await login(driver, "driver", "/driver");
      await driver.getByRole("tab", { name: new RegExp(s.driverActive) }).click();
      const card = driver.locator("article").filter({ hasText: `#${order.order_number}` });
      await card.getByRole("button", { name: s.start }).click();

      // Realtime: the customer's page switches to live tracking, then shows the map once a position arrives.
      await expect(page.getByRole("heading", { name: s.liveTracking })).toBeVisible({
        timeout: 20_000,
      });
      await expect(page.locator(".leaflet-container")).toBeVisible({ timeout: 30_000 });
      await expect(page.getByText(/آخر تحديث:/)).toBeVisible();

      await card.getByRole("button", { name: s.delivered }).click();
      await driver.getByRole("dialog").getByRole("button", { name: s.confirmDelivered }).click();
      await expect(page.getByRole("heading", { name: s.liveTracking })).toHaveCount(0, {
        timeout: 20_000,
      });
      // Delivered orders open the return/exchange section.
      await expect(page.getByRole("heading", { name: s.returnExchange })).toBeVisible();
    } finally {
      await driverCtx.close();
    }
  });
});
