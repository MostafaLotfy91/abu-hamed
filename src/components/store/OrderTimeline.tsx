import { Check, X } from "lucide-react";
import { useI18n, type DictKey } from "@/lib/i18n";
import { cn } from "@/lib/utils";

export const ORDER_FLOW = [
  "pending",
  "confirmed",
  "preparing",
  "out_for_delivery",
  "delivered",
] as const;
export const ALL_STATUSES = [...ORDER_FLOW, "cancelled"] as const;
export const statusKey = (s: string) => `status_${s}` as DictKey;

/** Allowed next statuses; mirrors the orders_guard trigger (delivered and cancelled are final). */
export const NEXT_STATUSES: Record<string, readonly string[]> = {
  pending: ["confirmed", "cancelled"],
  confirmed: ["preparing", "out_for_delivery", "cancelled"],
  preparing: ["out_for_delivery", "cancelled"],
  out_for_delivery: ["delivered", "cancelled"],
};
export const canMoveTo = (from: string, to: string) => (NEXT_STATUSES[from] ?? []).includes(to);

export function StatusBadge({ status }: { status: string }) {
  const { t } = useI18n();
  const tone =
    status === "delivered"
      ? "border-success/40 text-success"
      : status === "cancelled"
        ? "border-destructive/40 text-destructive"
        : status === "pending"
          ? "border-gold/70 text-foreground"
          : "border-foreground/30 text-foreground";
  return (
    <span className={cn("border px-2 py-0.5 text-[11px] font-medium tracking-wide", tone)}>
      {t(statusKey(status))}
    </span>
  );
}

export function OrderTimeline({
  status,
  history,
}: {
  status: string;
  history: { status: string; created_at: string }[];
}) {
  const { t, lang } = useI18n();
  const at = (s: string) => history.find((h) => h.status === s)?.created_at;
  const fmt = (d?: string) =>
    d
      ? new Date(d).toLocaleString(lang === "ar" ? "ar-EG" : "en-US", {
          hour: "2-digit",
          minute: "2-digit",
          day: "numeric",
          month: "short",
        })
      : "";
  if (status === "cancelled")
    return (
      <div className="flex items-center gap-3 border border-destructive/30 p-4 text-destructive">
        <X className="h-5 w-5" />
        <span className="font-medium">{t("status_cancelled")}</span>
        <span className="text-xs">{fmt(at("cancelled"))}</span>
      </div>
    );
  const idx = ORDER_FLOW.indexOf(status as (typeof ORDER_FLOW)[number]);
  return (
    <ol className="space-y-0">
      {ORDER_FLOW.map((s, i) => {
        const done = i <= idx;
        return (
          <li key={s} className="flex gap-3">
            <div className="flex flex-col items-center">
              <span
                className={cn(
                  "mt-1 flex h-5 w-5 items-center justify-center rounded-full border",
                  done
                    ? "border-foreground bg-foreground text-background"
                    : "border-border bg-card",
                  i === idx && "ring-4 ring-gold/25",
                )}
              >
                {done && <Check className="h-3 w-3" strokeWidth={2} />}
              </span>
              {i < ORDER_FLOW.length - 1 && (
                <span className={cn("h-9 w-px", i < idx ? "bg-foreground" : "bg-border")} />
              )}
            </div>
            <div className="pt-0.5">
              <p className={cn("text-sm font-medium", !done && "text-muted-foreground")}>
                {t(statusKey(s))}
              </p>
              <p className="text-xs text-muted-foreground">{fmt(at(s))}</p>
            </div>
          </li>
        );
      })}
    </ol>
  );
}
