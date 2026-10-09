// Driver cash and earnings: shared queries and wording for the driver app and the admin pages.
// Amounts come from the database (numeric) and are handled with ./money (integer minor units).
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toMinor } from "./money";

export const LEDGER_TYPES = [
  "cod_collected",
  "commission_earned",
  "settlement_paid",
  "adjustment",
  "reversal",
] as const;
export type LedgerType = (typeof LEDGER_TYPES)[number];

const TYPE_LABELS: Record<LedgerType, { ar: string; en: string }> = {
  cod_collected: { ar: "تحصيل كاش", en: "Cash collected" },
  commission_earned: { ar: "عمولة", en: "Commission" },
  settlement_paid: { ar: "تسوية (تسليم للمحل)", en: "Settlement" },
  adjustment: { ar: "تعديل", en: "Adjustment" },
  reversal: { ar: "إلغاء قيد", en: "Reversal" },
};

/** "Reversal of: commission" style label; `kind` is the type of the entry a reversal undoes. */
export function ledgerTypeLabel(type: string, ar: boolean, kind?: string): string {
  const l = TYPE_LABELS[type as LedgerType];
  const base = l ? (ar ? l.ar : l.en) : type;
  if (type === "reversal" && kind && kind !== "reversal")
    return `${base}: ${ledgerTypeLabel(kind, ar)}`;
  return base;
}

export type Balance = {
  cash_collected: number;
  commission_earned: number;
  settlements_paid: number;
  adjustments: number;
  cash_held: number;
  owed_to_store: number;
  commission_payable: number;
  last_settlement_at: string | null;
};

const ZERO: Balance = {
  cash_collected: 0,
  commission_earned: 0,
  settlements_paid: 0,
  adjustments: 0,
  cash_held: 0,
  owed_to_store: 0,
  commission_payable: 0,
  last_settlement_at: null,
};

/** One driver's balance from the driver_balance view (own row for a driver; any row for staff). */
export function useDriverBalance(driverId: string | null | undefined, enabled = true) {
  return useQuery({
    queryKey: ["driver_finance", "balance", driverId],
    enabled: !!driverId && enabled,
    queryFn: async (): Promise<Balance> => {
      const { data, error } = await supabase
        .from("driver_balance")
        .select("*")
        .eq("driver_id", driverId!)
        .maybeSingle();
      if (error) throw error;
      return data ? ({ ...ZERO, ...data } as Balance) : ZERO;
    },
  });
}

/** The store's current local day and its [start, end) bounds. */
export async function storeToday() {
  const { data: day, error } = await supabase.rpc("store_today");
  if (error) throw error;
  const { data: b, error: e2 } = await supabase.rpc("store_day_bounds", { _day: day as string });
  if (e2) throw e2;
  const bounds = (b as { day_start: string; day_end: string }[])[0];
  return { day: day as string, start: bounds.day_start, end: bounds.day_end };
}

/** Over the store's cash limit (0 = no limit). */
export function overCashLimit(
  cashHeld: number | string,
  limit: number | string | null | undefined,
) {
  const lim = toMinor(limit ?? 0);
  return lim > 0 && toMinor(cashHeld) > lim;
}

/** Errors from the finance functions, in the user's language. */
export function financeError(message: string, ar: boolean) {
  const known: Record<string, [string, string]> = {
    reason_required: ["اكتب السبب (٣ حروف على الأقل)", "Enter a reason (at least 3 characters)"],
    note_required: ["اكتب ملاحظة توضح الفرق", "Add a note explaining the difference"],
    amount_required: ["اكتب المبلغ اللي اتحصّل", "Enter the amount collected"],
    invalid_amount: ["المبلغ غير صحيح", "Invalid amount"],
    invalid_transition: ["الطلب اتغيرت حالته، حدّث الصفحة", "The order changed, refresh the page"],
    forbidden: ["مش مسموح لك", "Not allowed"],
    not_pending: ["الطلب ده اتراجع خلاص", "This order was already reviewed"],
  };
  const k = Object.keys(known).find((key) => message.includes(key));
  return k ? known[k][ar ? 0 : 1] : message;
}
