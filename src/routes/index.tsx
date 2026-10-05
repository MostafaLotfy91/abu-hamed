import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { Zap } from "lucide-react";
import useEmblaCarousel from "embla-carousel-react";
import { supabase } from "@/integrations/supabase/client";
import { useI18n } from "@/lib/i18n";
import { useAuth } from "@/lib/auth";
import { fetchBanners, fetchCategories, fetchProductsHome, PRODUCT_FIELDS, type Product } from "@/lib/queries";
import { ProductCard } from "@/components/store/ProductCard";
import { SectionHeader } from "@/components/store/SiteShell";
import { Countdown } from "@/components/store/Countdown";
import { ErrorState, ProductCardSkeleton } from "@/components/store/states";
import { Skeleton } from "@/components/ui/skeleton";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "تسوق البقالة أونلاين · Online Grocery" },
      { name: "description", content: "اطلب احتياجات بيتك من السوبر ماركت ووصلها لحد الباب. Order groceries online with fast delivery." },
      { property: "og:title", content: "تسوق البقالة أونلاين · Online Grocery" },
      { property: "og:description", content: "Fresh groceries delivered to your door." },
    ],
  }),
  component: Home,
});

function BannerSlider() {
  const { tx, dir } = useI18n();
  const { data, isLoading } = useQuery({ queryKey: ["banners"], queryFn: fetchBanners });
  const [ref, api] = useEmblaCarousel({ loop: true, direction: dir });
  const [idx, setIdx] = useState(0);
  useEffect(() => {
    if (!api) return;
    api.on("select", () => setIdx(api.selectedScrollSnap()));
    const i = setInterval(() => api.scrollNext(), 5000);
    return () => clearInterval(i);
  }, [api]);
  if (isLoading) return <Skeleton className="aspect-[5/2] w-full rounded-2xl md:aspect-[4/1]" />;
  if (!data?.length) return null;
  return (
    <div className="relative">
      <div ref={ref} className="overflow-hidden rounded-2xl">
        <div className="flex">
          {data.map((b, i) => (
            <a key={b.id} href={b.link ?? "#"} className="relative min-w-0 flex-[0_0_100%]">
              <img src={b.image_url} alt={tx(b, "title")} loading={i === 0 ? "eager" : "lazy"} className="aspect-[5/2] w-full object-cover md:aspect-[4/1]" />
              <div className="absolute inset-0 flex flex-col justify-center gap-1 bg-gradient-to-l from-transparent via-transparent to-foreground/60 p-5 text-primary-foreground rtl:bg-gradient-to-r md:p-10">
                <h2 className="max-w-[60%] text-xl font-extrabold md:text-4xl">{tx(b, "title")}</h2>
                <p className="max-w-[60%] text-sm md:text-lg">{tx(b, "subtitle")}</p>
              </div>
            </a>
          ))}
        </div>
      </div>
      <div className="absolute inset-x-0 bottom-2 flex justify-center gap-1.5">
        {data.map((b, i) => <span key={b.id} className={`h-1.5 rounded-full bg-card transition-all ${i === idx ? "w-5" : "w-1.5 opacity-60"}`} />)}
      </div>
    </div>
  );
}

function CategoryGrid() {
  const { tx } = useI18n();
  const { data, isLoading, error, refetch } = useQuery({ queryKey: ["categories"], queryFn: fetchCategories });
  if (error) return <ErrorState onRetry={() => refetch()} />;
  const roots = (data ?? []).filter((c) => !c.parent_id && c.is_active);
  return (
    <div className="grid grid-cols-4 gap-3 sm:grid-cols-6 lg:grid-cols-8">
      {isLoading
        ? Array.from({ length: 8 }).map((_, i) => <Skeleton key={i} className="aspect-square rounded-2xl" />)
        : roots.map((c) => (
            <Link key={c.id} to="/category/$id" params={{ id: c.id }} className="group flex flex-col items-center gap-1.5 text-center">
              <div className="aspect-square w-full overflow-hidden rounded-2xl bg-primary-soft">
                {c.image_url && <img src={c.image_url} alt="" loading="lazy" className="h-full w-full object-cover transition group-hover:scale-105" />}
              </div>
              <span className="line-clamp-2 text-xs font-semibold md:text-sm">{tx(c, "name")}</span>
            </Link>
          ))}
    </div>
  );
}

function Rail({ title, products, loading, extra }: { title: React.ReactNode; products?: Product[]; loading: boolean; extra?: React.ReactNode }) {
  const { t } = useI18n();
  if (!loading && !products?.length) return null;
  return (
    <section>
      <SectionHeader title={<span className="flex items-center gap-2">{title}{extra}</span>} action={<Link to="/products" className="text-sm font-semibold text-primary">{t("see_all")}</Link>} />
      <div className="-mx-3 flex snap-x gap-3 overflow-x-auto px-3 pb-2 scrollbar-none md:mx-0 md:px-0">
        {loading
          ? Array.from({ length: 5 }).map((_, i) => <div key={i} className="w-40 shrink-0 md:w-48"><ProductCardSkeleton /></div>)
          : products!.map((p) => <div key={p.id} className="w-40 shrink-0 snap-start md:w-48"><ProductCard p={p} /></div>)}
      </div>
    </section>
  );
}

function OrderAgain() {
  const { user } = useAuth();
  const { t } = useI18n();
  const { data, isLoading } = useQuery({
    queryKey: ["order_again", user?.id],
    enabled: !!user,
    queryFn: async () => {
      const { data: items } = await supabase.from("order_items").select("product_id, orders!inner(user_id)").eq("orders.user_id", user!.id).limit(60);
      const ids = Array.from(new Set((items ?? []).map((i) => i.product_id).filter(Boolean))) as string[];
      if (!ids.length) return [];
      const { data: prods } = await supabase.from("products").select(PRODUCT_FIELDS).in("id", ids.slice(0, 12)).eq("is_active", true);
      return (prods ?? []) as Product[];
    },
  });
  if (!user) return null;
  return <Rail title={t("order_again")} products={data} loading={isLoading} />;
}

function Home() {
  const { t } = useI18n();
  const flash = useQuery({ queryKey: ["home", "flash"], queryFn: () => fetchProductsHome("flash") });
  const best = useQuery({ queryKey: ["home", "best"], queryFn: () => fetchProductsHome("best") });
  const fresh = useQuery({ queryKey: ["home", "new"], queryFn: () => fetchProductsHome("new") });
  const soonest = flash.data?.[0]?.flash_ends_at;

  return (
    <div className="space-y-7">
      <BannerSlider />
      <CategoryGrid />
      <Rail
        title={<><Zap className="h-5 w-5 fill-deal text-deal" />{t("flash_deals")}</>}
        extra={soonest ? <span className="flex items-center gap-1 text-xs font-medium text-muted-foreground">{t("ends_in")} <Countdown to={soonest} /></span> : null}
        products={flash.data}
        loading={flash.isLoading}
      />
      <OrderAgain />
      <Rail title={t("best_sellers")} products={best.data} loading={best.isLoading} />
      <Rail title={t("new_arrivals")} products={fresh.data} loading={fresh.isLoading} />
      {(flash.error || best.error) && <ErrorState onRetry={() => { flash.refetch(); best.refetch(); fresh.refetch(); }} />}
    </div>
  );
}
