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
