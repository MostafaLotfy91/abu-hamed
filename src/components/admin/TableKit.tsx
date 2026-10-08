import { ChevronLeft, ChevronRight } from "lucide-react";
import type { ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export const PAGE = 25;

/** Slices rows for the current page (page is clamped). */
export function paginate<T>(rows: T[], page: number) {
  const pages = Math.max(1, Math.ceil(rows.length / PAGE));
  const p = Math.min(Math.max(0, page), pages - 1);
  return { pageRows: rows.slice(p * PAGE, p * PAGE + PAGE), pages, page: p };
}

export function Pager({
  page,
  pages,
  total,
  onPage,
}: {
  page: number;
  pages: number;
  total: number;
  onPage: (p: number) => void;
}) {
  if (total <= PAGE) return <p className="text-xs text-muted-foreground">{total} صف / rows</p>;
  return (
    <div className="flex items-center justify-between gap-2 text-sm">
      <span className="text-xs text-muted-foreground">
        {page * PAGE + 1}–{Math.min(total, (page + 1) * PAGE)} / {total}
      </span>
      <div className="flex items-center gap-1">
        <Button
          size="icon"
          variant="outline"
          className="h-8 w-8"
          disabled={page === 0}
          onClick={() => onPage(page - 1)}
          aria-label="Previous"
        >
          <ChevronRight className="h-4 w-4 ltr:rotate-180" />
        </Button>
        <span className="px-2 text-xs">
          {page + 1} / {pages}
        </span>
        <Button
          size="icon"
          variant="outline"
          className="h-8 w-8"
          disabled={page >= pages - 1}
          onClick={() => onPage(page + 1)}
          aria-label="Next"
        >
          <ChevronLeft className="h-4 w-4 ltr:rotate-180" />
        </Button>
      </div>
    </div>
  );
}

/** Sticky bar shown while rows are selected. */
export function BulkBar({
  count,
  onClear,
  children,
}: {
  count: number;
  onClear: () => void;
  children: ReactNode;
}) {
  if (!count) return null;
  return (
    <div className="flex flex-wrap items-center gap-2 rounded-md border bg-muted/60 px-3 py-2 text-sm">
      <span className="font-semibold">{count} محدد / selected</span>
      {children}
      <button onClick={onClear} className="ms-auto text-xs underline underline-offset-4">
        إلغاء التحديد
      </button>
    </div>
  );
}

export function Check({
  checked,
  onChange,
  label,
  className,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  label: string;
  className?: string;
}) {
  return (
    <input
      type="checkbox"
      aria-label={label}
      checked={checked}
      onChange={(e) => onChange(e.target.checked)}
      className={cn("h-4 w-4 accent-foreground", className)}
    />
  );
}

export function Segmented<T extends string>({
  value,
  options,
  onChange,
}: {
  value: T;
  options: { value: T; label: string }[];
  onChange: (v: T) => void;
}) {
  return (
    <div className="inline-flex rounded-md border p-0.5">
      {options.map((o) => (
        <button
          key={o.value}
          onClick={() => onChange(o.value)}
          className={cn(
            "rounded px-3 py-1 text-xs font-medium",
            value === o.value
              ? "bg-foreground text-background"
              : "text-muted-foreground hover:text-foreground",
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}
