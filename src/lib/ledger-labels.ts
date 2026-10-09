// Names of driver ledger entry types (pure: used by the pages and the Excel export).

export const LEDGER_TYPES = [
  "cod_collected",
  "commission_earned",
  "settlement_paid",
  "adjustment",
  "reversal",
] as const;
export type LedgerType = (typeof LEDGER_TYPES)[number];

const TYPE_LABELS: Record<LedgerType, { ar: string; en: string }> = {
  cod_collected: { ar: "تحصيل كاش", en: "Cash collected" },
  commission_earned: { ar: "عمولة", en: "Commission" },
  settlement_paid: { ar: "تسوية (تسليم للمحل)", en: "Settlement" },
  adjustment: { ar: "تعديل", en: "Adjustment" },
  reversal: { ar: "إلغاء قيد", en: "Reversal" },
};

/** "Reversal of: commission" style label; `kind` is the type of the entry a reversal undoes. */
export function ledgerTypeLabel(type: string, ar: boolean, kind?: string): string {
  const l = TYPE_LABELS[type as LedgerType];
  const base = l ? (ar ? l.ar : l.en) : type;
  if (type === "reversal" && kind && kind !== "reversal")
    return `${base}: ${ledgerTypeLabel(kind, ar)}`;
  return base;
}
