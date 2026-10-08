import { useCallback } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useI18n } from "@/lib/i18n";
import { parseListSearch, profileOf, toListSearch, type ListState } from "@/lib/catalog";
import { descendantIds, fetchCategories, profilesQuery } from "@/lib/queries";
import { ProductListing } from "@/components/store/ProductListing";
import { ProductGridSkeleton, ErrorState, EmptyState } from "@/components/store/states";

export const Route = createFileRoute("/category/$id")({
  // Listing filters live in the URL so reloads and shared links keep them (see parseListSearch).
  validateSearch: (s: Record<string, unknown>): Partial<Record<string, unknown>> => s,
  head: () => ({
    meta: [
      { title: "قسم المنتجات · Category" },
      { name: "description", content: "منتجات القسم. Products in this category." },
      { property: "og:title", content: "قسم المنتجات · Category" },
      { property: "og:description", content: "Products in this category." },
    ],
  }),
  component: CategoryPage,
});

function CategoryPage() {
  const { id } = Route.useParams();
  const { tx, t } = useI18n();
  const search = Route.useSearch();
  const navigate = useNavigate({ from: "/category/$id" });
  const onStateChange = useCallback((next: ListState) => navigate({ search: toListSearch(next), replace: true }), [navigate]);
  const { data, isLoading, error, refetch } = useQuery({ queryKey: ["categories"], queryFn: fetchCategories });
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
      <nav className="flex flex-wrap gap-1 text-xs text-muted-foreground">
        <Link to="/categories">{t("categories")}</Link>
        {chain.map((c) => <span key={c.id}> / <Link to="/category/$id" params={{ id: c.id }}>{tx(c, "name")}</Link></span>)}
      </nav>
      {kids.length > 0 && (
        <div className="-mx-3 flex gap-2 overflow-x-auto px-3 scrollbar-none">
          {kids.map((k) => (
            <Link key={k.id} to="/category/$id" params={{ id: k.id }} className="shrink-0 rounded-full border bg-card px-4 py-1.5 text-sm font-semibold hover:border-primary">{tx(k, "name")}</Link>
          ))}
        </div>
      )}
      <ProductListing key={id} base={{ categoryIds: descendantIds(all, id) }} title={tx(cat, "name")}
        profile={profileOf(id, all, profiles.data ?? [])}
        types={kids.map((k) => ({ id: k.id, label: tx(k, "name"), ids: descendantIds(all, k.id) }))}
        state={parseListSearch(search)} onStateChange={onStateChange} />
    </div>
  );
}
