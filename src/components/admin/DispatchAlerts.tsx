import { Link } from "@tanstack/react-router";
import { AlertTriangle } from "lucide-react";
import { useDrivers } from "@/lib/drivers";
import { dispatchLabel, useDispatchAlerts } from "@/lib/dispatch";

/** Dashboard alert: orders with no available driver, or unassigned longer than the configured minutes. */
export function DispatchAlerts({ ar }: { ar: boolean }) {
  const q = useDispatchAlerts();
  const drivers = useDrivers();
  const rows = q.data ?? [];
  if (!rows.length) return null;
  const available = (drivers.data ?? []).filter(
    (d) => d.is_active && d.status === "available",
  ).length;
  return (
    <section
      role="alert"
      aria-labelledby="dispatch-alerts-title"
      className="space-y-2 rounded-md border border-destructive/40 bg-destructive/5 p-4"
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2
          id="dispatch-alerts-title"
          className="flex items-center gap-2 font-bold text-destructive"
        >
          <AlertTriangle className="h-5 w-5" />
          {ar
            ? `${rows.length} طلب بانتظار مندوب`
            : `${rows.length} order${rows.length > 1 ? "s" : ""} waiting for a driver`}
        </h2>
        <span className="text-xs text-muted-foreground">
          {ar ? `المناديب المتاحين الآن: ${available}` : `Drivers available now: ${available}`}
        </span>
      </div>
      {/* Oldest first; every waiting order is reachable (scrolls after a few rows). */}
      <ul className="max-h-64 divide-y overflow-y-auto text-sm">
        {rows.map((r) => (
          <li key={r.order_id} className="flex flex-wrap items-center justify-between gap-2 py-1.5">
            <Link
              to="/admin/orders/$id"
              params={{ id: r.order_id }}
              className="font-bold text-primary"
            >
              #{r.order_number}
            </Link>
            <span className="text-muted-foreground">
              {r.reason === "no_driver"
                ? dispatchLabel("no_driver_available", ar)
                : ar
                  ? `بدون مندوب منذ ${r.waited_minutes} دقيقة`
                  : `No driver for ${r.waited_minutes} min`}
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}
