import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { ArrowRight, Download, HandCoins, Undo2 } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { useI18n } from "@/lib/i18n";
import { useMoney } from "@/components/store/use-money";
import { EmptyState, ErrorState, RowSkeleton } from "@/components/store/states";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { LEDGER_TYPES, ledgerTypeLabel } from "@/lib/ledger-labels";
import { dayBounds, useDriverBalance } from "@/lib/driver-finance";
import { downloadWorkbook, ledgerRows } from "@/lib/driver-cash-export";
import { fromMinor, parseAmountInput, sumMinor, toMinor } from "@/lib/money";
import {
  AdjustmentDialog,
  ReverseDialog,
  SettlementDialog,
  type DriverRef,
} from "@/components/admin/cash/CashDialogs";

export const Route = createFileRoute("/_authenticated/admin/cash/$driverId")({ component: Page });

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
  return <DriverLedger ar={ar} />;
}

/** Store-local [start of `from`, end of `to`) as timestamps. */
async function bounds(from: string, to: string) {
  return {
    start: from ? (await dayBounds(from)).start : undefined,
    end: to ? (await dayBounds(to)).end : undefined,
  };
}

function DriverLedger({ ar }: { ar: boolean }) {
  const { driverId } = Route.useParams();
  const money = useMoney();
  const qc = useQueryClient();
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [type, setType] = useState("");
  const [settle, setSettle] = useState<DriverRef | null>(null);
  const [adjust, setAdjust] = useState<DriverRef | null>(null);
  const [reverse, setReverse] = useState<{ id: string; number: number | null } | null>(null);
  const refresh = () => qc.invalidateQueries({ queryKey: ["driver_finance"] });

  const profile = useQuery({
    queryKey: ["driver_finance", "profile", driverId],
    queryFn: async () =>
      (await supabase.from("profiles").select("full_name,phone").eq("id", driverId).maybeSingle())
        .data,
  });
  const balance = useDriverBalance(driverId);
  const entries = useQuery({
    queryKey: ["driver_finance", "entries", driverId, from, to, type],
    queryFn: async () => {
      const b = await bounds(from, to);
      const { data, error } = await supabase.rpc("driver_ledger_entries", {
        _driver_id: driverId,
        ...(b.start ? { _from: b.start } : {}),
        ...(b.end ? { _to: b.end } : {}),
        ...(type ? { _types: [type] } : {}),
      });
      if (error) throw error;
      return data ?? [];
    },
  });
  const settlements = useQuery({
    queryKey: ["driver_finance", "settlements", driverId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("driver_settlements")
        .select(
          "id,created_at,period_start,period_end,expected_amount,received_amount,difference,note",
        )
        .eq("driver_id", driverId)
        .order("created_at", { ascending: false })
        .limit(50);
      if (error) throw error;
      return data ?? [];
    },
  });

  const name = profile.data?.full_name ?? profile.data?.phone ?? "—";
  const ref = { id: driverId, name };
  const list = entries.data ?? [];
  const reversed = new Set(
    list.filter((e) => e.type === "reversal" && e.kind === "cod_collected").map((e) => e.order_id),
  );
  const totals = LEDGER_TYPES.map(
    (t) => [t, sumMinor(list.filter((e) => e.type === t).map((e) => e.amount))] as const,
  ).filter(([, v]) => v !== 0);
  const b = balance.data;

  return (
    <div className="space-y-4">
      <Link to="/admin/cash" className="inline-flex items-center gap-1 text-sm text-primary">
        <ArrowRight className="h-4 w-4 rtl:rotate-0 ltr:rotate-180" />
        {ar ? "كاش المناديب" : "Drivers cash"}
      </Link>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-xl font-extrabold">{name}</h1>
        <div className="flex gap-2">
          <Button onClick={() => setSettle(ref)}>
            <HandCoins className="me-1 h-4 w-4" />
            {ar ? "استلام تسوية" : "Receive settlement"}
          </Button>
          <Button variant="outline" onClick={() => setAdjust(ref)}>
            {ar ? "تعديل" : "Adjustment"}
          </Button>
        </div>
      </div>

      {b && (
        <section className="grid gap-3 sm:grid-cols-4" aria-label={ar ? "الرصيد" : "Balance"}>
          <Card label={ar ? "الكاش معه" : "Cash held"} value={money(b.cash_held)} />
          <Card
            label={ar ? "المطلوب منه للمحل" : "Owed to store"}
            value={money(b.owed_to_store)}
            testId="detail-owed"
          />
          <Card
            label={ar ? "إجمالي العمولات" : "Commission earned"}
            value={money(b.commission_earned)}
          />
          <Card
            label={ar ? "عمولة تُصرف منفصلة" : "Commission payable"}
            value={money(b.commission_payable)}
          />
        </section>
      )}

      <PayoutOverride driverId={driverId} ar={ar} />

      <section className="space-y-2 rounded-2xl bg-card p-4 shadow-card">
        <div className="flex flex-wrap items-end gap-2">
          <div>
            <Label htmlFor="ledger-from">{ar ? "من" : "From"}</Label>
            <Input
              id="ledger-from"
              type="date"
              value={from}
              onChange={(e) => setFrom(e.target.value)}
            />
          </div>
          <div>
            <Label htmlFor="ledger-to">{ar ? "إلى" : "To"}</Label>
            <Input id="ledger-to" type="date" value={to} onChange={(e) => setTo(e.target.value)} />
          </div>
          <div>
            <Label htmlFor="ledger-type">{ar ? "النوع" : "Type"}</Label>
            <select
              id="ledger-type"
              className="h-9 rounded-md border bg-background px-2"
              value={type}
              onChange={(e) => setType(e.target.value)}
            >
              <option value="">{ar ? "الكل" : "All"}</option>
              {LEDGER_TYPES.map((t) => (
                <option key={t} value={t}>
                  {ledgerTypeLabel(t, ar)}
                </option>
              ))}
            </select>
          </div>
          <Button
            variant="outline"
            disabled={!list.length}
            onClick={() =>
              downloadWorkbook(`ledger-${name}-${from || "start"}-${to || "now"}.xlsx`, {
                [ar ? "القيود" : "Ledger"]: ledgerRows(
                  list.map((e) => ({ ...e, driver_name: name })),
                  ar,
                ),
              })
            }
          >
            <Download className="me-1 h-4 w-4" />
            {ar ? "تصدير Excel" : "Export Excel"}
          </Button>
        </div>

        {entries.error ? (
          <ErrorState
            onRetry={() => entries.refetch()}
            message={(entries.error as Error).message}
          />
        ) : entries.isLoading ? (
          <RowSkeleton n={4} />
        ) : list.length === 0 ? (
          <EmptyState title={ar ? "مفيش قيود" : "No entries"} />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm" aria-label={ar ? "القيود" : "Ledger"}>
              <thead className="text-xs text-muted-foreground">
                <tr>
                  <th className="p-2 text-start">{ar ? "التاريخ" : "Date"}</th>
                  <th className="p-2 text-start">{ar ? "النوع" : "Type"}</th>
                  <th className="p-2 text-start">{ar ? "الطلب" : "Order"}</th>
                  <th className="p-2 text-start">{ar ? "المبلغ" : "Amount"}</th>
                  <th className="p-2 text-start">{ar ? "ملاحظة" : "Note"}</th>
                  <th className="p-2" />
                </tr>
              </thead>
              <tbody className="divide-y">
                {list.map((e) => (
                  <tr key={e.id}>
                    <td className="p-2 text-xs">
                      {new Date(e.created_at).toLocaleString(ar ? "ar-EG" : "en-GB")}
                    </td>
                    <td className="p-2">{ledgerTypeLabel(e.type, ar, e.kind)}</td>
                    <td className="p-2">
                      {e.order_id && e.order_number ? (
                        <Link
                          to="/admin/orders/$id"
                          params={{ id: e.order_id }}
                          className="text-primary"
                        >
                          #{e.order_number}
                        </Link>
                      ) : (
                        "—"
                      )}
                    </td>
                    <td
                      className={
                        toMinor(e.amount) < 0
                          ? "p-2 font-semibold text-success"
                          : "p-2 font-semibold"
                      }
                      dir="ltr"
                    >
                      {money(e.amount)}
                    </td>
                    <td className="p-2 text-xs text-muted-foreground">{e.note}</td>
                    <td className="p-2 text-end">
                      {e.type === "cod_collected" && e.order_id && !reversed.has(e.order_id) && (
                        <Button
                          size="sm"
                          variant="ghost"
                          aria-label={
                            ar
                              ? `عكس قيود الطلب #${e.order_number}`
                              : `Reverse order #${e.order_number}`
                          }
                          onClick={() => setReverse({ id: e.order_id!, number: e.order_number })}
                        >
                          <Undo2 className="h-4 w-4" />
                        </Button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot className="border-t-2 text-sm font-bold">
                {totals.map(([t, v]) => (
                  <tr key={t}>
                    <td className="p-2" colSpan={3}>
                      {ledgerTypeLabel(t, ar)}
                    </td>
                    <td className="p-2" dir="ltr">
                      {money(fromMinor(v))}
                    </td>
                    <td colSpan={2} />
                  </tr>
                ))}
                <tr>
                  <td className="p-2" colSpan={3}>
                    {ar ? "صافي الفترة" : "Net for the period"}
                  </td>
                  <td className="p-2" dir="ltr" data-testid="ledger-net">
                    {money(fromMinor(sumMinor(list.map((e) => e.amount))))}
                  </td>
                  <td colSpan={2} />
                </tr>
              </tfoot>
            </table>
          </div>
        )}
      </section>

      <section className="space-y-2">
        <h2 className="font-bold">{ar ? "التسويات" : "Settlements"}</h2>
        {(settlements.data ?? []).length === 0 ? (
          <p className="text-sm text-muted-foreground">
            {ar ? "لسه مفيش تسويات" : "No settlements yet"}
          </p>
        ) : (
          <ul className="divide-y rounded-2xl bg-card text-sm shadow-card">
            {settlements.data!.map((s) => (
              <li key={s.id} className="flex flex-wrap justify-between gap-2 p-3">
                <span>{new Date(s.created_at).toLocaleString(ar ? "ar-EG" : "en-GB")}</span>
                <span>
                  {ar ? "المتوقع " : "Expected "}
                  {money(s.expected_amount)}
                </span>
                <span className="font-bold">
                  {ar ? "المستلم " : "Received "}
                  {money(s.received_amount)}
                </span>
                {toMinor(s.difference) !== 0 && (
                  <span className="text-destructive">
                    {ar ? "فرق " : "Diff "}
                    {money(s.difference)} {s.note ? `· ${s.note}` : ""}
                  </span>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>

      <SettlementDialog driver={settle} ar={ar} onClose={() => setSettle(null)} onSaved={refresh} />
      <AdjustmentDialog driver={adjust} ar={ar} onClose={() => setAdjust(null)} onSaved={refresh} />
      <ReverseDialog order={reverse} ar={ar} onClose={() => setReverse(null)} onSaved={refresh} />
    </div>
  );
}

function Card({ label, value, testId }: { label: string; value: string; testId?: string }) {
  return (
    <div className="rounded-2xl bg-card p-3 shadow-card">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="mt-1 text-lg font-extrabold" data-testid={testId}>
        {value}
      </p>
    </div>
  );
}

/** This driver's own commission rule (otherwise the store's). */
function PayoutOverride({ driverId, ar }: { driverId: string; ar: boolean }) {
  const qc = useQueryClient();
  const q = useQuery({
    queryKey: ["driver_finance", "payout", driverId],
    queryFn: async () =>
      (
        await supabase
          .from("driver_payout_settings")
          .select("commission_type,commission_value")
          .eq("driver_id", driverId)
          .maybeSingle()
      ).data,
  });
  const [draft, setDraft] = useState<{ type: string; value: string } | null>(null);
  const cur = draft ?? {
    type: q.data?.commission_type ?? "fixed",
    value: q.data ? String(q.data.commission_value) : "",
  };
  const save = async () => {
    const v = parseAmountInput(cur.value);
    if (v === null || (cur.type === "percent_of_delivery_fee" && v > 10000))
      return toast.error(ar ? "قيمة غير صحيحة" : "Invalid value");
    const { error } = await supabase.from("driver_payout_settings").upsert({
      driver_id: driverId,
      commission_type: cur.type,
      commission_value: fromMinor(v),
      updated_at: new Date().toISOString(),
    });
    if (error) return toast.error(error.message);
    toast.success("✓");
    setDraft(null);
    qc.invalidateQueries({ queryKey: ["driver_finance", "payout", driverId] });
  };
  const remove = async () => {
    const { error } = await supabase
      .from("driver_payout_settings")
      .delete()
      .eq("driver_id", driverId);
    if (error) return toast.error(error.message);
    setDraft(null);
    qc.invalidateQueries({ queryKey: ["driver_finance", "payout", driverId] });
  };
  return (
    <section className="flex flex-wrap items-end gap-2 rounded-2xl bg-card p-4 text-sm shadow-card">
      <p className="w-full font-bold">
        {ar ? "عمولة خاصة بالمندوب ده" : "Commission for this driver"}{" "}
        <span className="font-normal text-muted-foreground">
          {q.data ? "" : ar ? "(حالياً عمولة المتجر)" : "(currently the store's)"}
        </span>
      </p>
      <select
        aria-label={ar ? "نوع العمولة" : "Commission type"}
        className="h-9 rounded-md border bg-background px-2"
        value={cur.type}
        onChange={(e) => setDraft({ ...cur, type: e.target.value })}
      >
        <option value="fixed">{ar ? "مبلغ ثابت" : "Fixed"}</option>
        <option value="percent_of_delivery_fee">
          {ar ? "نسبة من التوصيل" : "% of delivery fee"}
        </option>
      </select>
      <Input
        aria-label={ar ? "القيمة" : "Value"}
        placeholder={
          cur.type === "fixed" ? (ar ? "مثلاً 20" : "e.g. 20") : ar ? "مثلاً 50 (%)" : "e.g. 50 (%)"
        }
        className="w-28"
        inputMode="decimal"
        dir="ltr"
        value={cur.value}
        onChange={(e) => setDraft({ ...cur, value: e.target.value })}
      />
      <Button size="sm" onClick={save}>
        {ar ? "حفظ" : "Save"}
      </Button>
      {q.data && (
        <Button size="sm" variant="ghost" onClick={remove}>
          {ar ? "رجوع لعمولة المتجر" : "Use the store's"}
        </Button>
      )}
    </section>
  );
}
