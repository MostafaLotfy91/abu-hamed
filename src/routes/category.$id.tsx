import { useCallback } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useI18n } from "@/lib/i18n";
import { pageHead } from "@/lib/seo";
import { parseListSearch, profileOf, toListSearch, type ListState } from "@/lib/catalog";
import {
  categoryImagesQuery,
  descendantIds,
  fetchCategories,
  fetchProfiles,
  profilesQuery,
} from "@/lib/queries";
import { usableImage } from "@/lib/category-image";
import { isServer, listingFiltersFor, loadInitialListing } from "@/lib/listing-ssr";
import { ProductListing } from "@/components/store/ProductListing";
import { ProductGridSkeleton, ErrorState, EmptyState } from "@/components/store/states";

export const Route = createFileRoute("/category/$id")({
  // Listing filters live in the URL so reloads and shared links keep them (see parseListSearch).
  validateSearch: (s: Record<string, unknown>): Partial<Record<string, unknown>> => s,
  loaderDeps: ({ search }) => ({ search }),
  loader: async ({ params, deps, context }) => {
    // <head> data; cached so filter changes in the browser don't refetch it.
    const seo = await context.queryClient.ensureQueryData({
      queryKey: ["category-seo", params.id],
      queryFn: async () =>
        (
          await supabase
            .from("categories")
            .select("name_ar,name_en,image_url")
            .eq("id", params.id)
            .maybeSingle()
        ).data ?? null,
    });
    // On the server, also load what the page needs to render its products into the HTML.
    if (!isServer()) return { seo, ssr: null };
    const [categories, profiles] = await Promise.all([fetchCategories(), fetchProfiles()]);
    const kids = categories.filter((c) => c.parent_id === params.id && c.is_active);
    const filters = listingFiltersFor(
      { categoryIds: descendantIds(categories, params.id) },
      deps.search,
      profileOf(params.id, categories, profiles),
    );
    const typeIds =
      filters.type && kids.some((k) => k.id === filters.type)
        ? descendantIds(categories, filters.type)
        : undefined;
    const listing = await loadInitialListing(filters, typeIds);
    return { seo, ssr: { categories, profiles, listing } };
  },
  head: ({ matches, loaderData }) =>
    pageHead(matches, {
      title: loaderData?.seo
        ? { ar: loaderData.seo.name_ar, en: loaderData.seo.name_en }
        : { ar: "قسم", en: "Category" },
      image: loaderData?.seo?.image_url ?? null,
    }),
  component: CategoryPage,
});

function CategoryPage() {
  const { id } = Route.useParams();
  const { tx, t } = useI18n();
  const search = Route.useSearch();
  const navigate = useNavigate({ from: "/category/$id" });
  const onStateChange = useCallback(
    (next: ListState) => navigate({ search: toListSearch(next), replace: true }),
    [navigate],
  );
  const { ssr } = Route.useLoaderData();
  const images = useQuery(categoryImagesQuery);
  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ["categories"],
    queryFn: fetchCategories,
    ...(ssr ? { initialData: ssr.categories, staleTime: 60_000 } : {}),
  });
  const profiles = useQuery({
    ...profilesQuery,
    ...(ssr ? { initialData: ssr.profiles } : {}),
  });
  if (isLoading || profiles.isLoading) return <ProductGridSkeleton />;
  if (error) return <ErrorState onRetry={() => refetch()} />;
  const all = data ?? [];
  const cat = all.find((c) => c.id === id);
  if (!cat) return <EmptyState title={t("no_products")} />;
  // breadcrumb chain
  const chain = [cat];
  while (chain[0].parent_id) {
    const p = all.find((c) => c.id === chain[0].parent_id);
    if (!p) break;
    chain.unshift(p);
  }
  const kids = all.filter((c) => c.parent_id === id && c.is_active);
  const banner = usableImage(images.data?.get(id) ?? cat.image_url);
  return (
    <div className="space-y-6">
      <nav
        aria-label={t("categories")}
        className="flex flex-wrap items-center justify-center gap-1 text-xs tracking-wide text-muted-foreground"
      >
        <Link to="/categories" className="inline-flex min-h-8 items-center hover:text-foreground">
          {t("categories")}
        </Link>
        {chain.map((c) => (
          <span key={c.id} className="inline-flex items-center gap-1">
            <span aria-hidden>/</span>
            <Link
              to="/category/$id"
              params={{ id: c.id }}
              className="inline-flex min-h-8 items-center hover:text-foreground"
            >
              {tx(c, "name")}
            </Link>
          </span>
        ))}
      </nav>
      {banner && (
        // Category banner: the department's own picture with its name in the display face.
        <section className="relative -mx-3 overflow-hidden bg-muted md:mx-0">
          <img
            src={banner}
            alt=""
            fetchPriority="high"
            decoding="async"
            className="aspect-[16/9] w-full object-cover md:aspect-[21/7]"
          />
          <div className="absolute inset-0 flex items-end justify-center bg-gradient-to-t from-black/55 via-black/10 to-transparent pb-8 md:pb-14">
            <h1 className="px-4 text-center font-display text-4xl text-white md:text-6xl">
              {tx(cat, "name")}
            </h1>
          </div>
        </section>
      )}
      {kids.length > 0 && (
        <div className="-mx-3 flex gap-2 overflow-x-auto px-3 scrollbar-none md:justify-center">
          {kids.map((k) => (
            <Link
              key={k.id}
              to="/category/$id"
              params={{ id: k.id }}
              className="inline-flex h-10 shrink-0 items-center border px-5 text-sm transition-colors duration-300 hover:border-foreground"
            >
              {tx(k, "name")}
            </Link>
          ))}
        </div>
      )}
      <ProductListing
        key={id}
        base={{ categoryIds: descendantIds(all, id) }}
        title={banner ? undefined : tx(cat, "name")}
        profile={profileOf(id, all, profiles.data ?? [])}
        types={kids.map((k) => ({ id: k.id, label: tx(k, "name"), ids: descendantIds(all, k.id) }))}
        state={parseListSearch(search)}
        onStateChange={onStateChange}
        initial={ssr?.listing}
      />
    </div>
  );
}
