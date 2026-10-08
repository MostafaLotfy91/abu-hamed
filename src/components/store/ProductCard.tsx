import { useState, useCallback } from "react";
import { Link, useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Heart, ImageOff, Plus } from "lucide-react";
import { toast } from "sonner";
import { useI18n } from "@/lib/i18n";
import { useCart } from "@/lib/cart";
import { useAuth } from "@/lib/auth";
import { supabase } from "@/integrations/supabase/client";
import { countLabel, effectivePrice } from "@/lib/format";
import { LOW_STOCK } from "@/lib/fashion";
import type { Product } from "@/lib/queries";
import { cn } from "@/lib/utils";
import { useMoney } from "./use-money";
import { useSettings } from "@/lib/store-settings";
import { QuickAddSheet } from "./QuickAddSheet";
import { usableImage } from "@/lib/category-image";

const NEW_DAYS = 21;

export function ProductImage({
  src,
  alt,
  className,
  priority,
}: {
  src?: string | null;
  alt: string;
  className?: string;
  priority?: boolean;
}) {
  const [loaded, setLoaded] = useState(false);
  const [failed, setFailed] = useState(false);
  const logo = useSettings().settings?.logo_url;
  // Images already in the browser cache can finish before React attaches onLoad.
  const ref = useCallback((el: HTMLImageElement | null) => {
    if (el?.complete && el.naturalWidth) setLoaded(true);
  }, []);
  // Old/relative paths (e.g. /__l5e/...) can't load here: go straight to the placeholder.
  const url = usableImage(src);
  if (!url || failed)
    return (
      // Same accessible name as the real image would have, so links wrapping the placeholder still have text.
      <div
        className={cn(
          "flex items-center justify-center bg-muted text-muted-foreground/60",
          className,
        )}
        {...(alt ? { role: "img", "aria-label": alt } : { "aria-hidden": true })}
      >
        {logo ? (
          // No product photo: the store logo, faded, reads better than a broken-image icon.
          <img src={logo} alt="" aria-hidden className="w-1/2 max-w-32 opacity-25 grayscale" />
        ) : (
          <ImageOff className="h-7 w-7" aria-hidden />
        )}
      </div>
    );
  return (
    <img
      ref={ref}
      src={url}
      alt={alt}
      loading={priority ? "eager" : "lazy"}
      decoding="async"
      {...(priority ? { fetchPriority: "high" as const } : {})}
      onLoad={() => setLoaded(true)}
      onError={() => setFailed(true)}
      className={cn(
        "object-cover transition-opacity duration-500",
        loaded ? "opacity-100" : "animate-pulse bg-muted opacity-60",
        className,
      )}
    />
  );
}

/** One shared query for the signed-in user's wishlist ids, so cards don't each hit the server. */
function useWishlistIds() {
  const { user } = useAuth();
  return useQuery({
    queryKey: ["wishlist", "ids", user?.id],
    enabled: !!user,
    staleTime: 60_000,
    queryFn: async () => {
      const { data } = await supabase.from("wishlist").select("product_id").eq("user_id", user!.id);
      return new Set((data ?? []).map((r) => r.product_id));
    },
  });
}

