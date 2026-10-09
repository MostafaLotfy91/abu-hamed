// Admin queries for drivers' cash (staff read; the pages that change money are admin-only).
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { CashRow } from "./driver-cash-export";
import { dayBounds } from "./driver-finance";

/** One row per driver for a store-local day (null = today). */
export function useDriverCash(day: string | null, enabled = true) {
  return useQuery({
    queryKey: ["driver_finance", "admin_cash", day],
    enabled,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("admin_driver_cash", day ? { _day: day } : {});
      if (error) throw error;
      return (data ?? []) as CashRow[];
    },
  });
}

export type PendingReview = {
  order_id: string;
  driver_id: string;
  expected_amount: number;
  collected_amount: number;
  reason: string | null;
  created_at: string;
  order_number: number | null;
};

/** COD amount mismatches waiting for an admin. */
export function usePendingReviews(enabled = true) {
  return useQuery({
    queryKey: ["driver_finance", "reviews"],
    enabled,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("cod_collections")
        .select(
          "order_id,driver_id,expected_amount,collected_amount,reason,created_at,orders(order_number)",
        )
        .eq("review_status", "pending_review")
        .order("created_at");
      if (error) throw error;
      return (data ?? []).map(({ orders, ...r }) => ({
        ...r,
        order_number: (orders as unknown as { order_number: number } | null)?.order_number ?? null,
      })) as PendingReview[];
    },
  });
}

/** All ledger entries of a store-local day for every driver (daily report), with order numbers. */
export async function dayEntries(day: string) {
  const { start: day_start, end: day_end } = await dayBounds(day);
  const { data: rows, error } = await supabase
    .from("driver_ledger")
    .select("id,created_at,driver_id,type,amount,order_id,note,reverses_id")
    .gte("created_at", day_start)
    .lt("created_at", day_end)
    .order("created_at")
    .limit(5000);
  if (error) throw error;
  const ids = [...new Set((rows ?? []).map((r) => r.order_id).filter(Boolean))] as string[];
  const numbers = new Map<string, number>();
  for (let i = 0; i < ids.length; i += 200) {
    const { data } = await supabase
      .from("orders")
      .select("id,order_number")
      .in("id", ids.slice(i, i + 200));
    for (const o of data ?? []) numbers.set(o.id, o.order_number);
  }
  return (rows ?? []).map((r) => ({
    ...r,
    order_number: r.order_id ? (numbers.get(r.order_id) ?? null) : null,
  }));
}
