import { test, expect } from "./fixtures/test";
import { E2E_READY, SKIP_REASON } from "./fixtures/env";
import { login, toast } from "./fixtures/helpers";
import {
  createOfferedOrder,
  createWaitingOrder,
  readSettings,
  rejectAsDriver,
  updateSettings,
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
    await expect(page.getByLabel("عروض جديدة: ١")).toBeVisible();
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

test.describe("driver notification settings", () => {
  test.use({ lang: "ar" });

  test("settings open from the header; the driver app is installable", async ({ page }) => {
    await login(page, "driver", "/driver");
    // Manifest linked for "Add to Home Screen" (required for push on iPhone).
    await expect(page.locator('link[rel="manifest"]')).toHaveAttribute(
      "href",
      "/driver.webmanifest",
    );
    await page.getByRole("button", { name: "الإعدادات" }).click();
    const dialog = page.getByRole("dialog", { name: "الإعدادات" });
    await expect(dialog).toBeVisible();
    // Either push is set up for this store (switch) or the page says it isn't; never a blank screen.
    await expect(
      dialog
        .getByRole("switch", { name: "إشعارات الطلبات" })
        .or(dialog.getByText("إشعارات الجهاز مش مفعّلة للمتجر لسه.")),
    ).toBeVisible();
  });
});

test.describe("dispatch (admin)", () => {
  test.use({ lang: "ar" });
  test.describe.configure({ mode: "serial" });

  let restore: (() => Promise<void>) | null = null;
  test.beforeAll(async () => {
    restore = await reserveDispatchForTestDriver();
  });
  test.afterAll(async () => {
    await restore?.();
  });

  test("order page shows the open offer, who rejected, and can offer again", async ({
    page,
    catalog,
  }) => {
    const order = await createOfferedOrder(catalog);
    await login(page, "admin", `/admin/orders/${order.id}`);
    const panel = page.getByRole("region", { name: "التوزيع" });
    await expect(panel.getByText("معروض على مندوب")).toBeVisible();
    await expect(panel.locator("span", { hasText: "معروض على:" })).toContainText("مندوب اختبار");

    // The driver rejects (auto dispatch is off, so the order goes back to unassigned).
    const [offer] = await offersFor(order.id);
    await rejectAsDriver(offer.id);
    await expect(panel.getByText("مناديب لم يقبلوا")).toBeVisible();
    await expect(panel.getByText("رفض", { exact: true })).toBeVisible();
    await panel.locator("summary").click();
    await expect(panel.getByText(/رفضه/)).toBeVisible();

    // Nobody else is available and the test driver already declined: offering again finds no driver.
    await panel.getByRole("button", { name: "اعرض على مندوب الآن" }).click();
    await expect(toast(page, "لا يوجد مندوب متاح الآن")).toBeVisible();
    // The badge (the open log repeats the same words further down).
    await expect(panel.getByText("لا يوجد مندوب متاح", { exact: true }).first()).toBeVisible();
  });

  test("dashboard alerts and the orders filter list an order with no available driver", async ({
    page,
    catalog,
  }) => {
    const order = await createWaitingOrder(catalog);
    await login(page, "admin", "/admin");
    const alert = page.getByRole("alert").filter({ hasText: "بانتظار مندوب" });
    await expect(alert.getByRole("link", { name: `#${order.order_number}` })).toBeVisible();

    await page.goto("/admin/orders");
    await page.getByRole("button", { name: "بانتظار مندوب" }).click();
    const row = page.getByRole("row").filter({ hasText: `#${order.order_number}` });
    await expect(row).toBeVisible();
    await expect(row.getByText("لا يوجد مندوب متاح")).toBeVisible();
  });

  test("settings: dispatch options are validated and saved", async ({ page }) => {
    const before = await readSettings();
    try {
      await login(page, "admin", "/admin/settings");
      const timeout = page.getByLabel(/مهلة رد المندوب/);
      await timeout.fill("5");
      await page.getByRole("button", { name: "Save / حفظ" }).click();
      await expect(
        toast(page, "مهلة رد المندوب (ثانية) / Driver answer time (s): 30–1800"),
      ).toBeVisible();
      await timeout.fill("90");
      await page.getByLabel(/يبدأ التوزيع عند/).selectOption("confirmed");
      await page.getByRole("button", { name: "Save / حفظ" }).click();
      await expect(toast(page, "✓")).toBeVisible();
      await expect
        .poll(async () => {
          const s = await readSettings();
          return [s.driver_accept_timeout_seconds, s.dispatch_trigger_status];
        })
        .toEqual([90, "confirmed"]);
      await expect(page.getByRole("switch", { name: /توزيع الطلبات تلقائياً/ })).toBeVisible();
    } finally {
      await updateSettings({
        driver_accept_timeout_seconds: before.driver_accept_timeout_seconds,
        dispatch_trigger_status: before.dispatch_trigger_status,
      });
    }
  });
});
