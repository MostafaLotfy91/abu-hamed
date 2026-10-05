import { Check, X } from "lucide-react";
import { useI18n, type DictKey } from "@/lib/i18n";
import { cn } from "@/lib/utils";

export const ORDER_FLOW = ["pending", "confirmed", "preparing", "out_for_delivery", "delivered"] as const;
export const ALL_STATUSES = [...ORDER_FLOW, "cancelled"] as const;
export const statusKey = (s: string) => `status_${s}` as DictKey;

export function StatusBadge({ status }: { status: string }) {
  const { t } = useI18n();
  const tone = status === "delivered" ? "bg-success/15 text-success" : status === "cancelled" ? "bg-destructive/10 text-destructive" : status === "pending" ? "bg-brand-secondary/25 text-brand-secondary-foreground" : "bg-primary-soft text-primary";
  return <span className={cn("rounded-full px-2.5 py-0.5 text-xs font-bold", tone)}>{t(statusKey(status))}</span>;
}

export function OrderTimeline({ status, history }: { status: string; history: { status: string; created_at: string }[] }) {
  const { t, lang } = useI18n();
  const at = (s: string) => history.find((h) => h.status === s)?.created_at;
  const fmt = (d?: string) => (d ? new Date(d).toLocaleString(lang === "ar" ? "ar-EG" : "en-US", { hour: "2-digit", minute: "2-digit", day: "numeric", month: "short" }) : "");
  if (status === "cancelled")
    return <div className="flex items-center gap-3 rounded-2xl bg-destructive/10 p-4 text-destructive"><X className="h-5 w-5" /><span className="font-bold">{t("status_cancelled")}</span><span className="text-xs">{fmt(at("cancelled"))}</span></div>;
  const idx = ORDER_FLOW.indexOf(status as (typeof ORDER_FLOW)[number]);
  return (
    <ol className="space-y-0">
      {ORDER_FLOW.map((s, i) => {
        const done = i <= idx;
        return (
          <li key={s} className="flex gap-3">
            <div className="flex flex-col items-center">
              <span className={cn("flex h-7 w-7 items-center justify-center rounded-full border-2", done ? "border-primary bg-primary text-primary-foreground" : "border-border bg-card", i === idx && "ring-4 ring-primary/20")}>
                {done && <Check className="h-4 w-4" />}
              </span>
              {i < ORDER_FLOW.length - 1 && <span className={cn("h-8 w-0.5", i < idx ? "bg-primary" : "bg-border")} />}
            </div>
            <div className="pt-0.5">
              <p className={cn("text-sm font-bold", !done && "text-muted-foreground")}>{t(statusKey(s))}</p>
              <p className="text-xs text-muted-foreground">{fmt(at(s))}</p>
            </div>
          </li>
        );
      })}
    </ol>
  );
}
