import { test, expect } from "./fixtures/test";
import { E2E_READY, SKIP_REASON, runTag } from "./fixtures/env";
import { login, newGuardedContext } from "./fixtures/helpers";
import {
  advanceOrder,
  deletePushEndpoints,
  ensureAccounts,
  getOrder,
  notificationsFor,
  placeOrderAs,
  pushEndpoints,
  readSettings,
  reserveDispatchForTestDriver,
  service,
  updateSettings,
  type Catalog,
  type SettingsRow,
} from "./fixtures/seed";

test.skip(!E2E_READY, SKIP_REASON);

/*
 * Driver notifications with two browser contexts (admin + driver). Web Push itself is mocked in the driver's
 * browser: the service worker registration and PushManager are replaced by a fake that hands out
 * https://push.example.test/... endpoints, so subscribing, re-subscribing and the server-side records are real
 * while nothing is sent to a real push service. The database side (who is notified, notification_log) is real.
 */
const ENDPOINT = `https://push.example.test/e2e-${runTag()}`;

/** Runs in the driver's browser before any page script. */
function fakePush(base: string) {
  const KEY = "e2e.fakePushEndpoint";
  const sub = (endpoint: string) => ({
    endpoint,
    options: { applicationServerKey: null },
    toJSON: () => ({ endpoint, keys: { p256dh: "BPfakeKey", auth: "fakeAuth" } }),
    unsubscribe: async () => {
      localStorage.removeItem(KEY);
      return true;
    },
  });
  const pushManager = {
    getSubscription: async () => {
      const e = localStorage.getItem(KEY);
      return e ? sub(e) : null;
    },
    subscribe: async () => {
      const e = `${base}/${Date.now()}${Math.random().toString(36).slice(2, 6)}`;
      localStorage.setItem(KEY, e);
      return sub(e);
    },
  };
  // Headless Chromium reports "denied" even when the context grants notifications.
  if ("Notification" in window) {
    Object.defineProperty(Notification, "permission", { get: () => "granted" });
    Object.defineProperty(Notification, "requestPermission", { value: async () => "granted" });
  }
  const reg = { scope: `${location.origin}/driver`, pushManager };
  const sw = navigator.serviceWorker;
  if (!sw) return;
  Object.defineProperty(sw, "register", { value: async () => reg });
  Object.defineProperty(sw, "getRegistration", { value: async () => reg });
  Object.defineProperty(sw, "ready", { get: () => Promise.resolve(reg) });
}

async function confirmedOrder(cat: Catalog) {
  const o = await placeOrderAs([
    { product_id: cat.productId, variant_id: cat.variants.L, quantity: 1 },
  ]);
  await advanceOrder(o.id, "confirmed");
  return o;
}

