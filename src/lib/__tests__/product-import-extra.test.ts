import { describe, expect, it } from "vitest";
import {
  categoryPath,
  clean,
  IMPORT_MAX_BYTES,
  IMPORT_MAX_ROWS,
  looksLikeFormula,
  mapHeader,
  matchImageFile,
  neutralizeFormula,
  normalizeColor,
  normalizeSize,
  resolveCategory,
  toPayload,
  toRows,
  validateRows,
  type CategoryInfo,
  type PaletteColor,
} from "@/lib/product-import";
import type { Profile } from "@/lib/catalog";

// Colours are matched against the store's own palette (from catalog_facets), no longer a built-in list.
const PALETTE: PaletteColor[] = [
  { en: "Black", ar: "أسود", hex: "#111111" },
  { en: "Navy", ar: "كحلي", hex: "#1f2a44" },
  { en: "Blue", ar: "أزرق", hex: "#2f6fb5" },
];

const cats: CategoryInfo[] = [
  { id: "m", name_ar: "ملابس رجالي", name_en: "Men", parent_id: null, profile: "clothes" },
  { id: "s", name_ar: "قمصان", name_en: "Shirts", parent_id: "m", profile: null },
  { id: "sh", name_ar: "أحذية", name_en: "Shoes", parent_id: null, profile: "shoes" },
  { id: "p", name_ar: "عطور", name_en: "Perfumes", parent_id: null, profile: "perfume" },
];
// Category profiles (product_profiles): sizes are validated against the category's profile.
const PROFILES: Profile[] = [
  {
    key: "clothes",
    name_ar: "ملابس",
    name_en: "Clothing",
    filters: [],
    fields: [],
    sizes: ["XS", "S", "M", "L", "XL", "XXL", "XXXL"],
    size_guide: "clothes",
  },
  {
    key: "shoes",
    name_ar: "أحذية",
    name_en: "Shoes",
    filters: [],
    fields: [],
    sizes: ["36", "37", "38", "39", "40", "41", "42", "43", "44", "45", "46"],
    size_guide: "shoes",
  },
  {
    key: "perfume",
    name_ar: "عطور",
    name_en: "Perfumes",
    filters: [],
    fields: [],
    sizes: null,
    size_guide: null,
  },
];

const none = { productCodes: new Set<string>(), variantSkus: new Set<string>() };
const HEAD = ["product_code", "name_ar", "category", "price", "size", "sku", "stock"];
const one = (row: string[], head = HEAD) => toRows([head, row]).rows[0];
const check = (
  row: string[],
  opts: { head?: string[]; create?: boolean; existing?: typeof none } = {},
) =>
  validateRows(
    toRows([opts.head ?? HEAD, row]).rows,
    cats,
    opts.existing ?? none,
    opts.create ?? false,
    PROFILES,
  ).checked[0];

describe("constants", () => {
  it("exposes import limits", () => {
    expect(IMPORT_MAX_ROWS).toBe(2000);
    expect(IMPORT_MAX_BYTES).toBe(5 * 1024 * 1024);
  });
});

describe("mapHeader", () => {
  it("maps English headers regardless of case, spacing and underscores", () => {
    expect(mapHeader("price")).toBe("price");
    expect(mapHeader("  PRICE ")).toBe("price");
    expect(mapHeader("Product Code")).toBe("product_code");
    expect(mapHeader("product_code")).toBe("product_code");
    expect(mapHeader("Name  AR")).toBe("name_ar");
    expect(mapHeader("Image 3")).toBe("image_3");
    expect(mapHeader("care")).toBe("care_instructions");
    expect(mapHeader("Color")).toBe("color_ar");
  });
  it("maps Arabic headers, tolerating extra spaces", () => {
    expect(mapHeader("كود المنتج")).toBe("product_code");
    expect(mapHeader(" السعر ")).toBe("price");
    expect(mapHeader("كود  الصنف")).toBe("sku");
    expect(mapHeader("صورة 1")).toBe("image_1");
    expect(mapHeader("الحجم مل")).toBe("volume_ml");
  });
  it("returns null for unknown headers", () => {
    expect(mapHeader("whatever")).toBeNull();
    expect(mapHeader("")).toBeNull();
  });
});

