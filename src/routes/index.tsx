import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { RotateCcw, Truck, Wallet, Zap } from "lucide-react";
import useEmblaCarousel from "embla-carousel-react";
import { useI18n } from "@/lib/i18n";
import { useSettings } from "@/lib/store-settings";
import { useMoney } from "@/components/store/use-money";
import { isSafeLink } from "@/lib/whatsapp";
import { fetchBanners, fetchCategories, fetchProductsHome, type Product } from "@/lib/queries";
import { ProductCard } from "@/components/store/ProductCard";
import { SectionHeader } from "@/components/store/SiteShell";
import { Countdown } from "@/components/store/Countdown";
import { EmptyState, ErrorState, ProductCardSkeleton } from "@/components/store/states";
import { pageHead } from "@/lib/seo";
import { Skeleton } from "@/components/ui/skeleton";
import { countLabel } from "@/lib/format";
import { CategoryCard } from "@/components/store/CategoryCard";
import { profileKeyOf } from "@/lib/catalog";

export const Route = createFileRoute("/")({
  head: ({ matches }) => pageHead(matches),
  component: Home,
});

function BannerSlider() {
  const { t, tx, dir } = useI18n();
  const { data, isLoading } = useQuery({ queryKey: ["banners"], queryFn: fetchBanners });
  const [ref, api] = useEmblaCarousel({ loop: true, direction: dir });
  const [idx, setIdx] = useState(0);
  useEffect(() => {
    if (!api) return;
    api.on("select", () => setIdx(api.selectedScrollSnap()));
    const i = setInterval(() => api.scrollNext(), 5000);
    return () => clearInterval(i);
  }, [api]);
  if (isLoading)
    return (
      <Skeleton className="-mx-3 -mt-4 aspect-[4/5] rounded-none sm:aspect-[16/9] md:-mx-6 md:aspect-[21/9]" />
    );
  if (!data?.length) return null;
  return (
    <div className="relative -mx-3 -mt-4 md:-mx-6">
      <div ref={ref} className="overflow-hidden">
        <div className="flex">
          {data.map((b, i) => (
            <a
              key={b.id}
              href={b.link && isSafeLink(b.link) ? b.link : "#"}
              className="relative min-w-0 flex-[0_0_100%]"
            >
              <img
                src={b.image_url}
                alt={tx(b, "title")}
                loading={i === 0 ? "eager" : "lazy"}
                decoding="async"
                {...(i === 0 ? { fetchPriority: "high" as const } : {})}
                className="aspect-[4/5] w-full bg-muted object-cover sm:aspect-[16/9] md:aspect-[21/9]"
              />
              <div className="absolute inset-0 flex flex-col justify-end gap-2 bg-gradient-to-t from-foreground/60 via-transparent to-transparent p-6 pb-10 text-background md:p-12 md:pb-14">
                <h2 className="max-w-xl text-3xl font-extrabold leading-tight md:text-5xl">
                  {tx(b, "title")}
                </h2>
                <p className="max-w-md text-sm md:text-lg">{tx(b, "subtitle")}</p>
                <span className="mt-2 inline-flex h-11 w-fit items-center rounded-sm bg-background px-6 text-sm font-bold text-foreground">
                  {t("shop_now")}
                </span>
              </div>
            </a>
          ))}
        </div>
      </div>
      <div className="absolute inset-x-0 bottom-4 flex justify-center gap-1.5">
        {data.map((b, i) => (
          <span
            key={b.id}
            className={`h-1 rounded-full bg-background transition-all ${i === idx ? "w-5" : "w-1.5 opacity-60"}`}
          />
        ))}
      </div>
    </div>
  );
}

/** Top-level departments; the whole section is hidden when the store has none. */
function Departments() {
  const { t, tx } = useI18n();
  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ["categories"],
    queryFn: fetchCategories,
  });
  if (error) return <ErrorState onRetry={() => refetch()} />;
  const roots = (data ?? []).filter((c) => !c.parent_id && c.is_active);
  if (!isLoading && !roots.length) return null;
  return (
    <section>
      <SectionHeader
        title={t("shop_by_department")}
        action={
          <Link to="/categories" className="text-sm font-semibold underline underline-offset-4">
            {t("see_all")}
          </Link>
        }
      />
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        {isLoading
          ? Array.from({ length: 8 }).map((_, i) => (
              <Skeleton key={i} className="aspect-[3/4] rounded-md" />
            ))
          : roots.map((c, i) => (
              <CategoryCard
                key={c.id}
                id={c.id}
                name={tx(c, "name")}
                image={c.image_url}
                profileKey={profileKeyOf(c.id, data ?? [])}
                variant="tile"
                priority={i < 4}
              />
            ))}
      </div>
    </section>
  );
}

