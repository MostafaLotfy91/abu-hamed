import { describe, expect, it } from "vitest";
import {
  descendantIds,
  GENERAL_PROFILE,
  listingFilters,
  parseListSearch,
  profileKeyOf,
  profileOf,
  pruneFilters,
  toCatalogQuery,
  toListSearch,
  UNIVERSAL_FILTERS,
  type Profile,
} from "../catalog";

const P = (key: string, filters: Profile["filters"], sizes: string[] | null = null): Profile => ({
  key,
  name_ar: key,
  name_en: key,
  filters,
  fields: [],
  sizes,
  size_guide: null,
});
const PROFILES = [
  P(
    "clothes",
    ["size", "color", "brand", "gender", "season", "price", "discount", "in_stock"],
    ["S", "M", "L"],
  ),
  P("perfume", ["concentration", "volume", "gender", "brand", "price", "discount", "in_stock"]),
  P("accessories", ["type", "color", "material", "brand", "price", "discount", "in_stock"]),
  P("general", ["brand", "price", "discount", "in_stock"]),
];
const CATS = [
  { id: "men", parent_id: null, profile: "clothes" },
  { id: "shirts", parent_id: "men", profile: null },
  { id: "tees", parent_id: "shirts", profile: null },
  { id: "perf", parent_id: null, profile: "perfume" },
  { id: "acc", parent_id: null, profile: "accessories" },
  { id: "watches", parent_id: "acc", profile: null },
  { id: "misc", parent_id: null, profile: null },
];

describe("category profiles", () => {
  it("subcategories inherit the nearest ancestor's profile", () => {
    expect(profileKeyOf("tees", CATS)).toBe("clothes");
    expect(profileKeyOf("watches", CATS)).toBe("accessories");
  });
  it("categories without a profile (or unknown ids) are general", () => {
    expect(profileKeyOf("misc", CATS)).toBe("general");
    expect(profileKeyOf("nope", CATS)).toBe("general");
    expect(profileKeyOf(null, CATS)).toBe("general");
  });
  it("falls back to a built-in general profile when profiles are not loaded", () => {
    expect(profileOf("perf", CATS, [])).toEqual(GENERAL_PROFILE);
    expect(profileOf("perf", CATS, PROFILES).key).toBe("perfume");
  });
  it("collects a category's subtree", () => {
    expect(descendantIds(CATS, "men").sort()).toEqual(["men", "shirts", "tees"]);
  });
});

describe("listing filters", () => {
  it("perfumes have no size or colour filters", () => {
    const f = listingFilters(profileOf("perf", CATS, PROFILES));
    expect(f).not.toContain("size");
    expect(f).not.toContain("color");
    expect(f).toEqual(expect.arrayContaining(["concentration", "volume"]));
  });
  it("accessories have no clothing sizes but a type filter", () => {
    const f = listingFilters(profileOf("watches", CATS, PROFILES));
    expect(f).not.toContain("size");
    expect(f).toContain("type");
  });
  it("search and 'all products' only offer the universal filters", () => {
    expect(listingFilters(null)).toEqual(UNIVERSAL_FILTERS);
  });
  it("switching category drops filters the new category doesn't offer", () => {
    const fromShirts = {
      size: "M",
      color: "Red",
      brand: "A",
      minPrice: 10,
      sort: "price_asc" as const,
    };
    expect(pruneFilters(fromShirts, listingFilters(profileOf("perf", CATS, PROFILES)))).toEqual({
      brand: "A",
      minPrice: 10,
      sort: "price_asc",
    });
    expect(
      pruneFilters(
        { concentration: "EDP", volume: 100 },
        listingFilters(profileOf("men", CATS, PROFILES)),
      ),
    ).toEqual({});
  });
});

describe("URL state", () => {
  it("round-trips through search params", () => {
    const s = {
      minPrice: 100,
      maxPrice: 500,
      brand: "A",
      discounted: true,
      inStock: true,
      size: "M",
      color: "Red",
      sort: "popular" as const,
    };
    expect(parseListSearch(toListSearch(s) as Record<string, unknown>)).toEqual(s);
  });
  it("ignores malformed values and the default sort", () => {
    expect(parseListSearch({ min: "abc", max: "-5", sort: "evil", stock: "0", vol: "50" })).toEqual(
      { volume: 50 },
    );
    expect(toListSearch({ sort: "newest" }).sort).toBeUndefined();
  });
  it("builds the SQL filter object without empty keys", () => {
    expect(toCatalogQuery({ q: "  ", categoryIds: [] }, {})).toEqual({});
    expect(toCatalogQuery({ categoryIds: ["a"] }, { size: "M", inStock: true }, ["b"])).toEqual({
      category_ids: ["a"],
      type_ids: ["b"],
      size: "M",
      in_stock: true,
    });
  });
});
