import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useI18n, type DictKey } from "@/lib/i18n";
import { EmptyState, ErrorState, RowSkeleton } from "@/components/store/states";
import { Input } from "@/components/ui/input";

export const Route = createFileRoute("/_authenticated/admin/returns")({ component: Page });

const STATUSES = ["requested", "approved", "rejected", "received", "refunded", "exchanged"] as const;

function Page() {
  const { t, tx, lang } = useI18n();
  const qc = useQueryClient();
  const [filter, setFilter] = useState<string>("");
  const q = useQuery({
    queryKey: ["admin", "returns", filter],
    queryFn: async () => {
      let qq = supabase.from("return_requests").select("*, orders(order_number), order_items(name_ar,name_en,size,color_ar,color_en)").order("created_at", { ascending: false }).limit(500);
      if (filter) qq = qq.eq("status", filter);
      const { data, error } = await qq;
      if (error) throw error;
      return data;
    },
  });
  const update = async (id: string, patch: { status?: string; admin_note?: string | null }) => {
    const { error } = await supabase.from("return_requests").update(patch).eq("id", id);
    if (error) toast.error(error.message); else { toast.success("✓"); qc.invalidateQueries({ queryKey: ["admin", "returns"] }); }
  };
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-xl font-extrabold">{t("return_requests")}</h1>
        <select className="h-9 rounded-md border bg-background px-2 text-sm" value={filter} onChange={(e) => setFilter(e.target.value)}>
          <option value="">{lang === "ar" ? "كل الحالات" : "All statuses"}</option>
          {STATUSES.map((s) => <option key={s} value={s}>{t(`rr_${s}` as DictKey)}</option>)}
        </select>
      </div>
      {q.isLoading ? <RowSkeleton n={4} /> : q.error ? <ErrorState onRetry={() => q.refetch()} /> : !q.data?.length ? <EmptyState title="—" /> : (
        <div className="space-y-3">
          {q.data.map((r) => {
            const item = r.order_items as { name_ar: string; name_en: string; size: string | null; color_ar: string | null; color_en: string | null } | null;
            return (
              <div key={r.id} className="space-y-2 rounded-2xl bg-card p-4 shadow-card">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <Link to="/admin/orders/$id" params={{ id: r.order_id }} className="font-bold text-primary">#{(r.orders as { order_number: number } | null)?.order_number}</Link>
                    <span className="ms-2 rounded-full bg-secondary px-2 py-0.5 text-xs font-semibold">{t(r.kind as DictKey)}</span>
                    <span className="ms-2 text-xs text-muted-foreground">{new Date(r.created_at).toLocaleString(lang === "ar" ? "ar-EG" : "en-US")}</span>
                  </div>
                  <select className="h-9 rounded-md border bg-background px-2 text-sm" value={r.status} onChange={(e) => update(r.id, { status: e.target.value })}>
                    {STATUSES.map((s) => <option key={s} value={s}>{t(`rr_${s}` as DictKey)}</option>)}
                  </select>
                </div>
                <p className="text-sm">{item ? `${tx(item, "name")}${item.size ? ` · ${item.size}` : ""}${item.color_ar ? ` · ${tx(item, "color")}` : ""}` : t("whole_order")}</p>
                <p className="text-sm"><b>{t("reason")}:</b> {r.reason}</p>
                {r.exchange_preference && <p className="text-sm"><b>{t("exchange_pref")}:</b> {r.exchange_preference}</p>}
                {r.details && <p className="text-sm text-muted-foreground">{r.details}</p>}
                <Input placeholder={lang === "ar" ? "ملاحظة للعميل" : "Note to customer"} defaultValue={r.admin_note ?? ""} onBlur={(e) => e.target.value !== (r.admin_note ?? "") && update(r.id, { admin_note: e.target.value || null })} />
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
