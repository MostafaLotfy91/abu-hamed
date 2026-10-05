import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useI18n } from "@/lib/i18n";
import { useMoney } from "@/components/store/use-money";
import { ALL_STATUSES, StatusBadge, statusKey } from "@/components/store/OrderTimeline";
import { EmptyState, ErrorState, RowSkeleton } from "@/components/store/states";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/admin/orders/")({ component: Page });

function Page() {
  const { t, lang } = useI18n();
  const money = useMoney();
  const qc = useQueryClient();
  const [status, setStatus] = useState<string>("all");
  const [search, setSearch] = useState("");
  const q = useQuery({
    queryKey: ["admin", "orders", status],
    queryFn: async () => {
      let qq = supabase.from("orders").select("id,order_number,status,total,created_at,address,payment_method,delivery_slot").order("created_at", { ascending: false }).limit(300);
      if (status !== "all") qq = qq.eq("status", status);
      const { data, error } = await qq;
      if (error) throw error;
      return data;
    },
  });
  useEffect(() => {
    const ch = supabase.channel("admin-orders").on("postgres_changes", { event: "*", schema: "public", table: "orders" }, () => qc.invalidateQueries({ queryKey: ["admin", "orders"] })).subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [qc]);
  const rows = (q.data ?? []).filter((o) => !search || String(o.order_number).includes(search) || JSON.stringify(o.address).includes(search));
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-xl font-extrabold">{lang === "ar" ? "الطلبات" : "Orders"}</h1>
        <Input className="h-9 w-56" placeholder="# / phone" value={search} onChange={(e) => setSearch(e.target.value)} />
      </div>
      <div className="flex flex-wrap gap-2">
        {["all", ...ALL_STATUSES].map((s) => (
          <button key={s} onClick={() => setStatus(s)} className={cn("rounded-full border px-3 py-1 text-sm", status === s && "border-primary bg-primary text-primary-foreground")}>{s === "all" ? (lang === "ar" ? "الكل" : "All") : t(statusKey(s))}</button>
        ))}
      </div>
      {q.isLoading ? <RowSkeleton n={6} /> : q.error ? <ErrorState onRetry={() => q.refetch()} /> : !rows.length ? <EmptyState title={t("no_orders")} /> : (
        <div className="overflow-x-auto rounded-2xl bg-card shadow-card">
          <table className="w-full text-sm">
            <tbody className="divide-y">
              {rows.map((o) => {
                const a = o.address as Record<string, string>;
                return (
                  <tr key={o.id} className="hover:bg-accent/50">
                    <td className="p-3 font-bold"><Link to="/admin/orders/$id" params={{ id: o.id }}>#{o.order_number}</Link></td>
                    <td className="p-3">{a?.recipient_name ?? a?.label} <span className="text-xs text-muted-foreground" dir="ltr">{a?.phone}</span></td>
                    <td className="p-3 text-xs text-muted-foreground">{new Date(o.created_at).toLocaleString(lang === "ar" ? "ar-EG" : "en-US")}</td>
                    <td className="p-3"><StatusBadge status={o.status} /></td>
                    <td className="p-3 font-bold">{money(o.total)}</td>
                    <td className="p-3"><Link className="text-primary" to="/admin/orders/$id" params={{ id: o.id }}>→</Link></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
