// First page of a product listing, loaded by the route on the server so the HTML already contains the products
// (fast first paint, and search engines see them). In the browser, the listing's own queries take over.
import { listingFilters, parseListSearch, pruneFilters, type Profile } from "@/lib/catalog";
import { fetchProductCount, fetchProductPage, type ListFilters, type Product } from "@/lib/queries";

export type InitialListing = { key: string; items: Product[]; total: number };

/** Identifies one listing state; the listing uses server data only when its own key is identical. */
export const listingKey = (filters: ListFilters, typeIds?: string[]) =>
  JSON.stringify([filters, typeIds ?? null]);

/** Same filter construction as ProductListing: base first, then the URL state pruned to the profile's filters. */
export function listingFiltersFor(
  base: Pick<ListFilters, "q" | "categoryIds">,
  search: Record<string, unknown>,
  profile: Profile | null,
): ListFilters {
  return { ...base, ...pruneFilters(parseListSearch(search), listingFilters(profile)) };
}

export async function loadInitialListing(
  filters: ListFilters,
  typeIds?: string[],
): Promise<InitialListing | null> {
  try {
    const [items, total] = await Promise.all([
      fetchProductPage(filters, 0, typeIds),
      fetchProductCount(filters, typeIds),
    ]);
    return { key: listingKey(filters, typeIds), items: items as Product[], total: Number(total) };
  } catch {
    // The page still works: the listing fetches in the browser as before.
    return null;
  }
}

export const isServer = () => typeof window === "undefined";
