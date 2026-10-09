// Driver cash and earnings: shared queries and wording for the driver app and the admin pages.
// Amounts come from the database (numeric) and are handled with ./money (integer minor units).
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toMinor } from "./money";

export { LEDGER_TYPES, ledgerTypeLabel, type LedgerType } from "./ledger-labels";

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

/** A store-local day's [start, end) as timestamps. (A single-row function: PostgREST returns an object.) */
export async function dayBounds(day: string) {
  const { data, error } = await supabase.rpc("store_day_bounds", { _day: day });
  if (error) throw error;
  const row = (Array.isArray(data) ? data[0] : data) as {
    day_start: string;
    day_end: string;
  } | null;
  if (!row) throw new Error("store_day_bounds returned nothing");
  return { start: row.day_start, end: row.day_end };
}

/** The store's current local day and its [start, end) bounds. */
export async function storeToday() {
  const { data: day, error } = await supabase.rpc("store_today");
  if (error) throw error;
  return { day: day as string, ...(await dayBounds(day as string)) };
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
