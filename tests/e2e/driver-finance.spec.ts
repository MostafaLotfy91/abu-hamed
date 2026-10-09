import { test, expect } from "./fixtures/test";
import { E2E_READY, SKIP_REASON } from "./fixtures/env";
import { login, newGuardedContext, toast } from "./fixtures/helpers";
import {
  advanceOrder,
  assignDriver,
  codCollection,
  driverBalance,
  ensureAccounts,
  ensureSecondDriverWithEntry,
  ledgerFor,
  placeOrderAs,
  readSettings,
  reserveDispatchForTestDriver,
  service,
  settleDriverToZero,
  signedIn,
  updateSettings,
  type Catalog,
  type SettingsRow,
} from "./fixtures/seed";

test.skip(!E2E_READY, SKIP_REASON);

/*
 * Driver cash and earnings end to end: the driver delivers in the driver app, the ledger records cash and
 * commission, the admin receives the settlement on "Drivers cash". Commission is a fixed 20 per delivery here.
 * The ledger is append-only (earlier runs leave entries), so each test starts by settling the driver to zero.
 */
const COMMISSION = 20;

/** Amounts as the Arabic UI prints them (ar-EG digits, no decimals for whole numbers). */
const arNum = (n: number) =>
  new Intl.NumberFormat("ar-EG", {
    minimumFractionDigits: n % 1 === 0 ? 0 : 2,
    maximumFractionDigits: 2,
  }).format(n);

async function outForDelivery(cat: Catalog, payment: "cod" | "online" = "cod") {
  const { driver } = await ensureAccounts();
  const o = await placeOrderAs(
    [{ product_id: cat.productId, variant_id: cat.variants.L, quantity: 1 }],
    { payment },
  );
  await advanceOrder(o.id, "confirmed");
  await assignDriver(o.id, driver, true);
  await advanceOrder(o.id, "out_for_delivery");
  const { data } = await service().from("orders").select("total").eq("id", o.id).single();
  return { ...o, total: Number(data!.total) };
}

