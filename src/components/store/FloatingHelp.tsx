import { useEffect, useRef, useState } from "react";
import { useRouterState } from "@tanstack/react-router";
import { LifeBuoy, Shirt, X } from "lucide-react";
import { useI18n } from "@/lib/i18n";
import { useSettings } from "@/lib/store-settings";
import { WhatsAppIcon, useWhatsAppLink } from "./WhatsAppButton";

/** ShoppingAssistant listens for this to open from elsewhere (the help menu). */
export const STYLIST_OPEN_EVENT = "stylist:open";
export const openStylist = () => window.dispatchEvent(new Event(STYLIST_OPEN_EVENT));

/**
 * On phones, the WhatsApp and Stylist buttons sat in opposite bottom corners over the content. When both would
 * show, one "help" button replaces them (desktop keeps both). Pages with a sticky action bar (product, cart,
 * checkout) already hide both on phones.
 */
export function useMergedHelp() {
  const path = useRouterState({ select: (s) => s.location.pathname });
  const { features } = useSettings();
  const wa = useWhatsAppLink();
  const busyPage =
    path.startsWith("/product/") ||
    path === "/cart" ||
    path === "/checkout" ||
    path.startsWith("/admin") ||
    path.startsWith("/driver");
  return !!wa && !!features.ai_assistant && !busyPage;
}

export function FloatingHelp() {
  const merged = useMergedHelp();
  const wa = useWhatsAppLink();
  const { lang } = useI18n();
  const ar = lang === "ar";
  const [open, setOpen] = useState(false);
  const wrap = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => {
      if (!wrap.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    window.addEventListener("pointerdown", onDown);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("pointerdown", onDown);
      window.removeEventListener("keydown", onKey);
    };
  }, [open]);

  if (!merged || !wa) return null;
  const label = ar ? "مساعدة" : "Help";
  return (
    <div ref={wrap} className="fixed bottom-20 end-4 z-40 lg:hidden">
      {open && (
        <div
          id="floating-help-menu"
          role="menu"
          aria-label={label}
          className="absolute bottom-full end-0 mb-3 w-56 space-y-1 rounded-2xl border bg-popover p-2 text-popover-foreground shadow-card"
        >
          <button
            type="button"
            role="menuitem"
            onClick={() => {
              setOpen(false);
              openStylist();
            }}
            className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-start text-sm font-semibold hover:bg-muted"
          >
            <span className="flex h-9 w-9 items-center justify-center rounded-full bg-primary text-primary-foreground">
              <Shirt className="h-5 w-5" />
            </span>
            {ar ? "الستايلست" : "Stylist"}
          </button>
          <a
            role="menuitem"
            href={wa.href}
            target="_blank"
            rel="noopener noreferrer"
            aria-label={ar ? "تواصل عبر واتساب" : "Chat on WhatsApp"}
            onClick={() => setOpen(false)}
            className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-semibold hover:bg-muted"
          >
            <span className="flex h-9 w-9 items-center justify-center rounded-full bg-whatsapp text-whatsapp-foreground">
              <WhatsAppIcon className="h-5 w-5" />
            </span>
            {ar ? "واتساب" : "WhatsApp"}
          </a>
        </div>
      )}
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-label={label}
        aria-expanded={open}
        aria-haspopup="menu"
        aria-controls={open ? "floating-help-menu" : undefined}
        className="flex h-12 w-12 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-lg"
      >
        {open ? <X className="h-6 w-6" /> : <LifeBuoy className="h-6 w-6" />}
      </button>
    </div>
  );
}
