import { describe, expect, it } from "vitest";
import { appManifest } from "../app-manifest";

describe("storefront install manifest", () => {
  it("names the app after the store and uses its colour", () => {
    const m = appManifest({
      name_ar: "أبو حامد",
      name_en: "Abu Hamed",
      tagline_ar: "أناقة كل يوم",
      primary_color: "#3e1e1e",
      default_language: "ar",
    });
    expect(m).toMatchObject({
      name: "أبو حامد",
      short_name: "أبو حامد",
      description: "أناقة كل يوم",
      lang: "ar",
      dir: "rtl",
      start_url: "/",
      scope: "/",
      display: "standalone",
      theme_color: "#3e1e1e",
    });
    expect(appManifest({ name_en: "Abu Hamed", default_language: "en" }).name).toBe("Abu Hamed");
  });

  it("has installable icons (192, 512 and a maskable one)", () => {
    const icons = appManifest(null).icons;
    expect(icons.map((i) => [i.sizes, i.purpose])).toEqual([
      ["192x192", "any"],
      ["512x512", "any"],
      ["512x512", "maskable"],
    ]);
  });

  it("falls back safely: no settings, bad colour, long name", () => {
    expect(appManifest(null)).toMatchObject({ name: "Store", theme_color: "#1C1A18" });
    expect(appManifest({ primary_color: "red" }).theme_color).toBe("#1C1A18");
    expect(
      appManifest({ name_ar: "متجر الأناقة الفاخرة للأزياء" }).short_name.length,
    ).toBeLessThanOrEqual(12);
  });
});
