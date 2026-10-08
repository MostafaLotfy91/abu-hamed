import { test, expect } from "./fixtures/test";
import { E2E_READY, SKIP_REASON } from "./fixtures/env";
import { login, toast } from "./fixtures/helpers";
import {
  createOfferedOrder,
  ensureAccounts,
  expireOffersNow,
  getOrder,
  offersFor,
  reserveDispatchForTestDriver,
} from "./fixtures/seed";

test.skip(!E2E_READY, SKIP_REASON);

/*
 * Automatic dispatch, driver side. The order is offered by dispatch_order (what the auto-dispatch trigger
 * calls), so these tests don't depend on the auto_dispatch_enabled flag. Other drivers are set offline
 * meanwhile so the offer goes to the test driver; the expiry job is run directly instead of waiting for pg_cron.
 */
test.describe("dispatch offers (driver app)", () => {
  test.use({ lang: "ar" });
  // Tests share the one test driver, who can hold only one open offer at a time.
  test.describe.configure({ mode: "serial" });

  let restore: (() => Promise<void>) | null = null;
  test.beforeAll(async () => {
    restore = await reserveDispatchForTestDriver();
  });
  test.afterAll(async () => {
    await restore?.();
  });

  const alert = (page: import("@playwright/test").Page, orderNumber: number) =>
    page.getByRole("alertdialog", { name: `أوردر جديد #${orderNumber}` });

  test("a live offer pops up with details and countdown; accept assigns the order", async ({
    page,
    catalog,
  }) => {
    const { driver } = await ensureAccounts();
    await login(page, "driver", "/driver");
    await expect(page.getByRole("heading", { level: 1, name: "تطبيق المندوب" })).toBeVisible();

    // Offered while the app is open: arrives through Realtime.
    const order = await createOfferedOrder(catalog);
    const a = alert(page, order.order_number);
    await expect(a).toBeVisible({ timeout: 20_000 });
    await expect(a.getByText("المطلوب تحصيله (كاش)")).toBeVisible();
    await expect(a.getByRole("timer")).toHaveText(/^[12]:\d\d$/);
    // Badge on the "New" tab.
    await expect(page.getByLabel("1 عرض جديد")).toBeVisible();
    // No customer personal data before accepting.
    await expect(a).not.toContainText("01000000002");

    await a.getByRole("button", { name: "قبول" }).click();
    await expect(toast(page, "تم قبول الطلب")).toBeVisible();
    await expect(a).toBeHidden();
    await expect(page.getByRole("tab", { name: /نشطة/, selected: true })).toBeVisible();
    await expect(
      page.locator("article").filter({ hasText: `#${order.order_number}` }),
    ).toBeVisible();

    const o = await getOrder(order.id);
    expect(o).toMatchObject({ driver_id: driver, dispatch_status: "assigned" });
    expect((await offersFor(order.id)).map((f) => f.status)).toEqual(["accepted"]);
  });

  test("reject closes the alert and records the rejection", async ({ page, catalog }) => {
    await login(page, "driver", "/driver");
    const order = await createOfferedOrder(catalog);
    const a = alert(page, order.order_number);
    await expect(a).toBeVisible({ timeout: 20_000 });
    await a.getByRole("button", { name: "رفض" }).click();
    await expect(a).toBeHidden();
    await expect
      .poll(async () => (await offersFor(order.id)).map((f) => f.status))
      .toEqual(["rejected"]);
    // Auto dispatch is off in the suite, so the order goes back to unassigned for the admin.
    expect((await getOrder(order.id)).dispatch_status).toBe("unassigned");
  });

  test("an offer that times out disappears with a clear message", async ({ page, catalog }) => {
    await login(page, "driver", "/driver");
    const order = await createOfferedOrder(catalog);
    const a = alert(page, order.order_number);
    await expect(a).toBeVisible({ timeout: 20_000 });
    await expireOffersNow(order.id);
    await expect(a).toBeHidden({ timeout: 20_000 });
    await expect(page.getByRole("status").filter({ hasText: "انتهت مهلة العرض" })).toBeVisible();
  });

  test("an offer made while the app was closed shows when the driver opens it", async ({
    page,
    catalog,
  }) => {
    const order = await createOfferedOrder(catalog);
    await login(page, "driver", "/driver");
    const a = alert(page, order.order_number);
    await expect(a).toBeVisible({ timeout: 20_000 });
    await a.getByRole("button", { name: "رفض" }).click();
    await expect(a).toBeHidden();
  });
});
