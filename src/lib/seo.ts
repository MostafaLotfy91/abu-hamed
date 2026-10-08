/**
 * Page <head> built from store_settings (loaded by the root route loader), so titles, descriptions, share
 * images and theme colour belong to the store, not to the template.
 */
import type { StoreSettings } from "@/lib/store-settings";

type Match = { loaderData?: unknown };

/** Store settings loaded by the root route (first match), if any. */
export function rootSettings(matches: readonly Match[] | undefined): StoreSettings | null {
  const data = matches?.[0]?.loaderData as { settings?: StoreSettings | null } | undefined;
  return data?.settings ?? null;
}

/** Store name in the store's default language. */
export function storeName(s: StoreSettings | null) {
  if (!s) return "";
  return (s.default_language === "en" ? s.name_en || s.name_ar : s.name_ar || s.name_en) ?? "";
}

function storeTagline(s: StoreSettings | null) {
  if (!s) return "";
  return (
    (s.default_language === "en" ? s.tagline_en || s.tagline_ar : s.tagline_ar || s.tagline_en) ??
    ""
  );
}

type Text = string | { ar: string; en: string } | null | undefined;
const pick = (t: Text, s: StoreSettings | null) =>
  t == null ? "" : typeof t === "string" ? t : s?.default_language === "en" ? t.en : t.ar;

/** Meta tags for a page: "<page> · <store>" title, description (defaults to the tagline), share image. */
export function pageHead(
  matches: readonly Match[] | undefined,
  page: { title?: Text; description?: Text; image?: string | null; noindex?: boolean } = {},
) {
  const s = rootSettings(matches);
  const name = storeName(s);
  const pageTitle = pick(page.title, s);
  const title = pageTitle ? (name ? `${pageTitle} · ${name}` : pageTitle) : name;
  const description = (pick(page.description, s) || storeTagline(s) || name).slice(0, 300);
  const image = page.image || s?.logo_url || undefined;
  return {
    meta: [
      ...(title ? [{ title }, { property: "og:title", content: title }] : []),
      ...(description
        ? [
            { name: "description", content: description },
            { property: "og:description", content: description },
          ]
        : []),
      ...(image ? [{ property: "og:image", content: image }] : []),
      ...(page.noindex ? [{ name: "robots", content: "noindex" }] : []),
    ],
  };
}
