import { useEffect, useState } from "react";
import { BellRing, Check, MapPin, Package, Timer, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useMoney } from "@/components/store/use-money";
import { countLabel, formatCount } from "@/lib/format";
import {
  formatCountdown,
  secondsLeft,
  type DriverOffer,
  type OfferOutcome,
} from "@/lib/driver-offers";
import { cn } from "@/lib/utils";

/** Full-width alert pinned to the top (full screen on phones) for the oldest open offer. */
export function OfferAlert({
  offer,
  offset,
  ar,
  more,
  busy,
  onAccept,
  onReject,
}: {
  offer: DriverOffer;
  offset: number;
  ar: boolean;
  /** Other open offers waiting behind this one. */
  more: number;
  busy: boolean;
  onAccept: () => void;
  onReject: () => void;
}) {
  const money = useMoney();
  const [left, setLeft] = useState(() => secondsLeft(offer.expires_at, offset));
  useEffect(() => {
    setLeft(secondsLeft(offer.expires_at, offset));
    const id = setInterval(() => setLeft(secondsLeft(offer.expires_at, offset)), 500);
    return () => clearInterval(id);
  }, [offer.expires_at, offset]);
  const total = Math.max(
    1,
    Math.round(
      (new Date(offer.expires_at).getTime() - new Date(offer.offered_at).getTime()) / 1000,
    ),
  );
  const expired = left === 0;
  const area = [offer.area, offer.city].filter(Boolean).join("، ");
  const titleId = `offer-${offer.offer_id}`;

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center bg-foreground/40 sm:items-start sm:pt-4">
      <div
        role="alertdialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="flex h-full w-full max-w-lg flex-col gap-4 bg-card p-5 shadow-2xl sm:h-auto sm:rounded-3xl"
      >
        <div className="flex items-center gap-2 text-primary">
          <BellRing className="h-6 w-6 animate-bounce" />
          <h2 id={titleId} className="text-xl font-extrabold">
            {ar ? `أوردر جديد #${offer.order_number}` : `New order #${offer.order_number}`}
          </h2>
        </div>

        <dl className="grid grid-cols-2 gap-3 text-sm">
          <div className="col-span-2 rounded-xl bg-muted p-3">
            <dt className="text-xs text-muted-foreground">{ar ? "المنطقة" : "Area"}</dt>
            <dd className="flex items-center gap-1 font-bold">
              <MapPin className="h-4 w-4" />
              {area || (ar ? "غير محددة" : "Not set")}
            </dd>
          </div>
          <div className="rounded-xl bg-muted p-3">
            <dt className="text-xs text-muted-foreground">{ar ? "الإجمالي" : "Total"}</dt>
            <dd className="font-bold">{money(offer.total)}</dd>
          </div>
          <div className="rounded-xl bg-muted p-3">
            <dt className="text-xs text-muted-foreground">{ar ? "القطع" : "Items"}</dt>
            <dd className="flex items-center gap-1 font-bold">
              <Package className="h-4 w-4" />
              {formatCount(offer.items, ar ? "ar" : "en")}
            </dd>
          </div>
          <div className="col-span-2 rounded-xl bg-brand-secondary/20 p-3">
            <dt className="text-xs text-muted-foreground">
              {ar ? "المطلوب تحصيله (كاش)" : "Cash to collect"}
            </dt>
            <dd className="text-lg font-extrabold">
              {offer.payment_method === "cod"
                ? money(offer.cod_amount)
                : ar
                  ? "مدفوع أونلاين"
                  : "Paid online"}
            </dd>
          </div>
        </dl>

        <div>
          <div
            className={cn(
              "flex items-center justify-between text-sm font-bold",
              left <= 15 && "text-destructive",
            )}
          >
            <span className="flex items-center gap-1">
              <Timer className="h-4 w-4" />
              {expired
                ? ar
                  ? "انتهت المهلة"
                  : "Time is up"
                : ar
                  ? "الوقت المتبقي للرد"
                  : "Time left to answer"}
            </span>
            <span role="timer" aria-live="off" dir="ltr">
              {formatCountdown(left)}
            </span>
          </div>
          <div className="mt-2 h-2 overflow-hidden rounded-full bg-muted">
            <div
              className={cn(
                "h-full rounded-full transition-[width] duration-500",
                left <= 15 ? "bg-destructive" : "bg-primary",
              )}
              style={{ width: `${Math.min(100, (left / total) * 100)}%` }}
            />
          </div>
        </div>

        {more > 0 && (
          <p className="text-xs text-muted-foreground">
            {ar
              ? `في الانتظار كمان: ${countLabel(more, "ar", "offer")}`
              : `Also waiting: ${countLabel(more, "en", "offer")}`}
          </p>
        )}

        <div className="mt-auto grid grid-cols-2 gap-3">
          <Button
            variant="outline"
            className="h-14 text-base"
            disabled={busy || expired}
            onClick={onReject}
          >
            <X className="me-1 h-5 w-5" />
            {ar ? "رفض" : "Reject"}
          </Button>
          <Button
            className="h-14 bg-success text-base text-background hover:bg-success/90"
            disabled={busy || expired}
            onClick={onAccept}
          >
            <Check className="me-1 h-5 w-5" />
            {ar ? "قبول" : "Accept"}
          </Button>
        </div>
      </div>
    </div>
  );
}

/** Message shown when an offer closed without the driver getting it. */
export function OfferClosedNotice({
  outcome,
  ar,
  onDismiss,
}: {
  outcome: OfferOutcome;
  ar: boolean;
  onDismiss: () => void;
}) {
  useEffect(() => {
    const id = setTimeout(onDismiss, 8000);
    return () => clearTimeout(id);
  }, [onDismiss]);
  const text =
    outcome === "expired"
      ? ar
        ? "انتهت مهلة العرض وتم تحويل الطلب لمندوب آخر."
        : "The offer expired and the order moved to another driver."
      : ar
        ? "الطلب ده اتسند لمندوب تاني أو اتلغى."
        : "This order was taken by another driver or cancelled.";
  return (
    <div
      role="status"
      className="flex items-start justify-between gap-2 rounded-2xl bg-brand-secondary/25 p-3 text-sm font-semibold"
    >
      <span>{text}</span>
      <button
        type="button"
        onClick={onDismiss}
        aria-label={ar ? "إغلاق" : "Dismiss"}
        className="shrink-0"
      >
        <X className="h-4 w-4" />
      </button>
    </div>
  );
}
