// Live dispatch offers for the signed-in driver: initial fetch, Realtime updates, refetch on reconnect/reopen,
// and the answer (accept/reject). Offer details come from driver_my_offers(), which never includes the
// customer's name, phone or street.
import { useCallback, useEffect, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { Database } from "@/integrations/supabase/types";

export type DriverOffer = Database["public"]["Functions"]["driver_my_offers"]["Returns"][number];

/** Why an offer left the screen without the driver accepting it. */
export type OfferOutcome = "expired" | "taken" | "rejected" | "accepted";

export const OFFERS_KEY = "driver_offers";

/** Server time minus device time (ms), from the server_now the RPC returns. Phones with a wrong clock still count down correctly. */
export function clockOffset(serverNow: string, receivedAt: number) {
  return new Date(serverNow).getTime() - receivedAt;
}

/** Whole seconds left before the offer expires (never negative). */
export function secondsLeft(expiresAt: string, offsetMs: number, now = Date.now()) {
  return Math.max(0, Math.ceil((new Date(expiresAt).getTime() - (now + offsetMs)) / 1000));
}

export function formatCountdown(secs: number) {
  const m = Math.floor(secs / 60);
  const s = secs % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}

/** Offer ids in `next` that were not in `prev` (new offers that should ring). */
export function newOfferIds(prev: Set<string>, next: DriverOffer[]) {
  return next.map((o) => o.offer_id).filter((id) => !prev.has(id));
}

/** Maps a closed offer row status (Realtime) or an RPC result to what the driver is told. */
export function outcomeOf(status: string): OfferOutcome | null {
  if (status === "expired") return "expired";
  if (status === "cancelled" || status === "taken") return "taken";
  if (status === "rejected") return "rejected";
  if (status === "accepted") return "accepted";
  return null;
}

export function useDriverOffers(driverId: string | null, enabled: boolean) {
  const qc = useQueryClient();
  const [offset, setOffset] = useState(0);
  // Outcome of the most recent offer that closed while it was on screen (shown as a message).
  const [closed, setClosed] = useState<{ offerId: string; outcome: OfferOutcome } | null>(null);
  const answered = useRef(new Set<string>());

  const q = useQuery({
    queryKey: [OFFERS_KEY, driverId],
    enabled: enabled && !!driverId,
    // Backup for a missed Realtime event; Realtime normally makes this instant.
    refetchInterval: 30_000,
    refetchOnWindowFocus: true,
    refetchOnReconnect: true,
    queryFn: async () => {
      const sent = Date.now();
      const { data, error } = await supabase.rpc("driver_my_offers");
      if (error) throw error;
      const rows = data ?? [];
      if (rows[0]) setOffset(clockOffset(rows[0].server_now, (sent + Date.now()) / 2));
      return rows;
    },
  });

  useEffect(() => {
    if (!enabled || !driverId) return;
    const refresh = () => qc.invalidateQueries({ queryKey: [OFFERS_KEY, driverId] });
    const ch = supabase
      .channel(`driver-offers-${driverId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "order_dispatch_offers",
          filter: `driver_id=eq.${driverId}`,
        },
        (payload) => {
          const row = payload.new as { id?: string; status?: string } | undefined;
          // An offer on screen was closed by the server (timeout, or the order went to someone else).
          if (row?.id && row.status && row.status !== "offered" && !answered.current.has(row.id)) {
            const outcome = outcomeOf(row.status);
            if (outcome === "expired" || outcome === "taken")
              setClosed({ offerId: row.id, outcome });
          }
          refresh();
        },
      )
      .subscribe((status) => {
        // After a dropped connection, fetch whatever arrived meanwhile.
        if (status === "SUBSCRIBED") refresh();
      });
    // Reopening the app (tab visible again) re-checks pending offers.
    const onVisible = () => document.visibilityState === "visible" && refresh();
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      document.removeEventListener("visibilitychange", onVisible);
      supabase.removeChannel(ch);
    };
  }, [enabled, driverId, qc]);

  const respond = useCallback(
    async (offerId: string, accept: boolean): Promise<OfferOutcome | "error"> => {
      answered.current.add(offerId);
      const { data, error } = await supabase.rpc("driver_respond_to_offer", {
        _offer_id: offerId,
        _accept: accept,
      });
      qc.invalidateQueries({ queryKey: [OFFERS_KEY, driverId] });
      qc.invalidateQueries({ queryKey: ["driver_orders"] });
      qc.invalidateQueries({ queryKey: ["driver_customers"] });
      if (error) return "error";
      const outcome = outcomeOf(data ?? "") ?? "error";
      if (outcome === "expired" || outcome === "taken") setClosed({ offerId, outcome });
      return outcome;
    },
    [qc, driverId],
  );

  return {
    offers: q.data ?? [],
    loading: q.isLoading,
    offset,
    respond,
    closed,
    dismissClosed: () => setClosed(null),
  };
}
