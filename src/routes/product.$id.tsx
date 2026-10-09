import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useRef, useState } from "react";
import { Heart, Star } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useI18n } from "@/lib/i18n";
import { pageHead } from "@/lib/seo";
import { useAuth } from "@/lib/auth";
import { useCart } from "@/lib/cart";
import { effectivePrice } from "@/lib/format";
import {
  defaultSelection,
  findVariant,
  GENDERS,
  LOW_STOCK,
  SEASONS,
  sizeLabel,
} from "@/lib/fashion";
import { profileOf } from "@/lib/catalog";
import { fetchCategories, profilesQuery } from "@/lib/queries";
import { ProductGallery } from "@/components/store/ProductGallery";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { SizeGuide } from "@/components/store/SizeGuide";
import { WhatsAppInlineIcon } from "@/components/store/WhatsAppButton";
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
import { useSettings } from "@/lib/store-settings";
import { Ornament, SectionTitle } from "@/components/luxe/Ornament";
import { usePublishWaContext } from "@/lib/whatsapp";
import { countLabel } from "@/lib/format";

export const Route = createFileRoute("/product/$id")({
  // The product is loaded here so the server HTML has the page and its <head> (title, description, share
  // image); the page query starts from it instead of showing a skeleton until a second request returns.
  loader: async ({ params }) => {
    const { data } = await supabase
      .from("products")
      .select(`*, product_variants(*)`)
      .eq("id", params.id)
      .eq("is_active", true)
      .maybeSingle();
    return { product: data ?? null };
  },
  head: ({ matches, loaderData }) => {
    const p = loaderData?.product;
    const h = pageHead(matches, {
      title: p ? { ar: p.name_ar, en: p.name_en } : { ar: "منتج", en: "Product" },
      description: p
        ? { ar: p.description_ar ?? p.name_ar, en: p.description_en ?? p.name_en }
        : null,
      image: p?.images?.[0] ?? null,
    });
    return { meta: [...h.meta, { property: "og:type", content: "product" }] };
  },
  component: ProductPage,
});

