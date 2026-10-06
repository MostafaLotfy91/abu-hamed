import { Link, useNavigate } from "@tanstack/react-router";
import { ImageOff, Plus, Star } from "lucide-react";
import { toast } from "sonner";
import { useI18n } from "@/lib/i18n";
import { useCart } from "@/lib/cart";
import { effectivePrice } from "@/lib/format";
import type { Product } from "@/lib/queries";
import { useMoney } from "./use-money";
import { QtyStepper } from "./QtyStepper";

export function ProductImage({ src, alt, className }: { src?: string | null; alt: string; className?: string }) {
  if (!src)
    return (
      <div className={`flex items-center justify-center bg-muted text-muted-foreground ${className ?? ""}`}>
        <ImageOff className="h-8 w-8" />
      </div>
    );
  return <img src={src} alt={alt} loading="lazy" className={`object-cover ${className ?? ""}`} />;
}

export function ProductCard({ p }: { p: Product }) {
  const { t, tx } = useI18n();
  const money = useMoney();
  const cart = useCart();
  const { current, was, pct } = effectivePrice(p);
  const name = tx(p, "name");
  const stock = Number(p.stock);
  const qty = cart.qtyOf(p.id);
  const hasVariants = (p.product_variants?.length ?? 0) > 0;
  const navigate = useNavigate();

  const addToCart = () => {
    if (hasVariants) return navigate({ to: "/product/$id", params: { id: p.id } });
    cart.add({ productId: p.id, variantId: null, name_ar: p.name_ar, name_en: p.name_en, image: p.images?.[0], maxQty: stock, price: current });
    toast.success(t("added_to_cart"));
  };

  return (
    <div className="group flex flex-col overflow-hidden rounded-2xl bg-card p-2 shadow-card transition hover:-translate-y-0.5">
      <Link to="/product/$id" params={{ id: p.id }} className="relative block">
        <ProductImage src={(p as any).thumbnails?.[0] ?? p.images?.[0]} alt={name} className="aspect-square w-full rounded-xl" />
        {pct > 0 && (
          <span className="absolute start-2 top-2 rounded-full bg-deal px-2 py-0.5 text-xs font-bold text-deal-foreground">-{pct}%</span>
        )}
        {stock <= 0 && (
          <span className="absolute inset-0 flex items-center justify-center rounded-xl bg-background/70 text-sm font-bold">{t("out_of_stock")}</span>
        )}
      </Link>
      <div className="flex flex-1 flex-col px-1 pt-2">
        <Link to="/product/$id" params={{ id: p.id }} className="line-clamp-2 min-h-[2.5rem] text-sm font-semibold leading-5">
          {name}
        </Link>
        {Number(p.rating_count) > 0 && (
          <div className="mt-1 flex items-center gap-1 text-xs text-muted-foreground">
            <Star className="h-3 w-3 fill-brand-secondary text-brand-secondary" />
            {Number(p.rating_avg).toFixed(1)} ({p.rating_count})
          </div>
        )}
        <div className="mt-1 flex flex-wrap items-baseline gap-x-2">
          <span className="font-extrabold text-primary">{money(current)}</span>
          {was && <span className="text-xs text-muted-foreground line-through">{money(was)}</span>}
        </div>
        <div className="mt-auto pt-2">
          {stock <= 0 ? (
            <div className="flex h-9 items-center justify-center rounded-xl bg-muted text-xs text-muted-foreground">{t("out_of_stock")}</div>
          ) : qty > 0 && !hasVariants ? (
            <QtyStepper size="sm" qty={qty} max={stock} onChange={(q) => cart.setQty(`${p.id}|`, q)} />
          ) : (
            <button onClick={addToCart} className="flex h-9 w-full items-center justify-center gap-1 rounded-xl bg-primary-soft text-sm font-bold text-primary transition hover:bg-primary hover:text-primary-foreground">
              {!hasVariants && <Plus className="h-4 w-4" />} {hasVariants ? t("choose_size") : t("add")}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