describe("clean", () => {
  it("converts Arabic-Indic and Persian digits", () => {
    expect(clean("٠١٢٣٤٥٦٧٨٩")).toBe("0123456789");
    expect(clean("۰۱۲۳۴۵۶۷۸۹")).toBe("0123456789");
  });
  it("converts the Arabic decimal separator", () => {
    expect(clean("١٢٫٥")).toBe("12.5");
  });
  it("collapses and trims whitespace", () => {
    expect(clean("  قميص \n  كتان\t ")).toBe("قميص كتان");
  });
  it("handles null, undefined and numbers", () => {
    expect(clean(null)).toBe("");
    expect(clean(undefined)).toBe("");
    expect(clean(0)).toBe("0");
    expect(clean(12.5)).toBe("12.5");
  });
  it("removes the export apostrophe only before formula-like text", () => {
    expect(clean("'=SUM(A1)")).toBe("=SUM(A1)");
    expect(clean("'+1")).toBe("+1");
    expect(clean("'-x")).toBe("-x");
    expect(clean("'@x")).toBe("@x");
    expect(clean("'hello")).toBe("'hello");
  });
  it("round-trips tab/CR-prefixed text through neutralizeFormula without a stray apostrophe", () => {
    expect(clean(neutralizeFormula("\tx"))).toBe(clean("\tx"));
    expect(clean(neutralizeFormula("\rx"))).toBe(clean("\rx"));
  });
});

describe("looksLikeFormula / neutralizeFormula", () => {
  it("flags formula prefixes", () => {
    for (const s of ["=1", "+x", "-x", "@x", "\tx", "\rx", "-", "+5"])
      expect(looksLikeFormula(s)).toBe(true);
  });
  it("does not flag plain negative numbers or normal text", () => {
    for (const s of ["-5", "-5.25", "5", "abc", "", "قميص", "a=b"])
      expect(looksLikeFormula(s)).toBe(false);
  });
  it("leaves non-strings untouched", () => {
    expect(neutralizeFormula(null)).toBeNull();
    expect(neutralizeFormula(-5)).toBe(-5);
    expect(neutralizeFormula(true)).toBe(true);
  });
});

describe("normalizeSize", () => {
  it("maps Arabic size words", () => {
    expect(normalizeSize("سمول")).toBe("S");
    expect(normalizeSize("صغير")).toBe("S");
    expect(normalizeSize("ميديم")).toBe("M");
    expect(normalizeSize("ميديام")).toBe("M");
    expect(normalizeSize("وسط")).toBe("M");
    expect(normalizeSize("لارج")).toBe("L");
    expect(normalizeSize("كبير")).toBe("L");
    expect(normalizeSize("اكس لارج")).toBe("XL");
    expect(normalizeSize("إكس لارج")).toBe("XL");
    expect(normalizeSize("  اكس   لارج ")).toBe("XL");
    expect(normalizeSize("اكس اكس لارج")).toBe("XXL");
  });
  it("upper-cases letter sizes and maps 2XL/3XL", () => {
    expect(normalizeSize("m")).toBe("M");
    expect(normalizeSize("xl")).toBe("XL");
    expect(normalizeSize("xxl")).toBe("XXL");
    expect(normalizeSize("xxxl")).toBe("XXXL");
    expect(normalizeSize("2XL")).toBe("XXL");
    expect(normalizeSize("3xl")).toBe("XXXL");
    expect(normalizeSize("xs")).toBe("XS");
  });
  it("keeps numeric and kids sizes, converting Arabic digits", () => {
    expect(normalizeSize("42")).toBe("42");
    expect(normalizeSize("٤٢")).toBe("42");
    expect(normalizeSize("3-4y")).toBe("3-4y");
    expect(normalizeSize("")).toBe("");
  });
});

describe("normalizeColor", () => {
  it("maps Arabic names (with and without hamza) to the palette", () => {
    expect(normalizeColor("أسود", "", PALETTE)).toEqual({
      color_ar: "أسود",
      color_en: "Black",
      color_hex: "#111111",
    });
    expect(normalizeColor("اسود", "", PALETTE)).toEqual({
      color_ar: "أسود",
      color_en: "Black",
      color_hex: "#111111",
    });
    expect(normalizeColor("لبني", "", PALETTE).color_en).toBe("Blue");
  });
  it("maps English names case-insensitively", () => {
    expect(normalizeColor("navy", "", PALETTE)).toEqual({
      color_ar: "كحلي",
      color_en: "Navy",
      color_hex: "#1f2a44",
    });
  });
  it("keeps a valid custom hex over the palette hex", () => {
    expect(normalizeColor("أسود", "#000", PALETTE).color_hex).toBe("#000");
  });
  it("falls back to the palette hex when the given hex is invalid", () => {
    expect(normalizeColor("أسود", "black", PALETTE).color_hex).toBe("#111111");
  });
  it("keeps unknown colors with their hex", () => {
    expect(normalizeColor("فوشيا", "#ff00ff")).toEqual({
      color_ar: "فوشيا",
      color_en: "فوشيا",
      color_hex: "#ff00ff",
    });
    expect(normalizeColor("فوشيا").color_hex).toBe("");
  });
  it("with no store palette yet, keeps the colour exactly as typed (nothing invented)", () => {
    expect(normalizeColor("أسود")).toEqual({ color_ar: "أسود", color_en: "أسود", color_hex: "" });
    expect(normalizeColor("أسود", "#101010")).toEqual({
      color_ar: "أسود",
      color_en: "أسود",
      color_hex: "#101010",
    });
  });
  it("drops an invalid hex even when no color name is given", () => {
    expect(normalizeColor("", "not-a-hex").color_hex).toBe("");
  });
});

