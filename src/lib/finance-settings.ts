// Validation of the driver payment settings (the same rules as the database CHECK constraints), so the admin
// sees a clear message instead of a constraint error.
import { parseAmountInput } from "./money";

export type FinanceSettings = {
  driver_commission_type: string;
  driver_commission_value: number | string | null;
  driver_cash_limit: number | string | null;
  timezone: string;
};

/** null when valid, otherwise a bilingual "ar / en" message. */
export function financeSettingsError(s: FinanceSettings): string | null {
  const value = parseAmountInput(String(s.driver_commission_value ?? ""));
  if (value === null) return "قيمة العمولة غير صحيحة / Invalid commission value";
  if (s.driver_commission_type === "percent_of_delivery_fee" && value > 100 * 100)
    return "نسبة العمولة من ٠ إلى ١٠٠ / Commission percent must be 0–100";
  if (parseAmountInput(String(s.driver_cash_limit ?? "")) === null)
    return "حد الكاش غير صحيح (٠ = بدون حد) / Invalid cash limit (0 = no limit)";
  if (!/^[A-Za-z][A-Za-z0-9_+/-]{1,63}$/.test(s.timezone ?? ""))
    return "المنطقة الزمنية غير صحيحة (مثال Africa/Cairo) / Invalid timezone (e.g. Africa/Cairo)";
  return null;
}
