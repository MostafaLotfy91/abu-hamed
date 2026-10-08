/**
 * Category profiles (product_profiles table) and listing filters. Pure functions, unit-tested.
 * A category uses its own profile, else its nearest ancestor's, else "general".
 */

export type FilterKey =
  | "size"
  | "color"
  | "brand"
  | "gender"
  | "season"
  | "concentration"
  | "volume"
  | "material"
  | "type"
  | "price"
  | "discount"
  | "in_stock";
export type FieldKey =
  "gender" | "season" | "material" | "care" | "notes" | "volume" | "concentration";

export type Profile = {
  key: string;
  name_ar: string;
  name_en: string;
  filters: FilterKey[];
  fields: FieldKey[];
  sizes: string[] | null;
  size_guide: "clothes" | "shoes" | "kids" | null;
};

type CategoryNode = { id: string; parent_id: string | null; profile?: string | null };

export const ALL_FILTERS: FilterKey[] = [
  "size",
  "color",
  "brand",
  "gender",
  "season",
  "concentration",
  "volume",
  "material",
  "type",
  "price",
  "discount",
  "in_stock",
];

/** Filters that make sense everywhere (search results, "all products", unknown categories). */
export const UNIVERSAL_FILTERS: FilterKey[] = ["brand", "price", "discount", "in_stock"];

/** Used until profiles load or when the table is missing a key: universal filters only, no sizes. */
export const GENERAL_PROFILE: Profile = {
  key: "general",
  name_ar: "عام",
  name_en: "General",
  filters: UNIVERSAL_FILTERS,
  fields: ["gender", "material"],
  sizes: null,
  size_guide: null,
};

/** Effective profile key of a category (own, nearest ancestor's, or "general"). Mirrors SQL category_profile(). */
export function profileKeyOf(
  categoryId: string | null | undefined,
  categories: CategoryNode[],
): string {
  const byId = new Map(categories.map((c) => [c.id, c]));
  let cur = categoryId ? byId.get(categoryId) : undefined;
  for (let depth = 0; cur && depth < 10; depth++) {
    if (cur.profile) return cur.profile;
    cur = cur.parent_id ? byId.get(cur.parent_id) : undefined;
  }
  return "general";
}

export function profileOf(
  categoryId: string | null | undefined,
  categories: CategoryNode[],
  profiles: Profile[],
): Profile {
  const key = profileKeyOf(categoryId, categories);
  return (
    profiles.find((p) => p.key === key) ??
    profiles.find((p) => p.key === "general") ??
    GENERAL_PROFILE
  );
}

/** All ids in a category's subtree (itself included). */
export function descendantIds(categories: CategoryNode[], rootId: string): string[] {
  const out = [rootId];
  for (let i = 0; i < out.length; i++)
    for (const c of categories) if (c.parent_id === out[i] && !out.includes(c.id)) out.push(c.id);
  return out;
}

/** Filters shown on a listing: the category profile's, or only the universal ones for search / all products. */
export function listingFilters(profile: Profile | null): FilterKey[] {
  return profile ? profile.filters : UNIVERSAL_FILTERS;
}

/** Listing filter state (what the URL stores). */
export type ListState = {
  minPrice?: number;
  maxPrice?: number;
  brand?: string;
  discounted?: boolean;
  inStock?: boolean;
  gender?: string;
  size?: string;
  color?: string;
  season?: string;
  concentration?: string;
  volume?: number;
  material?: string;
  type?: string;
  sort?: "newest" | "price_asc" | "price_desc" | "popular";
};

const FILTER_OF: Record<Exclude<keyof ListState, "sort">, FilterKey> = {
  minPrice: "price",
  maxPrice: "price",
  brand: "brand",
  discounted: "discount",
  inStock: "in_stock",
  gender: "gender",
  size: "size",
  color: "color",
  season: "season",
  concentration: "concentration",
  volume: "volume",
  material: "material",
  type: "type",
};

/** Drops filter values the current listing doesn't offer (e.g. a size filter after moving to perfumes). */
export function pruneFilters(state: ListState, allowed: FilterKey[]): ListState {
  const out: ListState = {};
  for (const [k, v] of Object.entries(state) as [keyof ListState, unknown][]) {
    if (v === undefined || v === null || v === "") continue;
    if (k === "sort" || allowed.includes(FILTER_OF[k])) (out as Record<string, unknown>)[k] = v;
  }
  return out;
}

const SORTS = ["newest", "price_asc", "price_desc", "popular"] as const;
const num = (v: unknown) => {
  const n = typeof v === "number" ? v : typeof v === "string" && v.trim() !== "" ? Number(v) : NaN;
  return Number.isFinite(n) && n >= 0 ? n : undefined;
};
const str = (v: unknown) =>
  typeof v === "string" && v.trim() !== "" && v.length <= 100 ? v.trim() : undefined;
const bool = (v: unknown) => (v === true || v === "1" || v === "true" ? true : undefined);

/** Parses URL search params into a listing state, ignoring anything malformed. */
export function parseListSearch(search: Record<string, unknown>): ListState {
  const s: ListState = {
    minPrice: num(search.min),
    maxPrice: num(search.max),
    brand: str(search.brand),
    discounted: bool(search.discount),
    inStock: bool(search.stock),
    gender: str(search.gender),
    size: str(search.size),
    color: str(search.color),
    season: str(search.season),
    concentration: str(search.conc),
    volume: num(search.vol),
    material: str(search.material),
    type: str(search.type),
    sort: SORTS.includes(search.sort as (typeof SORTS)[number])
      ? (search.sort as ListState["sort"])
      : undefined,
  };
  return Object.fromEntries(Object.entries(s).filter(([, v]) => v !== undefined)) as ListState;
}

/** Inverse of parseListSearch (short keys, defaults omitted) so filters survive reloads and shared links. */
export function toListSearch(s: ListState): Record<string, string | number | undefined> {
  return {
    min: s.minPrice,
    max: s.maxPrice,
    brand: s.brand,
    discount: s.discounted ? "1" : undefined,
    stock: s.inStock ? "1" : undefined,
    gender: s.gender,
    size: s.size,
    color: s.color,
    season: s.season,
    conc: s.concentration,
    vol: s.volume,
    material: s.material,
    type: s.type,
    sort: s.sort && s.sort !== "newest" ? s.sort : undefined,
  };
}

/** The jsonb filter object for the catalog_* SQL functions. */
export function toCatalogQuery(
  base: { q?: string; categoryIds?: string[] },
  s: ListState,
  typeIds?: string[],
) {
  const f: Record<string, unknown> = {
    q: base.q?.trim() || undefined,
    category_ids: base.categoryIds?.length ? base.categoryIds : undefined,
    type_ids: typeIds?.length ? typeIds : undefined,
    min_price: s.minPrice,
    max_price: s.maxPrice,
    brand: s.brand,
    gender: s.gender,
    season: s.season,
    concentration: s.concentration,
    volume: s.volume,
    material: s.material,
    size: s.size,
    color: s.color,
    discounted: s.discounted || undefined,
    in_stock: s.inStock || undefined,
  };
  return Object.fromEntries(Object.entries(f).filter(([, v]) => v !== undefined));
}