describe("resolveCategory / categoryPath", () => {
  it("resolves Arabic and English paths, case-insensitively", () => {
    expect(resolveCategory("ملابس رجالي > قمصان", cats, PROFILES)).toEqual({
      id: "s",
      sizes: ["XS", "S", "M", "L", "XL", "XXL", "XXXL"],
    });
    expect(resolveCategory("men > SHIRTS", cats, PROFILES)).toEqual({
      id: "s",
      sizes: ["XS", "S", "M", "L", "XL", "XXL", "XXXL"],
    });
    expect(resolveCategory("Men>قمصان", cats, PROFILES)).toEqual({
      id: "s",
      sizes: ["XS", "S", "M", "L", "XL", "XXL", "XXXL"],
    });
    expect(resolveCategory("أحذية", cats, PROFILES)).toEqual({
      id: "sh",
      sizes: ["36", "37", "38", "39", "40", "41", "42", "43", "44", "45", "46"],
    });
    expect(resolveCategory("Perfumes", cats, PROFILES)).toEqual({ id: "p", sizes: null });
  });
  it("requires the full path from the root", () => {
    expect(resolveCategory("قمصان", cats)).toBeNull();
    expect(resolveCategory("أحذية > قمصان", cats)).toBeNull();
    expect(resolveCategory("", cats)).toBeNull();
    expect(resolveCategory(" > ", cats)).toBeNull();
  });
  it("builds the Arabic path for a category id", () => {
    expect(categoryPath("s", cats)).toBe("ملابس رجالي > قمصان");
    expect(categoryPath("m", cats)).toBe("ملابس رجالي");
    expect(categoryPath(null, cats)).toBe("");
    expect(categoryPath("missing", cats)).toBe("");
  });
  it("categoryPath output resolves back to the same category", () => {
    expect(resolveCategory(categoryPath("s", cats), cats)?.id).toBe("s");
  });
});

describe("toRows", () => {
  it("returns nothing for an empty sheet", () => {
    expect(toRows([])).toEqual({ rows: [], unknownHeaders: [] });
  });
  it("groups several variant rows under one product code and keeps sheet row numbers", () => {
    const { rows } = toRows([
      HEAD,
      ["A1", "قميص", "Men", "100", "M", "A1-M", "2"],
      [],
      ["A1", "", "", "100", "L", "A1-L", "3"],
    ]);
    expect(rows.map((r) => [r.row, r.product_code, r.size])).toEqual([
      [2, "A1", "M"],
      [4, "A1", "L"],
    ]);
  });
  it("reports unknown headers", () => {
    expect(
      toRows([
        ["product_code", "foo", "", "السعر"],
        ["A1", "x", "", "1"],
      ]).unknownHeaders,
    ).toEqual(["foo"]);
  });
  it("collects non-empty image columns in order", () => {
    const r = one(
      ["A1", "https://a/1.jpg", "", "https://a/3.jpg", "A1_4.jpg"],
      ["product_code", "image_1", "image_2", "image_3", "صورة 4"],
    );
    expect(r.images).toEqual(["https://a/1.jpg", "https://a/3.jpg", "A1_4.jpg"]);
  });
  it("parses is_active in English and Arabic", () => {
    const act = (v: string) => one(["A1", v], ["product_code", "is_active"]).is_active;
    expect(act("")).toBe(true);
    expect(act("1")).toBe(true);
    expect(act("yes")).toBe(true);
    expect(act("نعم")).toBe(true);
    for (const v of ["0", "false", "FALSE", "no", "No", "لا", "غير نشط"])
      expect(act(v)).toBe(false);
  });
  it("parses numbers with thousands commas and Arabic digits", () => {
    expect(one(["A1", "x", "", "1,250"]).price).toBe(1250);
    expect(one(["A1", "x", "", "٤٥٠"]).price).toBe(450);
    expect(one(["A1", "x", "", "٩٩٫٥"]).price).toBe(99.5);
    expect(
      toRows([
        ["product_code", "price"],
        ["A1", 300],
      ]).rows[0].price,
    ).toBe(300);
    expect(one(["A1", "x", "", ""]).price).toBeNull();
    expect(one(["A1", "x", "", "abc"]).price).toBeNaN();
  });
  it("parses the Arabic thousands separator ٬", () => {
    expect(one(["A1", "x", "", "١٬٢٥٠"]).price).toBe(1250);
  });
  it("normalizes gender, season and concentration", () => {
    const r = one(
      ["A1", "رجالي", "Summer", "parfum"],
      ["product_code", "gender", "season", "concentration"],
    );
    expect([r.gender, r.season, r.concentration]).toEqual(["men", "summer", "Parfum"]);
    expect(
      one(["A1", "Women", "شتوي", "edp"], ["product_code", "gender", "season", "concentration"]),
    ).toMatchObject({ gender: "women", season: "winter", concentration: "EDP" });
  });
  it("normalizes size and color", () => {
    const r = toRows(
      [
        ["product_code", "size", "color_ar"],
        ["A1", "اكس لارج", "اسود"],
      ],
      PALETTE,
    ).rows[0];
    expect(r).toMatchObject({
      size: "XL",
      color_ar: "أسود",
      color_en: "Black",
      color_hex: "#111111",
    });
  });
});

