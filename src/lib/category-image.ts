// Which category image (if any) can be shown, and which icon represents a category type in the fallback.
import {
  Baby,
  Footprints,
  Gem,
  ShoppingBag,
  Shirt,
  Sparkles,
  SprayCan,
  type LucideIcon,
} from "lucide-react";

/**
 * A URL the browser can load, or null. Empty values, the old Lovable-hosted paths (/__l5e/...) that only work
 * on the Lovable site, and any other relative/invalid path count as "no image".
 */
export function usableImage(url: string | null | undefined): string | null {
  const u = (url ?? "").trim();
  if (!u || u.startsWith("/__l5e/")) return null;
  try {
    const parsed = new URL(u);
    return parsed.protocol === "https:" || parsed.protocol === "http:" ? u : null;
  } catch {
    return null;
  }
}

/** Icon for the fallback card, from the category's profile (product type). */
const ICONS: Record<string, LucideIcon> = {
  clothes: Shirt,
  shoes: Footprints,
  kids: Baby,
  modest: Sparkles,
  perfume: SprayCan,
  accessories: Gem,
  general: ShoppingBag,
};
export const categoryIcon = (profileKey: string | null | undefined): LucideIcon =>
  ICONS[profileKey ?? ""] ?? ShoppingBag;

/** "Men's T-Shirts" -> "mens-t-shirts"; Arabic names keep their letters ("ملابس رجالي" -> "ملابس-رجالي"). */
export function categorySlug(name: string) {
  return name
    .normalize("NFKD")
    .replace(/[ً-ٰٟ]/g, "") // Arabic diacritics
    .replace(/[̀-ͯ]/g, "") // Latin accents
    .toLowerCase()
    .replace(/['’]/g, "")
    .replace(/[^\p{L}\p{N}]+/gu, "-")
    .replace(/^-+|-+$/g, "");
}

/**
 * Bulk upload: which category a file is for, from its name without the extension: the English or Arabic
 * name as a slug ("t-shirts.jpg", "تيشيرتات.webp") or the category id. Null when nothing matches exactly once.
 */
export function matchCategoryFile(
  fileName: string,
  categories: { id: string; name_ar: string; name_en: string }[],
): string | null {
  const base = categorySlug(fileName.replace(/\.[^.]+$/, ""));
  if (!base) return null;
  const hits = categories.filter(
    (c) => c.id === base || categorySlug(c.name_en) === base || categorySlug(c.name_ar) === base,
  );
  return hits.length === 1 ? hits[0].id : null;
}
