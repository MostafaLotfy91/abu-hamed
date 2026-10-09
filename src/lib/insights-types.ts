/** Names of the fixed, aggregated queries exposed by the admin_insight DB function. */
export const INSIGHT_QUERIES = [
  "sales_by_period",
  "top_products",
  "sales_by_category",
  "stock_by_variant",
  "orders_by_status",
  "return_rate",
  "avg_order_value",
  "sales_by_governorate",
] as const;
export type InsightName = (typeof INSIGHT_QUERIES)[number];
export type InsightRow = Record<string, string | number | null>;

/** NDJSON events streamed by /api/admin-insights (mode "ask"). */
export type InsightEvent =
  | { type: "text"; delta: string }
  | { type: "data"; name: InsightName; rows: InsightRow[] }
  | { type: "error"; status: number; reason?: string };

export type WeeklySummary = { text: string; created_at: string; cached: boolean };

/** Restock rule: cover the next `coverDays` at the recent selling pace, minus current stock. */
export function restockQty(sold: number, periodDays: number, stock: number, coverDays = 21) {
  const need = Math.ceil((sold / periodDays) * coverDays) - stock;
  return need > 0 ? need : 0;
}
