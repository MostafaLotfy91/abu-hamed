import { deflateSync } from "node:zlib";
import type { Browser, BrowserContextOptions, Locator, Page } from "@playwright/test";
import * as XLSX from "xlsx";
import { COLUMNS, type Column } from "../../../src/lib/product-import";
import { ACCOUNTS, BASE_URL, type Role } from "./env";
import {
  expect,
  installGuards,
  setInitialLang,
  waitForHydrationOnNavigation,
  type Lang,
} from "./test";

/**
 * UI strings used by the specs, copied from src/lib/i18n.tsx (dict) and the components that inline
 * `lang === "ar" ? … : …`. Keep in sync when copy changes.
 */
export const T = {
  ar: {
    signIn: "تسجيل الدخول",
    shopByDept: "تسوق حسب القسم",
    allProducts: "كل المنتجات",
    searchPlaceholder: "ابحث عن منتج...",
    resultsFor: "نتائج البحث عن",
    noProducts: "لا توجد منتجات",
    clearAll: "مسح الكل",
    filters: "تصفية",
    min: "من",
    max: "إلى",
    size: "المقاس",
    color: "اللون",
    inStock: "متوفر",
    addToCart: "أضف للسلة",
    addedToCart: "تمت الإضافة للسلة",
    wishlist: "المفضلة",
    cart: "السلة",
    checkout: "إتمام الطلب",
    coupon: "كود الخصم",
    apply: "تطبيق",
    discount: "الخصم",
    cod: "الدفع عند الاستلام",
    online: "الدفع أونلاين",
    comingSoon: "قريباً",
    placeOrder: "تأكيد الطلب",
    orderPlaced: "تم استلام طلبك!",
    order: "طلب",
    timeline: {
      pending: "قيد الانتظار",
      confirmed: "تم التأكيد",
      preparing: "جاري التجهيز",
      out_for_delivery: "في الطريق",
      delivered: "تم التوصيل",
      cancelled: "ملغي",
    },
    returnExchange: "استرجاع / استبدال",
    requestReturn: "طلب استرجاع أو استبدال",
    return: "استرجاع",
    exchange: "استبدال",
    reason: "السبب *",
    exchangePref: "المقاس/اللون المطلوب بدلاً منه",
    items: "منتجات",
    wholeOrder: "الطلب كله",
    submit: "إرسال",
    saved: "تم الحفظ",
    rrRequested: "تم الطلب",
    waFloat: "تواصل عبر واتساب",
    waOrder: "تواصل معنا على واتساب",
    stylist: "الستايلست",
    stylistSub: "بيرشح من منتجات المتجر بس",
    stylistInput: "اكتب طلبك…",
    send: "إرسال",
    viewProduct: "عرض المنتج",
    stylistAdded: "اتضاف للسلة",
    noAccess: "غير مصرح لك بالدخول",
    driversOnly: "هذا التطبيق للمندوبين فقط",
    driverNew: "جديدة",
    driverActive: "نشطة",
    driverDone: "مكتملة",
    accept: "قبول الطلب",
    start: "بدء التوصيل",
    delivered: "تم التسليم",
    liveTracking: "تتبع المندوب مباشرة",
    waitingLocation: "في انتظار موقع المندوب…",
    language: "English",
  },
  en: {
    signIn: "Sign in",
    shopByDept: "Shop by department",
    allProducts: "All products",
    searchPlaceholder: "Search products...",
    resultsFor: "Results for",
    noProducts: "No products found",
    clearAll: "Clear all",
    filters: "Filters",
    min: "Min",
    max: "Max",
    size: "Size",
    color: "Color",
    inStock: "In stock",
    addToCart: "Add to cart",
    addedToCart: "Added to cart",
    wishlist: "Wishlist",
    cart: "Cart",
    checkout: "Checkout",
    coupon: "Coupon code",
    apply: "Apply",
    discount: "Discount",
    cod: "Cash on delivery",
    online: "Pay online",
    comingSoon: "Coming soon",
    placeOrder: "Place order",
    orderPlaced: "Order placed!",
    order: "Order",
    timeline: {
      pending: "Pending",
      confirmed: "Confirmed",
      preparing: "Preparing",
      out_for_delivery: "Out for delivery",
      delivered: "Delivered",
      cancelled: "Cancelled",
    },
    returnExchange: "Return / exchange",
    requestReturn: "Request return or exchange",
    return: "Return",
    exchange: "Exchange",
    reason: "Reason *",
    exchangePref: "Wanted size/color instead",
    items: "items",
    wholeOrder: "Whole order",
    submit: "Submit",
    saved: "Saved",
    rrRequested: "Requested",
    waFloat: "Chat on WhatsApp",
    waOrder: "Contact us on WhatsApp",
    stylist: "Stylist",
    stylistSub: "Recommends store products only",
    stylistInput: "Type your request…",
    send: "Send",
    viewProduct: "View product",
    stylistAdded: "Added to cart",
    noAccess: "You don't have access",
    driversOnly: "Drivers only",
    driverNew: "New",
    driverActive: "Active",
    driverDone: "Completed",
    accept: "Accept order",
    start: "Start delivery",
    delivered: "Mark delivered",
    liveTracking: "Live driver tracking",
    waitingLocation: "Waiting for the driver's location…",
    language: "العربية",
  },
} as const;

