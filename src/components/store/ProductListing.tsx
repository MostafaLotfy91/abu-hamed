import { useEffect, useMemo, useRef, useState } from "react";
import { keepPreviousData, useInfiniteQuery, useQuery } from "@tanstack/react-query";
import { SlidersHorizontal, X } from "lucide-react";
import { useI18n } from "@/lib/i18n";
import { GENDERS, SEASONS, sizeLabel } from "@/lib/fashion";
import {
  ALL_FILTERS,
  listingFilters,
  pruneFilters,
  type ListState,
  type Profile,
} from "@/lib/catalog";
import {
  EMPTY_OPTIONS,
  fetchFilterOptions,
  fetchProductCount,
  fetchProductPage,
  PAGE_SIZE,
  type ListFilters,
} from "@/lib/queries";
import { ProductCard } from "./ProductCard";
import { EmptyState, ErrorState, ProductGridSkeleton } from "./states";
import { FilterPanel, type TypeOption } from "./FilterPanel";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { countLabel } from "@/lib/format";
import { listingKey, type InitialListing } from "@/lib/listing-ssr";

type Base = Pick<ListFilters, "q" | "categoryIds">;
/** A subcategory offered by the "type" filter: its id, label and the ids of its whole subtree. */
export type ListingType = { id: string; label: string; ids: string[] };

/**
 * Product grid with filters. The filter state lives in the URL (owned by the route). Only the current category
 * profile's filters are offered; values the listing doesn't offer are dropped (e.g. after switching category).
 */
