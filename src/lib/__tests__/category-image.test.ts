import { describe, expect, it } from "vitest";
import { categorySlug, matchCategoryFile } from "../category-image";

const cats = [
  { id: "c1", name_ar: "تيشيرتات", name_en: "T-Shirts" },
  { id: "c2", name_ar: "ملابس رجالي", name_en: "Men's Clothing" },
  { id: "c3", name_ar: "قمصان", name_en: "Shirts" },
];

describe("category file matching (bulk upload)", () => {
  it("slugs English and Arabic names", () => {
    expect(categorySlug("Men's Clothing")).toBe("mens-clothing");
    expect(categorySlug("ملابس رجالي")).toBe("ملابس-رجالي");
    expect(categorySlug("  T_Shirts  ")).toBe("t-shirts");
  });

  it("matches by English slug, Arabic name or id, any extension", () => {
    expect(matchCategoryFile("t-shirts.jpg", cats)).toBe("c1");
    expect(matchCategoryFile("T-Shirts.PNG", cats)).toBe("c1");
    expect(matchCategoryFile("mens-clothing.webp", cats)).toBe("c2");
    expect(matchCategoryFile("ملابس رجالي.jpg", cats)).toBe("c2");
    expect(matchCategoryFile("ملابس-رجالي.jpeg", cats)).toBe("c2");
    expect(matchCategoryFile("c3.jpg", cats)).toBe("c3");
  });

  it("reports unmatched files instead of guessing", () => {
    expect(matchCategoryFile("shirt.jpg", cats)).toBeNull(); // close, but not exact
    expect(matchCategoryFile("photo-123.jpg", cats)).toBeNull();
    expect(matchCategoryFile(".jpg", cats)).toBeNull();
  });
});
