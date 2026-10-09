// Web app manifest for the storefront ("Add to Home Screen" / install), built from store_settings so the
// app name, description and colours follow the store. Served at /manifest.webmanifest. The driver app has its
// own manifest (public/driver.webmanifest, scope /driver).

type Settings = {
  name_ar?: string | null;
  name_en?: string | null;
  tagline_ar?: string | null;
  tagline_en?: string | null;
  primary_color?: string | null;
  default_language?: string | null;
} | null;

const HEX = /^#[0-9a-f]{6}$/i;

export function appManifest(s: Settings) {
  const ar = (s?.default_language ?? "ar") !== "en";
  const name = (ar ? s?.name_ar || s?.name_en : s?.name_en || s?.name_ar)?.trim() || "Store";
  const description = (ar ? s?.tagline_ar || s?.tagline_en : s?.tagline_en || s?.tagline_ar) ?? "";
  return {
    id: "/",
    name,
    short_name: name.length > 12 ? name.slice(0, 12) : name,
    description,
    lang: ar ? "ar" : "en",
    dir: ar ? "rtl" : "ltr",
    start_url: "/",
    scope: "/",
    display: "standalone",
    orientation: "portrait",
    background_color: "#FAF7F2",
    theme_color: s?.primary_color && HEX.test(s.primary_color) ? s.primary_color : "#1C1A18",
    categories: ["shopping", "lifestyle"],
    icons: [
      { src: "/icons/app-icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icons/app-icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      {
        src: "/icons/app-icon-maskable-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
    ],
  };
}
