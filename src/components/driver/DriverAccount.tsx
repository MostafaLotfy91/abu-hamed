import { useQuery } from "@tanstack/react-query";
import { AlertTriangle, Banknote, CheckCircle2, HandCoins, Receipt, Wallet } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useMoney } from "@/components/store/use-money";
import { useSettings } from "@/lib/store-settings";
import { formatCount } from "@/lib/format";
import { overCashLimit, storeToday, useDriverBalance } from "@/lib/driver-finance";
import { fromMinor, sumMinor, toMinor } from "@/lib/money";
import { ErrorState, RowSkeleton } from "@/components/store/states";
import { cn } from "@/lib/utils";

type Entry = {
  id: string;
  created_at: string;
  type: string;
  kind: string;
  amount: number;
  affects_cash: boolean;
  order_id: string | null;
  order_number: number | null;
  payment_method: string | null;
};

/** The driver's "My account" tab: balance, today, today's orders, previous days and settlements. */
export function DriverAccount({ driverId, ar }: { driverId: string; ar: boolean }) {
  const money = useMoney();
  const { settings } = useSettings();
  const L = ar ? "ar" : "en";
  const balance = useDriverBalance(driverId);
  const today = useQuery({
    queryKey: ["driver_finance", "today", driverId],
    queryFn: async () => {
      const day = await storeToday();
      const { data, error } = await supabase.rpc("driver_ledger_entries", {
        _driver_id: driverId,
        _from: day.start,
        _to: day.end,
      });
      if (error) throw error;
      return { day: day.day, entries: (data ?? []) as Entry[] };
    },
  });
  const days = useQuery({
    queryKey: ["driver_finance", "days", driverId],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("driver_daily_summary", {
        _driver_id: driverId,
        _days: 30,
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
        .select("id,created_at,expected_amount,received_amount,difference,note")
        .eq("driver_id", driverId)
        .order("created_at", { ascending: false })
        .limit(30);
      if (error) throw error;
      return data ?? [];
    },
  });

  const failed = balance.error ?? today.error;
  if (failed)
    return (
      <ErrorState
        message={(failed as Error).message}
        onRetry={() => {
          balance.refetch();
          today.refetch();
        }}
      />
    );
  if (balance.isLoading || today.isLoading) return <RowSkeleton n={3} />;
  const b = balance.data!;
  const entries = today.data?.entries ?? [];
  const orderIds = new Set(
    entries.filter((e) => e.type === "cod_collected").map((e) => e.order_id),
  );
  const reversedOrders = new Set(
    entries
      .filter((e) => e.type === "reversal" && e.kind === "cod_collected")
      .map((e) => e.order_id),
  );
  const cashToday = sumMinor(
    entries.filter((e) => e.kind === "cod_collected").map((e) => e.amount),
  );
  const commissionToday = -sumMinor(
    entries.filter((e) => e.kind === "commission_earned").map((e) => e.amount),
  );
  // Today's deliveries only (cash minus commission kept); settlements show in the balance card above.
  const netToday = sumMinor(
    entries
      .filter(
        (e) => e.affects_cash && (e.kind === "cod_collected" || e.kind === "commission_earned"),
      )
      .map((e) => e.amount),
  );
  const owed = toMinor(b.owed_to_store);
  const over = overCashLimit(b.cash_held, settings?.driver_cash_limit);
  const keeps = settings?.driver_keeps_commission_from_cash !== false;

  // Today's orders: one row per order with what was collected and earned.
  const byOrder = new Map<
    string,
    { number: number | null; cod: number; commission: number; online: boolean }
  >();
  for (const e of entries) {
    if (!e.order_id || !["cod_collected", "commission_earned"].includes(e.kind)) continue;
    const row = byOrder.get(e.order_id) ?? {
      number: e.order_number,
      cod: 0,
      commission: 0,
      online: e.payment_method === "online",
    };
    if (e.kind === "cod_collected") row.cod += toMinor(e.amount);
    else row.commission -= toMinor(e.amount);
    byOrder.set(e.order_id, row);
  }
  const previous = (days.data ?? []).filter((d) => d.day !== today.data?.day);

  return (
    <div className="space-y-4" data-testid="driver-account">
      <section
        aria-label={ar ? "رصيدي" : "My balance"}
        className={cn(
          "space-y-2 rounded-2xl p-4 shadow-card",
          over ? "bg-destructive/10" : "bg-card",
        )}
      >
        <div className="flex items-center justify-between">
          <span className="flex items-center gap-2 text-sm font-bold">
            <Wallet className="h-4 w-4" />
            {ar ? "كاش معاك دلوقتي" : "Cash you hold now"}
          </span>
          <span className="text-xl font-extrabold" data-testid="cash-held">
            {money(b.cash_held)}
          </span>
        </div>
        <div className="flex items-center justify-between text-sm">
          <span>
            {owed >= 0
              ? ar
                ? "المطلوب تسليمه للمحل"
                : "To hand over to the store"
              : ar
                ? "المحل عليه لك"
                : "The store owes you"}
          </span>
          <span className="font-extrabold" data-testid="owed-to-store">
            {money(fromMinor(Math.abs(owed)))}
          </span>
        </div>
        {toMinor(b.commission_payable) > 0 && (
          <div className="flex items-center justify-between text-sm">
            <span>{ar ? "عمولتك (بتتصرف منفصلة)" : "Your commission (paid separately)"}</span>
            <span className="font-bold">{money(b.commission_payable)}</span>
          </div>
        )}
        {over && (
          <p
            className="flex items-center gap-2 text-sm font-semibold text-destructive"
            role="alert"
          >
            <AlertTriangle className="h-4 w-4 shrink-0" />
            {ar
              ? `الكاش معاك عدّى الحد (${money(settings?.driver_cash_limit)}). سلّم للمحل في أقرب وقت.`
              : `Your cash is over the limit (${money(settings?.driver_cash_limit)}). Hand it over soon.`}
          </p>
        )}
        {settings?.settlement_mode === "per_order" && owed > 0 && (
          <p className="text-xs text-muted-foreground">
            {ar ? "المحل بيستلم الكاش بعد كل طلب." : "The store collects cash after every order."}
          </p>
        )}
      </section>

      <section aria-label={ar ? "النهارده" : "Today"} className="space-y-2">
        <h2 className="text-sm font-bold">{ar ? "النهارده" : "Today"}</h2>
        <div className="grid grid-cols-2 gap-3">
          <Stat icon={CheckCircle2} label={ar ? "طلبات اتسلّمت" : "Orders delivered"}>
            {formatCount(orderIds.size - reversedOrders.size, L)}
          </Stat>
          <Stat icon={Banknote} label={ar ? "كاش اتحصّل" : "Cash collected"}>
            {money(fromMinor(cashToday))}
          </Stat>
          <Stat icon={HandCoins} label={ar ? "عمولتي" : "My commission"}>
            {money(fromMinor(commissionToday))}
          </Stat>
          <Stat
            icon={Wallet}
            label={
              keeps
                ? ar
                  ? "الصافي للتسليم"
                  : "Net to hand over"
                : ar
                  ? "تسلّم للمحل"
                  : "To hand over"
            }
          >
            {money(fromMinor(netToday))}
          </Stat>
        </div>
        {byOrder.size > 0 && (
          <ul className="divide-y rounded-2xl bg-card text-sm shadow-card">
            {[...byOrder.entries()].map(([id, r]) => (
              <li key={id} className="flex items-center justify-between gap-2 p-3">
                <span className="font-bold">{r.number ? `#${r.number}` : "—"}</span>
                <span className="text-muted-foreground">
                  {r.online ? (ar ? "مدفوع أونلاين" : "Paid online") : money(fromMinor(r.cod))}
                </span>
                <span className="text-xs">
                  {ar ? "عمولة " : "Commission "}
                  {money(fromMinor(r.commission))}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>

      {previous.length > 0 && (
        <section aria-label={ar ? "الأيام اللي فاتت" : "Previous days"} className="space-y-2">
          <h2 className="text-sm font-bold">{ar ? "الأيام اللي فاتت" : "Previous days"}</h2>
          <ul className="divide-y rounded-2xl bg-card text-sm shadow-card">
            {previous.map((d) => (
              <li key={d.day} className="grid grid-cols-4 items-center gap-2 p-3">
                <span className="font-semibold">
                  {new Date(`${d.day}T12:00:00`).toLocaleDateString(ar ? "ar-EG" : "en-US", {
                    weekday: "short",
                    day: "numeric",
                    month: "short",
                  })}
                </span>
                <span>{formatCount(d.orders_delivered, L)}</span>
                <span>{money(d.cash_collected)}</span>
                <span className="text-end text-xs">
                  {ar ? "عمولة " : "Comm. "}
                  {money(d.commission_earned)}
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section aria-label={ar ? "التسويات" : "Settlements"} className="space-y-2">
        <h2 className="flex items-center gap-2 text-sm font-bold">
          <Receipt className="h-4 w-4" />
          {ar ? "التسويات" : "Settlements"}
        </h2>
        {(settlements.data ?? []).length === 0 ? (
          <p className="text-sm text-muted-foreground">
            {ar ? "لسه مفيش تسويات" : "No settlements yet"}
          </p>
        ) : (
          <ul className="divide-y rounded-2xl bg-card text-sm shadow-card">
            {settlements.data!.map((s) => (
              <li key={s.id} className="space-y-1 p-3">
                <div className="flex justify-between">
                  <span className="font-semibold">
                    {new Date(s.created_at).toLocaleString(ar ? "ar-EG" : "en-US")}
                  </span>
                  <span className="font-extrabold">{money(s.received_amount)}</span>
                </div>
                {toMinor(s.difference) !== 0 && (
                  <p className="text-xs text-destructive">
                    {ar ? "فرق: " : "Difference: "}
                    {money(s.difference)} · {ar ? "المتوقع " : "expected "}
                    {money(s.expected_amount)}
                    {s.note ? ` · ${s.note}` : ""}
                  </p>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

function Stat({
  icon: Icon,
  label,
  children,
}: {
  icon: typeof Wallet;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-2xl bg-card p-3 shadow-card">
      <p className="flex items-center gap-1 text-xs text-muted-foreground">
        <Icon className="h-3.5 w-3.5" />
        {label}
      </p>
      <p className="mt-1 text-lg font-extrabold">{children}</p>
    </div>
  );
}