test.describe("driver cash and earnings", () => {
  test.use({ lang: "ar" });
  test.describe.configure({ mode: "serial" });

  let restore: (() => Promise<void>) | null = null;
  let before: SettingsRow;
  test.beforeAll(async () => {
    restore = await reserveDispatchForTestDriver();
    before = await readSettings();
    await updateSettings({
      driver_commission_type: "fixed",
      driver_commission_value: COMMISSION,
      driver_keeps_commission_from_cash: true,
      driver_cash_limit: 0,
      staff_can_record_settlements: false,
      features: { ...before.features, delivery_tracking: true, online_payment: true },
    });
  });
  test.beforeEach(async () => {
    const { driver } = await ensureAccounts();
    await settleDriverToZero(driver);
  });
  test.afterAll(async () => {
    const { driver } = await ensureAccounts();
    await settleDriverToZero(driver);
    await updateSettings({
      driver_commission_type: before.driver_commission_type,
      driver_commission_value: before.driver_commission_value,
      driver_keeps_commission_from_cash: before.driver_keeps_commission_from_cash,
      driver_cash_limit: before.driver_cash_limit,
      staff_can_record_settlements: before.staff_can_record_settlements,
      features: before.features,
    });
    await restore?.();
  });

  const card = (page: import("@playwright/test").Page, n: number) =>
    page.locator("article").filter({ hasText: `#${n}` });

  test("COD: driver delivers, ledger has cash and commission, admin receives the settlement, balance is zero", async ({
    page,
    browser,
    catalog,
  }) => {
    const { driver } = await ensureAccounts();
    await updateSettings({ driver_cash_limit: 1 }); // any COD order goes over the limit
    const order = await outForDelivery(catalog);
    const owed = order.total - COMMISSION;
    // Cash held includes commission the driver kept on earlier runs (owed is reset to 0, cash held is not).
    const heldBefore = (await driverBalance(driver)).cashHeld;

    await login(page, "driver", "/driver");
    await page.getByRole("tab", { name: /نشطة/ }).click();
    await expect(card(page, order.order_number)).toContainText("المطلوب تحصيله");
    await card(page, order.order_number).getByRole("button", { name: "تم التسليم" }).click();
    const dialog = page.getByRole("dialog");
    await expect(dialog.getByTestId("expected-amount")).toContainText(arNum(order.total));
    await dialog.getByRole("button", { name: "تأكيد التسليم" }).click();
    await expect(toast(page, "تم التسليم")).toBeVisible();

    await expect
      .poll(() => ledgerFor(order.id))
      .toEqual([
        { type: "cod_collected", amount: order.total, affects_cash: true },
        { type: "commission_earned", amount: -COMMISSION, affects_cash: true },
      ]);
    expect(await codCollection(order.id)).toMatchObject({ review_status: "ok" });
    const overLimit = page.getByRole("alert").filter({ hasText: "الكاش معاك عدّى الحد" });
    await expect(overLimit).toBeVisible();

    await page.getByRole("tab", { name: "حسابي" }).click();
    const account = page.getByTestId("driver-account");
    await expect(account.getByTestId("cash-held")).toContainText(arNum(heldBefore + order.total));
    await expect(account.getByTestId("owed-to-store")).toContainText(arNum(owed));
    await expect(account).toContainText(`#${order.order_number}`);

    // Admin, in a second browser.
    const adminCtx = await newGuardedContext(browser, "ar");
    try {
      const admin = await adminCtx.newPage();
      await login(admin, "admin", "/admin/cash");
      const row = admin.getByTestId(`cash-row-${driver}`);
      await expect(row).toContainText(arNum(owed));
      await expect(row).toContainText("فوق الحد");
      await row.getByRole("button", { name: "استلام تسوية" }).click();
      const s = admin.getByRole("dialog");
      await expect(s.getByTestId("settlement-expected")).toContainText(arNum(owed));
      await s.getByRole("button", { name: "متابعة" }).click();
      await expect(s.getByRole("status")).toContainText("التسوية مش بتتعدل بعد الحفظ");
      await s.getByRole("button", { name: "تأكيد الحفظ" }).click();
      const receipt = s.getByTestId("settlement-receipt");
      await expect(receipt).toContainText("إيصال استلام نقدية من مندوب");
      await expect(receipt).toContainText(arNum(owed));
      await expect(s.getByRole("button", { name: "طباعة" })).toBeVisible();
    } finally {
      await adminCtx.close();
    }

    await expect.poll(async () => (await driverBalance(driver)).owed).toBe(0);
    await page.reload();
    await expect(overLimit).toBeHidden();
    await page.getByRole("tab", { name: "حسابي" }).click();
    await expect(page.getByTestId("owed-to-store")).toContainText(arNum(0));
    await expect(page.getByTestId("driver-account")).toContainText("التسويات");
  });

  test("amount mismatch: a reason is required, the order is flagged, the admin resolves it", async ({
    page,
    browser,
    catalog,
  }) => {
    const { driver } = await ensureAccounts();
    const order = await outForDelivery(catalog);
    await login(page, "driver", "/driver");
    await page.getByRole("tab", { name: /نشطة/ }).click();
    await card(page, order.order_number).getByRole("button", { name: "تم التسليم" }).click();
    const dialog = page.getByRole("dialog");
    await dialog.getByLabel("المبلغ اللي اتحصّل").fill(String(order.total - 10));
    await expect(dialog.getByRole("alert")).toContainText("الطلب هيتراجع من الإدارة");
    const confirm = dialog.getByRole("button", { name: "تأكيد التسليم" });
    await expect(confirm).toBeDisabled();
    await dialog.getByLabel("السبب").fill("العميل دفع أقل بعشرة");
    await confirm.click();
    await expect(toast(page, "اتسلّم، والفرق في المبلغ اتبعت للإدارة")).toBeVisible();
    await expect
      .poll(() => codCollection(order.id))
      .toMatchObject({ review_status: "pending_review", reason: "العميل دفع أقل بعشرة" });
    expect(Number((await codCollection(order.id))!.collected_amount)).toBe(order.total - 10);
    // The ledger keeps the expected amount until the admin decides.
    expect((await ledgerFor(order.id))[0]).toEqual({
      type: "cod_collected",
      amount: order.total,
      affects_cash: true,
    });

    const adminCtx = await newGuardedContext(browser, "ar");
    try {
      const admin = await adminCtx.newPage();
      await login(admin, "admin", "/admin/cash");
      const reviews = admin.getByRole("region", { name: "طلبات فيها فرق في المبلغ" });
      const item = reviews.getByRole("listitem").filter({ hasText: `#${order.order_number}` });
      await item.getByRole("button", { name: "مراجعة" }).click();
      const r = admin.getByRole("dialog");
      await r.getByLabel("ملاحظة (مطلوبة)").fill("خصم متفق عليه مع العميل");
      await r.getByRole("button", { name: "قفل المراجعة" }).click();
      await expect(toast(admin, "اتقفلت المراجعة")).toBeVisible();
    } finally {
      await adminCtx.close();
    }
    await expect.poll(async () => (await codCollection(order.id))!.review_status).toBe("resolved");
    expect((await ledgerFor(order.id)).map((e) => [e.type, e.amount])).toContainEqual([
      "adjustment",
      -10,
    ]);
    expect((await driverBalance(driver)).owed).toBe(order.total - COMMISSION - 10);
  });

  test("paid-online order: 'do not collect', no cash, commission still earned", async ({
    page,
    catalog,
  }) => {
    const { driver } = await ensureAccounts();
    const order = await outForDelivery(catalog, "online");
    await login(page, "driver", "/driver");
    await page.getByRole("tab", { name: /نشطة/ }).click();
    const c = card(page, order.order_number);
    await expect(c).toContainText("مدفوع — لا تحصّل أي مبلغ");
    await expect(c).not.toContainText("المطلوب تحصيله");
    await c.getByRole("button", { name: "تم التسليم" }).click();
    const dialog = page.getByRole("dialog");
    await expect(dialog).toContainText("مدفوع — لا تحصّل أي مبلغ");
    await expect(dialog.getByLabel("المبلغ اللي اتحصّل")).toHaveCount(0);
    await dialog.getByRole("button", { name: "تأكيد التسليم" }).click();
    await expect
      .poll(() => ledgerFor(order.id))
      .toEqual([
        { type: "cod_collected", amount: 0, affects_cash: true },
        { type: "commission_earned", amount: -COMMISSION, affects_cash: true },
      ]);
    expect(await codCollection(order.id)).toBeNull();
    // The store owes the driver the commission.
    expect((await driverBalance(driver)).owed).toBe(-COMMISSION);
    await page.getByRole("tab", { name: "حسابي" }).click();
    await expect(page.getByTestId("driver-account")).toContainText("المحل عليه لك");
  });

  test("cancelled order: nothing in the ledger", async ({ catalog }) => {
    const { driver } = await ensureAccounts();
    const order = await outForDelivery(catalog);
    await advanceOrder(order.id, "cancelled");
    expect(await ledgerFor(order.id)).toEqual([]);
    expect((await driverBalance(driver)).owed).toBe(0);
  });

  test("a driver sees only their own money; the admin pages are closed to drivers", async ({
    page,
  }) => {
    const { driver } = await ensureAccounts();
    const other = await ensureSecondDriverWithEntry();
    const c = await signedIn("driver");
    try {
      const ledger = await c.from("driver_ledger").select("driver_id");
      expect(ledger.error).toBeNull();
      expect(new Set((ledger.data ?? []).map((r) => r.driver_id))).toEqual(new Set([driver]));
      const balances = await c.from("driver_balance").select("driver_id");
      expect((balances.data ?? []).map((r) => r.driver_id)).toEqual([driver]);
      const otherEntries = await c.rpc("driver_ledger_entries", { _driver_id: other });
      expect(otherEntries.data).toEqual([]);
      const cash = await c.rpc("admin_driver_cash", {});
      expect(cash.data).toEqual([]);
      const settle = await c.rpc("admin_record_settlement", {
        _driver_id: driver,
        _received_amount: 1,
        _note: "self",
      });
      expect(settle.error?.message).toMatch(/forbidden/);
      const write = await c
        .from("driver_ledger")
        .insert({ driver_id: driver, type: "adjustment", amount: -100, note: "free money" });
      expect(write.error).not.toBeNull();
    } finally {
      await c.auth.signOut();
    }
    // The admin sees both drivers.
    const admin = await signedIn("admin");
    try {
      const rows = (await admin.rpc("admin_driver_cash", {})).data as { driver_id: string }[];
      expect(rows.map((r) => r.driver_id)).toEqual(expect.arrayContaining([driver, other]));
    } finally {
      await admin.auth.signOut();
    }
    await login(page, "driver", "/driver");
    await page.goto("/admin/cash");
    await expect(page.getByText("غير مصرح لك بالدخول")).toBeVisible();
  });
});
