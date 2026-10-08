import { useState } from "react";
import { Send } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { useDrivers } from "@/lib/drivers";
import { DispatchBadge, eventLabel, offerStatusLabel, useOrderDispatch } from "@/lib/dispatch";
import { formatCount } from "@/lib/format";

/** Order details: dispatch status, the open offer with its countdown, who rejected/let it expire, and the log. */
export function DispatchPanel({
  orderId,
  status,
  dispatchStatus,
  driverId,
  ar,
  onChanged,
}: {
  orderId: string;
  status: string;
  dispatchStatus: string;
  driverId: string | null;
  ar: boolean;
  onChanged: () => void;
}) {
  const q = useOrderDispatch(orderId);
  const drivers = useDrivers();
  const name = (id: string | null) => {
    if (!id) return "";
    const d = drivers.data?.find((x) => x.user_id === id);
    return d?.full_name ?? d?.email ?? (ar ? "مندوب" : "Driver");
  };
  const offers = q.data?.offers ?? [];
  const open = offers.find((o) => o.status === "offered");
  const declined = offers.filter((o) => o.status === "rejected" || o.status === "expired");
  const canDispatch = !driverId && (status === "confirmed" || status === "preparing") && !open;

  const [busy, setBusy] = useState(false);
  const dispatchNow = async () => {
    setBusy(true);
    const { data, error } = await supabase.rpc("dispatch_order", { _order_id: orderId });
    setBusy(false);
    if (error) return toast.error(error.message);
    if (data === "offered") toast.success(ar ? "تم عرض الطلب على مندوب" : "Offered to a driver");
    else if (data === "no_driver_available")
      toast.error(ar ? "لا يوجد مندوب متاح الآن" : "No driver is available right now");
    q.refetch();
    onChanged();
  };

  return (
    <section aria-labelledby="dispatch-title" className="space-y-3">
      <div className="flex items-center justify-between gap-2">
        <p id="dispatch-title" className="text-sm font-bold">
          {ar ? "التوزيع" : "Dispatch"}
        </p>
        <DispatchBadge status={dispatchStatus} ar={ar} />
      </div>

      {open && <OpenOffer driver={name(open.driver_id)} expiresAt={open.expires_at} ar={ar} />}

      {declined.length > 0 && (
        <div className="text-xs">
          <p className="mb-1 font-semibold text-muted-foreground">
            {ar ? "مناديب لم يقبلوا" : "Drivers who didn't take it"}
          </p>
          <ul className="space-y-1">
            {declined.map((o) => (
              <li key={o.id} className="flex justify-between gap-2">
                <span>{name(o.driver_id)}</span>
                <span className="text-muted-foreground">{offerStatusLabel(o.status, ar)}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {canDispatch && (
        <Button
          size="sm"
          variant="outline"
          className="w-full gap-1"
          disabled={busy}
          onClick={dispatchNow}
        >
          <Send className="h-4 w-4" />
          {ar ? "اعرض على مندوب الآن" : "Offer to a driver now"}
        </Button>
      )}

      {(q.data?.events.length ?? 0) > 0 && (
        <details className="text-xs">
          <summary className="cursor-pointer font-semibold text-muted-foreground">
            {ar ? "سجل التوزيع" : "Dispatch log"} (
            {formatCount(q.data!.events.length, ar ? "ar" : "en")})
          </summary>
          <ol className="mt-2 space-y-1">
            {q.data!.events.map((e) => (
              <li key={e.id} className="flex justify-between gap-2">
                <span>
                  {eventLabel(e.event, ar)} {name(e.driver_id)}
                </span>
                <time className="shrink-0 text-muted-foreground" dateTime={e.created_at}>
                  {new Date(e.created_at).toLocaleTimeString(ar ? "ar-EG" : "en-US")}
                </time>
              </li>
            ))}
          </ol>
        </details>
      )}
    </section>
  );
}

/** Shows the expiry as a clock time, not a countdown, so a wrong clock on the admin PC can't mislead. */
function OpenOffer({ driver, expiresAt, ar }: { driver: string; expiresAt: string; ar: boolean }) {
  return (
    <div className="flex items-center justify-between gap-2 rounded-xl bg-brand-secondary/20 p-2 text-sm">
      <span>
        {ar ? "معروض على: " : "Offered to: "}
        <b>{driver}</b>
      </span>
      <time dateTime={expiresAt} className="shrink-0 text-xs">
        {ar ? "حتى " : "until "}
        {new Date(expiresAt).toLocaleTimeString(ar ? "ar-EG" : "en-US")}
      </time>
    </div>
  );
}
