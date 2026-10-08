import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Bar, BarChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { supabase } from "@/integrations/supabase/client";
import { useI18n } from "@/lib/i18n";
import { useMoney } from "@/components/store/use-money";
import { ErrorState, RowSkeleton } from "@/components/store/states";
import { DispatchAlerts } from "@/components/admin/DispatchAlerts";
import { CalendarDays, Clock, ShoppingBag, TrendingUp, Wallet, ReceiptText } from "lucide-react";
import { formatCount } from "@/lib/format";

export const Route = createFileRoute("/_authenticated/admin/")({ component: Dashboard });

type Stats = {
  today: number;
  week: number;
  month: number;
  orders_today: number;
  orders_total: number;
  pending: number;
  daily: { day: string; total: number }[];
  top_products: { name_ar: string; name_en: string; qty: number; revenue: number }[];
};

function Dashboard() {
  const { lang, tx } = useI18n();
  const money = useMoney();
  const q = useQuery({
    queryKey: ["admin_stats"],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("admin_stats");
      if (error) throw error;
      return data as unknown as Stats;
    },
  });
  if (q.isLoading) return <RowSkeleton n={4} />;
  if (q.error || !q.data) return <ErrorState onRetry={() => q.refetch()} />;
  const s = q.data;
  const L = (ar: string, en: string) => (lang === "ar" ? ar : en);
  const cards = [
    [L("مبيعات اليوم", "Sales today"), money(s.today), Wallet],
    [L("مبيعات الأسبوع", "Sales this week"), money(s.week), TrendingUp],
    [L("مبيعات الشهر", "Sales this month"), money(s.month), CalendarDays],
    [L("طلبات اليوم", "Orders today"), formatCount(s.orders_today, lang), ShoppingBag],
    [L("قيد الانتظار", "Pending"), formatCount(s.pending, lang), Clock],
    [L("إجمالي الطلبات", "Total orders"), formatCount(s.orders_total, lang), ReceiptText],
  ] as const;
  return (
    <div className="space-y-5">
      <h1 className="text-xl font-bold tracking-tight">{L("الإحصائيات", "Dashboard")}</h1>
      <DispatchAlerts ar={lang === "ar"} />
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-6">
        {cards.map(([k, v, Icon], i) => (
          <div
            key={k}
            className={`rounded-md border bg-card p-4 ${i === 4 && s.pending > 0 ? "border-foreground" : ""}`}
          >
            <div className="flex items-center justify-between text-muted-foreground">
              <p className="text-xs font-medium">{k}</p>
              <Icon className="h-4 w-4" />
            </div>
            <p className="mt-2 text-2xl font-bold tracking-tight">{v}</p>
          </div>
        ))}
      </div>
      <div className="grid gap-4 lg:grid-cols-[2fr_1fr]">
        <div className="rounded-md border bg-card p-4">
          <p className="mb-3 font-bold">{L("المبيعات آخر ١٤ يوم", "Sales — last 14 days")}</p>
          <div className="h-64" dir="ltr">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={s.daily}>
                <XAxis dataKey="day" tickFormatter={(d: string) => d.slice(5)} fontSize={11} />
                <YAxis fontSize={11} />
                <Tooltip formatter={(v: number) => money(v)} />
                <Bar dataKey="total" fill="var(--color-primary)" radius={[6, 6, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
        <div className="rounded-md border bg-card p-4">
          <p className="mb-3 font-bold">{L("الأكثر مبيعاً", "Top products")}</p>
          {s.top_products.length === 0 ? (
            <p className="text-sm text-muted-foreground">—</p>
          ) : (
            <ol className="space-y-2 text-sm">
              {s.top_products.map((p, i) => (
                <li key={i} className="flex justify-between gap-2">
                  <span>
                    {i + 1}. {tx(p, "name")}
                  </span>
                  <span className="font-bold">{money(p.revenue)}</span>
                </li>
              ))}
            </ol>
          )}
        </div>
      </div>
    </div>
  );
}