export function ProductCard({ p }: { p: Product }) {
  const { t, tx, lang } = useI18n();
  const money = useMoney();
  const cart = useCart();
  const { user } = useAuth();
  const qc = useQueryClient();
  const navigate = useNavigate();
  const wish = useWishlistIds();
  const [quick, setQuick] = useState(false);
  const { current, was, pct } = effectivePrice(p);
  const name = tx(p, "name");
  const stock = Number(p.stock);
  const variants = (p.product_variants ?? []).filter((v) => v.is_active !== false);
  const hasVariants = variants.length > 0;
  const colors = [
    ...new Map(variants.filter((v) => v.color_hex).map((v) => [v.color_hex, v])).values(),
  ];
  const isNew = Date.now() - new Date(p.created_at).getTime() < NEW_DAYS * 864e5;
  const liked = wish.data?.has(p.id) ?? false;
  // Until the saved list is known the heart can't tell "add" from "remove", so it waits.
  const wishUnknown = !!user && !wish.isSuccess;
  const img1 = p.thumbnails?.[0] ?? p.images?.[0];
  const img2 = p.thumbnails?.[1] ?? p.images?.[1];

  const toggleWish = async () => {
    if (!user) {
      toast(t("sign_in_to_save"));
      return navigate({ to: "/auth" });
    }
    const { error } = liked
      ? await supabase.from("wishlist").delete().eq("product_id", p.id).eq("user_id", user.id)
      : await supabase
          .from("wishlist")
          .upsert(
            { product_id: p.id, user_id: user.id },
            { onConflict: "user_id,product_id", ignoreDuplicates: true },
          );
    if (error) toast.error(t("error_title"));
    qc.invalidateQueries({ queryKey: ["wishlist"] });
    qc.invalidateQueries({ queryKey: ["wish"] });
  };

  const quickAdd = () => {
    if (hasVariants) return setQuick(true);
    cart.addAndShow({
      productId: p.id,
      variantId: null,
      name_ar: p.name_ar,
      name_en: p.name_en,
      image: p.images?.[0],
      maxQty: stock,
      price: current,
    });
    toast.success(t("added_to_cart"));
  };

  return (
    <div className="group flex h-full flex-col">
      <div className="relative overflow-hidden rounded-md bg-muted">
        <Link to="/product/$id" params={{ id: p.id }} className="block aspect-[4/5]">
          <ProductImage src={img1} alt={name} className="absolute inset-0 h-full w-full" />
          {img2 && (
            <img
              src={img2}
              alt=""
              loading="lazy"
              aria-hidden
              className="absolute inset-0 hidden h-full w-full object-cover opacity-0 transition-opacity duration-500 md:block md:group-hover:opacity-100"
            />
          )}
        </Link>
        <div className="pointer-events-none absolute start-2 top-2 flex flex-col items-start gap-1">
          {pct > 0 && (
            <span className="rounded-sm bg-deal px-1.5 py-0.5 text-[11px] font-bold text-deal-foreground">
              -{pct}%
            </span>
          )}
          {isNew && (
            <span className="rounded-sm bg-card px-1.5 py-0.5 text-[11px] font-bold">
              {t("badge_new")}
            </span>
          )}
          {stock > 0 && stock <= LOW_STOCK && (
            <span className="rounded-sm bg-brand-secondary px-1.5 py-0.5 text-[11px] font-bold text-brand-secondary-foreground">
              {t("only_left").replace("{n}", countLabel(stock, lang, "piece"))}
            </span>
          )}
        </div>
        <button
          onClick={toggleWish}
          disabled={wishUnknown}
          aria-label={t("wishlist")}
          aria-pressed={liked}
          className="absolute end-1 top-1 flex h-11 w-11 items-center justify-center rounded-full text-foreground transition hover:scale-110"
        >
          <span className="flex h-8 w-8 items-center justify-center rounded-full bg-card/90">
            <Heart className={cn("h-4 w-4", liked && "fill-deal text-deal")} />
          </span>
        </button>
        {stock > 0 ? (
          <button
            onClick={quickAdd}
            aria-label={t("quick_add")}
            className="absolute bottom-2 end-2 flex h-11 w-11 items-center justify-center rounded-full bg-card shadow-card transition hover:bg-foreground hover:text-background md:h-10 md:w-auto md:translate-y-2 md:gap-1 md:px-3 md:opacity-0 md:group-hover:translate-y-0 md:group-hover:opacity-100 md:focus-visible:opacity-100"
          >
            <Plus className="h-4 w-4" />
            <span className="hidden text-xs font-bold md:inline">{t("quick_add")}</span>
          </button>
        ) : (
          <span className="absolute inset-x-0 bottom-0 bg-background/85 py-2 text-center text-xs font-bold">
            {t("out_of_stock")}
          </span>
        )}
      </div>
      <div className="flex flex-1 flex-col gap-1 pt-2">
        <Link
          to="/product/$id"
          params={{ id: p.id }}
          className="line-clamp-1 text-sm leading-5 hover:underline"
        >
          {name}
        </Link>
        <div className="flex flex-wrap items-baseline gap-x-2">
          <span className={cn("text-sm font-bold", was && "text-deal")}>{money(current)}</span>
          {was && <span className="text-xs text-muted-foreground line-through">{money(was)}</span>}
        </div>
        {colors.length > 1 && (
          <div className="flex items-center gap-1 pt-0.5">
            {colors.slice(0, 5).map((c) => (
              <span
                key={c.color_hex}
                title={tx(c, "color")}
                className="h-3 w-3 rounded-full border border-border"
                style={{ background: c.color_hex ?? undefined }}
              />
            ))}
            {colors.length > 5 && (
              <span className="text-[11px] text-muted-foreground">+{colors.length - 5}</span>
            )}
          </div>
        )}
      </div>
      {hasVariants && quick && (
        <QuickAddSheet p={p} price={current} open={quick} onOpenChange={setQuick} />
      )}
    </div>
  );
}
