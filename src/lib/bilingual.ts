// Admin labels were written as "عربي / English". Show only the half that matches the admin's language.
import { useContext } from "react";
import { I18nContext, type Lang } from "@/lib/i18n";

const AR = /[؀-ۿ]/g;
const arabicShare = (s: string) =>
  (s.match(AR)?.length ?? 0) / Math.max(1, s.replace(/\s/g, "").length);

/**
 * "حفظ / Save" -> "حفظ" (ar) or "Save" (en). Only splits when one side is clearly Arabic and the other is not;
 * anything else (no " / ", "M / L" sizes, URLs) comes back unchanged.
 */
export function pickLang(text: string, lang: Lang): string {
  const i = text.indexOf(" / ");
  if (i < 0) return text;
  const a = text.slice(0, i).trim();
  const b = text.slice(i + 3).trim();
  const sa = arabicShare(a);
  const sb = arabicShare(b);
  if (Math.abs(sa - sb) < 0.3) return text;
  const [arabic, english] = sa > sb ? [a, b] : [b, a];
  return lang === "ar" ? arabic : english;
}

/** bi("حفظ / Save") in the current language; unchanged outside the language provider (unit tests). */
export function useBi() {
  const lang = useContext(I18nContext)?.lang;
  return (text: string) => (lang ? pickLang(text, lang) : text);
}