function ProductPage() {
  const { id } = Route.useParams();
  const { product: loaded } = Route.useLoaderData();
  const { t, tx, lang } = useI18n();
  const money = useMoney();
  const { settings } = useSettings();
  const cart = useCart();
  const { user } = useAuth();
  const qc = useQueryClient();
  const [img, setImg] = useState(0);
  const [size, setSize] = useState<string | null>(null);
  const [color, setColor] = useState<string | null>(null);
  const [qty, setQty] = useState(1);
  // "Add to cart" without a size: scroll to the size row and highlight it instead of a dead, disabled button.
  const sizeRef = useRef<HTMLDivElement>(null);
  const [nudge, setNudge] = useState(false);

  const q = useQuery({
    queryKey: ["product", id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("products")
        .select(`*, product_variants(*)`)
        .eq("id", id)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
    initialData: loaded?.id === id ? loaded : undefined,
  });
  const p = q.data;
  const cats = useQuery({
    queryKey: ["categories"],
    queryFn: fetchCategories,
    staleTime: 5 * 60_000,
  });
  const profiles = useQuery(profilesQuery);
  // What the page shows as selected (including the auto-picked colour) is what the WhatsApp message describes.
  const picked = defaultSelection(p?.product_variants ?? [], { size, color });
  const waColor = (() => {
    const v = p?.product_variants?.find((x) => x.color_en === picked.color);
    return v ? tx(v, "color") : picked.color;
  })();
  usePublishWaContext(
    p ? { kind: "product", name: tx(p, "name"), size: picked.size, color: waColor } : null,
  );
  const related = useQuery({
    queryKey: ["related", p?.category_id, id],
    enabled: !!p?.category_id,
    queryFn: async () => {
      const { data } = await supabase
        .from("products")
        .select(PRODUCT_FIELDS)
        .eq("category_id", p!.category_id!)
        .eq("is_active", true)
        .neq("id", id)
        .limit(10);
      return (data ?? []) as Product[];
    },
  });
  const look = useQuery({
    queryKey: ["complete-look", id, p?.gender, p?.category_id],
    enabled: !!p?.gender && !!p?.category_id,
    queryFn: async () => {
      const { data } = await supabase
        .from("products")
        .select(PRODUCT_FIELDS)
        .eq("is_active", true)
        .in("gender", [p!.gender!, "unisex"])
        .neq("category_id", p!.category_id!)
        .gt("stock", 0)
        .order("sold_count", { ascending: false })
        .limit(8);
      return (data ?? []) as Product[];
    },
  });
  const wish = useQuery({
    queryKey: ["wish", id, user?.id],
    enabled: !!user,
    queryFn: async () => {
      const { data } = await supabase
        .from("wishlist")
        .select("product_id")
        .eq("product_id", id)
        .eq("user_id", user!.id)
        .maybeSingle();
      return !!data;
    },
  });

  if (q.isLoading)
    return (
      <div className="grid gap-6 md:grid-cols-2">
        <Skeleton className="aspect-[4/5] rounded-md" />
        <div className="space-y-3">
          <Skeleton className="h-8 w-3/4" />
          <Skeleton className="h-6 w-1/3" />
          <Skeleton className="h-24" />
          <Skeleton className="h-12" />
        </div>
      </div>
    );
  if (q.error) return <ErrorState onRetry={() => q.refetch()} />;
  if (!p) return <EmptyState title={t("no_products")} />;

  const variants = (p.product_variants ?? [])
    .filter((v) => v.is_active)
    .sort((a, b) => a.sort_order - b.sort_order);
  // Category profile decides the size guide, the fragrance section and how the size axis is labelled.
  const profile = profileOf(p.category_id, cats.data ?? [], profiles.data ?? []);
  const sizeAxisLabel = profile.sizes ? t("size") : lang === "ar" ? "الخيار" : "Option";
  const { sizes, colors, color: pickedColor, size: pickedSize } = picked;
  const needSize = sizes.length > 0,
    needColor = colors.length > 0;
  const variant = variants.length
    ? findVariant(variants, needSize ? pickedSize : null, needColor ? pickedColor : null)
    : null;
  const sizeStock = (s: string) =>
    variants
      .filter((v) => v.size === s && (!needColor || v.color_en === pickedColor))
      .reduce((n, v) => n + v.stock, 0);
  const colorStock = (c: string) =>
    variants.filter((v) => v.color_en === c).reduce((n, v) => n + v.stock, 0);
  const base = effectivePrice(p);
  const pricing =
    variant?.price != null
      ? {
          current: Number(variant.price),
          was: variant.old_price ? Number(variant.old_price) : base.was,
          pct: 0,
          flashActive: false,
        }
      : base;
  if (variant?.price != null && pricing.was)
    pricing.pct = Math.round(((pricing.was - pricing.current) / pricing.was) * 100);
  const stock = variants.length
    ? variant
      ? variant.stock
      : needColor && pickedColor && !needSize
        ? colorStock(pickedColor)
        : Number(p.stock)
    : Number(p.stock);
  const ready = !variants.length || !!variant;
  const curQty = Math.min(qty, Math.max(1, stock));
  const images = p.images?.length ? p.images : [null];
  const name = tx(p, "name");
  const g = GENDERS.find((x) => x.value === p.gender),
    se = SEASONS.find((x) => x.value === p.season);
  const returnDays = Number(settings?.return_window_days ?? 0);
  const notes = (
    [
      ["top_notes", p.top_notes],
      ["middle_notes", p.middle_notes],
      ["base_notes", p.base_notes],
    ] as const
  ).filter((n): n is readonly ["top_notes" | "middle_notes" | "base_notes", string] => !!n[1]);
  const isPerfume =
    (profile.fields.includes("notes") || profile.fields.includes("volume")) &&
    !!(p.top_notes || p.middle_notes || p.base_notes || p.volume_ml || p.concentration);

  const add = () => {
    if (!ready) {
      sizeRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
      setNudge(true);
      setTimeout(() => setNudge(false), 1200);
      return toast.error(t("select_size_color"));
    }
    cart.addAndShow(
      {
        productId: p.id,
        variantId: variant?.id ?? null,
        name_ar: p.name_ar,
        name_en: p.name_en,
        variant_ar: variant?.name_ar,
        variant_en: variant?.name_en,
        size: variant?.size,
        color_ar: variant?.color_ar,
        color_en: variant?.color_en,
        color_hex: variant?.color_hex,
        image: p.images?.[0],
        maxQty: stock,
        price: pricing.current,
      },
      curQty,
    );
    toast.success(t("added_to_cart"));
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
    <div className="space-y-16 pb-24 md:space-y-24 md:pb-0">
      <div className="grid gap-8 md:grid-cols-[1.25fr_1fr] md:gap-14 lg:gap-20">
        <ProductGallery
          images={images}
          alt={name}
          overlay={
            <>
              {pricing.pct > 0 && (
                <span className="label-gold absolute start-4 top-4 text-deal">-{pricing.pct}%</span>
              )}
              <button
                onClick={toggleWish}
                aria-label={t("wishlist")}
                aria-pressed={!!wish.data}
                className="absolute end-3 top-3 flex h-11 w-11 items-center justify-center rounded-full bg-background/75 backdrop-blur-sm transition-colors hover:bg-background"
              >
                <Heart className={cn("h-5 w-5", wish.data && "fill-current")} strokeWidth={1.25} />
              </button>
            </>
          }
        />

        <div className="space-y-6 md:sticky md:top-24 md:self-start">
          <div className="space-y-3">
            {p.brand && <p className="eyebrow">{p.brand}</p>}
            <h1 className="font-display text-3xl md:text-4xl">{name}</h1>
            {Number(p.rating_count) > 0 && (
              <a href="#reviews" className="flex items-center gap-1 text-sm text-muted-foreground">
                <Star className="h-4 w-4 fill-foreground text-foreground" />
                {Number(p.rating_avg).toFixed(1)} · {p.rating_count} {t("reviews")}
              </a>
            )}
          </div>
          <div className="flex flex-wrap items-baseline gap-3">
            <span className={cn("text-xl font-medium tabular-nums", pricing.was && "text-deal")}>
              {money(pricing.current)}
            </span>
            {pricing.was && (
              <span className="text-base text-muted-foreground line-through">
                {money(pricing.was)}
              </span>
            )}
          </div>
          {pricing.flashActive && p.flash_ends_at && (
            <div>
              <span className="label-gold">
                {t("flash_deals")} · {t("ends_in")} <Countdown to={p.flash_ends_at} />
              </span>
            </div>
          )}
          {needColor && (
            <div>
              <p className="mb-3 text-sm">
                <span className="eyebrow me-1 text-foreground">{t("color")}</span>{" "}
                <span className="font-normal text-muted-foreground">
                  {lang === "ar"
                    ? colors.find((c) => c.color_en === pickedColor)?.color_ar
                    : pickedColor}
                </span>
              </p>
              <div className="flex flex-wrap gap-2">
                {colors.map((c) => {
                  const out = colorStock(c.color_en!) <= 0;
                  return (
                    <button
                      key={c.color_en}
                      type="button"
                      title={tx(c, "color")}
                      aria-label={tx(c, "color")}
                      aria-pressed={c.color_en === pickedColor}
                      onClick={() => {
                        setColor(c.color_en);
                        setQty(1);
                      }}
                      className={cn(
                        "relative h-11 w-11 rounded-full border p-1",
                        c.color_en === pickedColor ? "border-foreground" : "border-border",
                        out && "opacity-40",
                      )}
                    >
                      <span
                        className="block h-full w-full rounded-full border border-border"
                        style={{ background: c.color_hex ?? undefined }}
                      />
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {needSize && (
            <div
              ref={sizeRef}
              role="group"
              aria-labelledby="size-label"
              data-nudge={nudge || undefined}
              className={cn(
                "scroll-mt-24 transition-shadow",
                nudge && "animate-nudge ring-2 ring-deal ring-offset-4 ring-offset-background",
              )}
            >
              <div className="mb-2 flex items-center justify-between">
                <p id="size-label" className="eyebrow text-foreground">
                  {sizeAxisLabel}
                </p>
                {profile.size_guide && <SizeGuide type={profile.size_guide} />}
              </div>
              <div className="grid grid-cols-4 gap-2 sm:grid-cols-5">
                {sizes.map((s) => {
                  const out = sizeStock(s) <= 0;
                  return (
                    <button
                      key={s}
                      type="button"
                      disabled={out}
                      aria-pressed={s === pickedSize}
                      onClick={() => {
                        setSize(s);
                        setQty(1);
                      }}
                      className={cn(
                        "h-12 border px-2 text-sm transition-colors duration-300 disabled:cursor-not-allowed disabled:text-muted-foreground disabled:line-through",
                        s === pickedSize
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

          <p
            aria-live="polite"
            className={cn(
              "text-sm font-medium",
              !ready
                ? "text-muted-foreground"
                : stock <= 0
                  ? "text-destructive"
                  : stock <= LOW_STOCK
                    ? "text-deal"
                    : "text-success",
            )}
          >
            {!ready && needSize && !pickedSize
              ? t("select_size_color")
              : stock <= 0
                ? t("out_of_stock")
                : stock <= LOW_STOCK
                  ? t("only_left").replace("{n}", countLabel(stock, lang, "piece"))
                  : t("in_stock")}
          </p>

          {stock > 0 && (
            <div className="hidden gap-3 md:flex">
              <div className="w-36">
                <QtyStepper
                  qty={curQty}
                  max={stock}
                  allowRemove={false}
                  onChange={(n) => setQty(Math.max(1, n))}
                />
              </div>
              <Button size="xl" className="flex-1" onClick={add}>
                {t("add_to_cart")} · {money(pricing.current * curQty)}
              </Button>
            </div>
          )}

          <Accordion
            type="multiple"
            defaultValue={["description"]}
            className="border-t [&_button]:text-sm [&_button]:font-normal [&_button]:tracking-wide"
          >
            {tx(p, "description") && (
              <AccordionItem value="description">
                <AccordionTrigger className="text-sm font-semibold">
                  {t("description")}
                </AccordionTrigger>
                <AccordionContent>
                  <p className="text-sm leading-7 text-muted-foreground">{tx(p, "description")}</p>
                </AccordionContent>
              </AccordionItem>
            )}
            {(g || se || p.sku || p.brand) && (
              <AccordionItem value="details">
                <AccordionTrigger className="text-sm font-semibold">
                  {t("details")}
                </AccordionTrigger>
                <AccordionContent>
                  <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 text-sm">
                    {p.brand && (
                      <>
                        <dt className="text-muted-foreground">{t("brand")}</dt>
                        <dd>{p.brand}</dd>
                      </>
                    )}
                    {g && (
                      <>
                        <dt className="text-muted-foreground">{t("gender")}</dt>
                        <dd>{g[lang]}</dd>
                      </>
                    )}
                    {se && (
                      <>
                        <dt className="text-muted-foreground">{t("season")}</dt>
                        <dd>{se[lang]}</dd>
                      </>
                    )}
                    {(variant?.sku ?? p.sku) && (
                      <>
                        <dt className="text-muted-foreground">SKU</dt>
                        <dd dir="ltr" className="text-start">
                          {variant?.sku ?? p.sku}
                        </dd>
                      </>
                    )}
                  </dl>
                </AccordionContent>
              </AccordionItem>
            )}
            {tx(p, "material") && (
              <AccordionItem value="material">
                <AccordionTrigger className="text-sm font-semibold">
                  {t("material")}
                </AccordionTrigger>
                <AccordionContent>
                  <p className="text-sm leading-7 text-muted-foreground">{tx(p, "material")}</p>
                </AccordionContent>
              </AccordionItem>
            )}
            {tx(p, "care") && (
              <AccordionItem value="care">
                <AccordionTrigger className="text-sm font-semibold">{t("care")}</AccordionTrigger>
                <AccordionContent>
                  <p className="text-sm leading-7 text-muted-foreground">{tx(p, "care")}</p>
                </AccordionContent>
              </AccordionItem>
            )}
            {isPerfume && (
              <AccordionItem value="fragrance">
                <AccordionTrigger className="text-sm font-semibold">
                  {t("fragrance")}
                </AccordionTrigger>
                <AccordionContent className="space-y-3 text-sm">
                  <div className="flex flex-wrap gap-2">
                    {p.volume_ml && (
                      <span className="rounded-full border px-3 py-1">
                        {t("volume")}: {p.volume_ml} {lang === "ar" ? "مل" : "ml"}
                      </span>
                    )}
                    {p.concentration && (
                      <span className="rounded-full border px-3 py-1">
                        {t("concentration")}: {p.concentration}
                      </span>
                    )}
                  </div>
                </AccordionContent>
              </AccordionItem>
            )}
            {returnDays > 0 && (
              <AccordionItem value="returns">
                <AccordionTrigger className="text-sm font-semibold">
                  {lang === "ar" ? "الاسترجاع والاستبدال" : "Returns & exchanges"}
                </AccordionTrigger>
                <AccordionContent>
                  <p className="text-sm leading-7 text-muted-foreground">
                    {lang === "ar"
                      ? `تقدر ترجّع أو تستبدل خلال ${countLabel(returnDays, "ar", "day")} من الاستلام، من صفحة طلباتك.`
                      : `Return or exchange within ${countLabel(returnDays, "en", "day")} of delivery, from your orders page.`}
                  </p>
                </AccordionContent>
              </AccordionItem>
            )}
          </Accordion>
        </div>
      </div>

      {notes.length > 0 && (
        // Perfumes: the fragrance pyramid as its own quiet, dark editorial block.
        <section
          aria-labelledby="notes-title"
          className="surface-dark -mx-3 px-6 py-16 md:mx-0 md:py-24"
        >
          <div className="mx-auto max-w-4xl text-center">
            <p className="eyebrow text-on-dark/70">
              {lang === "ar" ? "الهرم العطري" : "The fragrance"}
            </p>
            <h2 id="notes-title" className="mt-3 font-display text-3xl text-on-dark md:text-4xl">
              {lang === "ar" ? "مكوّنات العطر" : "Fragrance notes"}
            </h2>
            <Ornament className="mt-5" />
            <dl className={cn("mt-12 grid gap-10", notes.length > 1 && "md:grid-cols-3")}>
              {notes.map(([k, v]) => (
                <div key={k} className="space-y-3">
                  <dt className="flex flex-col items-center gap-3 font-display text-2xl text-on-dark">
                    <span aria-hidden className="h-px w-8 bg-gold" />
                    {t(k)}
                  </dt>
                  <dd className="leading-loose text-on-dark/80">{v}</dd>
                </div>
              ))}
            </dl>
            {(p.volume_ml || p.concentration) && (
              <p className="mt-12 text-sm tracking-wide text-on-dark/70">
                {[p.concentration, p.volume_ml && `${p.volume_ml} ${lang === "ar" ? "مل" : "ml"}`]
                  .filter(Boolean)
                  .join(" · ")}
              </p>
            )}
          </div>
        </section>
      )}

      {stock > 0 && (
        <div className="fixed inset-x-0 bottom-[calc(3.5rem+env(safe-area-inset-bottom))] z-30 flex items-center gap-3 border-t bg-background/95 px-4 py-3 backdrop-blur md:hidden">
          <WhatsAppInlineIcon />
          <div className="min-w-0">
            <p className="truncate text-xs text-muted-foreground">
              {[
                pickedSize && sizeLabel(pickedSize, lang),
                needColor && tx(colors.find((c) => c.color_en === pickedColor) ?? null, "color"),
              ]
                .filter(Boolean)
                .join(" · ") || name}
            </p>
            <p className="font-medium tabular-nums">{money(pricing.current)}</p>
          </div>
          <Button size="lg" className="h-12 flex-1" onClick={add}>
            {ready ? t("add_to_cart") : t("choose_size")}
          </Button>
        </div>
      )}

      <Reviews productId={p.id} />

      <ProductRow
        eyebrow={lang === "ar" ? "نسّقها مع" : "Style it with"}
        title={lang === "ar" ? "أكمل الإطلالة" : "Complete the look"}
        products={look.data}
      />
      <ProductRow
        eyebrow={lang === "ar" ? "من نفس القسم" : "From the same department"}
        title={t("related")}
        products={related.data}
      />
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
      const { data } = await supabase
        .from("reviews")
        .select("*")
        .eq("product_id", productId)
        .order("created_at", { ascending: false })
        .limit(50);
      return data ?? [];
    },
  });
  const submit = async () => {
    if (!user) return;
    setBusy(true);
    const { error } = await supabase.from("reviews").upsert(
      {
        product_id: productId,
        user_id: user.id,
        rating,
        comment: comment.trim().slice(0, 1000) || null,
        author_name: (user.user_metadata?.full_name as string) || user.email?.split("@")[0] || null,
      },
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
              <button key={n} onClick={() => setRating(n)} aria-label={`${n}`}>
                <Star
                  className={cn(
                    "h-6 w-6",
                    n <= rating
                      ? "fill-brand-secondary text-brand-secondary"
                      : "text-muted-foreground",
                  )}
                />
              </button>
            ))}
          </div>
          <Textarea
            value={comment}
            onChange={(e) => setComment(e.target.value)}
            maxLength={1000}
            rows={2}
          />
          <Button size="sm" onClick={submit} disabled={busy}>
            {t("submit")}
          </Button>
        </div>
      ) : (
        <p className="mb-4 text-sm text-muted-foreground">
          <Link to="/auth" className="font-semibold text-primary">
            {t("sign_in_to_review")}
          </Link>
        </p>
      )}
      {isLoading ? (
        <Skeleton className="h-16" />
      ) : !data?.length ? (
        <p className="text-sm text-muted-foreground">{t("no_reviews")}</p>
      ) : (
        <ul className="divide-y">
          {data.map((r) => (
            <li key={r.id} className="py-3">
              <div className="flex items-center justify-between text-sm">
                <span className="font-semibold">{r.author_name ?? "—"}</span>
                <span className="text-xs text-muted-foreground">
                  {new Date(r.created_at).toLocaleDateString(lang === "ar" ? "ar-EG" : "en-US")}
                </span>
              </div>
              <div className="my-1 flex">
                {Array.from({ length: 5 }).map((_, i) => (
                  <Star
                    key={i}
                    className={cn(
                      "h-3.5 w-3.5",
                      i < r.rating ? "fill-brand-secondary text-brand-secondary" : "text-muted",
                    )}
                  />
                ))}
              </div>
              {r.comment && <p className="text-sm text-muted-foreground">{r.comment}</p>}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

/** A titled row of product cards at the bottom of the product page; hidden when empty. */
function ProductRow({
  eyebrow,
  title,
  products,
}: {
  eyebrow: string;
  title: string;
  products?: Product[];
}) {
  if (!products?.length) return null;
  return (
    <section>
      <SectionTitle eyebrow={eyebrow} title={title} />
      <div className="-mx-3 mt-10 flex snap-x gap-4 overflow-x-auto px-3 pb-2 scrollbar-none md:mx-0 md:gap-6 md:px-0">
        {products.map((r) => (
          <div key={r.id} className="w-[62%] shrink-0 snap-start sm:w-[38%] lg:w-[23%]">
            <ProductCard p={r} />
          </div>
        ))}
      </div>
    </section>
  );
}
