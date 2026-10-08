import { useQuery } from "@tanstack/react-query";
import { LOW_STOCK } from "@/lib/fashion";
import { restockQty } from "@/lib/insights-types";
import { ErrorState, RowSkeleton } from "@/components/store/states";
import { runInsight } from "./api";
import { DataView } from "./DataView";

const PERIOD = 14;

/** Low-stock and fast-selling size/color alerts plus restock suggestions — plain queries, no AI cost. */
export function AlertsPanel({ ar }: { ar: boolean }) {
  const low = useQuery({
    queryKey: ["insight", "low"],
    queryFn: () => runInsight("stock_by_variant", { days: PERIOD, limit: 30, sort: "low_stock" }),
  });
  const fast = useQuery({
    queryKey: ["insight", "fast"],
    queryFn: () =>
      runInsight("stock_by_variant", { days: PERIOD, limit: 30, sort: "fast_selling" }),
  });
  if (low.isLoading || fast.isLoading) return <RowSkeleton n={4} />;
  if (low.error || fast.error)
    return (
      <ErrorState
        onRetry={() => {
          low.refetch();
          fast.refetch();
        }}
        message={((low.error ?? fast.error) as Error).message}
      />
    );
  const lowRows = (low.data ?? []).filter((r) => Number(r.stock) <= LOW_STOCK);
  const fastRows = (fast.data ?? []).filter((r) => Number(r.sold) > 0);
  const restock = [...(fast.data ?? []), ...lowRows]
    .filter(
      (r, i, a) =>
        a.findIndex((x) => x.product === r.product && x.size === r.size && x.color === r.color) ===
        i,
    )
    .map((r) => ({ ...r, suggest: restockQty(Number(r.sold), PERIOD, Number(r.stock)) }))
    .filter((r) => r.suggest > 0)
    .sort((a, b) => b.suggest - a.suggest);
  return (
    <div className="grid gap-3 lg:grid-cols-2">
      <DataView
        chart={false}
        title={ar ? `قربت تخلص (≤ ${LOW_STOCK})` : `Low stock (≤ ${LOW_STOCK})`}
        rows={lowRows}
      />
      <DataView
        title={ar ? `الأسرع بيعاً (آخر ${PERIOD} يوم)` : `Fast selling (last ${PERIOD} days)`}
        rows={fastRows}
      />
      <div className="lg:col-span-2">
        <DataView
          chart={false}
          title={
            ar ? "اقتراحات إعادة التخزين (تغطية ٣ أسابيع)" : "Restock suggestions (3-week cover)"
          }
          rows={restock}
        />
      </div>
    </div>
  );
}

export function ReturnsPanel({ ar }: { ar: boolean }) {
  const byProduct = useQuery({
    queryKey: ["insight", "rr_p"],
    queryFn: () => runInsight("return_rate", { days: 90, by: "product", limit: 20 }),
  });
  const byCat = useQuery({
    queryKey: ["insight", "rr_c"],
    queryFn: () => runInsight("return_rate", { days: 90, by: "category", limit: 20 }),
  });
  if (byProduct.isLoading || byCat.isLoading) return <RowSkeleton n={4} />;
  if (byProduct.error || byCat.error)
    return (
      <ErrorState
        onRetry={() => {
          byProduct.refetch();
          byCat.refetch();
        }}
        message={((byProduct.error ?? byCat.error) as Error).message}
      />
    );
  return (
    <div className="space-y-3">
      <p className="text-xs text-muted-foreground">
        {ar
          ? "آخر ٩٠ يوم. اسأل المحلل «أنهي منتجات مرتجعاتها عالية وليه؟» للأسباب المحتملة."
          : "Last 90 days. Ask the analyst for likely reasons."}
      </p>
      <DataView title={ar ? "حسب المنتج" : "By product"} rows={byProduct.data ?? []} />
      <DataView title={ar ? "حسب القسم" : "By category"} rows={byCat.data ?? []} />
    </div>
  );
}
