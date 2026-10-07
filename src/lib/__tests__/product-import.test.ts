import { describe, expect, it } from "vitest";
import { clean, matchImageFile, neutralizeFormula, normalizeColor, normalizeSize, toRows, validateRows } from "@/lib/product-import";

const cats = [
  { id: "m", name_ar: "ملابس رجالي", name_en: "Men", parent_id: null, size_type: "clothes" },
  { id: "s", name_ar: "قمصان", name_en: "Shirts", parent_id: "m", size_type: "none" },
];
const none = { productCodes: new Set<string>(), variantSkus: new Set<string>() };
const rows = (data: string[][]) => toRows([["product_code", "name_ar", "category", "price", "size", "sku", "stock"], ...data]).rows;

describe("product import", () => {
  it("converts Arabic-Indic digits", () => expect(clean("٤٥٠")).toBe("450"));
  it("normalizes لارج to L", () => expect(normalizeSize("لارج")).toBe("L"));
  it("maps Arabic color to hex", () => expect(normalizeColor("أسود").color_hex).toBe("#111111"));
  it("accepts Arabic headers", () => expect(toRows([["كود المنتج", "السعر"], ["A1", "10"]]).rows[0].price).toBe(10));
  it("flags size not allowed for category", () => {
    const { checked } = validateRows(rows([["A1", "قميص", "ملابس رجالي > قمصان", "100", "44", "A1-44", "1"]]), cats, none, false);
    expect(checked[0].status).toBe("error");
  });
  it("flags duplicate sku, negative stock, bad price, unknown category", () => {
    const { checked, summary } = validateRows(rows([
      ["A1", "قميص", "ملابس رجالي > قمصان", "100", "L", "X", "1"],
      ["A1", "", "ملابس رجالي > قمصان", "100", "M", "X", "-1"],
      ["A2", "بنطلون", "غير موجود", "abc", "", "", ""],
    ]), cats, none, false);
    expect(checked.map((c) => c.status)).toEqual(["error", "error", "error"]);
    expect(summary.errors).toBe(3);
  });
  it("counts new products and variants for valid rows", () => {
    const { summary } = validateRows(rows([["A1", "قميص", "ملابس رجالي > قمصان", "100", "L", "A1-L", "3"], ["A1", "", "", "100", "M", "A1-M", "2"]]), cats, none, false);
    expect(summary).toEqual({ newProducts: 1, updatedProducts: 0, newVariants: 2, errors: 0 });
  });
  it("neutralizes formula-like text for export and undoes it on re-import", () => {
    for (const v of ["=HYPERLINK(\"http://x\")", "+cmd", "-2+3", "@SUM(A1)", "\tx", "\rx"]) {
      expect(neutralizeFormula(v)).toBe(`'${v}`);
    }
    expect(neutralizeFormula("-5")).toBe("-5");
    expect(neutralizeFormula("قميص")).toBe("قميص");
    expect(neutralizeFormula(42)).toBe(42);
    expect(clean(neutralizeFormula("=1+1"))).toBe("=1+1");
    expect(clean("'not a formula")).toBe("'not a formula");
  });
  it("warns on formula-like text in any text column", () => {
    const { checked } = validateRows(
      toRows([["product_code", "name_ar", "price", "description_en"], ["A1", "قميص", "10", "=cmd|' /C calc'!A0"]]).rows,
      cats, none, false,
    );
    expect(checked[0].status).toBe("warning");
  });
  it("matches image file names to the longest product code", () => {
    expect(matchImageFile("AH001_أسود_2.jpg", ["AH00", "AH001"])).toEqual({ code: "AH001", color: "أسود", index: 2 });
    expect(matchImageFile("random.jpg", ["AH001"])).toBeNull();
  });
});
