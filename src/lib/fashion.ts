/** Fashion domain constants shared by storefront and admin. */
export type SizeType = "clothes" | "shoes" | "kids" | "none";

export const SIZE_SETS: Record<Exclude<SizeType, "none">, string[]> = {
  clothes: ["S", "M", "L", "XL", "XXL", "XXXL"],
  shoes: ["36", "37", "38", "39", "40", "41", "42", "43", "44", "45", "46"],
  kids: ["0-3m", "3-6m", "6-12m", "1-2y", "2-3y", "3-4y", "4-5y", "5-6y", "6-7y", "7-8y", "8-10y", "10-12y", "12-14y"],
};

export const SIZE_TYPE_OPTIONS = [
  { value: "clothes", label: "ملابس (S–XXXL) / Clothes" },
  { value: "shoes", label: "أحذية (36–46) / Shoes" },
  { value: "kids", label: "أطفال (بالسن) / Kids by age" },
  { value: "none", label: "بدون مقاس / No size" },
];

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

/** Sort sizes in their natural order (by set index, then numeric). */
export function sortSizes(sizes: string[]) {
  const all = [...SIZE_SETS.clothes, ...SIZE_SETS.kids, ...SIZE_SETS.shoes];
  return [...sizes].sort((a, b) => {
    const ia = all.indexOf(a), ib = all.indexOf(b);
    if (ia !== -1 && ib !== -1) return ia - ib;
    return a.localeCompare(b, undefined, { numeric: true });
  });
}

export type VariantLike = { id: string; size: string | null; color_en: string | null; color_ar: string | null; color_hex: string | null; stock: number; is_active: boolean };

/**
 * The colour/size a product page shows as selected: the shopper's choice, else the only option,
 * else (colour only) the first colour that has stock. Shared by the page and the WhatsApp message.
 */
export function defaultSelection<V extends Pick<VariantLike, "size" | "color_en" | "stock" | "is_active">>(
  allVariants: V[],
  chosen: { size: string | null; color: string | null },
) {
  const variants = allVariants.filter((v) => v.is_active);
  const sizes = sortSizes(Array.from(new Set(variants.map((v) => v.size).filter(Boolean) as string[])));
  const colors = Array.from(new Map(variants.filter((v) => v.color_en).map((v) => [v.color_en!, v])).values());
  const color = chosen.color ?? (colors.length === 1 ? colors[0].color_en
    : colors.find((c) => variants.some((v) => v.color_en === c.color_en && v.stock > 0))?.color_en ?? null);
  const size = chosen.size ?? (sizes.length === 1 ? sizes[0] : null);
  return { sizes, colors, color, size };
}

/** Picks a variant from size+color, falling back sensibly when one axis is absent. */
export function findVariant<V extends VariantLike>(variants: V[], size: string | null, color: string | null) {
  return variants.find((v) => (v.size ?? null) === size && (v.color_en ?? null) === color) ?? null;
}
