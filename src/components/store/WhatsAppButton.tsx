import { useRouterState } from "@tanstack/react-router";
import { useI18n } from "@/lib/i18n";
import { useSettings } from "@/lib/store-settings";
import { fillTemplate, useWaContext, waLink } from "@/lib/whatsapp";
import { cn } from "@/lib/utils";

export function WhatsAppIcon({ className = "h-7 w-7" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="currentColor" aria-hidden="true">
      <path d="M17.47 14.38c-.3-.15-1.75-.86-2.02-.96-.27-.1-.47-.15-.67.15-.2.3-.77.96-.94 1.16-.17.2-.35.22-.64.07-.3-.15-1.25-.46-2.38-1.47-.88-.79-1.47-1.76-1.65-2.06-.17-.3-.02-.46.13-.6.13-.14.3-.35.45-.52.15-.17.2-.3.3-.5.1-.2.05-.37-.03-.52-.07-.15-.67-1.6-.92-2.2-.24-.58-.49-.5-.67-.5h-.57c-.2 0-.52.07-.8.37-.27.3-1.04 1.02-1.04 2.48s1.07 2.88 1.21 3.08c.15.2 2.1 3.2 5.08 4.49.71.31 1.26.49 1.7.63.71.23 1.36.2 1.87.12.57-.09 1.75-.72 2-1.41.25-.7.25-1.29.17-1.41-.07-.13-.27-.2-.57-.35M12.05 21.5h-.01a9.4 9.4 0 0 1-4.8-1.32l-.34-.2-3.56.93.95-3.47-.22-.36A9.4 9.4 0 0 1 2.6 12.06c0-5.2 4.24-9.44 9.46-9.44a9.4 9.4 0 0 1 9.44 9.45c0 5.21-4.24 9.44-9.45 9.44M20.1 4a11.3 11.3 0 0 0-8.05-3.34C5.78.66.67 5.77.67 12.05c0 2 .52 3.96 1.52 5.69L.57 23.6l6-1.57a11.4 11.4 0 0 0 5.47 1.4h.01c6.27 0 11.38-5.11 11.38-11.39 0-3.04-1.18-5.9-3.33-8.05" />
    </svg>
  );
}

/** Builds the WhatsApp link for the current page context, or null when the button should be hidden. */
export function useWhatsAppLink(overrideOrder?: number | string) {
  const { settings, features } = useSettings();
  const { lang, tx } = useI18n();
  const ctx = useWaContext();
  const s = settings as (Record<string, unknown> & typeof settings) | null;
  if (!s || !features.whatsapp_button || !s.whatsapp_enabled || !s.whatsapp_number) return null;
  const pick = (k: string) => (s[`${k}_${lang}`] as string | null) || (s[`${k}_ar`] as string | null) || "";
  const vars: Record<string, string | number | null | undefined> = { store_name: tx(s, "name") };
  let tpl = pick("whatsapp_message_general");
  const order = overrideOrder ?? (ctx?.kind === "order" ? ctx.orderNumber : undefined);
  if (order != null) {
    tpl = pick("whatsapp_message_order");
    vars.order_number = order;
  } else if (ctx?.kind === "product") {
    tpl = pick("whatsapp_message_product");
    Object.assign(vars, { product_name: ctx.name, size: ctx.size, color: ctx.color, product_url: typeof window !== "undefined" ? window.location.href : "" });
  }
  return { href: waLink(s.whatsapp_number, fillTemplate(tpl, vars)), hours: pick("whatsapp_reply_hours_text") };
}

export function WhatsAppButton() {
  const path = useRouterState({ select: (s) => s.location.pathname });
  const { lang } = useI18n();
  const ctx = useWaContext();
  const link = useWhatsAppLink();
  if (!link || path.startsWith("/admin") || path.startsWith("/driver")) return null;
  const onProduct = ctx?.kind === "product";
  // Pages with a sticky action bar on mobile (product, cart, checkout): keep the bar and totals clear.
  const hideOnMobile = onProduct || path === "/cart" || path === "/checkout";
  return (
    <a href={link.href} target="_blank" rel="noopener noreferrer"
      aria-label={lang === "ar" ? "تواصل عبر واتساب" : "Chat on WhatsApp"}
      // On mobile product pages the sticky add-to-cart bar carries its own WhatsApp button instead.
      className={cn("group fixed bottom-20 start-4 z-40 md:bottom-6", hideOnMobile && "hidden md:block")}>
      <span className="absolute inset-0 animate-ping rounded-full bg-whatsapp opacity-30" />
      <span className="relative flex h-12 w-12 items-center justify-center rounded-full bg-whatsapp text-whatsapp-foreground shadow-lg md:h-14 md:w-14">
        <WhatsAppIcon className="h-6 w-6 md:h-7 md:w-7" />
      </span>
      {link.hours && (
        <span className="pointer-events-none absolute bottom-full start-0 mb-2 hidden w-max max-w-[220px] rounded-lg bg-foreground px-3 py-1.5 text-xs text-background shadow group-hover:block">
          {link.hours}
        </span>
      )}
    </a>
  );
}

/** Compact WhatsApp link for the mobile product sticky bar (same accessible name as the floating button). */
export function WhatsAppInlineIcon() {
  const { lang } = useI18n();
  const link = useWhatsAppLink();
  if (!link) return null;
  return (
    <a href={link.href} target="_blank" rel="noopener noreferrer" aria-label={lang === "ar" ? "تواصل عبر واتساب" : "Chat on WhatsApp"}
      className="flex h-12 w-12 shrink-0 items-center justify-center rounded-md border text-whatsapp">
      <WhatsAppIcon className="h-6 w-6" />
    </a>
  );
}

export function WhatsAppOrderButton({ orderNumber }: { orderNumber: number | string }) {
  const { lang } = useI18n();
  const link = useWhatsAppLink(orderNumber);
  if (!link) return null;
  return (
    <a href={link.href} target="_blank" rel="noopener noreferrer"
      className="inline-flex items-center gap-2 rounded-xl bg-whatsapp px-4 py-2 text-sm font-bold text-whatsapp-foreground">
      <WhatsAppIcon className="h-5 w-5" />{lang === "ar" ? "تواصل معنا على واتساب" : "Contact us on WhatsApp"}
    </a>
  );
}