export function ProductListing({
  base,
  title,
  profile,
  types = [],
  state,
  onStateChange,
  initial,
}: {
  /** First page loaded by the route on the server (used only while the listing shows exactly that state). */
  initial?: InitialListing | null;
  base: Base;
  title?: React.ReactNode;
  profile: Profile | null;
  types?: ListingType[];
  state: ListState;
  onStateChange: (next: ListState) => void;
}) {
  const { t, lang } = useI18n();
  const ar = lang === "ar";
  const money = (n: number) => n.toLocaleString(ar ? "ar-EG" : "en-US");
  const allowed = useMemo(() => listingFilters(profile), [profile]);
  const f = useMemo(() => pruneFilters(state, allowed), [state, allowed]);
  const stale = JSON.stringify(f) !== JSON.stringify(pruneFilters(state, ALL_FILTERS));
  // Clean filters the current listing doesn't support out of the URL (stale state after switching category).
  useEffect(() => {
    if (stale) onStateChange(f);
  }, [stale, f, onStateChange]);

  const setF = (next: ListState) => onStateChange(pruneFilters(next, allowed));
  const [draft, setDraft] = useState<ListState>(f);
  const [open, setOpen] = useState(false);
  const typeIdsOf = (s: ListState) =>
    s.type ? types.find((x) => x.id === s.type)?.ids : undefined;
  const filters: ListFilters = { ...base, ...f };
  const typeIds = typeIdsOf(f);

  const seed = initial && initial.key === listingKey(filters, typeIds) ? initial : null;
  const q = useInfiniteQuery({
    queryKey: ["products", filters, typeIds ?? null],
    initialPageParam: 0,
    // Server-loaded first page: shown immediately and not refetched right after hydration.
    ...(seed ? { initialData: { pages: [seed.items], pageParams: [0] }, staleTime: 60_000 } : {}),
    queryFn: ({ pageParam }) => fetchProductPage(filters, pageParam, typeIds),
    getNextPageParam: (last, pages) => (last.length === PAGE_SIZE ? pages.length : undefined),
  });
  const total = useQuery({
    queryKey: ["products-count", filters, typeIds ?? null],
    queryFn: () => fetchProductCount(filters, typeIds),
    ...(seed ? { initialData: seed.total, staleTime: 60_000 } : {}),
    placeholderData: keepPreviousData,
  });
  const optionsQ = useQuery({
    queryKey: ["filter-options", filters, typeIds ?? null],
    queryFn: () => fetchFilterOptions(filters, typeIds),
    placeholderData: keepPreviousData,
  });
  const draftFilters: ListFilters = { ...base, ...draft };
  const draftTypeIds = typeIdsOf(draft);
  const draftTotal = useQuery({
    queryKey: ["products-count", draftFilters, draftTypeIds ?? null],
    queryFn: () => fetchProductCount(draftFilters, draftTypeIds),
    enabled: open,
    placeholderData: keepPreviousData,
  });
  const draftOptions = useQuery({
    queryKey: ["filter-options", draftFilters, draftTypeIds ?? null],
    queryFn: () => fetchFilterOptions(draftFilters, draftTypeIds),
    enabled: open,
    placeholderData: keepPreviousData,
  });
  const options = optionsQ.data ?? EMPTY_OPTIONS;

  // Subcategory counts for the "type" filter, folded from per-category counts.
  const typeOptions = (opts = options): TypeOption[] =>
    types.map((x) => ({
      id: x.id,
      label: x.label,
      count: opts.categories
        .filter((c) => x.ids.includes(c.value))
        .reduce((n, c) => n + c.count, 0),
    }));

  // Infinite scroll. Depends on the stable query fields, not the query object (which changes every render
  // and used to reconnect the observer each time).
  const sentinel = useRef<HTMLDivElement>(null);
  const { hasNextPage, isFetchingNextPage, fetchNextPage } = q;
  useEffect(() => {
    const el = sentinel.current;
    if (!el) return;
    const io = new IntersectionObserver(
      (e) => {
        if (e[0].isIntersecting && hasNextPage && !isFetchingNextPage) fetchNextPage();
      },
      { rootMargin: "400px" },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [hasNextPage, isFetchingNextPage, fetchNextPage]);

  const items = q.data?.pages.flat() ?? [];

  // Active filter chips, each with its own remover.
  const chips: { key: string; label: string; clear: Partial<ListState> }[] = [];
  if (f.minPrice != null || f.maxPrice != null)
    chips.push({
      key: "price",
      label: `${f.minPrice != null ? money(f.minPrice) : "0"} – ${f.maxPrice != null ? money(f.maxPrice) : "∞"}`,
      clear: { minPrice: undefined, maxPrice: undefined },
    });
  if (f.type)
    chips.push({
      key: "type",
      label: types.find((x) => x.id === f.type)?.label ?? f.type,
      clear: { type: undefined },
    });
  if (f.brand) chips.push({ key: "brand", label: f.brand, clear: { brand: undefined } });
  if (f.gender)
    chips.push({
      key: "gender",
      label: GENDERS.find((g) => g.value === f.gender)?.[lang] ?? f.gender,
      clear: { gender: undefined },
    });
  if (f.season)
    chips.push({
      key: "season",
      label: SEASONS.find((g) => g.value === f.season)?.[lang] ?? f.season,
      clear: { season: undefined },
    });
  if (f.size)
    chips.push({ key: "size", label: sizeLabel(f.size, lang), clear: { size: undefined } });
  if (f.color) {
    const c = options.colors.find((x) => x.en === f.color);
    chips.push({
      key: "color",
      label: (c && (ar ? c.ar : c.en)) || f.color,
      clear: { color: undefined },
    });
  }
  if (f.concentration)
    chips.push({ key: "conc", label: f.concentration, clear: { concentration: undefined } });
  if (f.volume != null)
    chips.push({ key: "vol", label: `${f.volume} ml`, clear: { volume: undefined } });
  if (f.material)
    chips.push({ key: "material", label: f.material, clear: { material: undefined } });
  if (f.discounted)
    chips.push({ key: "disc", label: t("discounted_label"), clear: { discounted: undefined } });
  if (f.inStock)
    chips.push({ key: "stock", label: t("in_stock_only"), clear: { inStock: undefined } });

  return (
    <div className="space-y-4">
      {title && (
        <h1 className="py-4 text-center font-display text-3xl md:py-8 md:text-5xl">{title}</h1>
      )}

      {/* Minimal bar under the header: filters, result count, sort. */}
      <div className="sticky top-[60px] z-20 -mx-3 flex items-center justify-between gap-2 border-y bg-background/95 px-3 py-2 backdrop-blur md:top-[68px] lg:static lg:mx-0 lg:border-x-0 lg:bg-transparent lg:px-0">
        <div className="flex items-center gap-2">
          <Sheet
            open={open}
            onOpenChange={(o) => {
              setOpen(o);
              if (o) setDraft(f);
            }}
          >
            <SheetTrigger asChild>
              <Button variant="ghost" className="h-10 gap-2 px-2 lg:hidden">
                <SlidersHorizontal className="h-4 w-4" />
                {t("filters")}
                {chips.length > 0 && ` (${chips.length})`}
              </Button>
            </SheetTrigger>
            <SheetContent
              side={ar ? "right" : "left"}
              className="flex w-full flex-col gap-0 p-0 sm:max-w-sm"
            >
              <SheetHeader className="border-b p-5 text-start">
                <SheetTitle className="font-display text-2xl font-normal">
                  {t("filters")}
                </SheetTitle>
              </SheetHeader>
              <div className="flex-1 overflow-y-auto p-5">
                <FilterPanel
                  value={draft}
                  onChange={setDraft}
                  options={draftOptions.data ?? options}
                  allowed={allowed}
                  types={typeOptions(draftOptions.data ?? options)}
                />
              </div>
              <div className="grid grid-cols-2 gap-2 border-t p-4 pb-[calc(1rem+env(safe-area-inset-bottom))]">
                <Button variant="outline" onClick={() => setDraft({ sort: f.sort })}>
                  {t("reset")}
                </Button>
                <Button
                  onClick={() => {
                    setF(draft);
                    setOpen(false);
                  }}
                >
                  {t("show_results").replace(
                    "{n}",
                    draftTotal.data != null ? countLabel(draftTotal.data, lang, "product") : "…",
                  )}
                </Button>
              </div>
            </SheetContent>
          </Sheet>
          <span className="text-xs tracking-wide text-muted-foreground">
            {total.data != null && countLabel(total.data, lang, "product")}
          </span>
        </div>
        <Select
          value={f.sort ?? "newest"}
          onValueChange={(v) => setF({ ...f, sort: v as ListState["sort"] })}
        >
          <SelectTrigger
            className="h-10 w-44 border-0 bg-transparent shadow-none"
            aria-label={t("sort")}
          >
            <SelectValue placeholder={t("sort")} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="newest">{t("sort_newest")}</SelectItem>
            <SelectItem value="popular">{t("sort_popular")}</SelectItem>
            <SelectItem value="price_asc">{t("sort_price_asc")}</SelectItem>
            <SelectItem value="price_desc">{t("sort_price_desc")}</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {chips.length > 0 && (
        <div className="flex flex-wrap items-center gap-2">
          {chips.map((c) => (
            <button
              key={c.key}
              onClick={() => setF({ ...f, ...c.clear })}
              className="flex items-center gap-1.5 border px-3 py-1.5 text-xs transition-colors hover:border-foreground"
            >
              {c.label}
              <X className="h-3 w-3" aria-hidden />
            </button>
          ))}
          <button onClick={() => setF({ sort: f.sort })} className="link-luxe text-xs font-medium">
            {t("clear_all")}
          </button>
        </div>
      )}

      <div className="lg:grid lg:grid-cols-[15rem_1fr] lg:gap-12">
        <aside className="hidden lg:block" aria-label={t("filters")}>
          <div className="sticky top-24 max-h-[calc(100vh-7rem)] overflow-y-auto pe-2">
            <FilterPanel
              value={f}
              onChange={setF}
              options={options}
              allowed={allowed}
              types={typeOptions()}
            />
          </div>
        </aside>
        <div>
          {q.isLoading ? (
            <ProductGridSkeleton />
          ) : q.error ? (
            <ErrorState onRetry={() => q.refetch()} />
          ) : items.length === 0 ? (
            <EmptyState title={t("no_products")} hint={t("no_products_hint")} />
          ) : (
            <div className="grid grid-cols-2 gap-x-4 gap-y-10 sm:grid-cols-3 md:gap-x-6 md:gap-y-14 xl:grid-cols-4">
              {items.map((p) => (
                <ProductCard key={p.id} p={p} />
              ))}
            </div>
          )}
          <div ref={sentinel} />
          {q.isFetchingNextPage && <ProductGridSkeleton n={4} />}
        </div>
      </div>
    </div>
  );
}
