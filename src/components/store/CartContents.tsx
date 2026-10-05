import { Link } from "@tanstack/react-router";
import { ShoppingBasket, Trash2 } from "lucide-react";
import { useI18n } from "@/lib/i18n";
import { useCart } from "@/lib/cart";
import { useSettings } from "@/lib/store-settings";
import { deliveryFeeFor } from "@/lib/format";
import { sizeLabel } from "@/lib/fashion";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useMoney } from "./use-money";
import { QtyStepper } from "./QtyStepper";
import { ProductImage } from "./ProductCard";
import { EmptyState } from "./states";

export function CartLines({ editableNotes = true, onNavigate }: { editableNotes?: boolean; onNavigate?: () => void }) {
  const { tx, t } = useI18n();
  const cart = useCart();
  const money = useMoney();
  if (cart.items.length === 0)
    return (
      <EmptyState icon={<ShoppingBasket className="h-8 w-8" />} title={t("cart_empty")} hint={t("cart_empty_hint")}
        action={<Button asChild onClick={onNavigate}><Link to="/products">{t("start_shopping")}</Link></Button>} />
    );
  return (
    <ul className="divide-y">
      {cart.items.map((i) => (
        <li key={i.key} className="flex gap-3 py-3">
          <ProductImage src={i.image} alt="" className="h-20 w-20 shrink-0 rounded-xl" />
          <div className="min-w-0 flex-1 space-y-2">
            <div className="flex items-start justify-between gap-2">
              <div>
                <p className="line-clamp-2 text-sm font-semibold">{tx(i, "name")}</p>
                <VariantLine size={i.size} colorName={tx(i, "color")} hex={i.color_hex} fallback={tx(i, "variant")} />
              </div>
              <button aria-label={t("remove")} onClick={() => cart.remove(i.key)} className="text-muted-foreground hover:text-destructive">
                <Trash2 className="h-4 w-4" />
              </button>
            </div>
            <div className="flex items-center justify-between gap-2">
              <div className="w-36"><QtyStepper size="sm" qty={i.quantity} max={i.maxQty} onChange={(q) => cart.setQty(i.key, q)} /></div>
              <span className="font-bold">{money(i.price * i.quantity)}</span>
            </div>
            {editableNotes && (
              <Input value={i.notes ?? ""} maxLength={300} onChange={(e) => cart.setNotes(i.key, e.target.value)} placeholder={t("item_note")} className="h-8 text-xs" />
            )}
          </div>
        </li>
      ))}
    </ul>
  );
}

export function CartTotals({ discount = 0 }: { discount?: number }) {
  const { t } = useI18n();
  const cart = useCart();
  const { settings } = useSettings();
  const money = useMoney();
  const fee = deliveryFeeFor(cart.subtotal, Number(settings?.delivery_fee ?? 0), settings?.free_delivery_threshold != null ? Number(settings.free_delivery_threshold) : null);
  const min = Number(settings?.min_order_amount ?? 0);
  return (
    <div className="space-y-2 text-sm">
      <Row label={t("subtotal")} value={money(cart.subtotal)} />
      <Row label={t("delivery_fee")} value={fee === 0 ? t("free") : money(fee)} />
      {discount > 0 && <Row label={t("discount")} value={`- ${money(discount)}`} className="text-success" />}
      <div className="flex justify-between border-t pt-2 text-base font-extrabold">
        <span>{t("total")}</span><span>{money(cart.subtotal + fee - discount)}</span>
      </div>
      {cart.subtotal < min && (
        <p className="rounded-lg bg-brand-secondary/20 px-3 py-2 text-xs">{t("min_order_note")}: {money(min)}</p>
      )}
      {settings?.free_delivery_threshold != null && fee > 0 && (
        <p className="text-xs text-muted-foreground">{t("free_delivery_over")} {money(settings.free_delivery_threshold)}</p>
      )}
    </div>
  );
}

function Row({ label, value, className }: { label: string; value: string; className?: string }) {
  return <div className={`flex justify-between ${className ?? ""}`}><span className="text-muted-foreground">{label}</span><span className="font-semibold">{value}</span></div>;
}

/** "M · ● Black" line for cart / order items. */
export function VariantLine({ size, colorName, hex, fallback }: { size?: string | null; colorName?: string; hex?: string | null; fallback?: string }) {
  const { t, lang } = useI18n();
  if (!size && !colorName) return fallback ? <p className="text-xs text-muted-foreground">{fallback}</p> : null;
  return (
    <p className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
      {size && <span>{t("size")}: <b className="text-foreground">{sizeLabel(size, lang)}</b></span>}
      {colorName && <span className="flex items-center gap-1">{hex && <span className="inline-block h-3 w-3 rounded-full border" style={{ background: hex }} />}{colorName}</span>}
    </p>
  );
}
