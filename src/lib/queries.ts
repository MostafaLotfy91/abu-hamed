import { supabase } from "@/integrations/supabase/client";
import type { Json, Tables } from "@/integrations/supabase/types";
import {
  descendantIds as descendantsOf,
  toCatalogQuery,
  type ListState,
  type Profile,
} from "@/lib/catalog";
import { assertImageFile, toWebp } from "@/lib/image-compress";

export type Product = Tables<"products"> & {
  product_variants?: {
    id: string;
    size?: string | null;
    color_hex?: string | null;
    color_ar?: string | null;
    color_en?: string | null;
    stock?: number;
    is_active?: boolean;
    price?: number | null;
  }[];
};
export type Category = Tables<"categories">;
export type Banner = Tables<"banners">;

export const PRODUCT_FIELDS =
  "id,category_id,name_ar,name_en,brand,price,old_price,flash_price,flash_ends_at,stock,size_type,gender,season,images,rating_avg,rating_count,sold_count,created_at,is_active,is_featured,description_ar,description_en,sku,updated_at,thumbnails,product_variants(id,size,color_hex,color_ar,color_en,stock,is_active,price)";

export async function fetchCategories() {
  const { data, error } = await supabase.from("categories").select("*").order("sort_order");
  if (error) throw error;
  return data;
}

export async function fetchBanners() {
  const { data, error } = await supabase
    .from("banners")
    .select("*")
    .eq("is_active", true)
    .order("sort_order");
  if (error) throw error;
  return data;
}

export async function fetchProductsHome(kind: "flash" | "best" | "new" | "season") {
  let q = supabase.from("products").select(PRODUCT_FIELDS).eq("is_active", true).limit(12);
  if (kind === "flash")
    q = q
      .not("flash_price", "is", null)
      .gt("flash_ends_at", new Date().toISOString())
      .order("flash_ends_at");
  if (kind === "best") q = q.order("sold_count", { ascending: false });
  if (kind === "new") q = q.order("created_at", { ascending: false });
  if (kind === "season") {
    const m = new Date().getMonth();
    const season = m >= 3 && m <= 8 ? "summer" : "winter";
    q = q.eq("season", season).order("sold_count", { ascending: false });
  }
  const { data, error } = await q;
  if (error) throw error;
  return data as unknown as Product[];
}

/** Collects a category and all descendants (unlimited depth via parent_id). */
export function descendantIds(all: Category[], rootId: string) {
  return descendantsOf(all, rootId);
}

/** What a listing shows: a base scope (search text or category subtree) plus the user's filters. */
export type ListFilters = { q?: string; categoryIds?: string[] } & ListState;

export const PAGE_SIZE = 20;

/** Matching products, ordered and paged by the catalog_search SQL function (same rules as the count and options). */
export async function fetchProductPage(f: ListFilters, page: number, typeIds?: string[]) {
  const { data, error } = await supabase
    .rpc("catalog_search", {
      f: toCatalogQuery(f, f, typeIds) as Json,
      _sort: f.sort ?? "newest",
      _limit: PAGE_SIZE,
      _offset: page * PAGE_SIZE,
    })
    .select(PRODUCT_FIELDS);
  if (error) throw error;
  return data as unknown as Product[];
}

export async function fetchProductCount(f: ListFilters, typeIds?: string[]) {
  const { data, error } = await supabase.rpc("catalog_count", {
    f: toCatalogQuery(f, f, typeIds) as Json,
  });
  if (error) throw error;
  return data ?? 0;
}

export type FilterOptions = Omit<Facets, "volumes"> & {
  volumes: { value: number; count: number }[];
  materials: { value: string; en: string | null; count: number }[];
  categories: { value: string; count: number }[];
  discounted: number;
  in_stock: number;
  price: { min: number | null; max: number | null };
};
export const EMPTY_OPTIONS: FilterOptions = {
  sizes: [],
  colors: [],
  brands: [],
  genders: [],
  seasons: [],
  concentrations: [],
  volumes: [],
  materials: [],
  categories: [],
  discounted: 0,
  in_stock: 0,
  price: { min: null, max: null },
};