/** Signs in through the real /auth email+password form, then waits to land on `dest`. */
export async function login(page: Page, role: Role, dest = "/") {
  const { email, password } = ACCOUNTS[role];
  await page.goto(`/auth?redirect=${encodeURIComponent(dest)}`);
  const form = page.locator("form").filter({ has: page.locator('input[type="password"]') });
  await form.locator('input[type="email"]').fill(email);
  await form.locator('input[type="password"]').fill(password);
  await form.locator('button[type="submit"]').click();
  await expect(page).not.toHaveURL(/\/auth(\?|$)/, { timeout: 20_000 });
  if (dest !== "/") await expect(page).toHaveURL(new RegExp(escapeRe(dest)));
}

/** A second, independently guarded browser context (e.g. driver + customer at the same time). */
export async function newGuardedContext(
  browser: Browser,
  lang: Lang,
  opts: BrowserContextOptions = {},
) {
  const context = await browser.newContext({ baseURL: BASE_URL, ...opts });
  await installGuards(context);
  await context.addInitScript(setInitialLang, lang);
  context.on("page", waitForHydrationOnNavigation);
  return context;
}

/**
 * Admin forms render <Label> next to the control without htmlFor, so getByLabel cannot work.
 * This returns the control that immediately follows the label with the given (whitespace-normalized) text.
 */
export function fieldAfterLabel(scope: Page | Locator, label: string) {
  const lit = xpathLiteral(label);
  return scope.locator(`xpath=.//label[normalize-space(.)=${lit}]/following-sibling::*[1]`).first();
}

function xpathLiteral(s: string) {
  if (!s.includes("'")) return `'${s}'`;
  if (!s.includes('"')) return `"${s}"`;
  return `concat('${s.split("'").join(`', "'", '`)}')`;
}

export const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** Sonner toast containing text. */
export const toast = (page: Page, text: string | RegExp) =>
  page.locator("[data-sonner-toast]").filter({ hasText: text }).first();

/** First visible match (desktop and mobile render duplicate controls, one hidden by CSS). */
export const visible = (l: Locator) => l.filter({ visible: true }).first();

export async function expectDir(page: Page, lang: Lang) {
  await expect(page.locator("html")).toHaveAttribute("dir", lang === "ar" ? "rtl" : "ltr");
  await expect(page.locator("html")).toHaveAttribute("lang", lang);
}

/** Accepts the next window.confirm() (CrudPage delete, import undo). Playwright dismisses dialogs by default. */
export function acceptNextDialog(page: Page) {
  page.once("dialog", (d) => d.accept());
}

/** Splits a wa.me link into number and decoded message. */
export function parseWa(href: string | null) {
  expect(href, "WhatsApp href").toBeTruthy();
  const u = new URL(href!);
  expect(u.hostname).toBe("wa.me");
  return { number: u.pathname.replace(/^\//, ""), text: u.searchParams.get("text") ?? "" };
}

export const fill = (tpl: string, vars: Record<string, string | number>) =>
  tpl.replace(/\{(\w+)\}/g, (_, k) => (vars[k] == null || vars[k] === "" ? "-" : String(vars[k])));

/* ---------------------------------------------------------------- files -- */

const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();
function crc32(buf: Buffer) {
  let c = 0xffffffff;
  for (const b of buf) c = CRC_TABLE[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}
function chunk(type: string, data: Buffer) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type, "ascii"), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(td));
  return Buffer.concat([len, td, crc]);
}

/** Small valid RGB PNG generated in memory (no fixture files on disk). */
export function makePng(width = 32, height = 32, rgb: [number, number, number] = [200, 30, 60]) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;
  ihdr[9] = 2;
  ihdr[10] = 0;
  ihdr[11] = 0;
  ihdr[12] = 0;
  const row = Buffer.alloc(1 + width * 3);
  for (let x = 0; x < width; x++) row.set(rgb, 1 + x * 3);
  const raw = Buffer.concat(Array.from({ length: height }, () => row));
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", ihdr),
    chunk("IDAT", deflateSync(raw)),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

export const pngFile = (name = "e2e.png") => ({ name, mimeType: "image/png", buffer: makePng() });

/** Builds an .xlsx import file using the importer's own COLUMNS (header row first, sheet "Products"). */
export function makeImportXlsx(rows: Partial<Record<Column, string | number>>[]) {
  const matrix = [[...COLUMNS] as string[], ...rows.map((r) => COLUMNS.map((c) => r[c] ?? ""))];
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(matrix), "Products");
  return XLSX.write(wb, { type: "buffer", bookType: "xlsx" }) as Buffer;
}

export const xlsxFile = (name: string, rows: Partial<Record<Column, string | number>>[]) => ({
  name,
  mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  buffer: makeImportXlsx(rows),
});

/**
 * Phones show one "help" button for WhatsApp + Stylist (FloatingHelp) when both are on; desktop shows both.
 * These open the right control either way.
 */
export async function openStylist(page: Page, lang: Lang = "ar") {
  const help = page.getByRole("button", { name: lang === "ar" ? "مساعدة" : "Help", exact: true });
  if (await help.isVisible()) {
    await help.click();
    await page.getByRole("menuitem", { name: T[lang].stylist }).click();
  } else await page.getByRole("button", { name: T[lang].stylist, exact: true }).click();
}

/** The floating WhatsApp link (inside the help menu on phones when it is merged). */
export async function floatingWhatsApp(page: Page, lang: Lang = "ar") {
  const help = page.getByRole("button", { name: lang === "ar" ? "مساعدة" : "Help", exact: true });
  if (await help.isVisible()) {
    await help.click();
    return page.getByRole("menuitem", { name: T[lang].waFloat });
  }
  return page.getByRole("link", { name: T[lang].waFloat });
}
