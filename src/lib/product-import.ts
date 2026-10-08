/** Pure parsing/normalizing/validation for the Excel product import (no I/O, unit-tested). */
import { profileOf, type Profile } from "@/lib/catalog";
import { toAsciiDigits } from "@/lib/format";

export const IMPORT_MAX_ROWS = 2000;
export const IMPORT_MAX_BYTES = 5 * 1024 * 1024;
export const IMPORT_BATCH = 100;

export const COLUMNS = [
  "product_code",
  "name_ar",
  "name_en",
  "category",
  "brand",
  "gender",
  "season",
  "material",
  "description_ar",
  "description_en",
  "care_instructions",
  "price",
  "old_price",
  "color_ar",
  "color_hex",
  "size",
  "sku",
  "stock",
  "image_1",
  "image_2",
  "image_3",
  "image_4",
  "image_5",
  "is_active",
  "top_notes",
  "middle_notes",
  "base_notes",
  "volume_ml",
  "concentration",
] as const;
export type Column = (typeof COLUMNS)[number];

/** Arabic header aliases (also used as the 2nd label in the template). */
export const AR_HEADERS: Record<Column, string> = {
  product_code: "كود المنتج",
  name_ar: "الاسم عربي",
  name_en: "الاسم انجليزي",
  category: "القسم",
  brand: "الماركة",
  gender: "الفئة",
  season: "الموسم",
  material: "الخامة",
  description_ar: "الوصف عربي",
  description_en: "الوصف انجليزي",
  care_instructions: "تعليمات العناية",
  price: "السعر",
  old_price: "السعر القديم",
  color_ar: "اللون",
  color_hex: "كود اللون",
  size: "المقاس",
  sku: "كود الصنف",
  stock: "المخزون",
  image_1: "صورة 1",
  image_2: "صورة 2",
  image_3: "صورة 3",
  image_4: "صورة 4",
  image_5: "صورة 5",
  is_active: "نشط",
  top_notes: "مقدمة العطر",
  middle_notes: "قلب العطر",
  base_notes: "قاعدة العطر",
  volume_ml: "الحجم مل",
  concentration: "التركيز",
};

const GENDER_MAP: Record<string, string> = {
  men: "men",
  رجالي: "men",
  رجال: "men",
  women: "women",
  حريمي: "women",
  نسائي: "women",
  kids: "kids",
  أطفال: "kids",
  اطفال: "kids",
  unisex: "unisex",
  للجنسين: "unisex",
};
const SEASON_MAP: Record<string, string> = {
  summer: "summer",
  صيفي: "summer",
  صيف: "summer",
  winter: "winter",
  شتوي: "winter",
  شتاء: "winter",
  all: "all",
  "كل المواسم": "all",
};
const SIZE_MAP: Record<string, string> = {
  سمول: "S",
  صغير: "S",
  ميديم: "M",
  ميديام: "M",
  وسط: "M",
  لارج: "L",
  كبير: "L",
  "اكس لارج": "XL",
  "إكس لارج": "XL",
  "اكس اكس لارج": "XXL",
  "2xl": "XXL",
  "3xl": "XXXL",
  xxxl: "XXXL",
};
const EXTRA_COLORS: Record<string, string> = {
  اسود: "Black",
  ابيض: "White",
  رصاصي: "Gray",
  سماوي: "Blue",
  لبني: "Blue",
  نبيتي: "Red",
  كافيه: "Brown",
  جملي: "Beige",
  دهبي: "Gold",
  بمبي: "Pink",
};

const headerIndex = (() => {
  const m = new Map<string, Column>();
  for (const c of COLUMNS) {
    m.set(c, c);
    m.set(AR_HEADERS[c], c);
  }
  m.set("care", "care_instructions");
  m.set("product code", "product_code");
  m.set("color", "color_ar");
  return m;
})();

export function mapHeader(h: string): Column | null {
  const k = clean(h).toLowerCase().replace(/\s+/g, " ");
  return headerIndex.get(k) ?? headerIndex.get(k.replace(/ /g, "_")) ?? null;
}