/** Filter values present in the current result set, each counted with the other active filters applied. */
export async function fetchFilterOptions(
  f: ListFilters,
  typeIds?: string[],
): Promise<FilterOptions> {
  const { data, error } = await supabase.rpc("catalog_filter_options", {
    f: toCatalogQuery(f, f, typeIds) as Json,
  });
  if (error) throw error;
  return { ...EMPTY_OPTIONS, ...((data ?? {}) as Partial<FilterOptions>) };
}

export async function fetchProfiles(): Promise<Profile[]> {
  const { data, error } = await supabase.from("product_profiles").select("*").order("sort_order");
  if (error) throw error;
  return (data ?? []) as unknown as Profile[];
}
export const profilesQuery = {
  queryKey: ["product_profiles"],
  queryFn: fetchProfiles,
  staleTime: 10 * 60_000,
};

export type Facet = { value: string; count: number };
export type ColorFacet = { en: string; ar: string | null; hex: string | null; count: number };
/** What actually exists on active products (and variants) in scope, with product counts. */
export type Facets = {
  sizes: Facet[];
  colors: ColorFacet[];
  brands: Facet[];
  genders: Facet[];
  seasons: Facet[];
  concentrations: Facet[];
  volumes: { value: number; count: number }[];
};
export const EMPTY_FACETS: Facets = {
  sizes: [],
  colors: [],
  brands: [],
  genders: [],
  seasons: [],
  concentrations: [],
  volumes: [],
};

/** Filter options derived from the catalogue (catalog_facets RPC); nothing is hardcoded. */
export async function fetchFacets(categoryIds?: string[]): Promise<Facets> {
  const { data, error } = await supabase.rpc("catalog_facets", {
    _category_ids: categoryIds?.length ? categoryIds : null,
  });
  if (error) throw error;
  return { ...EMPTY_FACETS, ...((data ?? {}) as Partial<Facets>) };
}

/** Validates, resizes to WebP and uploads to the public store-media bucket; returns its public URL. */
export async function uploadMedia(file: File, folder: string) {
  assertImageFile(file);
  const webp = await toWebp(file, folder === "banners" ? 2400 : 1600);
  const path = `${folder}/${crypto.randomUUID()}.webp`;
  const bucket = supabase.storage.from("store-media");
  const { error } = await bucket.upload(path, webp, { upsert: false, contentType: "image/webp" });
  if (error) throw error;
  return bucket.getPublicUrl(path).data.publicUrl;
}

export function rpcErrorMessage(msg: string, lang: "ar" | "en") {
  const map: Record<string, [string, string]> = {
    out_of_stock: ["بعض المنتجات غير متوفرة بالكمية المطلوبة", "Some items are out of stock"],
    below_min_order: ["الطلب أقل من الحد الأدنى", "Order is below the minimum amount"],
    invalid_coupon: ["كود الخصم غير صالح", "Invalid coupon"],
    invalid_address: ["اختر عنوان توصيل", "Please choose a delivery address"],
    product_unavailable: ["منتج في السلة لم يعد متاحاً", "An item is no longer available"],
    empty_cart: ["السلة فاضية", "Cart is empty"],
    payment_unavailable: ["الدفع الأونلاين غير متاح", "Online payment unavailable"],
    variant_required: ["اختار المقاس واللون الأول", "Please choose a size and color"],
    variant_unavailable: [
      "المقاس أو اللون المختار لم يعد متاحاً",
      "The selected size/color is no longer available",
    ],
    invalid_quantity: ["الكمية غير صحيحة", "Invalid quantity"],
    not_returnable: ["لا يمكن طلب استرجاع لهذا الطلب", "This order can't be returned"],
    return_window_closed: ["انتهت مدة الاسترجاع", "The return window has closed"],
    already_requested: [
      "تم تقديم طلب لهذا المنتج بالفعل",
      "A request already exists for this item",
    ],
    reason_required: ["اكتب سبب الطلب", "Please enter a reason"],
    cannot_cancel: ["لا يمكن إلغاء الطلب الآن", "This order can no longer be cancelled"],
  };
  const hit = Object.keys(map).find((k) => msg.includes(k));
  return hit ? map[hit][lang === "ar" ? 0 : 1] : msg;
}
