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

/** Common colors for the admin bulk editor and storefront filter. */
export const COLORS = [
  { en: "Black", ar: "أسود", hex: "#111111" },
  { en: "White", ar: "أبيض", hex: "#f5f5f5" },
  { en: "Navy", ar: "كحلي", hex: "#1f2a44" },
  { en: "Beige", ar: "بيج", hex: "#d8c3a5" },
  { en: "Gray", ar: "رمادي", hex: "#8a8a8a" },
  { en: "Red", ar: "أحمر", hex: "#b3261e" },
  { en: "Olive", ar: "زيتي", hex: "#6b7046" },
  { en: "Brown", ar: "بني", hex: "#6d4c41" },
  { en: "Pink", ar: "وردي", hex: "#e8a0b4" },
  { en: "Blue", ar: "أزرق", hex: "#2f6fb5" },
  { en: "Gold", ar: "ذهبي", hex: "#c8a24a" },
];

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

/** Picks a variant from size+color, falling back sensibly when one axis is absent. */
export function findVariant<V extends VariantLike>(variants: V[], size: string | null, color: string | null) {
  return variants.find((v) => (v.size ?? null) === size && (v.color_en ?? null) === color) ?? null;
}
