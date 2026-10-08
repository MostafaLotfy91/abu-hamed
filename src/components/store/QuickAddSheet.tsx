import { useMemo, useState } from "react";
import { Link } from "@tanstack/react-router";
import { toast } from "sonner";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { useI18n } from "@/lib/i18n";
import { useCart } from "@/lib/cart";
import { useIsMobile } from "@/hooks/use-mobile";
import { sizeLabel, sortSizes } from "@/lib/fashion";
import type { Product } from "@/lib/queries";
import { cn } from "@/lib/utils";
import { useMoney } from "./use-money";

/** Size/colour picker for the product card's quick-add: bottom sheet on mobile, side panel on desktop. */
export function QuickAddSheet({
  p,
  price,
  open,
  onOpenChange,
}: {
  p: Product;
  price: number;
  open: boolean;
  onOpenChange: (o: boolean) => void;
}) {
  const { t, tx, lang } = useI18n();
  const money = useMoney();
  const cart = useCart();
  const mobile = useIsMobile();
  const variants = useMemo(
    () => (p.product_variants ?? []).filter((v) => v.is_active !== false),
    [p.product_variants],
  );
  const colors = useMemo(() => {
    const m = new Map<string, (typeof variants)[number]>();
    variants.forEach((v) => v.color_en && !m.has(v.color_en) && m.set(v.color_en, v));
    return [...m.values()];
  }, [variants]);
  const [color, setColor] = useState<string | null>(colors[0]?.color_en ?? null);
  const [size, setSize] = useState<string | null>(null);
  const forColor = variants.filter((v) => !color || v.color_en === color);
  const sizes = sortSizes([...new Set(forColor.map((v) => v.size).filter(Boolean) as string[])]);
  const chosen = forColor.find((v) => (sizes.length ? v.size === size : true));
  const stock = Number(chosen?.stock ?? 0);

  const add = () => {
    if (!chosen) return;
    cart.add({
      productId: p.id,
      variantId: chosen.id,
      name_ar: p.name_ar,
      name_en: p.name_en,
      size: chosen.size,
      color_ar: chosen.color_ar,
      color_en: chosen.color_en,
      color_hex: chosen.color_hex,
      image: p.images?.[0],
      maxQty: stock,
      price: Number(chosen.price ?? price),
    });
    toast.success(t("added_to_cart"));
    onOpenChange(false);
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side={mobile ? "bottom" : lang === "ar" ? "left" : "right"}
        className={cn(
          "flex flex-col gap-5",
          mobile ? "max-h-[85vh] rounded-t-lg" : "w-full sm:max-w-sm",
        )}
      >
        <SheetHeader className="pe-10 text-start">
          <SheetTitle className="text-base font-bold">{t("select_size_color")}</SheetTitle>
        </SheetHeader>
        <div className="flex gap-3 px-4">
          <img
            src={p.thumbnails?.[0] ?? p.images?.[0]}
            alt=""
            className="aspect-[4/5] w-20 rounded-md bg-muted object-cover"
          />
          <div className="min-w-0">
            <p className="line-clamp-2 text-sm font-semibold">{tx(p, "name")}</p>
            <p className="mt-1 font-bold">{money(chosen?.price ?? price)}</p>
          </div>
        </div>
        {colors.length > 0 && (
          <div className="px-4">
            <p className="mb-2 text-xs font-semibold text-muted-foreground">
              {tx(colors.find((c) => c.color_en === color) ?? null, "color")}
            </p>
            <div className="flex flex-wrap gap-2">
              {colors.map((c) => (
                <button
                  key={c.color_en}
                  onClick={() => {
                    setColor(c.color_en!);
                    setSize(null);
                  }}
                  aria-label={tx(c, "color")}
                  className={cn(
                    "h-11 w-11 rounded-full border p-1 transition",
                    color === c.color_en ? "border-foreground" : "border-border",
                  )}
                >
                  <span
                    className="block h-full w-full rounded-full border border-border"
                    style={{ background: c.color_hex ?? undefined }}
                  />
                </button>
              ))}
            </div>
          </div>
        )}
        {sizes.length > 0 && (
          <div className="px-4">
            <div className="grid grid-cols-4 gap-2">
              {sizes.map((s) => {
                const v = forColor.find((x) => x.size === s);
                const out = Number(v?.stock ?? 0) <= 0;
                return (
                  <button
                    key={s}
                    disabled={out}
                    onClick={() => setSize(s)}
                    className={cn(
                      "h-11 rounded-md border text-sm font-semibold transition disabled:cursor-not-allowed disabled:text-muted-foreground disabled:line-through",
                      size === s
                        ? "border-foreground bg-foreground text-background"
                        : "border-border hover:border-foreground",
                    )}
                  >
                    {sizeLabel(s, lang)}
                  </button>
                );
              })}
            </div>
          </div>
        )}
        <div className="mt-auto grid gap-2 p-4">
          <Button
            size="lg"
            className="h-12"
            disabled={!chosen || stock <= 0 || (sizes.length > 0 && !size)}
            onClick={add}
          >
            {t("add")}
          </Button>
          <Link
            to="/product/$id"
            params={{ id: p.id }}
            onClick={() => onOpenChange(false)}
            className="py-2 text-center text-sm font-semibold underline underline-offset-4"
          >
            {t("view_details")}
          </Link>
        </div>
      </SheetContent>
    </Sheet>
  );
}
