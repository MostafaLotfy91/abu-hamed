import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { AlertTriangle, Download, FileText, HandCoins } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { useI18n } from "@/lib/i18n";
import { useSettings } from "@/lib/store-settings";
import { useMoney } from "@/components/store/use-money";
import { EmptyState, ErrorState, RowSkeleton } from "@/components/store/states";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { formatCount } from "@/lib/format";
import { ledgerTypeLabel } from "@/lib/ledger-labels";
import { dayEntries, useDriverCash, usePendingReviews } from "@/lib/driver-cash";
import {
  cashTableRows,
  dailySummaryRows,
  downloadWorkbook,
  ledgerRows,
} from "@/lib/driver-cash-export";
import {
  AdjustmentDialog,
  ReviewDialog,
  SettlementDialog,
  type DriverRef,
  type Review,
} from "@/components/admin/cash/CashDialogs";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/admin/cash/")({ component: Page });

function Page() {
  const { isAdmin } = useAuth();
  const { lang } = useI18n();
  const ar = lang === "ar";
  if (!isAdmin)
    return (
      <EmptyState
        title={ar ? "للمدير فقط" : "Admins only"}
        hint={ar ? "هذه الصفحة متاحة لحساب المدير فقط" : "This page is for the admin account only"}
      />
    );
  return <DriversCash ar={ar} />;
}

