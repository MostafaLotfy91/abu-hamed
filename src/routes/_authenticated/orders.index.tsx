import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { ReceiptText } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useI18n } from "@/lib/i18n";
import { useMoney } from "@/components/store/use-money";
import { StatusBadge } from "@/components/store/OrderTimeline";
import { EmptyState, ErrorState, RowSkeleton } from "@/components/store/states";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/_authenticated/orders/")({
  head: () => ({ meta: [{ title: "طلباتي · My orders" }, { name: "description", content: "Order history" }, { property: "og:title", content: "My orders" }, { property: "og:description", content: "Order history" }] }),
  component: Orders,
});

function Orders() {
  const { t, lang } = useI18n();
  const money = useMoney();
  const q = useQuery({
    queryKey: ["orders"],
    queryFn: async () => {
      const { data, error } = await supabase.from("orders").select("id,order_number,status,total,created_at,order_items(count)").order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
  });
  if (q.isLoading) return <RowSkeleton n={4} />;
  if (q.error) return <ErrorState onRetry={() => q.refetch()} />;
  if (!q.data?.length) return <EmptyState icon={<ReceiptText className="h-8 w-8" />} title={t("no_orders")} action={<Button asChild><Link to="/products">{t("start_shopping")}</Link></Button>} />;
  return (
    <div className="space-y-3">
      <h1 className="text-xl font-extrabold">{t("orders")}</h1>
      {q.data.map((o) => (
        <div key={o.id} className="flex items-center gap-3 rounded-2xl bg-card p-4 shadow-card">
          <Link to="/orders/$id" params={{ id: o.id }} className="flex-1 space-y-1">
            <div className="flex items-center gap-2"><span className="font-bold">#{o.order_number}</span><StatusBadge status={o.status} /></div>
            <p className="text-xs text-muted-foreground">{new Date(o.created_at).toLocaleString(lang === "ar" ? "ar-EG" : "en-US")} · {(o.order_items as unknown as { count: number }[])[0]?.count ?? 0} {t("items")}</p>
            <p className="font-extrabold text-primary">{money(o.total)}</p>
          </Link>
        </div>
      ))}
    </div>
  );
}
