// Readable text on a store colour, chosen by WCAG contrast ratio (used for the brand CSS variables).

const DARK_TEXT = "#1c1a18";
const LIGHT_TEXT = "#faf7f2";

/** WCAG relative luminance of a #rrggbb colour. */
function luminance(hex: string) {
  const n = parseInt(hex.slice(1), 16);
  const ch = (v: number) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * ch((n >> 16) & 255) + 0.7152 * ch((n >> 8) & 255) + 0.0722 * ch(n & 255);
}
const ratio = (a: number, b: number) => (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);

/** Charcoal or ivory text on a store colour: whichever reads better (higher WCAG contrast). */
export function readableOn(hex: string) {
  if (!/^#[0-9a-f]{6}$/i.test(hex)) return LIGHT_TEXT;
  const l = luminance(hex);
  return ratio(l, luminance(DARK_TEXT)) >= ratio(l, luminance(LIGHT_TEXT)) ? DARK_TEXT : LIGHT_TEXT;
}
