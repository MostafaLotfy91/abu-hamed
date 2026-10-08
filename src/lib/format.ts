import type { Lang } from "./i18n";

/** Arabic-Indic (٠-٩) and Persian (۰-۹) digits -> ASCII 0-9, so Arabic keyboard input parses like Latin digits. */
export function toAsciiDigits(s: string) {
  return s
    .replace(/[٠-٩]/g, (d) => String(d.charCodeAt(0) - 0x0660))
    .replace(/[۰-۹]/g, (d) => String(d.charCodeAt(0) - 0x06f0));
}

export function formatMoney(
  value: number | string | null | undefined,
  lang: Lang,
  symbol: { ar?: string | null; en?: string | null },
) {
  const n = Number(value ?? 0);
  const num = new Intl.NumberFormat(lang === "ar" ? "ar-EG" : "en-US", {
    minimumFractionDigits: n % 1 === 0 ? 0 : 2,
    maximumFractionDigits: 2,
  }).format(n);
  const sym = (lang === "ar" ? symbol.ar : symbol.en) ?? "";
  return lang === "ar" ? `${num} ${sym}` : `${sym} ${num}`;
}

/** Item counts (always whole pieces), with locale digits. */
export function formatCount(q: number, lang: Lang) {
  return new Intl.NumberFormat(lang === "ar" ? "ar-EG" : "en-US", {
    maximumFractionDigits: 0,
  }).format(q);
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
  const flashActive =
    p.flash_price != null && p.flash_ends_at != null && new Date(p.flash_ends_at).getTime() > now;
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

type PluralForms = Partial<Record<Intl.LDMLPluralRule, string>> & { other: string };

/** Nouns counted in the UI. Arabic uses all six plural categories; "{n}" is the number in locale digits. */
const NOUNS = {
  product: {
    ar: {
      zero: "لا منتجات",
      one: "منتج واحد",
      two: "منتجان",
      few: "{n} منتجات",
      many: "{n} منتجًا",
      other: "{n} منتج",
    },
    en: { one: "{n} item", other: "{n} items" },
  },
  piece: {
    ar: {
      zero: "لا قطع",
      one: "قطعة واحدة",
      two: "قطعتان",
      few: "{n} قطع",
      many: "{n} قطعة",
      other: "{n} قطعة",
    },
    en: { one: "{n} piece", other: "{n} pieces" },
  },
  order: {
    ar: {
      zero: "لا طلبات",
      one: "طلب واحد",
      two: "طلبان",
      few: "{n} طلبات",
      many: "{n} طلبًا",
      other: "{n} طلب",
    },
    en: { one: "{n} order", other: "{n} orders" },
  },
  day: {
    ar: {
      zero: "{n} يوم",
      one: "يوم واحد",
      two: "يومان",
      few: "{n} أيام",
      many: "{n} يومًا",
      other: "{n} يوم",
    },
    en: { one: "{n} day", other: "{n} days" },
  },
  minute: {
    ar: {
      zero: "أقل من دقيقة",
      one: "دقيقة واحدة",
      two: "دقيقتان",
      few: "{n} دقائق",
      many: "{n} دقيقة",
      other: "{n} دقيقة",
    },
    en: { one: "{n} minute", other: "{n} minutes" },
  },
  category: {
    ar: {
      zero: "لا أقسام",
      one: "قسم واحد",
      two: "قسمان",
      few: "{n} أقسام",
      many: "{n} قسمًا",
      other: "{n} قسم",
    },
    en: { one: "{n} category", other: "{n} categories" },
  },
  offer: {
    ar: {
      zero: "لا عروض",
      one: "عرض واحد",
      two: "عرضان",
      few: "{n} عروض",
      many: "{n} عرضًا",
      other: "{n} عرض",
    },
    en: { one: "{n} offer", other: "{n} offers" },
  },
} satisfies Record<string, Record<Lang, PluralForms>>;

export type CountNoun = keyof typeof NOUNS;

/** "منتج واحد / منتجان / ٣ منتجات / ١١ منتجًا" — grammatical count phrase with locale digits. */
export function countLabel(n: number, lang: Lang, noun: CountNoun) {
  const forms: PluralForms = NOUNS[noun][lang];
  const rule = new Intl.PluralRules(lang === "ar" ? "ar-EG" : "en-US").select(n);
  return (forms[rule] ?? forms.other).replace("{n}", formatCount(n, lang));
}
