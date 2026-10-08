// Admin side of automatic dispatch: labels, the per-order dispatch picture and the dashboard alerts.
import { createElement, useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { Database } from "@/integrations/supabase/types";

export type DispatchStatus = "unassigned" | "offered" | "assigned" | "no_driver_available";
export type OfferRow = Database["public"]["Tables"]["order_dispatch_offers"]["Row"];
export type DispatchEvent = Database["public"]["Tables"]["order_dispatch_events"]["Row"];
export type DispatchAlert =
  Database["public"]["Functions"]["admin_dispatch_alerts"]["Returns"][number];

export const dispatchLabel = (s: string, ar: boolean) =>
  ({
    unassigned: ar ? "بدون مندوب" : "Unassigned",
    offered: ar ? "معروض على مندوب" : "Offered",
    assigned: ar ? "مع مندوب" : "Assigned",
    no_driver_available: ar ? "لا يوجد مندوب متاح" : "No driver available",
  })[s] ?? s;

export const offerStatusLabel = (s: string, ar: boolean) =>
  ({
    offered: ar ? "بانتظار الرد" : "Waiting",
    accepted: ar ? "قبل" : "Accepted",
    rejected: ar ? "رفض" : "Rejected",
    expired: ar ? "انتهت المهلة" : "Expired",
    cancelled: ar ? "أُلغي" : "Cancelled",
  })[s] ?? s;

export const eventLabel = (e: string, ar: boolean) =>
  ({
    offered: ar ? "عُرض على" : "Offered to",
    accepted: ar ? "قبله" : "Accepted by",
    rejected: ar ? "رفضه" : "Rejected by",
    expired: ar ? "انتهت مهلة" : "Expired for",
    cancelled: ar ? "أُلغي العرض لـ" : "Offer cancelled for",
    no_driver: ar ? "لا يوجد مندوب متاح" : "No driver available",
    manual_assign: ar ? "تعيين يدوي لـ" : "Assigned manually to",
    manual_unassign: ar ? "إلغاء تعيين" : "Unassigned from",
  })[e] ?? e;

export function DispatchBadge({ status, ar }: { status: string; ar: boolean }) {
  const tone =
    status === "no_driver_available"
      ? "bg-destructive/10 text-destructive"
      : status === "offered"
        ? "bg-brand-secondary/25 text-foreground"
        : status === "assigned"
          ? "bg-success/15 text-success"
          : "bg-muted text-muted-foreground";
  return createElement(
    "span",
    { className: `rounded-full px-2 py-0.5 text-xs font-bold ${tone}` },
    dispatchLabel(status, ar),
  );
}

/** Offers and audit events for one order, live (staff RLS). */
export function useOrderDispatch(orderId: string) {
  const qc = useQueryClient();
  const key = ["order_dispatch", orderId];
  const q = useQuery({
    queryKey: key,
    queryFn: async () => {
      const [offers, events] = await Promise.all([
        supabase
          .from("order_dispatch_offers")
          .select("*")
          .eq("order_id", orderId)
          .order("offered_at", { ascending: true }),
        supabase
          .from("order_dispatch_events")
          .select("*")
          .eq("order_id", orderId)
          .order("id", { ascending: true }),
      ]);
      if (offers.error) throw offers.error;
      if (events.error) throw events.error;
      return { offers: offers.data ?? [], events: events.data ?? [] };
    },
  });
  useEffect(() => {
    const ch = supabase
      .channel(`admin-dispatch-${orderId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "order_dispatch_offers",
          filter: `order_id=eq.${orderId}`,
        },
        () => qc.invalidateQueries({ queryKey: key }),
      )
      .subscribe();
    return () => {
      supabase.removeChannel(ch);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- key is derived from orderId
  }, [orderId, qc]);
  return q;
}

/** Open offers for a set of orders (orders list: "offered to …"). */
export function useOpenOffers(orderIds: string[]) {
  return useQuery({
    queryKey: ["open_offers", [...orderIds].sort().join(",")],
    enabled: orderIds.length > 0,
    // An offer moves to the next driver without changing the order row, so re-check regularly.
    refetchInterval: 15_000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("order_dispatch_offers")
        .select("order_id,driver_id,expires_at")
        .in("order_id", orderIds)
        .eq("status", "offered");
      if (error) throw error;
      return new Map((data ?? []).map((o) => [o.order_id, o]));
    },
  });
}

/** Orders waiting for a driver; refreshed live and every 30 s (time-based alerts appear without changes). */
export function useDispatchAlerts() {
  const qc = useQueryClient();
  const q = useQuery({
    queryKey: ["dispatch_alerts"],
    refetchInterval: 30_000,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("admin_dispatch_alerts");
      if (error) throw error;
      return data ?? [];
    },
  });
  useEffect(() => {
    const ch = supabase
      .channel("admin-dispatch-alerts")
      .on("postgres_changes", { event: "*", schema: "public", table: "orders" }, () =>
        qc.invalidateQueries({ queryKey: ["dispatch_alerts"] }),
      )
      .subscribe();
    return () => {
      supabase.removeChannel(ch);
    };
  }, [qc]);
  return q;
}
