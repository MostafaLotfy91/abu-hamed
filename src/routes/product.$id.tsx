import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Heart, Star } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useI18n } from "@/lib/i18n";
import { useAuth } from "@/lib/auth";
import { useCart } from "@/lib/cart";
import { effectivePrice } from "@/lib/format";
import { defaultSelection, findVariant, GENDERS, LOW_STOCK, SEASONS, sizeLabel, type SizeType } from "@/lib/fashion";
import { ProductGallery } from "@/components/store/ProductGallery";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { SizeGuide } from "@/components/store/SizeGuide";
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
import { usePublishWaContext } from "@/lib/whatsapp";

export const Route = createFileRoute("/product/$id")({
  head: () => ({
    meta: [
      { title: "تفاصيل المنتج · Product" },
      { name: "description", content: "المقاسات والألوان والسعر والتقييمات. Sizes, colors, price and reviews." },
      { property: "og:title", content: "تفاصيل المنتج · Product" },
      { property: "og:description", content: "Sizes, colors, price and reviews." }, { property: "og:type", content: "product" }, { name: "twitter:card", content: "summary_large_image" },
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
  const [size, setSize] = useState<string | null>(null);
  const [color, setColor] = useState<string | null>(null);
  const [qty, setQty] = useState(1);

  const q = useQuery({
    queryKey: ["product", id],
    queryFn: async () => {
      const { data, error } = await supabase.from("products").select(`*, product_variants(*), categories(size_type)`).eq("id", id).maybeSingle();
      if (error) throw error;
      return data;
    },
  });
  const p = q.data;
  // What the page shows as selected (including the auto-picked colour) is what the WhatsApp message describes.
  const picked = defaultSelection(p?.product_variants ?? [], { size, color });
  const waColor = (() => { const v = p?.product_variants?.find((x) => x.color_en === picked.color); return v ? tx(v, "color") : picked.color; })();
  usePublishWaContext(p ? { kind: "product", name: tx(p, "name"), size: picked.size, color: waColor } : null);
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
        <Skeleton className="aspect-[4/5] rounded-md" />
        <div className="space-y-3"><Skeleton className="h-8 w-3/4" /><Skeleton className="h-6 w-1/3" /><Skeleton className="h-24" /><Skeleton className="h-12" /></div>
      </div>
    );
  if (q.error) return <ErrorState onRetry={() => q.refetch()} />;
  if (!p) return <EmptyState title={t("no_products")} />;

  const variants = (p.product_variants ?? []).filter((v) => v.is_active).sort((a, b) => a.sort_order - b.sort_order);
  const sizeType = (p.size_type ?? (p.categories as { size_type?: string } | null)?.size_type ?? "none") as SizeType;
  const { sizes, colors, color: pickedColor, size: pickedSize } = picked;
  const needSize = sizes.length > 0, needColor = colors.length > 0;
  const variant = variants.length ? findVariant(variants, needSize ? pickedSize : null, needColor ? pickedColor : null) : null;
  const sizeStock = (s: string) => variants.filter((v) => v.size === s && (!needColor || v.color_en === pickedColor)).reduce((n, v) => n + v.stock, 0);
  const colorStock = (c: string) => variants.filter((v) => v.color_en === c).reduce((n, v) => n + v.stock, 0);
  const base = effectivePrice(p);
  const pricing = variant?.price != null
    ? { current: Number(variant.price), was: variant.old_price ? Number(variant.old_price) : base.was, pct: 0, flashActive: false }
    : base;
  if (variant?.price != null && pricing.was) pricing.pct = Math.round(((pricing.was - pricing.current) / pricing.was) * 100);
  const stock = variants.length ? (variant ? variant.stock : needColor && pickedColor && !needSize ? colorStock(pickedColor) : Number(p.stock)) : Number(p.stock);
  const ready = !variants.length || !!variant;
  const curQty = Math.min(qty, Math.max(1, stock));
  const images = p.images?.length ? p.images : [null];
  const name = tx(p, "name");
  const g = GENDERS.find((x) => x.value === p.gender), se = SEASONS.find((x) => x.value === p.season);
  const isPerfume = !!(p.top_notes || p.middle_notes || p.base_notes || p.volume_ml || p.concentration);

  const add = () => {
    if (!ready) return toast.error(t("select_size_color"));
    cart.add({
      productId: p.id, variantId: variant?.id ?? null, name_ar: p.name_ar, name_en: p.name_en,
      variant_ar: variant?.name_ar, variant_en: variant?.name_en, size: variant?.size, color_ar: variant?.color_ar, color_en: variant?.color_en, color_hex: variant?.color_hex,
      image: p.images?.[0], maxQty: stock, price: pricing.current,
    }, curQty);
    toast.success(t("added_to_cart"), { action: { label: t("view_cart"), onClick: () => cart.setDrawerOpen(true) } });
  };

  const toggleWish = async () => {
    if (!user) return toast(t("required_sign_in"));
    const { error } = wish.data
      ? await supabase.from("wishlist").delete().eq("product_id", id).eq("user_id", user.id)
      : await supabase.from("wishlist").insert({ product_id: id, user_id: user.id });
    if (error) toast.error(t("error_title"));
    qc.invalidateQueries({ queryKey: ["wish"] });
    qc.invalidateQueries({ queryKey: ["wishlist"] });
  };

  return (
    <div className="space-y-10 pb-24 md:pb-0">
      <div className="grid gap-6 md:grid-cols-[1.2fr_1fr] md:gap-10">
        <ProductGallery images={images} alt={name} overlay={<>
          {pricing.pct > 0 && <span className="absolute start-3 top-3 rounded-sm bg-deal px-2 py-0.5 text-xs font-bold text-deal-foreground">-{pricing.pct}%</span>}
          <button onClick={toggleWish} aria-label={t("wishlist")} className="absolute end-3 top-3 flex h-10 w-10 items-center justify-center rounded-full bg-background/90 shadow-sm">
            <Heart className={cn("h-5 w-5", wish.data && "fill-deal text-deal")} />
          </button>
        </>} />

        <div className="space-y-5 md:sticky md:top-20 md:self-start">
          <div className="space-y-1">
            {p.brand && <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">{p.brand}</p>}
            <h1 className="text-xl font-semibold leading-snug md:text-2xl">{name}</h1>
            {Number(p.rating_count) > 0 && (
              <a href="#reviews" className="flex items-center gap-1 text-sm text-muted-foreground"><Star className="h-4 w-4 fill-foreground text-foreground" />{Number(p.rating_avg).toFixed(1)} · {p.rating_count} {t("reviews")}</a>
            )}
          </div>
          <div className="flex flex-wrap items-baseline gap-3">
            <span className={cn("text-2xl font-bold", pricing.was && "text-deal")}>{money(pricing.current)}</span>
            {pricing.was && <span className="text-base text-muted-foreground line-through">{money(pricing.was)}</span>}
          </div>
          {pricing.flashActive && p.flash_ends_at && (
            <div className="flex items-center gap-2 text-sm font-semibold text-deal">{t("flash_deals")} · {t("ends_in")} <Countdown to={p.flash_ends_at} /></div>
          )}
          {needColor && (
            <div>
              <p className="mb-2 text-sm font-semibold">{t("color")}: <span className="font-normal text-muted-foreground">{lang === "ar" ? colors.find((c) => c.color_en === pickedColor)?.color_ar : pickedColor}</span></p>
              <div className="flex flex-wrap gap-2">
                {colors.map((c) => {
                  const out = colorStock(c.color_en!) <= 0;
                  return (
                    <button key={c.color_en} type="button" title={tx(c, "color")} aria-label={tx(c, "color")} aria-pressed={c.color_en === pickedColor} onClick={() => { setColor(c.color_en); setQty(1); }}
                      className={cn("relative h-11 w-11 rounded-full border p-1", c.color_en === pickedColor ? "border-foreground" : "border-border", out && "opacity-40")}>
                      <span className="block h-full w-full rounded-full border border-border" style={{ background: c.color_hex ?? undefined }} />
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {needSize && (
            <div>
              <div className="mb-2 flex items-center justify-between">
                <p className="text-sm font-semibold">{t("size")}</p>
                <SizeGuide type={sizeType} />
              </div>
              <div className="grid grid-cols-4 gap-2 sm:grid-cols-5">
                {sizes.map((s) => {
                  const out = sizeStock(s) <= 0;
                  return (
                    <button key={s} type="button" disabled={out} aria-pressed={s === pickedSize} onClick={() => { setSize(s); setQty(1); }}
                      className={cn("h-11 rounded-md border px-2 text-sm font-semibold transition disabled:cursor-not-allowed disabled:text-muted-foreground disabled:line-through",
                        s === pickedSize ? "border-foreground bg-foreground text-background" : "border-border bg-card hover:border-foreground")}>
                      {sizeLabel(s, lang)}
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          <p className={cn("text-sm font-medium", !ready ? "text-muted-foreground" : stock <= 0 ? "text-destructive" : stock <= LOW_STOCK ? "text-deal" : "text-success")}>
            {!ready && needSize && !pickedSize ? t("select_size_color") : stock <= 0 ? t("out_of_stock") : stock <= LOW_STOCK ? t("only_left").replace("{n}", String(stock)) : t("in_stock")}
          </p>

          {stock > 0 && (
            <div className="hidden gap-3 md:flex">
              <div className="w-36"><QtyStepper qty={curQty} max={stock} allowRemove={false} onChange={(n) => setQty(Math.max(1, n))} /></div>
              <Button size="lg" className="h-12 flex-1 font-semibold" onClick={add} disabled={!ready}>{t("add_to_cart")} · {money(pricing.current * curQty)}</Button>
            </div>
          )}

          <Accordion type="multiple" defaultValue={["description"]} className="border-t">
            {tx(p, "description") && (
              <AccordionItem value="description">
                <AccordionTrigger className="text-sm font-semibold">{t("description")}</AccordionTrigger>
                <AccordionContent><p className="text-sm leading-7 text-muted-foreground">{tx(p, "description")}</p></AccordionContent>
              </AccordionItem>
            )}
            {(g || se || p.material_ar || p.sku || tx(p, "care") || p.brand) && (
              <AccordionItem value="details">
                <AccordionTrigger className="text-sm font-semibold">{t("details")}</AccordionTrigger>
                <AccordionContent>
                  <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 text-sm">
                    {p.brand && <><dt className="text-muted-foreground">{t("brand")}</dt><dd>{p.brand}</dd></>}
                    {tx(p, "material") && <><dt className="text-muted-foreground">{t("material")}</dt><dd>{tx(p, "material")}</dd></>}
                    {g && <><dt className="text-muted-foreground">{t("gender")}</dt><dd>{g[lang]}</dd></>}
                    {se && <><dt className="text-muted-foreground">{t("season")}</dt><dd>{se[lang]}</dd></>}
                    {(variant?.sku ?? p.sku) && <><dt className="text-muted-foreground">SKU</dt><dd dir="ltr" className="text-start">{variant?.sku ?? p.sku}</dd></>}
                  </dl>
                </AccordionContent>
              </AccordionItem>
            )}
            {tx(p, "care") && (
              <AccordionItem value="care">
                <AccordionTrigger className="text-sm font-semibold">{t("care")}</AccordionTrigger>
                <AccordionContent><p className="text-sm leading-7 text-muted-foreground">{tx(p, "care")}</p></AccordionContent>
              </AccordionItem>
            )}
            {isPerfume && (
              <AccordionItem value="fragrance">
                <AccordionTrigger className="text-sm font-semibold">{t("fragrance")}</AccordionTrigger>
                <AccordionContent className="space-y-3 text-sm">
                  <div className="flex flex-wrap gap-2">
                    {p.volume_ml && <span className="rounded-full border px-3 py-1">{t("volume")}: {p.volume_ml} {lang === "ar" ? "مل" : "ml"}</span>}
                    {p.concentration && <span className="rounded-full border px-3 py-1">{t("concentration")}: {p.concentration}</span>}
                  </div>
                  <dl className="space-y-1">
                    {p.top_notes && <div><dt className="inline font-semibold">{t("top_notes")}: </dt><dd className="inline text-muted-foreground">{p.top_notes}</dd></div>}
                    {p.middle_notes && <div><dt className="inline font-semibold">{t("middle_notes")}: </dt><dd className="inline text-muted-foreground">{p.middle_notes}</dd></div>}
                    {p.base_notes && <div><dt className="inline font-semibold">{t("base_notes")}: </dt><dd className="inline text-muted-foreground">{p.base_notes}</dd></div>}
                  </dl>
                </AccordionContent>
              </AccordionItem>
            )}
          </Accordion>
        </div>
      </div>

      {stock > 0 && (
        <div className="fixed inset-x-0 bottom-[calc(3.5rem+env(safe-area-inset-bottom))] z-30 flex items-center gap-3 border-t bg-background/95 p-3 backdrop-blur md:hidden">
          <div className="min-w-0">
            <p className="truncate text-xs text-muted-foreground">{[pickedSize && sizeLabel(pickedSize, lang), needColor && tx(colors.find((c) => c.color_en === pickedColor) ?? null, "color")].filter(Boolean).join(" · ") || name}</p>
            <p className="font-bold">{money(pricing.current)}</p>
          </div>
          <Button size="lg" className="h-12 flex-1 font-semibold" onClick={add} disabled={!ready}>{ready ? t("add_to_cart") : t("select_size_color")}</Button>
        </div>
      )}

      <Reviews productId={p.id} />

      {!!related.data?.length && (
        <section>
          <SectionHeader title={t("related")} />
          <div className="-mx-3 flex snap-x gap-3 overflow-x-auto px-3 pb-2 scrollbar-none">
            {related.data.map((r) => <div key={r.id} className="w-40 shrink-0 snap-start md:w-56"><ProductCard p={r} /></div>)}
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
    <section id="reviews" className="scroll-mt-20 border-t pt-8">
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
