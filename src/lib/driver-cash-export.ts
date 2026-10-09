// Excel export of drivers' cash: the table on the admin page, a driver's ledger, and the daily report.
// Every text cell that a spreadsheet could run as a formula (= + - @) is escaped; amounts stay numbers.
import { neutralizeFormula } from "./product-import";
import { ledgerTypeLabel } from "./ledger-labels";
import { fromMinor, sumMinor, toMinor } from "./money";

export type CashRow = {
  driver_id: string;
  full_name: string | null;
  phone: string | null;
  orders_delivered: number;
  cod_total: number | string;
  commission_earned: number | string;
  settlements_paid: number | string;
  adjustments: number | string;
  cash_held: number | string;
  owed_to_store: number | string;
  commission_payable: number | string;
  last_settlement_at: string | null;
  over_limit: boolean;
  unsettled_from_before: boolean;
  pending_reviews: number;
};

export type LedgerRow = {
  created_at: string;
  driver_name?: string | null;
  type: string;
  kind?: string;
  amount: number | string;
  order_number: number | null;
  note: string | null;
};

type Cell = string | number | null;
const n = (v: number | string | null | undefined) => fromMinor(toMinor(v));
const safe = (row: Cell[]) => row.map((c) => neutralizeFormula(c ?? ""));
const date = (iso: string | null, ar: boolean) =>
  iso ? new Date(iso).toLocaleString(ar ? "ar-EG" : "en-GB") : "";

/** Drivers table (one row per driver) for a day. */
export function cashTableRows(rows: CashRow[], ar: boolean): Cell[][] {
  const head = ar
    ? [
        "المندوب",
        "الموبايل",
        "طلبات اليوم",
        "كاش اليوم",
        "عمولة اليوم",
        "تسويات اليوم",
        "تعديلات اليوم",
        "الكاش معه",
        "المطلوب منه",
        "عمولة تُصرف منفصلة",
        "آخر تسوية",
        "فوق الحد",
        "متأخر من أيام سابقة",
        "مراجعات مفتوحة",
      ]
    : [
        "Driver",
        "Phone",
        "Orders today",
        "Cash today",
        "Commission today",
        "Settled today",
        "Adjustments today",
        "Cash held",
        "Owed to store",
        "Commission payable",
        "Last settlement",
        "Over limit",
        "Unsettled from before",
        "Open reviews",
      ];
  return [
    head,
    ...rows.map((r) =>
      safe([
        r.full_name ?? "",
        r.phone ?? "",
        r.orders_delivered,
        n(r.cod_total),
        n(r.commission_earned),
        n(r.settlements_paid),
        n(r.adjustments),
        n(r.cash_held),
        n(r.owed_to_store),
        n(r.commission_payable),
        date(r.last_settlement_at, ar),
        r.over_limit ? (ar ? "نعم" : "yes") : "",
        r.unsettled_from_before ? (ar ? "نعم" : "yes") : "",
        r.pending_reviews,
      ]),
    ),
  ];
}

/** Ledger entries with a totals line. */
export function ledgerRows(entries: LedgerRow[], ar: boolean): Cell[][] {
  const head = ar
    ? ["التاريخ", "المندوب", "النوع", "رقم الطلب", "المبلغ", "ملاحظة"]
    : ["Date", "Driver", "Type", "Order", "Amount", "Note"];
  const total = fromMinor(sumMinor(entries.map((e) => e.amount)));
  return [
    head,
    ...entries.map((e) =>
      safe([
        date(e.created_at, ar),
        e.driver_name ?? "",
        ledgerTypeLabel(e.type, ar, e.kind),
        e.order_number ?? "",
        n(e.amount),
        e.note ?? "",
      ]),
    ),
    ["", "", ar ? "الإجمالي" : "Total", "", total, ""],
  ];
}

/** Daily report: totals for the day and the outstanding balances now. */
export function dailySummaryRows(day: string, rows: CashRow[], ar: boolean): Cell[][] {
  const sum = (k: keyof CashRow) => fromMinor(sumMinor(rows.map((r) => r[k] as number | string)));
  const orders = rows.reduce((t, r) => t + r.orders_delivered, 0);
  const line = (ar_: string, en: string, v: Cell) => [ar ? ar_ : en, v];
  return [
    line("التقرير اليومي", "Daily report", day),
    line("طلبات اتسلّمت", "Orders delivered", orders),
    line("إجمالي الكاش (COD)", "COD total", sum("cod_total")),
    line("العمولات", "Commissions", sum("commission_earned")),
    line("التسويات المستلمة", "Settlements received", sum("settlements_paid")),
    line("التعديلات", "Adjustments", sum("adjustments")),
    line("الأرصدة المستحقة الآن", "Outstanding balances now", sum("owed_to_store")),
    line(
      "مناديب فوق حد الكاش",
      "Drivers over the cash limit",
      rows.filter((r) => r.over_limit).length,
    ),
  ];
}

/** Writes sheets to an .xlsx file (the library loads only when exporting). */
export async function downloadWorkbook(name: string, sheets: Record<string, Cell[][]>) {
  const XLSX = await import("xlsx");
  const wb = XLSX.utils.book_new();
  for (const [title, rows] of Object.entries(sheets))
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(rows), title.slice(0, 31));
  XLSX.writeFile(wb, name, { compression: true });
}
