import { describe, expect, it } from "vitest";
import { returnDaysLeft } from "@/components/store/ReturnRequest";
import { sortSizes, findVariant } from "@/lib/fashion";

describe("return window", () => {
  const delivered = "2026-10-01T12:00:00Z";
  it("allows requests inside the window", () => {
    expect(returnDaysLeft(delivered, 14, Date.parse("2026-10-10T12:00:00Z"))).toBe(5);
  });
  it("closes after the configured days", () => {
    expect(returnDaysLeft(delivered, 14, Date.parse("2026-10-16T12:00:01Z"))).toBeLessThanOrEqual(0);
  });
  it("is closed when not delivered", () => {
    expect(returnDaysLeft(null, 14)).toBe(-1);
  });
});

describe("sizes and variants", () => {
  it("orders clothing sizes naturally", () => {
    expect(sortSizes(["XL", "S", "XXXL", "M"])).toEqual(["S", "M", "XL", "XXXL"]);
  });
  it("finds the variant for a size + color", () => {
    const v = [
      { id: "a", size: "M", color_en: "Black", color_ar: null, color_hex: null, stock: 0, is_active: true },
      { id: "b", size: "L", color_en: "Black", color_ar: null, color_hex: null, stock: 3, is_active: true },
    ];
    expect(findVariant(v, "L", "Black")?.id).toBe("b");
    expect(findVariant(v, "XL", "Black")).toBeNull();
  });
});
