import { Link } from "@tanstack/react-router";
import { Wallet } from "lucide-react";
import { useAuth } from "@/lib/auth";
import { useDriverCash } from "@/lib/driver-cash";
import { useMoney } from "@/components/store/use-money";

/** Dashboard alert (admins): drivers holding more cash than the limit, or with a balance carried from an earlier day. */
export function CashAlerts({ ar }: { ar: boolean }) {
  const { isAdmin } = useAuth();
  const money = useMoney();
  const q = useDriverCash(null, isAdmin);
  const rows = (q.data ?? []).filter((r) => r.over_limit || r.unsettled_from_before);
  if (!isAdmin || !rows.length) return null;
  return (
    <section
      role="alert"
      aria-labelledby="cash-alerts-title"
      className="space-y-2 rounded-md border border-amber-500/40 bg-amber-500/5 p-4"
    >
      <h2 id="cash-alerts-title" className="flex items-center gap-2 font-bold">
        <Wallet className="h-5 w-5" />
        {ar ? "كاش مع المناديب محتاج تسوية" : "Driver cash needs settling"}
      </h2>
      <ul className="divide-y text-sm">
        {rows.map((r) => (
          <li
            key={r.driver_id}
            className="flex flex-wrap items-center justify-between gap-2 py-1.5"
          >
            <Link
              to="/admin/cash/$driverId"
              params={{ driverId: r.driver_id }}
              className="font-bold text-primary"
            >
              {r.full_name ?? r.phone}
            </Link>
            <span className="text-muted-foreground">
              {r.over_limit
                ? ar
                  ? `معاه ${money(r.cash_held)} — فوق الحد`
                  : `Holds ${money(r.cash_held)}, over the limit`
                : ar
                  ? `عليه ${money(r.owed_to_store)} من أيام سابقة`
                  : `Owes ${money(r.owed_to_store)} from earlier days`}
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}