test.describe("driver notifications", () => {
  test.use({ lang: "ar" });
  test.describe.configure({ mode: "serial" });

  let restore: (() => Promise<void>) | null = null;
  let before: SettingsRow;
  test.beforeAll(async () => {
    restore = await reserveDispatchForTestDriver();
    before = await readSettings();
    await updateSettings({
      dispatch_trigger_status: "preparing",
      features: { ...before.features, auto_dispatch_enabled: true, delivery_tracking: true },
    });
  });
  test.afterAll(async () => {
    await updateSettings({
      dispatch_trigger_status: before.dispatch_trigger_status,
      features: before.features,
    });
    await restore?.();
    await deletePushEndpoints(ENDPOINT);
  });

  const driverContext = async (browser: import("@playwright/test").Browser) => {
    const ctx = await newGuardedContext(browser, "ar", { permissions: ["notifications"] });
    await ctx.addInitScript(fakePush, ENDPOINT);
    return ctx;
  };

  test("settings show this device's status; an expired subscription is flagged and re-subscribed", async ({
    browser,
  }) => {
    const { driver: driverId } = await ensureAccounts();
    const ctx = await driverContext(browser);
    try {
      const page = await ctx.newPage();
      await login(page, "driver", "/driver");
      // Not enabled yet: the main screen says so and opens the settings.
      const banner = page.getByRole("alert").filter({ hasText: "إشعارات الطلبات مش مفعّلة" });
      await expect(banner).toBeVisible();
      await banner.click();
      const dialog = page.getByRole("dialog", { name: "الإعدادات" });
      await dialog.getByRole("switch", { name: "إشعارات الطلبات" }).click();
      const status = dialog.getByTestId("push-device-status");
      await expect(status).toContainText("مفعّلة ✓");
      await expect(status).toContainText("مسجّلة");
      await expect(status).toContainText("آخر إشعار وصل");
      await expect.poll(() => pushEndpoints(driverId, ENDPOINT)).toHaveLength(1);
      const [first] = await pushEndpoints(driverId, ENDPOINT);

      // The push service reported the device gone (404/410): send-driver-push deleted the row.
      await deletePushEndpoints(ENDPOINT);
      await page.keyboard.press("Escape");
      const stale = page.getByRole("alert").filter({ hasText: "الإشعارات وقفت على الجهاز ده" });
      await expect(stale).toBeVisible();
      // Reloading must not silently save the dead endpoint again.
      await page.reload();
      await expect(stale).toBeVisible();
      expect(await pushEndpoints(driverId, ENDPOINT)).toEqual([]);

      await stale.click();
      await dialog.getByRole("button", { name: "إعادة الاشتراك" }).click();
      await expect(status).toContainText("مفعّلة ✓");
      await expect.poll(() => pushEndpoints(driverId, ENDPOINT)).toHaveLength(1);
      const [renewed] = await pushEndpoints(driverId, ENDPOINT);
      expect(renewed).not.toBe(first);
      await page.keyboard.press("Escape");
      await expect(stale).toBeHidden();
    } finally {
      await ctx.close();
    }
  });

  test("admin moves an order to preparing: the available driver gets the offer and a push is logged", async ({
    page,
    browser,
    catalog,
  }) => {
    const { driver: driverId } = await ensureAccounts();
    const order = await confirmedOrder(catalog);
    const ctx = await driverContext(browser);
    try {
      const driver = await ctx.newPage();
      await login(driver, "driver", "/driver");
      await expect(driver.getByRole("heading", { level: 1, name: "تطبيق المندوب" })).toBeVisible();

      await login(page, "admin", `/admin/orders/${order.id}`);
      // Nothing at confirmed: the start status is preparing.
      expect(await notificationsFor(order.id)).toEqual([]);
      await page.getByRole("button", { name: "جاري التجهيز" }).click();

      const offer = driver.getByRole("alertdialog", { name: `أوردر جديد #${order.order_number}` });
      await expect(offer).toBeVisible({ timeout: 20_000 });
      const [log] = await notificationsFor(order.id);
      expect(log).toMatchObject({ event: "offer_created", recipient: driverId });
      // Queued for send-driver-push (or already answered by it); never silently dropped.
      expect(["queued", "sent", "partial", "failed", "no_subscription"]).toContain(log.status);

      await offer.getByRole("button", { name: "رفض" }).click();
      await expect(offer).toBeHidden();
    } finally {
      await ctx.close();
    }
  });

  test("manual assignment notifies that driver at once, and again when the order reaches preparing", async ({
    page,
    browser,
    catalog,
  }) => {
    const { driver: driverId } = await ensureAccounts();
    const order = await confirmedOrder(catalog);
    const ctx = await driverContext(browser);
    try {
      const driver = await ctx.newPage();
      await login(driver, "driver", "/driver");

      await login(page, "admin", `/admin/orders/${order.id}`);
      await page.getByRole("combobox").filter({ hasText: "بدون مندوب" }).click();
      await page.getByRole("option", { name: /مندوب اختبار/ }).click();
      await expect.poll(async () => (await getOrder(order.id)).driver_id).toBe(driverId);
      await expect
        .poll(async () => (await notificationsFor(order.id)).map((l) => [l.event, l.recipient]))
        .toEqual([["order_assigned", driverId]]);

      // The driver sees it without reloading.
      // Assigned but not accepted yet: listed under "new".
      await driver.getByRole("tab", { name: /جديدة/ }).click();
      await expect(
        driver.locator("article").filter({ hasText: `#${order.order_number}` }),
      ).toBeVisible({ timeout: 20_000 });

      await page.getByRole("button", { name: "جاري التجهيز" }).click();
      await expect
        .poll(async () => (await notificationsFor(order.id)).map((l) => [l.event, l.recipient]))
        .toEqual([
          ["order_assigned", driverId],
          ["order_status", driverId],
        ]);
      // A pre-assigned order is never offered to anyone else.
      const offers = await service()
        .from("order_dispatch_offers")
        .select("id")
        .eq("order_id", order.id);
      expect(offers.data).toEqual([]);
    } finally {
      await ctx.close();
    }
  });

  test("no available driver: the order still moves to preparing and the log says why", async ({
    page,
    catalog,
  }) => {
    const { driver: driverId } = await ensureAccounts();
    const order = await confirmedOrder(catalog);
    const db = service();
    await db.from("driver_profiles").update({ status: "offline" }).eq("user_id", driverId);
    try {
      await login(page, "admin", `/admin/orders/${order.id}`);
      await page.getByRole("button", { name: "جاري التجهيز" }).click();
      await expect.poll(async () => (await getOrder(order.id)).status).toBe("preparing");
      await expect
        .poll(async () => await notificationsFor(order.id))
        .toEqual([
          {
            event: "offer_created",
            recipient: null,
            status: "skipped",
            error: "no_driver_available",
          },
        ]);
    } finally {
      // Cancel the waiting order first: a driver who becomes available is offered waiting orders.
      await advanceOrder(order.id, "cancelled");
      await db.from("driver_profiles").update({ status: "available" }).eq("user_id", driverId);
    }
  });
});
