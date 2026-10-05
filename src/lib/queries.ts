import { supabase } from "@/integrations/supabase/client";
import type { Tables } from "@/integrations/supabase/types";

export type Product = Tables<"products">;
export type Category = Tables<"categories">;
export type Banner = Tables<"banners">;

export const PRODUCT_FIELDS =
  "id,category_id,name_ar,name_en,brand,price,old_price,flash_price,flash_ends_at,unit,step,min_qty,stock,images,rating_avg,rating_count,sold_count,created_at,is_active,is_featured,description_ar,description_en,sku,updated_at";

export async function fetchCategories() {
  const { data, error } = await supabase.from("categories").select("*").order("sort_order");
  if (error) throw error;
  return data;
}

export async function fetchBanners() {
  const { data, error } = await supabase.from("banners").select("*").eq("is_active", true).order("sort_order");
  if (error) throw error;
  return data;
}

export async function fetchProductsHome(kind: "flash" | "best" | "new") {
  let q = supabase.from("products").select(PRODUCT_FIELDS).eq("is_active", true).limit(12);
  if (kind === "flash") q = q.not("flash_price", "is", null).gt("flash_ends_at", new Date().toISOString()).order("flash_ends_at");
  if (kind === "best") q = q.order("sold_count", { ascending: false });
  if (kind === "new") q = q.order("created_at", { ascending: false });
  const { data, error } = await q;
  if (error) throw error;
  return data as Product[];
}

/** Collects a category and all descendants (unlimited depth via parent_id). */
export function descendantIds(all: Category[], rootId: string) {
  const out = [rootId];
  for (let i = 0; i < out.length; i++) {
    for (const c of all) if (c.parent_id === out[i]) out.push(c.id);
  }
  return out;
}

export type ListFilters = {
  q?: string;
  categoryIds?: string[];
  minPrice?: number;
  maxPrice?: number;
  brand?: string;
  discounted?: boolean;
  inStock?: boolean;
  sort?: "newest" | "price_asc" | "price_desc" | "popular";
};

export const PAGE_SIZE = 20;

export async function fetchProductPage(f: ListFilters, page: number) {
  let q = supabase.from("products").select(PRODUCT_FIELDS).eq("is_active", true);
  if (f.q) {
    const s = f.q.replace(/[%,()]/g, " ").trim();
    q = q.or(`name_ar.ilike.%${s}%,name_en.ilike.%${s}%,brand.ilike.%${s}%`);
  }
  if (f.categoryIds?.length) q = q.in("category_id", f.categoryIds);
  if (f.minPrice != null) q = q.gte("price", f.minPrice);
  if (f.maxPrice != null) q = q.lte("price", f.maxPrice);
  if (f.brand) q = q.eq("brand", f.brand);
  if (f.discounted) q = q.or(`old_price.not.is.null,flash_ends_at.gt.${new Date().toISOString()}`);
  if (f.inStock) q = q.gt("stock", 0);
  switch (f.sort) {
    case "price_asc": q = q.order("price", { ascending: true }); break;
    case "price_desc": q = q.order("price", { ascending: false }); break;
    case "popular": q = q.order("sold_count", { ascending: false }); break;
    default: q = q.order("created_at", { ascending: false });
  }
  const from = page * PAGE_SIZE;
  const { data, error } = await q.range(from, from + PAGE_SIZE - 1);
  if (error) throw error;
  return data as Product[];
}

export async function fetchBrands() {
  const { data } = await supabase.from("products").select("brand").eq("is_active", true).not("brand", "is", null);
  return Array.from(new Set((data ?? []).map((r) => r.brand as string))).sort();
}

/** Uploads to the store-media bucket and returns a long-lived URL. */
export async function uploadMedia(file: File, folder: string) {
  const ext = file.name.split(".").pop() || "jpg";
  const path = `${folder}/${crypto.randomUUID()}.${ext}`;
  const { error } = await supabase.storage.from("store-media").upload(path, file, { upsert: false, contentType: file.type });
  if (error) throw error;
  const { data, error: e2 } = await supabase.storage.from("store-media").createSignedUrl(path, 60 * 60 * 24 * 365 * 10);
  if (e2) throw e2;
  return data.signedUrl;
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
    cannot_cancel: ["لا يمكن إلغاء الطلب الآن", "This order can no longer be cancelled"],
  };
  const hit = Object.keys(map).find((k) => msg.includes(k));
  return hit ? map[hit][lang === "ar" ? 0 : 1] : msg;
}
