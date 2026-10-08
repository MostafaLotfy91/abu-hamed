// Admin: pending-orders count for the nav badge, and a chime + toast when a new order comes in.
import { useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { playChime, resumeSound } from "@/lib/driver-alerts";

export const PENDING_KEY = ["admin", "pending-count"];

export function useNewOrderAlerts(enabled: boolean, ar: boolean) {
  const qc = useQueryClient();
  const navigate = useNavigate();
  const pending = useQuery({
    queryKey: PENDING_KEY,
    enabled,
    refetchInterval: 60_000,
    queryFn: async () => {
      const { count, error } = await supabase
        .from("orders")
        .select("id", { count: "exact", head: true })
        .eq("status", "pending");
      if (error) throw error;
      return count ?? 0;
    },
  });

  useEffect(() => {
    if (!enabled) return;
    // Browsers only play sound after a tap: unlock on the first one.
    const unlock = () => resumeSound();
    window.addEventListener("pointerdown", unlock, { once: true });
    const ch = supabase
      .channel("admin-new-orders")
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "orders" }, (payload) => {
        const o = payload.new as { id?: string; order_number?: number };
        qc.invalidateQueries({ queryKey: PENDING_KEY });
        qc.invalidateQueries({ queryKey: ["admin", "orders"] });
        playChime();
        toast(ar ? `طلب جديد #${o.order_number ?? ""}` : `New order #${o.order_number ?? ""}`, {
          duration: 10_000,
          action: o.id
            ? {
                label: ar ? "فتح" : "Open",
                onClick: () => navigate({ to: "/admin/orders/$id", params: { id: o.id! } }),
              }
            : undefined,
        });
      })
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "orders" }, () =>
        qc.invalidateQueries({ queryKey: PENDING_KEY }),
      )
      .subscribe();
    return () => {
      window.removeEventListener("pointerdown", unlock);
      supabase.removeChannel(ch);
    };
  }, [enabled, ar, qc, navigate]);

  return pending.data ?? 0;
}
