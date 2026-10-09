import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useI18n } from "@/lib/i18n";
import { fetchBanners, fetchCategories, fetchProductsHome } from "@/lib/queries";
import { EmptyState, ErrorState } from "@/components/store/states";
import { pageHead } from "@/lib/seo";
import { usableImage } from "@/lib/category-image";
import { Hero } from "@/components/store/home/Hero";
import {
  BrandStory,
  Departments,
  EditorialBanner,
  OffersStrip,
  Rail,
  TrustStrip,
} from "@/components/store/home/Sections";

export const Route = createFileRoute("/")({
  head: ({ matches }) => pageHead(matches),
  component: Home,
});

function Home() {
  const { t, lang } = useI18n();
  const ar = lang === "ar";
  const banners = useQuery({ queryKey: ["banners"], queryFn: fetchBanners });
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

  // Banners whose picture can't load anywhere (empty, old /__l5e/ path) are skipped, not shown broken.
  // With two or more, the last one becomes the editorial collection banner; the rest crossfade in the hero.
  const usable = (banners.data ?? []).filter((b) => usableImage(b.image_url));
  const editorial = usable.length >= 2 ? usable[usable.length - 1] : null;
  const heroBanners = editorial ? usable.slice(0, -1) : usable;

  const loaded = [flash, best, fresh, season, cats].every((q) => q.isSuccess);
  const hasRoots = (cats.data ?? []).some((c) => !c.parent_id && c.is_active);
  const nothing = loaded && !hasRoots && [flash, best, fresh, season].every((q) => !q.data?.length);

  return (
    <div>
      <Hero banners={heroBanners} loading={banners.isLoading} />
      {nothing && (
        <div className="section-luxe container-wide">
          <EmptyState
            title={ar ? "المتجر قيد التجهيز" : "The store is being set up"}
            hint={ar ? "ترقبوا منتجاتنا قريباً." : "Products are coming soon."}
          />
        </div>
      )}
      <Departments />
      <Rail
        eyebrow={ar ? "جديد الموسم" : "Just in"}
        title={t("new_arrivals")}
        products={fresh.data}
        loading={fresh.isLoading}
      />
      <EditorialBanner banner={editorial} />
      <Rail
        eyebrow={ar ? "الأكثر طلباً" : "Most loved"}
        title={t("best_sellers")}
        products={best.data}
        loading={best.isLoading}
      />
      <OffersStrip products={flash.data} loading={flash.isLoading} />
      <Rail
        eyebrow={ar ? "مختارات" : "Curated"}
        title={t("seasonal_collection")}
        products={season.data}
        loading={season.isLoading}
      />
      <BrandStory />
      <TrustStrip />
      {(flash.error || best.error || fresh.error || season.error) && (
        <div className="container-wide">
          <ErrorState
            onRetry={() => {
              flash.refetch();
              best.refetch();
              fresh.refetch();
              season.refetch();
            }}
          />
        </div>
      )}
    </div>
  );
}
