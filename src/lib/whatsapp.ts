import { useEffect, useSyncExternalStore } from "react";
import { toAsciiDigits } from "./format";

/** Normalize Egyptian numbers (01xxxxxxxxx, +201..., 00201..., 201...) to 20xxxxxxxxxx. Returns null if invalid. */
export function normalizeEgyptPhone(input: string): string | null {
  let d = toAsciiDigits(input ?? "").replace(/[^\d]/g, "");
  if (d.startsWith("0020")) d = d.slice(2);
  if (d.startsWith("01") && d.length === 11) d = "2" + d;
  if (/^201[0125]\d{8}$/.test(d)) return d;
  return null;
}

export const WA_VARIABLES = [
  "{store_name}",
  "{product_name}",
  "{product_url}",
  "{size}",
  "{color}",
  "{order_number}",
] as const;

export function fillTemplate(
  tpl: string,
  vars: Record<string, string | number | null | undefined>,
) {
  return tpl.replace(/\{(\w+)\}/g, (m, k) =>
    vars[k] == null || vars[k] === "" ? "-" : String(vars[k]),
  );
}

export function waLink(number: string, message: string) {
  return `https://wa.me/${number}?text=${encodeURIComponent(message)}`;
}

/** Only allow plain https URLs (rejects javascript:, data:, http:). */
export function isSafeHttpsUrl(url: string) {
  try {
    const u = new URL(url.trim());
    return u.protocol === "https:" && !/[\s<>"]/.test(url.trim());
  } catch {
    return false;
  }
}

/** Same-site paths ("/products", not "//host") or https URLs; mirrors the banners.link DB check. */
export function isSafeLink(url: string) {
  const u = url.trim();
  return /^\/(?![/\\])[^\s<>"]*$/.test(u) || isSafeHttpsUrl(u);
}

/* Page context: product/order pages publish details so the floating button picks the right message. */
export type WaContext =
  | { kind: "product"; name: string; size?: string | null; color?: string | null; offset?: boolean }
  | { kind: "order"; orderNumber: number | string }
  | null;

let current: WaContext = null;
const listeners = new Set<() => void>();
const sub = (l: () => void) => {
  listeners.add(l);
  return () => {
    listeners.delete(l);
  };
};
const set = (c: WaContext) => {
  current = c;
  listeners.forEach((l) => l());
};

export function useWaContext() {
  return useSyncExternalStore(
    sub,
    () => current,
    () => null,
  );
}

export function usePublishWaContext(ctx: WaContext) {
  const key = JSON.stringify(ctx);
  useEffect(() => {
    set(ctx);
    return () => set(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
}
