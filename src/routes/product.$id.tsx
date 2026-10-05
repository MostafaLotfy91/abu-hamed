import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Heart, Star } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useI18n } from "@/lib/i18n";
import { useAuth } from "@/lib/auth";
import { useCart } from "@/lib/cart";
import { effectivePrice, snapQty, unitLabel } from "@/lib/format";
import { PRODUCT_FIELDS, type Product } from "@/lib/queries";
import { useMoney } from "@/components/store/use-money";
import { ProductCard, ProductImage } from "@/components/store/ProductCard";
import { QtyStepper } from "@/components/store/QtyStepper";
import { Countdown } from "@/components/store/Countdown";
import { EmptyState, ErrorState } from "@/components/store/states";
import { SectionHeader } from "@/components/store/SiteShell";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/product/$id")({
  head: () => ({
    meta: [
      { title: "تفاصيل المنتج · Product" },
      { name: "description", content: "تفاصيل المنتج والسعر والتقييمات. Product details, price and reviews." },
      { property: "og:title", content: "تفاصيل المنتج · Product" },
      { property: "og:description", content: "Product details, price and reviews." },
    ],
  }),
  component: ProductPage,
});

function ProductPage() {
  const { id } = Route.useParams();
  const { t, tx, lang } = useI18n();
  const money = useMoney();
  const cart = useCart();
  const { user } = useAuth();
  const qc = useQueryClient();
  const [img, setImg] = useState(0);
  const [variantId, setVariantId] = useState<string | null>(null);
  const [qty, setQty] = useState<number | null>(null);

  const q = useQuery({
    queryKey: ["product", id],
    queryFn: async () => {
      const { data, error } = await supabase.from("products").select(`${PRODUCT_FIELDS}, product_variants(*)`).eq("id", id).maybeSingle();
      if (error) throw error;
      return data;
    },
  });
  const p = q.data;
  const related = useQuery({
    queryKey: ["related", p?.category_id, id],
    enabled: !!p?.category_id,
    queryFn: async () => {
      const { data } = await supabase.from("products").select(PRODUCT_FIELDS).eq("category_id", p!.category_id!).eq("is_active", true).neq("id", id).limit(10);
      return (data ?? []) as Product[];
    },
  });
  const wish = useQuery({
    queryKey: ["wish", id, user?.id],
    enabled: !!user,
    queryFn: async () => {
      const { data } = await supabase.from("wishlist").select("product_id").eq("product_id", id).eq("user_id", user!.id).maybeSingle();
      return !!data;
    },
  });

  if (q.isLoading)
    return (
      <div className="grid gap-6 md:grid-cols-2">
        <Skeleton className="aspect-square rounded-3xl" />
        <div className="space-y-3"><Skeleton className="h-8 w-3/4" /><Skeleton className="h-6 w-1/3" /><Skeleton className="h-24" /><Skeleton className="h-12" /></div>
      </div>
    );
  if (q.error) return <ErrorState onRetry={() => q.refetch()} />;
  if (!p) return <EmptyState title={t("no_products")} />;

  const variants = (p.product_variants ?? []).filter((v) => v.is_active).sort((a, b) => a.sort_order - b.sort_order);
  const variant = variants.find((v) => v.id === (variantId ?? variants[0]?.id)) ?? null;
  const pricing = variant ? { current: Number(variant.price), was: variant.old_price ? Number(variant.old_price) : null, pct: 0, flashActive: false } : effectivePrice(p);
  if (variant && pricing.was) pricing.pct = Math.round(((pricing.was - pricing.current) / pricing.was) * 100);
  const stock = Number(variant ? variant.stock : p.stock);
  const step = Number(p.step), min = Number(p.min_qty);
  const curQty = qty ?? Math.max(min, step);
  const images = p.images?.length ? p.images : [null];
  const name = tx(p, "name");

  const add = () => {
    cart.add({
      productId: p.id, variantId: variant?.id ?? null, name_ar: p.name_ar, name_en: p.name_en,
      variant_ar: variant?.name_ar, variant_en: variant?.name_en, image: p.images?.[0], unit: p.unit, step, minQty: min, price: pricing.current,
    }, curQty);
    toast.success(t("added_to_cart"), { action: { label: t("view_cart"), onClick: () => cart.setDrawerOpen(true) } });
  };

  const toggleWish = async () => {
    if (!user) return toast(t("required_sign_in"));
    if (wish.data) await supabase.from("wishlist").delete().eq("product_id", id).eq("user_id", user.id);
    else await supabase.from("wishlist").insert({ product_id: id, user_id: user.id });
    qc.invalidateQueries({ queryKey: ["wish"] });
    qc.invalidateQueries({ queryKey: ["wishlist"] });
  };

  return (
    <div className="space-y-8">
      <div className="grid gap-6 md:grid-cols-2">
        <div className="space-y-3">
          <div className="relative overflow-hidden rounded-3xl bg-card shadow-card">
            <ProductImage src={images[img]} alt={name} className="aspect-square w-full" />
            {pricing.pct > 0 && <span className="absolute start-3 top-3 rounded-full bg-deal px-3 py-1 text-sm font-bold text-deal-foreground">-{pricing.pct}%</span>}
            <button onClick={toggleWish} aria-label={t("wishlist")} className="absolute end-3 top-3 flex h-10 w-10 items-center justify-center rounded-full bg-card shadow-card">
              <Heart className={cn("h-5 w-5", wish.data && "fill-deal text-deal")} />
            </button>
          </div>
          {images.length > 1 && (
            <div className="flex gap-2 overflow-x-auto">
              {images.map((src, i) => (
                <button key={i} onClick={() => setImg(i)} className={cn("h-16 w-16 shrink-0 overflow-hidden rounded-xl border-2", i === img ? "border-primary" : "border-transparent")}>
                  <ProductImage src={src} alt="" className="h-full w-full" />
                </button>
              ))}
            </div>
          )}
        </div>

        <div className="space-y-4">
          {p.brand && <p className="text-sm font-semibold text-primary">{p.brand}</p>}
          <h1 className="text-2xl font-extrabold leading-tight md:text-3xl">{name}</h1>
          {Number(p.rating_count) > 0 && (
            <div className="flex items-center gap-1 text-sm text-muted-foreground"><Star className="h-4 w-4 fill-brand-secondary text-brand-secondary" />{Number(p.rating_avg).toFixed(1)} · {p.rating_count} {t("reviews")}</div>
          )}
          <div className="flex flex-wrap items-baseline gap-3">
            <span className="text-3xl font-extrabold text-primary">{money(pricing.current)}</span>
            <span className="text-muted-foreground">/ {unitLabel(p.unit, lang)}</span>
            {pricing.was && <span className="text-lg text-muted-foreground line-through">{money(pricing.was)}</span>}
          </div>
          {pricing.flashActive && p.flash_ends_at && (
            <div className="flex items-center gap-2 text-sm font-semibold text-deal">{t("flash_deals")} · {t("ends_in")} <Countdown to={p.flash_ends_at} /></div>
          )}
          <p className={cn("text-sm font-semibold", stock <= 0 ? "text-destructive" : stock < 10 ? "text-brand-secondary-foreground" : "text-success")}>
            {stock <= 0 ? t("out_of_stock") : stock < 10 ? t("low_stock") : t("in_stock")}
          </p>

          {variants.length > 0 && (
            <div>
              <p className="mb-2 text-sm font-semibold">{t("options")}</p>
              <div className="flex flex-wrap gap-2">
                {variants.map((v) => (
                  <button key={v.id} onClick={() => setVariantId(v.id)} className={cn("rounded-xl border px-4 py-2 text-sm font-semibold", v.id === variant?.id ? "border-primary bg-primary-soft text-primary" : "bg-card")}>
                    {tx(v, "name")}
                  </button>
                ))}
              </div>
            </div>
          )}

          {stock > 0 && (
            <div className="flex gap-3">
              <div className="w-44"><QtyStepper qty={curQty} step={step} min={min} unit={p.unit} max={stock} onChange={(n) => setQty(snapQty(n, step, min))} /></div>
              <Button size="lg" className="h-11 flex-1 font-bold" onClick={add}>{t("add_to_cart")} · {money(pricing.current * curQty)}</Button>
            </div>
          )}

          {tx(p, "description") && (
            <div><h2 className="mb-1 font-bold">{t("description")}</h2><p className="text-sm leading-7 text-muted-foreground">{tx(p, "description")}</p></div>
          )}
        </div>
      </div>

      <Reviews productId={p.id} />

      {!!related.data?.length && (
        <section>
          <SectionHeader title={t("related")} />
          <div className="-mx-3 flex gap-3 overflow-x-auto px-3 pb-2 scrollbar-none">
            {related.data.map((r) => <div key={r.id} className="w-40 shrink-0 md:w-48"><ProductCard p={r} /></div>)}
          </div>
        </section>
      )}
    </div>
  );
}

