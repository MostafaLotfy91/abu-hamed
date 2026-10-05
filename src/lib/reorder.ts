import { supabase } from "@/integrations/supabase/client";
import { effectivePrice } from "./format";
import type { useCart } from "./cart";

/** Re-adds an order's items using CURRENT prices/availability. Returns count added. */
export async function reorder(orderId: string, cart: ReturnType<typeof useCart>) {
  const { data: items } = await supabase.from("order_items").select("product_id,variant_id,quantity,notes").eq("order_id", orderId);
  const ids = (items ?? []).map((i) => i.product_id).filter(Boolean) as string[];
  if (!ids.length) return 0;
  const { data: prods } = await supabase.from("products").select("*, product_variants(*)").in("id", ids).eq("is_active", true);
  let n = 0;
  for (const it of items ?? []) {
    const p = prods?.find((x) => x.id === it.product_id);
    if (!p) continue;
    const v = it.variant_id ? p.product_variants.find((x) => x.id === it.variant_id && x.is_active) : null;
    if (it.variant_id && !v) continue;
    if (Number(v ? v.stock : p.stock) <= 0) continue;
    cart.add({
      productId: p.id, variantId: v?.id ?? null, name_ar: p.name_ar, name_en: p.name_en, variant_ar: v?.name_ar, variant_en: v?.name_en,
      image: p.images?.[0], unit: p.unit, step: Number(p.step), minQty: Number(p.min_qty), price: v ? Number(v.price) : effectivePrice(p).current,
    }, Number(it.quantity));
    n++;
  }
  return n;
}
