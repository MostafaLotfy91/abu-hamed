import { createElement, useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useI18n } from "@/lib/i18n";

export type DriverStatus = "available" | "busy" | "offline";
export const DRIVER_STATUSES: DriverStatus[] = ["available", "busy", "offline"];
export const driverStatusLabel = (s: string, ar: boolean) =>
  ({
    available: ar ? "متاح" : "Available",
    busy: ar ? "مشغول" : "Busy",
    offline: ar ? "غير متصل" : "Offline",
  })[s] ?? s;

export type DriverRow = {
  user_id: string;
  is_available: boolean;
  status: DriverStatus;
  is_active: boolean;
  vehicle: string | null;
  full_name: string | null;
  phone: string | null;
  email: string | null;
};

export function DriverStatusBadge({ status, active }: { status: string; active: boolean }) {
  const { lang } = useI18n();
  const ar = lang === "ar";
  const tone = !active
    ? "bg-destructive/10 text-destructive"
    : status === "available"
      ? "bg-success/15 text-success"
      : status === "busy"
        ? "bg-brand-secondary/25 text-brand-secondary-foreground"
        : "bg-muted text-muted-foreground";
  return createElement(
    "span",
    { className: `rounded-full px-2 py-0.5 text-xs font-bold ${tone}` },
    !active ? (ar ? "موقوف" : "Deactivated") : driverStatusLabel(status, ar),
  );
}

/** Staff-only: all drivers with availability + profile info. */
export function useDrivers() {
  return useQuery({
    queryKey: ["drivers"],
    queryFn: async (): Promise<DriverRow[]> => {
      const { data: dp, error } = await supabase.from("driver_profiles").select("*");
      if (error) throw error;
      const rows = (dp ?? []) as unknown as Omit<DriverRow, "full_name" | "phone" | "email">[];
      const ids = rows.map((d) => d.user_id);
      const { data: profs } = ids.length
        ? await supabase.from("profiles").select("id,full_name,phone,email").in("id", ids)
        : { data: [] };
      const map = new Map((profs ?? []).map((p) => [p.id, p]));
      return rows.map((d) => ({
        ...d,
        full_name: map.get(d.user_id)?.full_name ?? null,
        phone: map.get(d.user_id)?.phone ?? null,
        email: map.get(d.user_id)?.email ?? null,
      }));
    },
  });
}

export type LatLng = { lat: number; lng: number; created_at: string };

/** Latest driver position for an order, live via realtime. RLS decides who sees it. */
export function useLatestLocation(orderId: string, enabled: boolean) {
  const qc = useQueryClient();
  const key = ["driver_location", orderId];
  const q = useQuery({
    queryKey: key,
    enabled,
    queryFn: async (): Promise<LatLng | null> => {
      const { data } = await supabase
        .from("driver_locations")
        .select("lat,lng,created_at")
        .eq("order_id", orderId)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      return data ?? null;
    },
  });
  useEffect(() => {
    if (!enabled) return;
    const ch = supabase
      .channel(`loc-${orderId}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "driver_locations",
          filter: `order_id=eq.${orderId}`,
        },
        (p) => {
          const r = p.new as LatLng;
          qc.setQueryData(key, { lat: r.lat, lng: r.lng, created_at: r.created_at });
        },
      )
      .subscribe();
    const poll = setInterval(() => qc.invalidateQueries({ queryKey: key }), 15000);
    return () => {
      clearInterval(poll);
      supabase.removeChannel(ch);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orderId, enabled, qc]);
  return q;
}

export function mapsUrl(a: Record<string, unknown>) {
  if (a.lat && a.lng) return `https://www.google.com/maps/dir/?api=1&destination=${a.lat},${a.lng}`;
  const q = [a.street, a.building, a.area, a.city].filter(Boolean).join(", ");
  return `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(q)}`;
}
