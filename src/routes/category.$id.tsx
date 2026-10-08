import { useCallback } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useI18n } from "@/lib/i18n";
import { pageHead } from "@/lib/seo";
import { parseListSearch, profileOf, toListSearch, type ListState } from "@/lib/catalog";
import { descendantIds, fetchCategories, profilesQuery } from "@/lib/queries";
import { ProductListing } from "@/components/store/ProductListing";
import { ProductGridSkeleton, ErrorState, EmptyState } from "@/components/store/states";

export const Route = createFileRoute("/category/$id")({
  // Listing filters live in the URL so reloads and shared links keep them (see parseListSearch).
  validateSearch: (s: Record<string, unknown>): Partial<Record<string, unknown>> => s,
  loader: async ({ params }) => {
    const { data } = await supabase
      .from("categories")
      .select("name_ar,name_en,image_url")
      .eq("id", params.id)
      .maybeSingle();
    return { seo: data ?? null };
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
  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ["categories"],
    queryFn: fetchCategories,
  });
  const profiles = useQuery(profilesQuery);
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
  return (
    <div className="space-y-4">
      <nav
        aria-label={t("categories")}
        className="flex flex-wrap items-center gap-1 text-xs text-muted-foreground"
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
      {kids.length > 0 && (
        <div className="-mx-3 flex gap-2 overflow-x-auto px-3 scrollbar-none">
          {kids.map((k) => (
            <Link
              key={k.id}
              to="/category/$id"
              params={{ id: k.id }}
              className="inline-flex h-10 shrink-0 items-center rounded-full border bg-card px-4 text-sm font-semibold hover:border-primary"
            >
              {tx(k, "name")}
            </Link>
          ))}
        </div>
      )}
      <ProductListing
        key={id}
        base={{ categoryIds: descendantIds(all, id) }}
        title={tx(cat, "name")}
        profile={profileOf(id, all, profiles.data ?? [])}
        types={kids.map((k) => ({ id: k.id, label: tx(k, "name"), ids: descendantIds(all, k.id) }))}
        state={parseListSearch(search)}
        onStateChange={onStateChange}
      />
    </div>
  );
}
