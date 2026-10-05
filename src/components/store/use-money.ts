import { useI18n } from "@/lib/i18n";
import { useSettings } from "@/lib/store-settings";
import { formatMoney } from "@/lib/format";

export function useMoney() {
  const { lang } = useI18n();
  const { settings } = useSettings();
  return (v: number | string | null | undefined) =>
    formatMoney(v, lang, { ar: settings?.currency_symbol_ar, en: settings?.currency_symbol_en });
}
