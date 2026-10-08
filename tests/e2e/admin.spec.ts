import type { Page } from "@playwright/test";
import { test, expect } from "./fixtures/test";
import { ACCOUNTS, E2E_READY, SKIP_REASON } from "./fixtures/env";
import { T, login, parseWa, pngFile, toast, xlsxFile } from "./fixtures/helpers";

/** Confirms the in-app AlertDialog used for destructive admin actions. */
const confirmDialog = (page: Page, label: string) => page.getByRole("alertdialog").getByRole("button", { name: label }).click();
import {
  WA, createPendingOrder, findBanner, findCoupon, findProductBySku, getOrder, lastImportJob, readSettings, updateSettings, variantsOf,
} from "./fixtures/seed";

test.skip(!E2E_READY, SKIP_REASON);

/** CrudPage table row containing text; its icon buttons are named "تعديل / Edit" and "حذف / Delete". */
const row = (page: Page, text: string) => page.locator("tbody tr").filter({ hasText: text });
const rowButton = (page: Page, text: string, name: "تعديل / Edit" | "حذف / Delete") => row(page, text).getByRole("button", { name });

test.describe("admin", () => {
  test.use({ lang: "ar" });

  test("admin signs in and sees the dashboard navigation", async ({ page }) => {
    await login(page, "admin", "/admin");
    for (const label of ["الإحصائيات", "الطلبات", "الاسترجاع", "المندوبين", "المنتجات", "استيراد Excel", "الأقسام", "البانرات", "الكوبونات", "إعدادات المتجر"]) {
      await expect(page.getByRole("link", { name: label, exact: true })).toBeVisible();
    }
  });

  test("product CRUD with image upload and size/colour variants", async ({ page, catalog }) => {
    const name = `منتج أدمن ${catalog.tag}`;
    const sku = `E2E-${catalog.tag}-ADM`;
    await login(page, "admin", "/admin/products");
    await expect(page.getByRole("heading", { name: "المنتجات / Products" })).toBeVisible();

    // Create
    await page.getByRole("button", { name: "Add / إضافة" }).click();
    const dialog = page.getByRole("dialog");
    await dialog.getByLabel("الاسم (عربي) *", { exact: true }).fill(name);
    await dialog.getByLabel("Name (EN) *", { exact: true }).fill(`E2E Admin ${catalog.tag}`);
    await dialog.getByLabel("Category / القسم", { exact: true }).selectOption({ label: catalog.category.ar });
    await dialog.getByLabel("SKU", { exact: true }).fill(sku);
    await dialog.getByLabel("Price / السعر *", { exact: true }).fill("250");
    // Image upload: generated PNG -> compressed to WebP in the browser -> store-media bucket.
    await dialog.locator('input[type="file"]').first().setInputFiles(pngFile());
    await expect(dialog.locator('img[src*="store-media"]')).toHaveCount(1, { timeout: 30_000 });
    await dialog.getByRole("button", { name: "Save / حفظ" }).click();
    await expect(toast(page, "✓")).toBeVisible();
    await expect(dialog).toBeHidden();

    const created = await findProductBySku(sku);
    expect(created).not.toBeNull();
    expect(Number(created!.price)).toBe(250);
    expect(created!.images).toHaveLength(1);
    expect(created!.images[0]).toContain("store-media");

    // Read + update
    await page.getByPlaceholder("Search / بحث").fill(sku);
    await expect(row(page, name)).toHaveCount(1);
    await rowButton(page, name, "تعديل / Edit").click();
    await dialog.getByLabel("Price / السعر *", { exact: true }).fill("275");
    await dialog.getByRole("button", { name: "Save / حفظ" }).click();
    await expect(dialog).toBeHidden();
    await expect.poll(async () => Number((await findProductBySku(sku))?.price)).toBe(275);

    // Variants (VariantEditor): S + M in Black, 7 each, then S stock -> 0.
    await row(page, name).getByRole("button", { name: "Sizes & colors / المقاسات والألوان" }).click();
    const variants = page.getByRole("dialog", { name: `${name} — المقاسات والألوان` });
    await variants.getByRole("button", { name: "S", exact: true }).click();
    await variants.getByRole("button", { name: "M", exact: true }).click();
    await variants.getByRole("button", { name: "أسود / Black" }).click();
    await variants.getByLabel("Stock / المخزون لكل اختيار", { exact: true }).fill("7");
    await variants.getByRole("button", { name: "Generate / توليد" }).click();
    await expect(toast(page, "+2")).toBeVisible();
    await expect(variants.locator("tbody tr")).toHaveCount(2);
    const sStock = variants.getByRole("spinbutton", { name: "المخزون / Stock S / Black", exact: true });
    await sStock.fill("0");
    await sStock.press("Tab");
    await expect
      .poll(async () => (await variantsOf(created!.id)).map((v) => `${v.size}:${v.color_en}:${v.stock}`).sort().join(","))
      .toBe("M:Black:7,S:Black:0");
    await page.keyboard.press("Escape");

    // Storefront reflects the variants: S disabled, M available.
    await page.goto(`/product/${created!.id}`);
    await expect(page.getByRole("heading", { level: 1, name })).toBeVisible();
    await expect(page.getByRole("button", { name: "S", exact: true })).toBeDisabled();
    await expect(page.getByRole("button", { name: "M", exact: true })).toBeEnabled();

    // Delete
    await page.goto("/admin/products");
    await page.getByPlaceholder("Search / بحث").fill(sku);
    await rowButton(page, name, "حذف / Delete").click();
    await confirmDialog(page, "حذف / Delete");
    await expect(row(page, name)).toHaveCount(0);
    await expect.poll(() => findProductBySku(sku)).toBeNull();
  });

  test("Excel import: valid file imports, then undo hides it", async ({ page, catalog }) => {
    const code = `E2EIMP${catalog.tag}`;
    const file = `e2e-import-${catalog.tag}.xlsx`;
    const base = { product_code: code, category: catalog.category.ar, price: 300, color_ar: "أسود", is_active: 1 };
    await login(page, "admin", "/admin/import");
    await expect(page.getByRole("heading", { name: "استيراد المنتجات من Excel" })).toBeVisible();
    await page.locator('input[type="file"][accept=".xlsx,.xls,.csv"]').setInputFiles(
      xlsxFile(file, [
        { ...base, name_ar: `مستورد ${catalog.tag}`, name_en: `E2E Imported ${catalog.tag}`, gender: "men", season: "summer", size: "M", sku: `${code}-M`, stock: 4 },
        { ...base, size: "L", sku: `${code}-L`, stock: 2 },
      ]),
    );
    await expect(page.getByRole("heading", { name: "2. مراجعة البيانات" })).toBeVisible();
    await expect(page.getByText("منتجات جديدة", { exact: true }).locator("..")).toContainText("1");
    await expect(page.getByText("مقاسات/ألوان جديدة", { exact: true }).locator("..")).toContainText("2");
    await expect(page.getByText("صفوف بها أخطاء", { exact: true }).locator("..")).toContainText("0");
    await page.getByRole("button", { name: /3\. تأكيد الاستيراد \(2 صف/ }).click();
    await expect(toast(page, "تم استيراد 2 صف")).toBeVisible({ timeout: 30_000 });

    const imported = await findProductBySku(code);
    expect(imported).toMatchObject({ is_active: true });
    expect((await variantsOf(imported!.id)).map((v) => v.size).sort()).toEqual(["L", "M"]);

    // Undo the last import from the history tab.
    await page.getByRole("tab", { name: "السجل" }).click();
    await expect(page.getByRole("row").filter({ hasText: file })).toContainText("مكتمل");
    await page.getByRole("button", { name: new RegExp(`التراجع عن آخر استيراد \\(${file.replace(/\./g, "\\.")}\\)`) }).click();
    await confirmDialog(page, "تراجع / Undo");
    await expect(toast(page, /تم إخفاء \d+ منتج/)).toBeVisible();
    await expect.poll(async () => (await findProductBySku(code))?.is_active).toBe(false);
    await expect.poll(async () => (await lastImportJob(file))?.status).toBe("undone");
  });

  test("Excel import: rows with errors are reported and skipped", async ({ page, catalog }) => {
    const tag = catalog.tag;
    const file = `e2e-errors-${tag}.xlsx`;
    await login(page, "admin", "/admin/import");
    await page.locator('input[type="file"][accept=".xlsx,.xls,.csv"]').setInputFiles(
      xlsxFile(file, [
        { product_code: `E2EOK${tag}`, name_ar: `سليم ${tag}`, name_en: `E2E OK ${tag}`, category: catalog.category.ar, price: 120, stock: 3 },
        { product_code: `E2EBAD1${tag}`, name_ar: "سعر خطأ", category: catalog.category.ar, price: "abc" },
        { product_code: "", name_ar: "بدون كود", price: 10 },
        { product_code: `E2EBAD3${tag}`, name_ar: "قسم خطأ", category: "قسم غير موجود", price: 10 },
        { product_code: `E2EBAD4${tag}`, name_ar: "مقاس خطأ", category: catalog.category.ar, size: "XXXXL", price: 10 },
      ]),
    );
    await expect(page.getByText("صفوف بها أخطاء", { exact: true }).locator("..")).toContainText("4");
    for (const msg of ["السعر ليس رقماً", "كود المنتج مفقود", "القسم غير موجود: قسم غير موجود", "المقاس XXXXL غير مسموح لهذا القسم"]) {
      await expect(page.getByRole("cell", { name: new RegExp(msg) })).toBeVisible();
    }
    await page.getByRole("button", { name: "خطأ", exact: true }).click();
    await expect(page.locator("table tbody tr")).toHaveCount(4);

    await page.getByRole("button", { name: /3\. تأكيد الاستيراد \(1 صف — سيتم تخطي الأخطاء\)/ }).click();
    await expect(toast(page, "تم استيراد 1 صف")).toBeVisible({ timeout: 30_000 });
    expect(await findProductBySku(`E2EOK${tag}`)).not.toBeNull();
    expect(await findProductBySku(`E2EBAD1${tag}`)).toBeNull();
    expect(await findProductBySku(`E2EBAD3${tag}`)).toBeNull();
  });

  test("order status updates follow the allowed flow", async ({ page, catalog }) => {
    const order = await createPendingOrder(catalog);
    await login(page, "admin", "/admin/orders");
    await page.getByRole("link", { name: `#${order.order_number}` }).click();
    await expect(page).toHaveURL(new RegExp(`/admin/orders/${order.id}$`));
    await expect(page.getByText(`طلب #${order.order_number}`)).toBeVisible();

    const statusBtn = (label: string) => page.getByRole("button", { name: label, exact: true });
    await statusBtn(T.ar.timeline.confirmed).click();
    await expect.poll(async () => (await getOrder(order.id)).status).toBe("confirmed");
    await expect(statusBtn(T.ar.timeline.confirmed)).toBeDisabled();

    await statusBtn(T.ar.timeline.preparing).click();
    await expect.poll(async () => (await getOrder(order.id)).status).toBe("preparing");

    // Only moves the order flow allows are offered: from "preparing" there is no "delivered" button
    // (the orders_guard trigger would reject it anyway).
    await expect(statusBtn(T.ar.timeline.delivered)).toHaveCount(0);
    await expect(statusBtn(T.ar.timeline.pending)).toHaveCount(0);
    expect((await getOrder(order.id)).status).toBe("preparing");

    await statusBtn(T.ar.timeline.out_for_delivery).click();
    await expect.poll(async () => (await getOrder(order.id)).status).toBe("out_for_delivery");
    const history = (await getOrder(order.id)).order_status_history.map((h) => h.status);
    expect(history).toEqual(expect.arrayContaining(["pending", "confirmed", "preparing", "out_for_delivery"]));
  });

  test("coupons: create and delete", async ({ page, catalog }) => {
    const code = `E2EC${catalog.tag}`;
    await login(page, "admin", "/admin/coupons");
    await page.getByRole("button", { name: "Add / إضافة" }).click();
    const dialog = page.getByRole("dialog");
    await dialog.getByLabel("Code *", { exact: true }).fill(code);
    await expect(dialog.getByLabel("Type *", { exact: true })).toHaveValue("percent");
    await dialog.getByLabel("Value *", { exact: true }).fill("15");
    await dialog.getByRole("button", { name: "Save / حفظ" }).click();
    await expect(dialog).toBeHidden();
    await expect(row(page, code)).toHaveCount(1);
    expect(await findCoupon(code)).toMatchObject({ code, discount_type: "percent" });

    await rowButton(page, code, "حذف / Delete").click();
    await confirmDialog(page, "حذف / Delete");
    await expect(row(page, code)).toHaveCount(0);
    await expect.poll(() => findCoupon(code)).toBeNull();
  });

  test("banners: javascript: link is rejected, safe link is saved and shown on the storefront", async ({ page, catalog }) => {
    const titleAr = `بانر ${catalog.tag}`;
    const titleEn = `E2E Banner ${catalog.tag}`;
    await login(page, "admin", "/admin/banners");
    await page.getByRole("button", { name: "Add / إضافة" }).click();
    const dialog = page.getByRole("dialog");
    await dialog.locator('input[type="file"]').setInputFiles(pngFile("banner.png"));
    await expect(dialog.locator('img[src*="store-media"]')).toHaveCount(1, { timeout: 30_000 });
    await dialog.getByLabel("العنوان", { exact: true }).fill(titleAr);
    await dialog.getByLabel("Title (EN)", { exact: true }).fill(titleEn);
    const link = dialog.getByLabel("Link (e.g. /products)", { exact: true });

    await link.fill("javascript:alert(1)");
    await dialog.getByRole("button", { name: "Save / حفظ" }).click();
    await expect(toast(page, /banners_link_safe_chk|check constraint/)).toBeVisible();
    await expect(dialog).toBeVisible();
    expect(await findBanner(titleEn)).toBeNull();

    await link.fill("/products");
    await dialog.getByRole("button", { name: "Save / حفظ" }).click();
    await expect(dialog).toBeHidden();
    await expect.poll(async () => (await findBanner(titleEn))?.link).toBe("/products");

    await page.goto("/");
    await expect(page.locator('a[href="/products"]').filter({ has: page.getByRole("img", { name: titleAr }) })).toHaveCount(1);
    await expect(page.locator('a[href^="javascript:"]')).toHaveCount(0);
  });

  test("settings: store name and primary colour are applied on the storefront", async ({ page, catalog }) => {
    const original = await readSettings();
    const newName = `متجر اختبار ${catalog.tag}`;
    try {
      await login(page, "admin", "/admin/settings");
      await expect(page.getByRole("heading", { name: "إعدادات المتجر / Store settings" })).toBeVisible();
      await page.getByLabel("اسم المتجر", { exact: true }).fill(newName);
      await page.getByLabel("Primary", { exact: true }).fill("#123456");
      await page.getByRole("button", { name: "Save / حفظ" }).click();
      await expect(toast(page, "✓")).toBeVisible();

      await page.goto("/");
      await expect(page.locator("footer")).toContainText(newName);
      await expect.poll(() => page.evaluate(() => document.documentElement.style.getPropertyValue("--primary").trim())).toBe("#123456");
    } finally {
      await updateSettings({ name_ar: original.name_ar, primary_color: original.primary_color });
    }
  });

  test("settings: WhatsApp number validation and social links", async ({ page, catalog }) => {
    const url = `https://social.example.com/e2e-${catalog.tag}`;
    try {
      await login(page, "admin", "/admin/settings");
      const wa = page.getByLabel("رقم واتساب / WhatsApp number", { exact: true });
      await wa.fill("123");
      await expect(page.getByText("رقم مصري غير صحيح / Invalid Egyptian number")).toBeVisible();
      await wa.fill("01098765432");
      await expect(page.getByText("→ 201098765432")).toBeVisible();
      await page.getByRole("button", { name: "Save / حفظ" }).click();
      await expect(toast(page, "✓")).toBeVisible();
      await expect.poll(async () => (await readSettings()).whatsapp_number).toBe("201098765432");

      // Social links are saved per row.
      await page.getByRole("button", { name: "إضافة / Add" }).click();
      const social = page.locator('div[draggable="true"]').last();
      const input = social.getByRole("textbox", { name: /^الرابط \/ Link/ });
      await input.fill("javascript:alert(1)");
      await input.press("Enter");
      await expect(toast(page, "رابط غير صحيح / Invalid URL")).toBeVisible();
      await input.fill(url);
      await input.press("Enter");
      await expect(social.getByRole("switch", { name: /^إظهار \/ Visible/ })).toBeChecked();

      await page.goto("/");
      await expect(page.locator(`footer a[href="${url}"]`)).toBeVisible();
      expect(parseWa(await page.getByRole("link", { name: T.ar.waFloat }).getAttribute("href")).number).toBe("201098765432");
    } finally {
      await updateSettings({ whatsapp_number: WA.number });
    }
  });

  test("drivers: admin adds a driver by email", async ({ page }) => {
    await login(page, "admin", "/admin/drivers");
    const email = page.getByPlaceholder("بريد حساب المندوب");
    await email.fill(`nobody-${Date.now()}@example.invalid`);
    await page.getByRole("button", { name: "إضافة", exact: true }).click();
    await expect(toast(page, "لا يوجد حساب بهذا البريد")).toBeVisible();
    await email.fill(ACCOUNTS.driver.email);
    await page.getByRole("button", { name: "إضافة", exact: true }).click();
    await expect(toast(page, "تمت إضافة المندوب")).toBeVisible();
    await expect(page.getByText(ACCOUNTS.driver.email).first()).toBeVisible();
  });

  test.fixme("branches CRUD", () => {
    // Feature not present: the `branches` table exists (initial migration) and CrudPage accepts table="branches",
    // but there is no /admin/branches route or admin navigation entry, so there is no UI to test.
  });
});
