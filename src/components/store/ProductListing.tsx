import { useEffect, useRef, useState } from "react";
import { useInfiniteQuery, useQuery } from "@tanstack/react-query";
import { SlidersHorizontal } from "lucide-react";
import { useI18n } from "@/lib/i18n";
import { fetchBrands, fetchProductPage, PAGE_SIZE, type ListFilters } from "@/lib/queries";
import { ProductCard } from "./ProductCard";
import { EmptyState, ErrorState, ProductGridSkeleton } from "./states";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

type Base = Pick<ListFilters, "q" | "categoryIds">;

export function ProductListing({ base, title }: { base: Base; title?: React.ReactNode }) {
  const { t } = useI18n();
  const [f, setF] = useState<Omit<ListFilters, "q" | "categoryIds">>({ sort: "newest" });
  const [draft, setDraft] = useState(f);
  const [open, setOpen] = useState(false);
  const filters: ListFilters = { ...base, ...f };
  const brands = useQuery({ queryKey: ["brands"], queryFn: fetchBrands });

  const q = useInfiniteQuery({
    queryKey: ["products", filters],
    initialPageParam: 0,
    queryFn: ({ pageParam }) => fetchProductPage(filters, pageParam),
    getNextPageParam: (last, pages) => (last.length === PAGE_SIZE ? pages.length : undefined),
  });

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
  const activeCount = [f.minPrice, f.maxPrice, f.brand, f.discounted || undefined, f.inStock || undefined].filter((x) => x != null && x !== "").length;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        {title && <h1 className="text-xl font-extrabold">{title}</h1>}
        <div className="flex gap-2">
          <Sheet open={open} onOpenChange={(o) => { setOpen(o); if (o) setDraft(f); }}>
            <SheetTrigger asChild>
              <Button variant="outline" size="sm" className="gap-1"><SlidersHorizontal className="h-4 w-4" />{t("filters")}{activeCount > 0 && ` (${activeCount})`}</Button>
            </SheetTrigger>
            <SheetContent side="bottom" className="max-h-[85vh] overflow-y-auto rounded-t-3xl">
              <SheetHeader><SheetTitle>{t("filters")}</SheetTitle></SheetHeader>
              <div className="space-y-5 p-4">
                <div>
                  <Label>{t("price")}</Label>
                  <div className="mt-2 flex gap-2">
                    <Input type="number" inputMode="decimal" placeholder={t("min")} value={draft.minPrice ?? ""} onChange={(e) => setDraft({ ...draft, minPrice: e.target.value ? Number(e.target.value) : undefined })} />
                    <Input type="number" inputMode="decimal" placeholder={t("max")} value={draft.maxPrice ?? ""} onChange={(e) => setDraft({ ...draft, maxPrice: e.target.value ? Number(e.target.value) : undefined })} />
                  </div>
                </div>
                {!!brands.data?.length && (
                  <div>
                    <Label>{t("brand")}</Label>
                    <div className="mt-2 flex flex-wrap gap-2">
                      {brands.data.map((b) => (
                        <button key={b} onClick={() => setDraft({ ...draft, brand: draft.brand === b ? undefined : b })}
                          className={`rounded-full border px-3 py-1 text-sm ${draft.brand === b ? "border-primary bg-primary text-primary-foreground" : "bg-card"}`}>{b}</button>
                      ))}
                    </div>
                  </div>
                )}
                <div className="flex items-center justify-between"><Label>{t("discounted_only")}</Label><Switch checked={!!draft.discounted} onCheckedChange={(v) => setDraft({ ...draft, discounted: v })} /></div>
                <div className="flex items-center justify-between"><Label>{t("in_stock_only")}</Label><Switch checked={!!draft.inStock} onCheckedChange={(v) => setDraft({ ...draft, inStock: v })} /></div>
                <div className="grid grid-cols-2 gap-2">
                  <Button variant="outline" onClick={() => { setF({ sort: f.sort }); setOpen(false); }}>{t("reset")}</Button>
                  <Button onClick={() => { setF(draft); setOpen(false); }}>{t("apply")}</Button>
                </div>
              </div>
            </SheetContent>
          </Sheet>
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
      </div>

      {q.isLoading ? (
        <ProductGridSkeleton />
      ) : q.error ? (
        <ErrorState onRetry={() => q.refetch()} />
      ) : items.length === 0 ? (
        <EmptyState title={t("no_products")} hint={t("no_products_hint")} />
      ) : (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
          {items.map((p) => <ProductCard key={p.id} p={p} />)}
        </div>
      )}
      <div ref={sentinel} />
      {q.isFetchingNextPage && <ProductGridSkeleton n={5} />}
    </div>
  );
}