describe("validateRows", () => {
  it("accepts a clean row", () => {
    expect(check(["A1", "قميص", "Men", "100", "L", "A1-L", "3"]).status).toBe("valid");
  });
  it("errors on missing product code", () => {
    const c = check(["", "قميص", "Men", "100", "L", "A1-L", "3"]);
    expect(c.status).toBe("error");
    expect(c.messages).toContain("كود المنتج مفقود");
  });
  it("errors on missing name for a new product only", () => {
    expect(check(["A1", "", "Men", "100", "L", "A1-L", "3"]).messages).toContain(
      "اسم المنتج مفقود",
    );
    const existing = { productCodes: new Set(["A1"]), variantSkus: new Set<string>() };
    expect(check(["A1", "", "Men", "100", "L", "A1-L", "3"], { existing }).status).toBe("valid");
  });
  it("errors on missing or non-numeric price", () => {
    expect(check(["A1", "قميص", "Men", "", "L", "A1-L", "3"]).messages).toContain(
      "السعر ليس رقماً",
    );
    expect(check(["A1", "قميص", "Men", "abc", "L", "A1-L", "3"]).messages).toContain(
      "السعر ليس رقماً",
    );
  });
  it("errors on negative price", () => {
    expect(check(["A1", "قميص", "Men", "-5", "L", "A1-L", "3"]).messages).toContain("السعر سالب");
  });
  it("errors on non-integer and negative stock", () => {
    expect(check(["A1", "قميص", "Men", "100", "L", "A1-L", "1.5"]).messages).toContain(
      "المخزون ليس رقماً صحيحاً",
    );
    expect(check(["A1", "قميص", "Men", "100", "L", "A1-L", "x"]).messages).toContain(
      "المخزون ليس رقماً صحيحاً",
    );
    expect(check(["A1", "قميص", "Men", "100", "L", "A1-L", "-1"]).messages).toContain(
      "المخزون سالب",
    );
  });
  it("errors on duplicate sku in the file", () => {
    const rs = toRows([
      HEAD,
      ["A1", "قميص", "Men", "100", "L", "DUP", "1"],
      ["A1", "", "Men", "100", "M", "DUP", "1"],
    ]).rows;
    const { checked } = validateRows(rs, cats, none, false, PROFILES);
    expect(
      checked.every(
        (c) => c.status === "error" && c.messages.includes("كود الصنف مكرر في الملف (DUP)"),
      ),
    ).toBe(true);
  });
  it("errors on unknown gender and season", () => {
    const head = ["product_code", "name_ar", "price", "gender", "season"];
    const c = check(["A1", "قميص", "10", "aliens", "spring"], { head });
    expect(c.messages).toEqual(expect.arrayContaining(["الفئة غير معروفة", "الموسم غير معروف"]));
  });
  it("errors on a size not allowed for the category (including inherited size type)", () => {
    expect(check(["A1", "حذاء", "أحذية", "100", "L", "A1-L", "1"]).messages).toContain(
      "المقاس L غير مسموح لهذا القسم",
    );
    expect(check(["A1", "قميص", "Men > Shirts", "100", "42", "A1-42", "1"]).status).toBe("error");
    expect(check(["A1", "حذاء", "أحذية", "100", "42", "A1-42", "1"]).status).toBe("valid");
  });
  it("warns when a sized row goes into a category without sizes", () => {
    const c = check(["A1", "عطر", "عطور", "100", "L", "A1-L", "1"]);
    expect(c.status).toBe("warning");
    expect(c.messages).toContain("القسم بدون مقاسات، تأكد من المقاس");
  });
  it("unknown category is an error, or a warning when creating categories", () => {
    expect(check(["A1", "قميص", "جديد", "100", "", "", ""]).status).toBe("error");
    const c = check(["A1", "قميص", "جديد", "100", "", "", ""], { create: true });
    expect(c.status).toBe("warning");
    expect(c.messages).toContain("سيتم إنشاء قسم جديد");
  });
  it("warns on formula-like text", () => {
    const c = check(["A1", '=HYPERLINK("x")', "Men", "100", "L", "A1-L", "1"]);
    expect(c.status).toBe("warning");
    expect(c.messages).toContain("خلية تبدأ بـ = أو + أو - أو @ — ستُحفظ كنص");
  });
  it("warns on non-https image references", () => {
    const head = [...HEAD, "image_1"];
    expect(
      check(["A1", "قميص", "Men", "100", "L", "A1-L", "1", "http://x.com/a.jpg"], { head }).status,
    ).toBe("warning");
    expect(check(["A1", "قميص", "Men", "100", "L", "A1-L", "1", "A1_1.jpg"], { head }).status).toBe(
      "warning",
    );
    expect(
      check(["A1", "قميص", "Men", "100", "L", "A1-L", "1", "https://x.com/a.jpg"], { head }).status,
    ).toBe("valid");
  });
  it("warns on unknown concentration", () => {
    const head = ["product_code", "name_ar", "price", "category", "concentration"];
    expect(check(["A1", "عطر", "10", "عطور", "cologne"], { head }).messages).toContain(
      "التركيز غير معروف وسيتم تجاهله",
    );
  });
  it("summarizes new vs updated products and new variants", () => {
    const existing = { productCodes: new Set(["OLD"]), variantSkus: new Set(["OLD-M"]) };
    const rs = toRows([
      HEAD,
      ["OLD", "", "Men", "100", "M", "OLD-M", "1"],
      ["OLD", "", "Men", "100", "L", "OLD-L", "1"],
      ["NEW", "جديد", "Men", "100", "S", "NEW-S", "1"],
      ["BAD", "x", "Men", "-1", "S", "BAD-S", "1"],
    ]).rows;
    expect(validateRows(rs, cats, existing, false, PROFILES).summary).toEqual({
      newProducts: 1,
      updatedProducts: 1,
      newVariants: 2,
      errors: 1,
    });
  });
});