function Reviews({ productId }: { productId: string }) {
  const { t, lang } = useI18n();
  const { user } = useAuth();
  const qc = useQueryClient();
  const [rating, setRating] = useState(5);
  const [comment, setComment] = useState("");
  const [busy, setBusy] = useState(false);
  const { data, isLoading } = useQuery({
    queryKey: ["reviews", productId],
    queryFn: async () => {
      const { data } = await supabase.from("reviews").select("*").eq("product_id", productId).order("created_at", { ascending: false }).limit(50);
      return data ?? [];
    },
  });
  const submit = async () => {
    if (!user) return;
    setBusy(true);
    const { error } = await supabase.from("reviews").upsert(
      { product_id: productId, user_id: user.id, rating, comment: comment.trim().slice(0, 1000) || null, author_name: (user.user_metadata?.full_name as string) || user.email?.split("@")[0] || null },
      { onConflict: "product_id,user_id" },
    );
    setBusy(false);
    if (error) return toast.error(error.message);
    setComment("");
    qc.invalidateQueries({ queryKey: ["reviews", productId] });
    qc.invalidateQueries({ queryKey: ["product", productId] });
    toast.success(t("saved"));
  };
  return (
    <section className="rounded-3xl bg-card p-4 shadow-card md:p-6">
      <SectionHeader title={t("reviews")} />
      {user ? (
        <div className="mb-5 space-y-2 rounded-2xl bg-secondary p-3">
          <p className="text-sm font-semibold">{t("write_review")}</p>
          <div className="flex gap-1">
            {[1, 2, 3, 4, 5].map((n) => (
              <button key={n} onClick={() => setRating(n)} aria-label={`${n}`}><Star className={cn("h-6 w-6", n <= rating ? "fill-brand-secondary text-brand-secondary" : "text-muted-foreground")} /></button>
            ))}
          </div>
          <Textarea value={comment} onChange={(e) => setComment(e.target.value)} maxLength={1000} rows={2} />
          <Button size="sm" onClick={submit} disabled={busy}>{t("submit")}</Button>
        </div>
      ) : (
        <p className="mb-4 text-sm text-muted-foreground"><Link to="/auth" className="font-semibold text-primary">{t("sign_in_to_review")}</Link></p>
      )}
      {isLoading ? <Skeleton className="h-16" /> : !data?.length ? <p className="text-sm text-muted-foreground">{t("no_reviews")}</p> : (
        <ul className="divide-y">
          {data.map((r) => (
            <li key={r.id} className="py-3">
              <div className="flex items-center justify-between text-sm">
                <span className="font-semibold">{r.author_name ?? "—"}</span>
                <span className="text-xs text-muted-foreground">{new Date(r.created_at).toLocaleDateString(lang === "ar" ? "ar-EG" : "en-US")}</span>
              </div>
              <div className="my-1 flex">{Array.from({ length: 5 }).map((_, i) => <Star key={i} className={cn("h-3.5 w-3.5", i < r.rating ? "fill-brand-secondary text-brand-secondary" : "text-muted")} />)}</div>
              {r.comment && <p className="text-sm text-muted-foreground">{r.comment}</p>}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
