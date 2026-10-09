import type { ReactNode } from "react";
import { Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { RotateCcw, Truck, Wallet } from "lucide-react";
import { useI18n } from "@/lib/i18n";
import { useSettings } from "@/lib/store-settings";
import { useMoney } from "@/components/store/use-money";
import { categoryImagesQuery, fetchCategories, type Product } from "@/lib/queries";
import { ProductCard } from "@/components/store/ProductCard";
import { CategoryCard } from "@/components/store/CategoryCard";
import { Countdown } from "@/components/store/Countdown";
import { ErrorState, ProductCardSkeleton } from "@/components/store/states";
import { Skeleton } from "@/components/ui/skeleton";
import { Reveal } from "@/components/luxe/Reveal";
import { Ornament, SectionTitle } from "@/components/luxe/Ornament";
import { profileKeyOf } from "@/lib/catalog";
import { countLabel } from "@/lib/format";
import { isSafeLink } from "@/lib/whatsapp";
import { cn } from "@/lib/utils";
import type { Tables } from "@/integrations/supabase/types";

/** Centered "see all" text link with the slow underline. */
function SeeAll({ to = "/products" }: { to?: "/products" | "/categories" }) {
  const { t } = useI18n();
  return (
    <div className="mt-10 text-center md:mt-14">
      <Link to={to} className="link-luxe text-sm font-medium tracking-wide">
        {t("see_all")}
      </Link>
    </div>
  );
}

/** Top-level departments as tall editorial tiles; hidden when the store has none. */
export function Departments() {
  const { t, tx, lang } = useI18n();
  const images = useQuery(categoryImagesQuery);
  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ["categories"],
    queryFn: fetchCategories,
  });
  if (error) return <ErrorState onRetry={() => refetch()} />;
  const roots = (data ?? []).filter((c) => !c.parent_id && c.is_active);
  if (!isLoading && !roots.length) return null;
  return (
    <section className="section-luxe container-wide">
      <Reveal>
        <SectionTitle
          eyebrow={lang === "ar" ? "الأقسام" : "The departments"}
          title={t("shop_by_department")}
        />
      </Reveal>
      <div className="mt-10 grid grid-cols-2 gap-x-3 gap-y-6 md:mt-14 md:grid-cols-3 md:gap-x-6 md:gap-y-10 lg:grid-cols-4">
        {isLoading
          ? Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} className="aspect-[2/3] rounded-none" />
            ))
          : roots.map((c, i) => (
              <Reveal key={c.id} delay={(i % 4) * 90}>
                <CategoryCard
                  id={c.id}
                  name={tx(c, "name")}
                  image={images.data?.get(c.id) ?? c.image_url}
                  profileKey={profileKeyOf(c.id, data ?? [])}
                  variant="tile"
                  priority={i < 2}
                />
              </Reveal>
            ))}
      </div>
      <SeeAll to="/categories" />
    </section>
  );
}

/** A titled row of product cards; hidden when there is nothing to show. */
export function Rail({
  eyebrow,
  title,
  products,
  loading,
  label,
  tone = "plain",
}: {
  eyebrow?: string;
  title: string;
  products?: Product[];
  loading: boolean;
  /** Small refined note under the title (e.g. the offer's end time). */
  label?: ReactNode;
  /** "band": a quiet tinted background, for the one offers strip. */
  tone?: "plain" | "band";
}) {
  if (!loading && !products?.length) return null;
  return (
    <section className={cn("section-luxe", tone === "band" && "bg-secondary")}>
      <div className="container-wide">
        <Reveal>
          <SectionTitle eyebrow={eyebrow} title={title} />
          {label && <div className="mt-4 flex justify-center">{label}</div>}
        </Reveal>
        <div className="-mx-5 mt-10 flex snap-x gap-4 overflow-x-auto px-5 pb-2 scrollbar-none md:mx-0 md:mt-14 md:gap-6 md:px-0">
          {loading
            ? Array.from({ length: 4 }).map((_, i) => (
                <div key={i} className="w-[62%] shrink-0 sm:w-[38%] lg:w-[23%]">
                  <ProductCardSkeleton />
                </div>
              ))
            : products!.map((p) => (
                <div key={p.id} className="w-[62%] shrink-0 snap-start sm:w-[38%] lg:w-[23%]">
                  <ProductCard p={p} />
                </div>
              ))}
        </div>
        <SeeAll />
      </div>
    </section>
  );
}

