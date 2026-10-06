import { useMemo, useState } from "react";
import { Link } from "@tanstack/react-router";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { useCart } from "@/lib/cart";
import { useI18n } from "@/lib/i18n";
import { formatMoney } from "@/lib/format";
import { sizeLabel } from "@/lib/fashion";
import { cn } from "@/lib/utils";
import type { AssistantProduct } from "@/lib/assistant-types";

type Props = { p: AssistantProduct; sym: { ar?: string | null; en?: string | null }; onNavigate: () => void };

/** Product recommendation card with inline size/color picking and add-to-cart. */
export function AssistantProductCard({ p, sym, onNavigate }: Props) {
  const { lang } = useI18n();
  const cart = useCart();
  const ar = lang === "ar";
  const colors = useMemo(() => {
    const m = new Map<string, { ar: string | null; en: string | null; hex: string | null }>();
    p.variants.forEach((v) => m.set(v.color_en ?? v.color_ar ?? "", { ar: v.color_ar, en: v.color_en, hex: v.color_hex }));
    return [...m.entries()].filter(([k]) => k);
  }, [p.variants]);
  const [color, setColor] = useState<string | null>(colors.length === 1 ? colors[0][0] : null);
  const sizes = [...new Set(p.variants.filter((v) => !color || (v.color_en ?? v.color_ar) === color).map((v) => v.size).filter(Boolean))] as string[];
  const [size, setSize] = useState<string | null>(null);

  const variant = p.has_variants
    ? p.variants.find(
        (v) => (colors.length === 0 || (v.color_en ?? v.color_ar) === color) && (sizes.length === 0 || v.size === size),
      )
    : null;
  const canAdd = p.in_stock && (!p.has_variants || !!variant);

  const add = () => {
    cart.add({
      productId: p.id,
      variantId: variant?.id ?? null,
      name_ar: p.name_ar,
      name_en: p.name_en,
      image: p.image,
      price: variant?.price ?? p.price,
      size: variant?.size ?? null,
      color_ar: variant?.color_ar ?? null,
      color_en: variant?.color_en ?? null,
      color_hex: variant?.color_hex ?? null,
      maxQty: variant?.stock ?? p.stock,
    });
    toast.success(ar ? "اتضاف للسلة" : "Added to cart");
  };

  return (
    <div className="space-y-2 rounded-xl border bg-card p-2">
      <div className="flex items-center gap-2">
        {p.image ? <img src={p.image} alt="" className="h-14 w-14 rounded-lg object-cover" /> : <div className="h-14 w-14 rounded-lg bg-muted" />}
        <div className="min-w-0 flex-1">
          <div className="truncate text-sm font-semibold">{ar ? p.name_ar : p.name_en}</div>
          <div className="text-xs text-muted-foreground">{formatMoney(variant?.price ?? p.price, lang, sym)}</div>
        </div>
      </div>
      {colors.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {colors.map(([k, c]) => (
            <button
              key={k}
              type="button"
              onClick={() => { setColor(k); setSize(null); }}
              title={(ar ? c.ar : c.en) ?? k}
              aria-label={(ar ? c.ar : c.en) ?? k}
              className={cn("h-6 w-6 rounded-full border-2", color === k ? "border-primary" : "border-border")}
              style={{ background: c.hex ?? undefined }}
            />
          ))}
        </div>
      )}
      {sizes.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {sizes.map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => setSize(s)}
              className={cn("rounded-md border px-2 py-0.5 text-xs", size === s ? "border-primary bg-primary text-primary-foreground" : "hover:bg-accent")}
            >
              {sizeLabel(s, lang)}
            </button>
          ))}
        </div>
      )}
      <div className="grid grid-cols-2 gap-2">
        <Button size="sm" variant="outline" asChild>
          <Link to="/product/$id" params={{ id: p.id }} onClick={onNavigate}>{ar ? "عرض المنتج" : "View product"}</Link>
        </Button>
        <Button size="sm" disabled={!canAdd} onClick={add}>
          {p.has_variants && !variant ? (ar ? "اختار المقاس" : "Pick size") : ar ? "أضف للسلة" : "Add to cart"}
        </Button>
      </div>
    </div>
  );
}