function DriversCash({ ar }: { ar: boolean }) {
  const money = useMoney();
  const qc = useQueryClient();
  const { settings } = useSettings();
  const today = useQuery({
    queryKey: ["store_today"],
    queryFn: async () => (await supabase.rpc("store_today")).data as string,
  });
  const [picked, setPicked] = useState<string | null>(null);
  const day = picked ?? today.data ?? null;
  const q = useDriverCash(day, !!day);
  const reviews = usePendingReviews();
  const [settle, setSettle] = useState<DriverRef | null>(null);
  const [adjust, setAdjust] = useState<DriverRef | null>(null);
  const [review, setReview] = useState<Review | null>(null);
  const [exporting, setExporting] = useState(false);
  const refresh = () => qc.invalidateQueries({ queryKey: ["driver_finance"] });

  if (q.error)
    return <ErrorState onRetry={() => q.refetch()} message={(q.error as Error).message} />;
  const rows = q.data ?? [];
  const names = new Map(rows.map((r) => [r.driver_id, r.full_name ?? r.phone ?? "—"]));
  const over = rows.filter((r) => r.over_limit);
  const carried = rows.filter((r) => r.unsettled_from_before);
  const isToday = day === today.data;

  const exportTable = async () => {
    setExporting(true);
    try {
      await downloadWorkbook(`drivers-cash-${day}.xlsx`, {
        [ar ? "المناديب" : "Drivers"]: cashTableRows(rows, ar),
      });
    } finally {
      setExporting(false);
    }
  };
  const exportDaily = async () => {
    if (!day) return;
    setExporting(true);
    try {
      const entries = await dayEntries(day);
      await downloadWorkbook(`daily-report-${day}.xlsx`, {
        [ar ? "الملخص" : "Summary"]: dailySummaryRows(day, rows, ar),
        [ar ? "المناديب" : "Drivers"]: cashTableRows(rows, ar),
        [ar ? "القيود" : "Entries"]: ledgerRows(
          entries.map((e) => ({ ...e, driver_name: names.get(e.driver_id) ?? "" })),
          ar,
        ),
      });
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setExporting(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-extrabold">{ar ? "كاش المناديب" : "Drivers cash"}</h1>
          <p className="text-sm text-muted-foreground">
            {settings?.driver_cash_limit && Number(settings.driver_cash_limit) > 0
              ? ar
                ? `حد الكاش: ${money(settings.driver_cash_limit)}`
                : `Cash limit: ${money(settings.driver_cash_limit)}`
              : ar
                ? "مفيش حد للكاش (من إعدادات المتجر)"
                : "No cash limit set (store settings)"}
          </p>
        </div>
        <div className="flex flex-wrap items-end gap-2">
          <div>
            <Label htmlFor="cash-day">{ar ? "اليوم" : "Day"}</Label>
            <Input
              id="cash-day"
              type="date"
              value={day ?? ""}
              max={today.data ?? undefined}
              onChange={(e) => setPicked(e.target.value || null)}
            />
          </div>
          <Button variant="outline" onClick={exportTable} disabled={exporting || !rows.length}>
            <Download className="me-1 h-4 w-4" />
            {ar ? "تصدير Excel" : "Export Excel"}
          </Button>
          <Button variant="outline" onClick={exportDaily} disabled={exporting || !day}>
            <FileText className="me-1 h-4 w-4" />
            {ar ? "التقرير اليومي" : "Daily report"}
          </Button>
        </div>
      </div>

      {(over.length > 0 || carried.length > 0) && (
        <section
          role="alert"
          className="space-y-1 rounded-md border border-destructive/40 bg-destructive/5 p-3 text-sm"
        >
          <p className="flex items-center gap-2 font-bold text-destructive">
            <AlertTriangle className="h-4 w-4" />
            {ar ? "تنبيهات الكاش" : "Cash alerts"}
          </p>
          {over.map((r) => (
            <p key={`o-${r.driver_id}`}>
              {ar
                ? `${names.get(r.driver_id)}: معاه ${money(r.cash_held)} — فوق الحد`
                : `${names.get(r.driver_id)}: holds ${money(r.cash_held)}, over the limit`}
            </p>
          ))}
          {carried.map((r) => (
            <p key={`c-${r.driver_id}`}>
              {ar
                ? `${names.get(r.driver_id)}: رصيد من أيام سابقة لسه ماتسوّاش`
                : `${names.get(r.driver_id)}: balance from previous days not settled`}
            </p>
          ))}
        </section>
      )}

      {q.isLoading || !day ? (
        <RowSkeleton n={4} />
      ) : rows.length === 0 ? (
        <EmptyState title={ar ? "لا يوجد مناديب" : "No drivers"} />
      ) : (
        <div className="overflow-x-auto rounded-2xl bg-card shadow-card">
          <table className="w-full text-sm" aria-label={ar ? "كاش المناديب" : "Drivers cash"}>
            <thead className="bg-muted/50 text-xs">
              <tr className="text-start">
                <th className="p-2 text-start">{ar ? "المندوب" : "Driver"}</th>
                <th className="p-2 text-start">{ar ? "الكاش معه" : "Cash held"}</th>
                <th className="p-2 text-start">
                  {isToday
                    ? ar
                      ? "عمولة اليوم"
                      : "Commission today"
                    : ar
                      ? "عمولة اليوم المختار"
                      : "Commission (day)"}
                </th>
                <th className="p-2 text-start">{ar ? "المطلوب تحصيله منه" : "To collect"}</th>
                <th className="p-2 text-start">{ar ? "آخر تسوية" : "Last settlement"}</th>
                <th className="p-2" />
              </tr>
            </thead>
            <tbody className="divide-y">
              {rows.map((r) => {
                const ref = { id: r.driver_id, name: names.get(r.driver_id) ?? "" };
                return (
                  <tr
                    key={r.driver_id}
                    className={cn(r.over_limit && "bg-destructive/5")}
                    data-testid={`cash-row-${r.driver_id}`}
                  >
                    <td className="p-2">
                      <Link
                        to="/admin/cash/$driverId"
                        params={{ driverId: r.driver_id }}
                        className="font-bold text-primary"
                      >
                        {ref.name}
                      </Link>
                      <div className="flex flex-wrap gap-1 text-[11px]">
                        {r.over_limit && (
                          <span className="rounded bg-destructive/15 px-1 text-destructive">
                            {ar ? "فوق الحد" : "Over limit"}
                          </span>
                        )}
                        {r.unsettled_from_before && (
                          <span className="rounded bg-amber-500/15 px-1 text-amber-700 dark:text-amber-400">
                            {ar ? "متأخر" : "Carried over"}
                          </span>
                        )}
                        {r.pending_reviews > 0 && (
                          <span className="rounded bg-primary/10 px-1">
                            {ar
                              ? `مراجعات: ${formatCount(r.pending_reviews, "ar")}`
                              : `Reviews: ${r.pending_reviews}`}
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="p-2 font-semibold">{money(r.cash_held)}</td>
                    <td className="p-2">{money(r.commission_earned)}</td>
                    <td className="p-2 font-extrabold">{money(r.owed_to_store)}</td>
                    <td className="p-2 text-xs text-muted-foreground">
                      {r.last_settlement_at
                        ? new Date(r.last_settlement_at).toLocaleString(ar ? "ar-EG" : "en-GB")
                        : "—"}
                    </td>
                    <td className="p-2">
                      <div className="flex justify-end gap-1">
                        <Button size="sm" onClick={() => setSettle(ref)}>
                          <HandCoins className="me-1 h-4 w-4" />
                          {ar ? "استلام تسوية" : "Receive"}
                        </Button>
                        <Button size="sm" variant="outline" onClick={() => setAdjust(ref)}>
                          {ar ? "تعديل" : "Adjust"}
                        </Button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <section aria-labelledby="reviews-title" className="space-y-2">
        <h2 id="reviews-title" className="font-bold">
          {ar ? "طلبات فيها فرق في المبلغ" : "Orders with an amount mismatch"}
        </h2>
        {(reviews.data ?? []).length === 0 ? (
          <p className="text-sm text-muted-foreground">
            {ar ? "مفيش حاجة للمراجعة" : "Nothing to review"}
          </p>
        ) : (
          <ul className="divide-y rounded-2xl bg-card text-sm shadow-card">
            {reviews.data!.map((r) => (
              <li
                key={r.order_id}
                className="flex flex-wrap items-center justify-between gap-2 p-3"
              >
                <Link
                  to="/admin/orders/$id"
                  params={{ id: r.order_id }}
                  className="font-bold text-primary"
                >
                  #{r.order_number}
                </Link>
                <span>{names.get(r.driver_id) ?? ""}</span>
                <span>
                  {money(r.collected_amount)} / {money(r.expected_amount)}
                </span>
                <span className="text-muted-foreground">{r.reason}</span>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() =>
                    setReview({
                      order_id: r.order_id,
                      order_number: r.order_number,
                      driver_name: names.get(r.driver_id) ?? "",
                      expected_amount: r.expected_amount,
                      collected_amount: r.collected_amount,
                      reason: r.reason,
                    })
                  }
                >
                  {ar ? "مراجعة" : "Review"}
                </Button>
              </li>
            ))}
          </ul>
        )}
      </section>

      <p className="text-xs text-muted-foreground">
        {ar ? "أنواع القيود: " : "Entry types: "}
        {["cod_collected", "commission_earned", "settlement_paid", "adjustment", "reversal"]
          .map((t) => ledgerTypeLabel(t, ar))
          .join(" · ")}
      </p>

      <SettlementDialog driver={settle} ar={ar} onClose={() => setSettle(null)} onSaved={refresh} />
      <AdjustmentDialog driver={adjust} ar={ar} onClose={() => setAdjust(null)} onSaved={refresh} />
      <ReviewDialog review={review} ar={ar} onClose={() => setReview(null)} onSaved={refresh} />
    </div>
  );
}
