import { Minus, Plus, Trash2 } from "lucide-react";
import { useI18n } from "@/lib/i18n";
import { formatQty, unitLabel } from "@/lib/format";
import { cn } from "@/lib/utils";

export function QtyStepper({
  qty, step, min, unit, max, onChange, size = "md",
}: { qty: number; step: number; min: number; unit: string; max?: number; onChange: (q: number) => void; size?: "sm" | "md" }) {
  const { lang } = useI18n();
  const atMin = qty - step < min - 1e-9;
  const atMax = max != null && qty + step > max + 1e-9;
  const h = size === "sm" ? "h-9" : "h-11";
  return (
    <div className={cn("flex items-center justify-between gap-1 rounded-xl bg-primary text-primary-foreground", h)}>
      <button type="button" aria-label="decrease" onClick={() => onChange(qty - step)} className={cn("flex items-center justify-center rounded-xl px-3", h)}>
        {atMin ? <Trash2 className="h-4 w-4" /> : <Minus className="h-4 w-4" />}
      </button>
      <span className="text-sm font-bold tabular-nums">
        {formatQty(qty, lang)} <span className="text-xs font-medium opacity-80">{unitLabel(unit, lang)}</span>
      </span>
      <button type="button" aria-label="increase" disabled={atMax} onClick={() => onChange(qty + step)} className={cn("flex items-center justify-center rounded-xl px-3 disabled:opacity-40", h)}>
        <Plus className="h-4 w-4" />
      </button>
    </div>
  );
}
