// Money as integer minor units (e.g. piasters): sums and commissions are exact, never floating-point.
// Amounts arrive from the database as numeric(12,2) strings ("130.00"); convert once with toMinor, add and
// compare integers, and convert back with fromMinor only to display or send. Rounding is half away from zero,
// the same as Postgres round(), so the app and the database always agree.

/** Minor units per major unit: the database stores 2 decimals. */
export const MINOR = 100;

/** Integer division rounded half away from zero (exact for integers). */
function divRound(n: number, d: number) {
  const q = Math.trunc(n / d);
  const r = n - q * d;
  return Math.abs(r) * 2 >= Math.abs(d) ? q + Math.sign(n) * Math.sign(d) : q;
}

/** "12.345" | 12.345 | null -> 1235 minor units. Throws on anything that is not a number. */
export function toMinor(v: number | string | null | undefined): number {
  if (v == null || v === "") return 0;
  // Fixed notation first: avoids exponents and reads 1.005 as written, not as 1.00499999...
  const s = typeof v === "number" ? (Number.isFinite(v) ? v.toFixed(6) : "x") : v.trim();
  const m = /^([+-])?(\d*)(?:\.(\d*))?$/.exec(s);
  if (!m || (!m[2] && !m[3])) throw new Error(`not an amount: ${v}`);
  const sign = m[1] === "-" ? -1 : 1;
  const frac = (m[3] ?? "").padEnd(3, "0");
  const abs = Number(m[2] || "0") * MINOR + Number(frac.slice(0, 2));
  const up = Number(frac[2]) >= 5 ? 1 : 0;
  return sign * (abs + up) || 0;
}

/** Minor units -> number for display or for sending to the database (2 decimals, exact in JSON). */
export function fromMinor(m: number) {
  return Number((m / MINOR).toFixed(2));
}

export const sumMinor = (values: (number | string | null | undefined)[]) =>
  values.reduce<number>((n, v) => n + toMinor(v), 0);

export type CommissionType = "fixed" | "percent_of_delivery_fee";

/** The driver's commission for one delivery, in minor units (same rule as public.driver_commission). */
export function commissionMinor(
  type: CommissionType,
  value: number | string,
  deliveryFee: number | string,
) {
  if (type === "percent_of_delivery_fee")
    // fee (minor) * percent (hundredths) / (100 * 100)
    return divRound(toMinor(deliveryFee) * toMinor(value), MINOR * 100);
  return toMinor(value);
}

/**
 * Parses what a driver or admin typed: Arabic or Persian digits, Arabic decimal separator, spaces and a
 * thousands comma are accepted. Returns minor units, or null for empty / invalid / more than 2 decimals.
 */
export function parseAmountInput(raw: string, { allowNegative = false } = {}): number | null {
  const s = raw
    .trim()
    .replace(/[٠-٩]/g, (d) => String(d.charCodeAt(0) - 0x660))
    .replace(/[۰-۹]/g, (d) => String(d.charCodeAt(0) - 0x6f0))
    .replace(/[٫]/g, ".")
    .replace(/[\s,،]/g, "");
  if (!/^[+-]?\d+(\.\d{1,2})?$/.test(s)) return null;
  if (!allowNegative && s.startsWith("-")) return null;
  return toMinor(s);
}

/** Settlement difference (received - expected), minor units: negative = short, positive = over. */
export const differenceMinor = (received: number, expected: number) => received - expected;
