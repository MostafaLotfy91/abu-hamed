import type { Lang } from "./i18n";

export function formatMoney(value: number | string | null | undefined, lang: Lang, symbol: { ar?: string | null; en?: string | null }) {
  const n = Number(value ?? 0);
  const num = new Intl.NumberFormat(lang === "ar" ? "ar-EG" : "en-US", {
    minimumFractionDigits: n % 1 === 0 ? 0 : 2,
    maximumFractionDigits: 2,
  }).format(n);
  const sym = (lang === "ar" ? symbol.ar : symbol.en) ?? "";
  return lang === "ar" ? `${num} ${sym}` : `${sym} ${num}`;
}

export function formatQty(q: number, lang: Lang) {
  return new Intl.NumberFormat(lang === "ar" ? "ar-EG" : "en-US", { maximumFractionDigits: 3 }).format(q);
}

type PriceInput = {
  price: number | string;
  old_price?: number | string | null;
  flash_price?: number | string | null;
  flash_ends_at?: string | null;
};

/** Effective selling price + reference "was" price. Flash price wins while active. */
export function effectivePrice(p: PriceInput, now = Date.now()) {
  const price = Number(p.price);
  const flashActive = p.flash_price != null && p.flash_ends_at != null && new Date(p.flash_ends_at).getTime() > now;
  const current = flashActive ? Number(p.flash_price) : price;
  const ref = flashActive ? Math.max(price, Number(p.old_price ?? 0)) : Number(p.old_price ?? 0);
  const was = ref > current ? ref : null;
  const pct = was ? Math.round(((was - current) / was) * 100) : 0;
  return { current, was, pct, flashActive };
}

export function deliveryFeeFor(subtotal: number, fee: number, freeThreshold: number | null) {
  if (freeThreshold != null && subtotal >= freeThreshold) return 0;
  return fee;
}