/** The quiet offers strip: the flash row with its end time in a small gold label instead of a loud timer. */
export function OffersStrip({ products, loading }: { products?: Product[]; loading: boolean }) {
  const { t, lang } = useI18n();
  const soonest = products?.[0]?.flash_ends_at;
  return (
    <Rail
      tone="band"
      eyebrow={lang === "ar" ? "لفترة محدودة" : "For a limited time"}
      title={t("flash_deals")}
      products={products}
      loading={loading}
      label={
        soonest ? (
          <span className="label-gold">
            {t("ends_in")} <Countdown to={soonest} />
          </span>
        ) : null
      }
    />
  );
}

/** Editorial "collection" banner: one banner from the store as a large picture beside its words. */
export function EditorialBanner({ banner }: { banner: Tables<"banners"> | null }) {
  const { t, tx, lang } = useI18n();
  if (!banner) return null;
  const title = tx(banner, "title");
  const sub = tx(banner, "subtitle");
  const link = banner.link && isSafeLink(banner.link) ? banner.link : "/products";
  return (
    <section className="section-luxe">
      <Reveal className="container-wide">
        <div className="grid overflow-hidden md:grid-cols-2">
          <a href={link} className="group relative block overflow-hidden bg-muted" tabIndex={-1}>
            <img
              src={banner.image_url}
              alt={title}
              loading="lazy"
              decoding="async"
              className="img-zoom aspect-[4/5] h-full w-full object-cover md:aspect-auto md:min-h-[640px]"
            />
          </a>
          <div className="surface-dark flex flex-col justify-center gap-6 px-8 py-14 md:px-16">
            <p className="eyebrow text-on-dark/70">
              {lang === "ar" ? "المجموعة" : "The collection"}
            </p>
            {title && <h2 className="font-display text-3xl text-on-dark md:text-5xl">{title}</h2>}
            <Ornament className="justify-start" />
            {sub && <p className="max-w-md leading-loose text-on-dark/80">{sub}</p>}
            <div>
              <a
                href={link}
                className="inline-flex h-12 items-center border border-gold px-10 text-sm tracking-[0.08em] text-on-dark transition-colors duration-500 hover:bg-gold hover:text-gold-foreground rtl:tracking-normal"
              >
                {t("shop_now")}
              </a>
            </div>
          </div>
        </div>
      </Reveal>
    </section>
  );
}

/** Short brand story, written by the store in Admin → Store settings; hidden until there is text. */
export function BrandStory() {
  const { lang, tx } = useI18n();
  const { settings } = useSettings();
  const f = (settings?.features ?? {}) as Record<string, unknown>;
  const text = String(
    (lang === "ar" ? f.brand_story_ar : f.brand_story_en) || f.brand_story_ar || "",
  ).trim();
  if (!text) return null;
  return (
    <section className="section-luxe">
      <Reveal className="container-text text-center">
        <SectionTitle
          eyebrow={lang === "ar" ? "حكايتنا" : "Our story"}
          title={tx(settings as Record<string, unknown> | null, "name")}
        />
        <p className="mt-8 whitespace-pre-line text-lg leading-loose text-muted-foreground">
          {text}
        </p>
      </Reveal>
    </section>
  );
}

/** Only claims backed by store settings: free delivery (fee/threshold), cash on delivery, the return window. */
export function TrustStrip() {
  const { t, lang } = useI18n();
  const { settings } = useSettings();
  const money = useMoney();
  if (!settings) return null;
  const ar = lang === "ar";
  const fee = Number(settings.delivery_fee ?? 0);
  const over =
    settings.free_delivery_threshold != null ? Number(settings.free_delivery_threshold) : null;
  const days = Number(settings.return_window_days ?? 0);
  const items = [
    fee === 0
      ? { icon: Truck, label: ar ? "توصيل مجاني" : "Free delivery" }
      : over != null
        ? {
            icon: Truck,
            label: ar ? `توصيل مجاني فوق ${money(over)}` : `Free delivery over ${money(over)}`,
          }
        : null,
    { icon: Wallet, label: t("trust_cod") },
    days > 0
      ? {
          icon: RotateCcw,
          label: ar
            ? `استرجاع خلال ${countLabel(days, "ar", "day")}`
            : `Returns within ${countLabel(days, "en", "day")}`,
        }
      : null,
  ].filter((i): i is { icon: typeof Truck; label: string } => !!i);
  return (
    <section className="section-luxe container-wide">
      <ul
        className={cn(
          "grid grid-cols-1 gap-y-8 border-y py-10 md:py-12",
          items.length === 3 ? "sm:grid-cols-3" : items.length === 2 && "sm:grid-cols-2",
        )}
      >
        {items.map((i) => (
          <li key={i.label} className="flex flex-col items-center gap-3 px-3 text-center">
            <i.icon className="h-7 w-7 text-gold" strokeWidth={1} />
            <span className="text-sm text-muted-foreground">{i.label}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}
