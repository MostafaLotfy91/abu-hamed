import { Minus, Plus, Trash2 } from "lucide-react";
import { useI18n } from "@/lib/i18n";
import { formatCount } from "@/lib/format";
import { cn } from "@/lib/utils";

/** Whole-number quantity stepper. Going below 1 shows a trash icon (remove). */
export function QtyStepper({
  qty,
  max,
  onChange,
  size = "md",
  allowRemove = true,
}: {
  qty: number;
  max?: number;
  onChange: (q: number) => void;
  size?: "sm" | "md";
  allowRemove?: boolean;
}) {
  const { lang } = useI18n();
  const atMin = qty <= 1;
  const atMax = max != null && qty >= max;
  const h = size === "sm" ? "h-9" : "h-11";
  return (
    <div
      className={cn(
        "flex items-center justify-between gap-1 rounded-xl bg-primary text-primary-foreground",
        h,
      )}
    >
      <button
        type="button"
        aria-label="decrease"
        disabled={atMin && !allowRemove}
        onClick={() => onChange(qty - 1)}
        className={cn("flex items-center justify-center rounded-xl px-3 disabled:opacity-40", h)}
      >
        {atMin && allowRemove ? <Trash2 className="h-4 w-4" /> : <Minus className="h-4 w-4" />}
      </button>
      <span className="text-sm font-bold tabular-nums">{formatCount(qty, lang)}</span>
      <button
        type="button"
        aria-label="increase"
        disabled={atMax}
        onClick={() => onChange(qty + 1)}
        className={cn("flex items-center justify-center rounded-xl px-3 disabled:opacity-40", h)}
      >
        <Plus className="h-4 w-4" />
      </button>
    </div>
  );
}