/** Trim, convert Arabic-Indic digits; values are always kept as literal text (never formulas). */
export function clean(v: unknown): string {
  if (v === null || v === undefined) return "";
  // Undo the apostrophe our exports put in front of formula-like text (see neutralizeFormula). This must run
  // on the raw value: whitespace normalization below would turn a leading tab/CR into a space and hide it.
  const raw = String(v).replace(/^'(?=[=+\-@\t\r])/, "");
  return toAsciiDigits(raw).replace(/٫/g, ".").replace(/\s+/g, " ").trim();
}

/** A cell beginning with = + - @ (or tab/CR) that isn't a plain number is text — strip nothing, just never evaluate. */
export const looksLikeFormula = (s: string) => /^[=+\-@\t\r]/.test(s) && !/^-?\d+(\.\d+)?$/.test(s);

/** Prefixes formula-like text with an apostrophe so spreadsheet apps show it as text instead of running it. */
export function neutralizeFormula<T>(v: T): T | string {
  return typeof v === "string" && looksLikeFormula(v) ? `'${v}` : v;
}

export function normalizeSize(s: string): string {
  const v = clean(s);
  if (!v) return "";
  const k = v.toLowerCase();
  if (SIZE_MAP[k]) return SIZE_MAP[k];
  if (/^(x{0,3}l|s|m|xs)$/i.test(v)) return v.toUpperCase();
  return v;
}

/** A colour the store already uses (from catalog_facets), used to match names in the sheet. */
export type PaletteColor = { en: string; ar: string | null; hex: string | null };

/**
 * Matches a colour name against the store's existing colours (Arabic or English, common Arabic spellings).
 * Unknown colours are kept as typed, with the sheet's hex if it is a valid one.
 */
export function normalizeColor(s: string, hex?: string, palette: PaletteColor[] = []) {
  const v = clean(s);
  const h = clean(hex);
  // Only real hex colours reach the database (the value ends up in a style attribute on the storefront).
  const validHex = /^#[0-9a-f]{3,8}$/i.test(h) ? h : "";
  if (!v) return { color_ar: "", color_en: "", color_hex: validHex };
  const alias = EXTRA_COLORS[v];
  const c = palette.find((x) => x.ar === v || x.en.toLowerCase() === (alias ?? v).toLowerCase());
  return { color_ar: c?.ar ?? v, color_en: c?.en ?? v, color_hex: validHex || (c?.hex ?? "") };
}

export type CategoryInfo = {
  id: string;
  name_ar: string;
  name_en: string;
  parent_id: string | null;
  profile: string | null;
};

/** Resolves "ملابس رجالي > قمصان" to a category; returns its effective size preset (null = no sizes). */
export function resolveCategory(path: string, cats: CategoryInfo[], profiles: Profile[] = []) {
  let parent: string | null = null,
    hit: CategoryInfo | undefined;
  const chain: CategoryInfo[] = [];
  for (const seg of path
    .split(">")
    .map((s) => s.trim())
    .filter(Boolean)) {
    hit = cats.find(
      (c) =>
        c.parent_id === parent &&
        (c.name_ar === seg || c.name_en.toLowerCase() === seg.toLowerCase()),
    );
    if (!hit) return null;
    chain.push(hit);
    parent = hit.id;
  }
  if (!hit) return null;
  return { id: hit.id, sizes: profileOf(hit.id, cats, profiles).sizes };
}

export const categoryPath = (id: string | null, cats: CategoryInfo[]) => {
  const out: string[] = [];
  let c = cats.find((x) => x.id === id);
  while (c) {
    out.unshift(c.name_ar);
    c = cats.find((x) => x.id === c!.parent_id);
  }
  return out.join(" > ");
};

export type ImportRow = {
  row: number;
  product_code: string;
  name_ar: string;
  name_en: string;
  category: string;
  brand: string;
  gender: string;
  season: string;
  material: string;
  description_ar: string;
  description_en: string;
  care: string;
  price: number | null;
  old_price: number | null;
  color_ar: string;
  color_en: string;
  color_hex: string;
  size: string;
  sku: string;
  stock: number | null;
  images: string[];
  is_active: boolean;
  top_notes: string;
  middle_notes: string;
  base_notes: string;
  volume_ml: number | null;
  concentration: string;
};
export type RowStatus = "valid" | "warning" | "error";
export type CheckedRow = { data: ImportRow; status: RowStatus; messages: string[] };

// Thousands separators: ASCII comma and the Arabic separator ٬ (U+066C), e.g. "١٬٢٥٠" -> 1250.
const num = (s: string) => (s === "" ? null : Number(s.replace(/[,٬]/g, "")));
const bool = (s: string) => !/^(0|false|no|لا|غير نشط)$/i.test(s);

/** Turns raw sheet rows (header row first) into typed rows. */
export function toRows(
  matrix: unknown[][],
  palette: PaletteColor[] = [],
): { rows: ImportRow[]; unknownHeaders: string[] } {
  if (!matrix.length) return { rows: [], unknownHeaders: [] };
  const heads = matrix[0].map((h) => mapHeader(String(h ?? "")));
  const unknownHeaders = matrix[0].filter((h, i) => clean(h) && !heads[i]).map((h) => clean(h));
  const rows: ImportRow[] = [];
  matrix.slice(1).forEach((r, i) => {
    const g: Partial<Record<Column, string>> = {};
    heads.forEach((h, j) => {
      if (h) g[h] = clean(r[j]);
    });
    if (!Object.values(g).some(Boolean)) return;
    const s = (k: Column) => g[k] ?? "";
    const color = normalizeColor(s("color_ar"), s("color_hex"), palette);
    rows.push({
      row: i + 2,
      product_code: s("product_code"),
      name_ar: s("name_ar"),
      name_en: s("name_en"),
      category: s("category"),
      brand: s("brand"),
      gender: GENDER_MAP[s("gender").toLowerCase()] ?? s("gender").toLowerCase(),
      season: SEASON_MAP[s("season").toLowerCase()] ?? s("season").toLowerCase(),
      material: s("material"),
      description_ar: s("description_ar"),
      description_en: s("description_en"),
      care: s("care_instructions"),
      price: num(s("price")),
      old_price: num(s("old_price")),
      ...color,
      size: normalizeSize(s("size")),
      sku: s("sku"),
      stock: num(s("stock")),
      images: (["image_1", "image_2", "image_3", "image_4", "image_5"] as const)
        .map(s)
        .filter(Boolean),
      is_active: s("is_active") === "" ? true : bool(s("is_active")),
      top_notes: s("top_notes"),
      middle_notes: s("middle_notes"),
      base_notes: s("base_notes"),
      volume_ml: num(s("volume_ml")),
      concentration:
        s("concentration").toUpperCase() === "PARFUM" ? "Parfum" : s("concentration").toUpperCase(),
    });
  });
  return { rows, unknownHeaders };
}

export type Existing = { productCodes: Set<string>; variantSkus: Set<string> };

export function validateRows(
  rows: ImportRow[],
  cats: CategoryInfo[],
  existing: Existing,
  createCategories: boolean,
  profiles: Profile[] = [],
) {
  const skuCount = new Map<string, number>();
  rows.forEach((r) => r.sku && skuCount.set(r.sku, (skuCount.get(r.sku) ?? 0) + 1));
  const named = new Set(rows.filter((r) => r.name_ar).map((r) => r.product_code));
  const checked: CheckedRow[] = rows.map((r) => {
    const e: string[] = [],
      w: string[] = [];
    if (!r.product_code) e.push("كود المنتج مفقود");
    if (!r.name_ar && !existing.productCodes.has(r.product_code) && !named.has(r.product_code))
      e.push("اسم المنتج مفقود");
    if (r.price === null || Number.isNaN(r.price)) e.push("السعر ليس رقماً");
    else if (r.price < 0) e.push("السعر سالب");
    if (r.old_price !== null && Number.isNaN(r.old_price)) e.push("السعر القديم ليس رقماً");
    if (r.stock !== null && (Number.isNaN(r.stock) || !Number.isInteger(r.stock)))
      e.push("المخزون ليس رقماً صحيحاً");
    else if ((r.stock ?? 0) < 0) e.push("المخزون سالب");
    if (r.sku && (skuCount.get(r.sku) ?? 0) > 1) e.push(`كود الصنف مكرر في الملف (${r.sku})`);
    if (r.gender && !GENDER_MAP[r.gender]) e.push("الفئة غير معروفة");
    if (r.season && !SEASON_MAP[r.season]) e.push("الموسم غير معروف");
    if (r.concentration && !["EDP", "EDT", "Parfum"].includes(r.concentration))
      w.push("التركيز غير معروف وسيتم تجاهله");
    if (r.volume_ml !== null && Number.isNaN(r.volume_ml)) e.push("الحجم ليس رقماً");
    if (r.category) {
      const cat = resolveCategory(r.category, cats, profiles);
      if (!cat)
        (createCategories ? w : e).push(
          createCategories ? "سيتم إنشاء قسم جديد" : `القسم غير موجود: ${r.category}`,
        );
      else if (r.size && cat.sizes && !cat.sizes.includes(r.size))
        e.push(`المقاس ${r.size} غير مسموح لهذا القسم`);
      else if (r.size && !cat.sizes) w.push("القسم بدون مقاسات، تأكد من المقاس");
    } else if (!existing.productCodes.has(r.product_code)) w.push("بدون قسم");
    if (!r.sku && (r.size || r.color_ar)) w.push("بدون كود صنف — سيتم المطابقة بالمقاس واللون");
    const bad = r.images.filter((u) => !/^https:\/\//i.test(u));
    if (bad.length) w.push("صور بأسماء ملفات — ارفعها من شاشة رفع الصور");
    const texts = [
      r.name_ar,
      r.name_en,
      r.brand,
      r.material,
      r.description_ar,
      r.description_en,
      r.care,
      r.color_ar,
      r.color_en,
      r.top_notes,
      r.middle_notes,
      r.base_notes,
    ];
    if (texts.some(looksLikeFormula)) w.push("خلية تبدأ بـ = أو + أو - أو @ — ستُحفظ كنص");
    return {
      data: r,
      status: e.length ? "error" : w.length ? "warning" : "valid",
      messages: [...e, ...w],
    } as CheckedRow;
  });
  const ok = checked.filter((c) => c.status !== "error").map((c) => c.data);
  const codes = new Set(ok.map((r) => r.product_code));
  const summary = {
    newProducts: [...codes].filter((c) => !existing.productCodes.has(c)).length,
    updatedProducts: [...codes].filter((c) => existing.productCodes.has(c)).length,
    newVariants: ok.filter(
      (r) => (r.size || r.color_ar || r.sku) && !(r.sku && existing.variantSkus.has(r.sku)),
    ).length,
    errors: checked.length - ok.length,
  };
  return { checked, summary };
}

/** Payload sent to the server: only https image URLs. */
export const toPayload = (r: ImportRow) => ({
  ...r,
  images: r.images.filter((u) => /^https:\/\//i.test(u)),
});

/** Matches "<code>_<n>.jpg" or "<code>_<color>_<n>.jpg" against known product codes (longest code wins). */
export function matchImageFile(name: string, codes: string[]) {
  const base = name
    .split("/")
    .pop()!
    .replace(/\.[a-z0-9]+$/i, "");
  const code = [...codes]
    .sort((a, b) => b.length - a.length)
    .find((c) => base.toLowerCase().startsWith(c.toLowerCase() + "_"));
  if (!code) return null;
  const rest = base.slice(code.length + 1).split("_");
  const n = Number(clean(rest[rest.length - 1]));
  if (!Number.isInteger(n) || n < 1) return null;
  return { code, color: rest.length > 1 ? rest.slice(0, -1).join("_") : null, index: n };
}
