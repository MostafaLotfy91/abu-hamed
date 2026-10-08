import { useCallback } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useI18n } from "@/lib/i18n";
import { parseListSearch, toListSearch, type ListState } from "@/lib/catalog";
import { pageHead } from "@/lib/seo";
import { ProductListing } from "@/components/store/ProductListing";
import { isServer, listingFiltersFor, loadInitialListing } from "@/lib/listing-ssr";

type ProductsSearch = { q?: string } & Partial<Record<string, unknown>>;

export const Route = createFileRoute("/products")({
  // Search text plus the listing filters (see parseListSearch); unknown keys are ignored by the listing.
  validateSearch: (s: Record<string, unknown>): ProductsSearch => ({
    ...s,
    q: typeof s.q === "string" && s.q.trim() ? s.q : undefined,
  }),
  loaderDeps: ({ search }) => ({ search }),
  // Server only: first page into the HTML. In the browser the listing fetches as the filters change.
  loader: async ({ deps }) =>
    isServer()
      ? {
          listing: await loadInitialListing(
            listingFiltersFor({ q: deps.search.q }, deps.search, null),
          ),
        }
      : { listing: null },
  head: ({ matches }) => pageHead(matches, { title: { ar: "كل المنتجات", en: "All products" } }),
  component: ProductsPage,
});

function ProductsPage() {
  const search = Route.useSearch();
  const navigate = useNavigate({ from: "/products" });
  const { t } = useI18n();
  const q = search.q;
  const onStateChange = useCallback(
    (next: ListState) =>
      navigate({
        search: (prev: Record<string, unknown>) => ({
          q: prev.q as string | undefined,
          ...toListSearch(next),
        }),
        replace: true,
      }),
    [navigate],
  );
  // Search and "all products" span every category, so only the universal filters apply (profile = null).
  return (
    <ProductListing
      key={q ?? ""}
      base={{ q }}
      profile={null}
      state={parseListSearch(search)}
      onStateChange={onStateChange}
      initial={Route.useLoaderData().listing}
      title={q ? `${t("results_for")} "${q}"` : t("all_products")}
    />
  );
}