describe("toPayload", () => {
  it("keeps only https images", () => {
    const r = one(
      [
        "A1",
        "https://a/1.jpg",
        "http://a/2.jpg",
        "A1_3.jpg",
        "HTTPS://a/4.jpg",
        "javascript:alert(1)",
      ],
      ["product_code", "image_1", "image_2", "image_3", "image_4", "image_5"],
    );
    expect(toPayload(r).images).toEqual(["https://a/1.jpg", "HTTPS://a/4.jpg"]);
    expect(r.images).toHaveLength(5);
  });
});

describe("matchImageFile", () => {
  it("parses code, optional color and index", () => {
    expect(matchImageFile("AH001_1.jpg", ["AH001"])).toEqual({
      code: "AH001",
      color: null,
      index: 1,
    });
    expect(matchImageFile("photos/AH001_Black_3.JPG", ["AH001"])).toEqual({
      code: "AH001",
      color: "Black",
      index: 3,
    });
    expect(matchImageFile("AH001_أسود_فاتح_2.webp", ["AH001"])).toEqual({
      code: "AH001",
      color: "أسود_فاتح",
      index: 2,
    });
  });
  it("matches codes case-insensitively and Arabic-digit indexes", () => {
    expect(matchImageFile("ah001_٢.png", ["AH001"])).toEqual({
      code: "AH001",
      color: null,
      index: 2,
    });
  });
  it("rejects zero, non-numeric indexes and unknown codes", () => {
    expect(matchImageFile("AH001_0.jpg", ["AH001"])).toBeNull();
    expect(matchImageFile("AH001_front.jpg", ["AH001"])).toBeNull();
    expect(matchImageFile("AH0011_1.jpg", ["AH001"])).toBeNull();
    expect(matchImageFile("AH001.jpg", ["AH001"])).toBeNull();
  });
});
