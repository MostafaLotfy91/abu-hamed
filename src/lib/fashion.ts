/**
 * Fashion helpers shared by storefront and admin. Size presets per category live in the database
 * (product_profiles); only enumerations the database validates (gender, season, concentration) are listed here.
 */
/** Which size chart a profile shows; "none" = no size guide. */
export type SizeType = "clothes" | "shoes" | "kids" | "none";

export const GENDERS = [
  { value: "men", ar: "رجالي", en: "Men" },
  { value: "women", ar: "حريمي", en: "Women" },
  { value: "kids", ar: "أطفال", en: "Kids" },
  { value: "unisex", ar: "للجنسين", en: "Unisex" },
] as const;

export const SEASONS = [
  { value: "summer", ar: "صيفي", en: "Summer" },
  { value: "winter", ar: "شتوي", en: "Winter" },
  { value: "all", ar: "كل المواسم", en: "All seasons" },
] as const;

export const CONCENTRATIONS = ["EDP", "EDT", "Parfum"] as const;

export const LOW_STOCK = 3;

export function sizeLabel(size: string, lang: "ar" | "en") {
  const m = /^(\d+)-(\d+)(m|y)$/.exec(size);
  if (!m) return size;
  const unit = m[3] === "m" ? (lang === "ar" ? "شهور" : "mo") : lang === "ar" ? "سنة" : "y";
  return `${m[1]}-${m[2]} ${unit}`;
}

const LETTER_SIZES = ["XXS", "XS", "S", "M", "L", "XL", "XXL", "XXXL", "4XL", "5XL"];

/** Sort key: letter sizes (XXS..5XL), then ages ("0-3m", "2-3y") by months, then numbers, then anything else. */
function sizeRank(s: string): [number, number] {
  const letter = LETTER_SIZES.indexOf(s.toUpperCase());
  if (letter !== -1) return [0, letter];
  const age = /^(\d+)-(\d+)(m|y)$/i.exec(s);
  if (age) return [1, Number(age[1]) * (age[3].toLowerCase() === "y" ? 12 : 1)];
  if (/^\d+(\.\d+)?$/.test(s)) return [2, Number(s)];
  return [3, 0];
}

/** Sort sizes in their natural order (letters, ages, numbers, then alphabetical). */
export function sortSizes(sizes: string[]) {
  return [...sizes].sort((a, b) => {
    const [ga, va] = sizeRank(a),
      [gb, vb] = sizeRank(b);
    return ga - gb || va - vb || a.localeCompare(b, undefined, { numeric: true });
  });
}

export type VariantLike = {
  id: string;
  size: string | null;
  color_en: string | null;
  color_ar: string | null;
  color_hex: string | null;
  stock: number;
  is_active: boolean;
};

/**
 * The colour/size a product page shows as selected: the shopper's choice, else the only option,
 * else (colour only) the first colour that has stock. Shared by the page and the WhatsApp message.
 */
export function defaultSelection<
  V extends Pick<VariantLike, "size" | "color_en" | "stock" | "is_active">,
>(allVariants: V[], chosen: { size: string | null; color: string | null }) {
  const variants = allVariants.filter((v) => v.is_active);
  const sizes = sortSizes(
    Array.from(new Set(variants.map((v) => v.size).filter(Boolean) as string[])),
  );
  const colors = Array.from(
    new Map(variants.filter((v) => v.color_en).map((v) => [v.color_en!, v])).values(),
  );
  const color =
    chosen.color ??
    (colors.length === 1
      ? colors[0].color_en
      : (colors.find((c) => variants.some((v) => v.color_en === c.color_en && v.stock > 0))
          ?.color_en ?? null));
  const size = chosen.size ?? (sizes.length === 1 ? sizes[0] : null);
  return { sizes, colors, color, size };
}

/** Picks a variant from size+color, falling back sensibly when one axis is absent. */
export function findVariant<V extends VariantLike>(
  variants: V[],
  size: string | null,
  color: string | null,
) {
  return variants.find((v) => (v.size ?? null) === size && (v.color_en ?? null) === color) ?? null;
}
