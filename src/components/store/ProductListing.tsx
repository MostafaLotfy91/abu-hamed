import { useEffect, useRef, useState } from "react";
import { keepPreviousData, useInfiniteQuery, useQuery } from "@tanstack/react-query";
import { SlidersHorizontal, X } from "lucide-react";
import { useI18n } from "@/lib/i18n";
import { GENDERS, sizeLabel } from "@/lib/fashion";
import { EMPTY_FACETS, fetchFacets, fetchProductCount, fetchProductPage, PAGE_SIZE, type ListFilters } from "@/lib/queries";
import { ProductCard } from "./ProductCard";
import { EmptyState, ErrorState, ProductGridSkeleton } from "./states";
import { FilterPanel, type Extra } from "./FilterPanel";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

type Base = Pick<ListFilters, "q" | "categoryIds">;

export function ProductListing({ base, title }: { base: Base; title?: React.ReactNode }) {
  const { t, lang } = useI18n();
  const money = (n: number) => n.toLocaleString(lang === "ar" ? "ar-EG" : "en-US");
  const [f, setF] = useState<Extra>({ sort: "newest" });
  const [draft, setDraft] = useState(f);
  const [open, setOpen] = useState(false);
  const filters: ListFilters = { ...base, ...f };

  const q = useInfiniteQuery({
    queryKey: ["products", filters],
    initialPageParam: 0,
    queryFn: ({ pageParam }) => fetchProductPage(filters, pageParam),
    getNextPageParam: (last, pages) => (last.length === PAGE_SIZE ? pages.length : undefined),
  });
  const total = useQuery({ queryKey: ["products-count", filters], queryFn: () => fetchProductCount(filters), placeholderData: keepPreviousData });
  const facetsQ = useQuery({ queryKey: ["facets", base.categoryIds ?? null], queryFn: () => fetchFacets(base.categoryIds), staleTime: 60_000 });
  const facets = facetsQ.data ?? EMPTY_FACETS;
  const draftFilters = { ...base, ...draft };
  const draftTotal = useQuery({ queryKey: ["products-count", draftFilters], queryFn: () => fetchProductCount(draftFilters), enabled: open, placeholderData: keepPreviousData });

  const sentinel = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = sentinel.current;
    if (!el) return;
    const io = new IntersectionObserver((e) => {
      if (e[0].isIntersecting && q.hasNextPage && !q.isFetchingNextPage) q.fetchNextPage();
    }, { rootMargin: "400px" });
    io.observe(el);
    return () => io.disconnect();
  }, [q.hasNextPage, q.isFetchingNextPage, q]);

  const items = q.data?.pages.flat() ?? [];

  // Active filter chips, each with its own remover.
  const chips: { key: string; label: string; clear: Partial<Extra> }[] = [];
  if (f.minPrice != null || f.maxPrice != null) chips.push({ key: "price", label: `${f.minPrice != null ? money(f.minPrice) : "0"} – ${f.maxPrice != null ? money(f.maxPrice) : "∞"}`, clear: { minPrice: undefined, maxPrice: undefined } });
  if (f.brand) chips.push({ key: "brand", label: f.brand, clear: { brand: undefined } });
  if (f.gender) chips.push({ key: "gender", label: GENDERS.find((g) => g.value === f.gender)?.[lang] ?? f.gender, clear: { gender: undefined } });
  if (f.size) chips.push({ key: "size", label: sizeLabel(f.size, lang), clear: { size: undefined } });
  if (f.color) { const c = facets.colors.find((x) => x.en === f.color); chips.push({ key: "color", label: (c && (lang === "ar" ? c.ar : c.en)) || f.color, clear: { color: undefined } }); }
  if (f.discounted) chips.push({ key: "disc", label: t("discounted_label"), clear: { discounted: undefined } });
  if (f.inStock) chips.push({ key: "stock", label: t("in_stock_only"), clear: { inStock: undefined } });

  return (
    <div className="space-y-4">
      {title && <h1 className="text-xl font-bold tracking-tight md:text-2xl">{title}</h1>}

      <div className="sticky top-14 z-20 -mx-3 flex items-center justify-between gap-2 border-b bg-background/95 px-3 py-2 backdrop-blur lg:static lg:mx-0 lg:border-0 lg:bg-transparent lg:px-0">
        <div className="flex items-center gap-2">
          <Sheet open={open} onOpenChange={(o) => { setOpen(o); if (o) setDraft(f); }}>
            <SheetTrigger asChild>
              <Button variant="outline" size="sm" className="gap-1 lg:hidden"><SlidersHorizontal className="h-4 w-4" />{t("filters")}{chips.length > 0 && ` (${chips.length})`}</Button>
            </SheetTrigger>
            <SheetContent side="bottom" className="flex max-h-[88vh] flex-col rounded-t-lg p-0">
              <SheetHeader className="border-b p-4 text-start"><SheetTitle>{t("filters")}</SheetTitle></SheetHeader>
              <div className="flex-1 overflow-y-auto p-4"><FilterPanel value={draft} onChange={setDraft} facets={facets} /></div>
              <div className="grid grid-cols-2 gap-2 border-t p-4">
                <Button variant="outline" onClick={() => setDraft({ sort: f.sort })}>{t("reset")}</Button>
                <Button onClick={() => { setF(draft); setOpen(false); }}>{t("show_results").replace("{n}", String(draftTotal.data ?? "…"))}</Button>
              </div>
            </SheetContent>
          </Sheet>
          <span className="text-sm text-muted-foreground">{total.data != null && t("items_count").replace("{n}", String(total.data))}</span>
        </div>
        <Select value={f.sort} onValueChange={(v) => setF({ ...f, sort: v as ListFilters["sort"] })}>
          <SelectTrigger className="h-9 w-44"><SelectValue placeholder={t("sort")} /></SelectTrigger>
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
            <button key={c.key} onClick={() => setF({ ...f, ...c.clear })} className="flex items-center gap-1 rounded-full border bg-card px-3 py-1 text-xs font-medium hover:border-foreground">
              {c.label}<X className="h-3 w-3" aria-hidden />
            </button>
          ))}
          <button onClick={() => setF({ sort: f.sort })} className="text-xs font-semibold underline underline-offset-4">{t("clear_all")}</button>
        </div>
      )}

      <div className="lg:grid lg:grid-cols-[15rem_1fr] lg:gap-8">
        <aside className="hidden lg:block">
          <div className="sticky top-20 max-h-[calc(100vh-6rem)] overflow-y-auto pe-2"><FilterPanel value={f} onChange={setF} facets={facets} /></div>
        </aside>
        <div>
          {q.isLoading ? (
            <ProductGridSkeleton />
          ) : q.error ? (
            <ErrorState onRetry={() => q.refetch()} />
          ) : items.length === 0 ? (
            <EmptyState title={t("no_products")} hint={t("no_products_hint")} />
          ) : (
            <div className="grid grid-cols-2 gap-x-3 gap-y-6 sm:grid-cols-3 xl:grid-cols-4">
              {items.map((p) => <ProductCard key={p.id} p={p} />)}
            </div>
          )}
          <div ref={sentinel} />
          {q.isFetchingNextPage && <ProductGridSkeleton n={4} />}
        </div>
      </div>
    </div>
  );
}
