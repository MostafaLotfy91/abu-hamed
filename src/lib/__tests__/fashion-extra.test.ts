import { describe, expect, it } from "vitest";
import { defaultSelection } from "@/lib/fashion";

describe("defaultSelection (what the product page and WhatsApp message treat as selected)", () => {
  const v = (size: string | null, color_en: string | null, stock: number, is_active = true) => ({
    size,
    color_en,
    stock,
    is_active,
  });
  it("auto-selects the only colour and leaves size open when there are several", () => {
    const r = defaultSelection([v("S", "Black", 0), v("M", "Black", 5)], {
      size: null,
      color: null,
    });
    expect(r).toMatchObject({ color: "Black", size: null, sizes: ["S", "M"] });
  });
  it("picks the first in-stock colour when there are several", () => {
    expect(
      defaultSelection([v("M", "Red", 0), v("M", "Blue", 3)], { size: null, color: null }).color,
    ).toBe("Blue");
  });
  it("auto-selects a single size", () => {
    expect(defaultSelection([v("L", "Red", 1)], { size: null, color: null }).size).toBe("L");
  });
  it("the shopper's choice always wins and inactive variants are ignored", () => {
    const r = defaultSelection([v("M", "Red", 3), v("M", "Blue", 3), v("XL", "Green", 9, false)], {
      size: "M",
      color: "Red",
    });
    expect(r).toMatchObject({ color: "Red", size: "M", sizes: ["M"] });
  });
  it("returns nothing for a product without variants", () => {
    expect(defaultSelection([], { size: null, color: null })).toMatchObject({
      color: null,
      size: null,
    });
  });
});
import { findVariant, sizeLabel, sortSizes, type VariantLike } from "@/lib/fashion";
import { restockQty } from "@/lib/insights-types";

describe("sizeLabel", () => {
  it("labels kids month ranges", () => {
    expect(sizeLabel("3-6m", "ar")).toBe("3-6 شهور");
    expect(sizeLabel("3-6m", "en")).toBe("3-6 mo");
  });
  it("labels kids year ranges", () => {
    expect(sizeLabel("10-12y", "ar")).toBe("10-12 سنة");
    expect(sizeLabel("2-3y", "en")).toBe("2-3 y");
  });
  it("returns other sizes unchanged", () => {
    for (const s of ["M", "XXL", "42", "One size", ""]) expect(sizeLabel(s, "ar")).toBe(s);
  });
});

describe("sortSizes", () => {
  it("orders letter sizes without a hardcoded preset, including XS and 4XL", () => {
    expect(sortSizes(["4XL", "M", "XS", "xl", "S", "XXS"])).toEqual([
      "XXS",
      "XS",
      "S",
      "M",
      "xl",
      "4XL",
    ]);
  });
  it("puts letters before ages before numbers before free text", () => {
    expect(sortSizes(["One size", "40", "2-3y", "M"])).toEqual(["M", "2-3y", "40", "One size"]);
  });
  it("orders all clothing sizes naturally", () => {
    expect(sortSizes(["XXXL", "L", "XXL", "S", "XL", "M"])).toEqual([
      "S",
      "M",
      "L",
      "XL",
      "XXL",
      "XXXL",
    ]);
  });
  it("orders shoe sizes numerically", () => {
    expect(sortSizes(["44", "36", "40", "46", "38"])).toEqual(["36", "38", "40", "44", "46"]);
  });
  it("orders kids ages from months to years", () => {
    expect(sortSizes(["10-12y", "1-2y", "0-3m", "6-12m", "2-3y", "8-10y"])).toEqual([
      "0-3m",
      "6-12m",
      "1-2y",
      "2-3y",
      "8-10y",
      "10-12y",
    ]);
  });
  it("orders unknown numeric sizes numerically", () => {
    expect(sortSizes(["50", "9", "100"])).toEqual(["9", "50", "100"]);
  });
  it("does not mutate the input", () => {
    const input = ["L", "S"];
    sortSizes(input);
    expect(input).toEqual(["L", "S"]);
  });
});

describe("findVariant", () => {
  const v = (id: string, size: string | null, color_en: string | null): VariantLike => ({
    id,
    size,
    color_en,
    color_ar: null,
    color_hex: null,
    stock: 1,
    is_active: true,
  });

  it("matches color-only variants (no size)", () => {
    const vs = [v("a", null, "Black"), v("b", null, "White")];
    expect(findVariant(vs, null, "White")?.id).toBe("b");
  });
  it("matches size-only variants (no color)", () => {
    const vs = [v("a", "M", null), v("b", "L", null)];
    expect(findVariant(vs, "L", null)?.id).toBe("b");
  });
  it("matches a single no-size no-color variant", () => {
    expect(findVariant([v("a", null, null)], null, null)?.id).toBe("a");
  });
  it("requires both axes to match", () => {
    const vs = [v("a", "M", "Black")];
    expect(findVariant(vs, "M", null)).toBeNull();
    expect(findVariant(vs, null, "Black")).toBeNull();
    expect(findVariant(vs, "M", "White")).toBeNull();
    expect(findVariant([], "M", "Black")).toBeNull();
  });
  it("treats undefined fields as null", () => {
    const vs = [{ ...v("a", null, null), size: undefined as unknown as null }];
    expect(findVariant(vs, null, null)?.id).toBe("a");
  });
});

describe("restockQty edge cases", () => {
  it("rounds the need up", () => {
    expect(restockQty(1, 30, 0)).toBe(1);
    expect(restockQty(10, 30, 0)).toBe(7);
  });
  it("suggests nothing when nothing sold", () => {
    expect(restockQty(0, 30, 0)).toBe(0);
    expect(restockQty(0, 30, 10)).toBe(0);
  });
  it("suggests nothing when stock exactly covers demand", () => {
    expect(restockQty(14, 14, 21)).toBe(0);
  });
  it("suggests the full need when stock is zero or negative (oversold)", () => {
    expect(restockQty(14, 14, 0)).toBe(21);
    expect(restockQty(14, 14, -2)).toBe(23);
  });
  it("honours a custom cover period", () => {
    expect(restockQty(30, 30, 0, 7)).toBe(7);
  });
  it("never returns a negative number", () => {
    expect(restockQty(1, 30, 1000)).toBe(0);
  });
});