function Rail({
  title,
  products,
  loading,
  extra,
}: {
  title: React.ReactNode;
  products?: Product[];
  loading: boolean;
  extra?: React.ReactNode;
}) {
  const { t } = useI18n();
  if (!loading && !products?.length) return null;
  return (
    <section>
      <SectionHeader
        title={
          <span className="flex items-center gap-2">
            {title}
            {extra}
          </span>
        }
        action={
          <Link to="/products" className="text-sm font-semibold underline underline-offset-4">
            {t("see_all")}
          </Link>
        }
      />
      <div className="-mx-3 flex snap-x gap-3 overflow-x-auto px-3 pb-2 scrollbar-none md:mx-0 md:px-0">
        {loading
          ? Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="w-[44%] shrink-0 sm:w-[30%] lg:w-[23%]">
                <ProductCardSkeleton />
              </div>
            ))
          : products!.map((p) => (
              <div key={p.id} className="w-[44%] shrink-0 snap-start sm:w-[30%] lg:w-[23%]">
                <ProductCard p={p} />
              </div>
            ))}
      </div>
    </section>
  );
}

/** Only claims backed by store settings: free delivery (fee/threshold), cash on delivery, the return window. */
function TrustStrip() {
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
    <section
      className={`grid ${items.length === 3 ? "grid-cols-3" : items.length === 2 ? "grid-cols-2" : "grid-cols-1"} divide-x divide-border border-y py-4 rtl:divide-x-reverse`}
    >
      {items.map((i) => (
        <div
          key={i.label}
          className="flex flex-col items-center gap-1.5 px-2 text-center sm:flex-row sm:justify-center sm:gap-2"
        >
          <i.icon className="h-5 w-5 shrink-0" strokeWidth={1.5} />
          <span className="text-[11px] font-semibold sm:text-sm">{i.label}</span>
        </div>
      ))}
    </section>
  );
}

function Home() {
  const { t, lang } = useI18n();
  const flash = useQuery({
    queryKey: ["home", "flash"],
    queryFn: () => fetchProductsHome("flash"),
  });
  const best = useQuery({ queryKey: ["home", "best"], queryFn: () => fetchProductsHome("best") });
  const fresh = useQuery({ queryKey: ["home", "new"], queryFn: () => fetchProductsHome("new") });
  const season = useQuery({
    queryKey: ["home", "season"],
    queryFn: () => fetchProductsHome("season"),
  });
  const cats = useQuery({ queryKey: ["categories"], queryFn: fetchCategories });
  const soonest = flash.data?.[0]?.flash_ends_at;
  const loaded = [flash, best, fresh, season, cats].every((q) => q.isSuccess);
  const hasRoots = (cats.data ?? []).some((c) => !c.parent_id && c.is_active);
  const nothing = loaded && !hasRoots && [flash, best, fresh, season].every((q) => !q.data?.length);

  return (
    <div className="space-y-10 md:space-y-14">
      <BannerSlider />
      <TrustStrip />
      {nothing && (
        <EmptyState
          title={lang === "ar" ? "المتجر قيد التجهيز" : "The store is being set up"}
          hint={lang === "ar" ? "ترقبوا منتجاتنا قريباً." : "Products are coming soon."}
        />
      )}
      <Departments />
      <Rail
        title={
          <>
            <Zap className="h-5 w-5 fill-deal text-deal" />
            {t("flash_deals")}
          </>
        }
        extra={
          soonest ? (
            <span className="flex items-center gap-1 text-xs font-medium text-muted-foreground">
              {t("ends_in")} <Countdown to={soonest} />
            </span>
          ) : null
        }
        products={flash.data}
        loading={flash.isLoading}
      />
      <Rail title={t("new_arrivals")} products={fresh.data} loading={fresh.isLoading} />
      <Rail title={t("best_sellers")} products={best.data} loading={best.isLoading} />
      <Rail title={t("seasonal_collection")} products={season.data} loading={season.isLoading} />
      {(flash.error || best.error || fresh.error || season.error) && (
        <ErrorState
          onRetry={() => {
            flash.refetch();
            best.refetch();
            fresh.refetch();
            season.refetch();
          }}
        />
      )}
    </div>
  );
}
