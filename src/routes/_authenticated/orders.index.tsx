import { createFileRoute, Link } from "@tanstack/react-router";
import { useInfiniteQuery } from "@tanstack/react-query";
import { ReceiptText } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { useI18n } from "@/lib/i18n";
import { useMoney } from "@/components/store/use-money";
import { StatusBadge } from "@/components/store/OrderTimeline";
import { EmptyState, ErrorState, RowSkeleton } from "@/components/store/states";
import { pageHead } from "@/lib/seo";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/_authenticated/orders/")({
  head: ({ matches }) => pageHead(matches, { title: { ar: "طلباتي", en: "My orders" }, noindex: true }),
  component: Orders,
});

const PAGE = 20;

function Orders() {
  const { t, lang } = useI18n();
  const money = useMoney();
  const { user } = useAuth();
  // Only the signed-in customer's own orders: RLS also lets staff/drivers read others' orders.
  const q = useInfiniteQuery({
    queryKey: ["orders", user?.id],
    enabled: !!user,
    initialPageParam: 0,
    queryFn: async ({ pageParam }) => {
      const { data, error } = await supabase.from("orders").select("id,order_number,status,total,created_at,order_items(count)")
        .eq("user_id", user!.id).order("created_at", { ascending: false }).range(pageParam * PAGE, pageParam * PAGE + PAGE - 1);
      if (error) throw error;
      return data;
    },
    getNextPageParam: (last, pages) => (last.length === PAGE ? pages.length : undefined),
  });
  const orders = q.data?.pages.flat() ?? [];
  if (q.isLoading) return <RowSkeleton n={4} />;
  if (q.error) return <ErrorState onRetry={() => q.refetch()} />;
  if (!orders.length) return <EmptyState icon={<ReceiptText className="h-8 w-8" />} title={t("no_orders")} action={<Button asChild><Link to="/products">{t("start_shopping")}</Link></Button>} />;
  return (
    <div className="space-y-3">
      <h1 className="text-xl font-extrabold">{t("orders")}</h1>
      {orders.map((o) => (
        <div key={o.id} className="flex items-center gap-3 rounded-2xl bg-card p-4 shadow-card">
          <Link to="/orders/$id" params={{ id: o.id }} className="flex-1 space-y-1">
            <div className="flex items-center gap-2"><span className="font-bold">#{o.order_number}</span><StatusBadge status={o.status} /></div>
            <p className="text-xs text-muted-foreground">{new Date(o.created_at).toLocaleString(lang === "ar" ? "ar-EG" : "en-US")} · {(o.order_items as unknown as { count: number }[])[0]?.count ?? 0} {t("items")}</p>
            <p className="font-extrabold text-primary">{money(o.total)}</p>
          </Link>
        </div>
      ))}
      {q.hasNextPage && (
        <Button variant="outline" className="w-full" disabled={q.isFetchingNextPage} onClick={() => q.fetchNextPage()}>
          {q.isFetchingNextPage ? "…" : t("load_more")}
        </Button>
      )}
    </div>
  );
}
