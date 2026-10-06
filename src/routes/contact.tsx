import { createFileRoute } from "@tanstack/react-router";
import { Mail, Phone } from "lucide-react";
import { useI18n } from "@/lib/i18n";
import { useSettings } from "@/lib/store-settings";
import { SocialIcons } from "@/lib/social";
import { WhatsAppIcon, useWhatsAppLink } from "@/components/store/WhatsAppButton";

export const Route = createFileRoute("/contact")({
  head: () => ({
    meta: [
      { title: "تواصل معنا · Contact us" },
      { name: "description", content: "تواصل معنا عبر واتساب أو الهاتف أو وسائل التواصل. Reach us on WhatsApp, phone or social media." },
      { property: "og:title", content: "تواصل معنا · Contact us" },
      { property: "og:description", content: "Reach us on WhatsApp, phone or social media." },
    ],
  }),
  component: ContactPage,
});

function ContactPage() {
  const { lang } = useI18n();
  const { settings } = useSettings();
  const wa = useWhatsAppLink();
  const ar = lang === "ar";
  return (
    <div className="mx-auto max-w-xl space-y-4">
      <h1 className="text-2xl font-extrabold">{ar ? "تواصل معنا" : "Contact us"}</h1>
      <div className="space-y-3 rounded-3xl bg-card p-5 shadow-card">
        {wa && (
          <a href={wa.href} target="_blank" rel="noopener noreferrer" className="flex items-center gap-3 rounded-xl bg-whatsapp p-3 font-bold text-whatsapp-foreground">
            <WhatsAppIcon className="h-6 w-6" /><span className="flex-1">{ar ? "راسلنا على واتساب" : "Message us on WhatsApp"}</span>
          </a>
        )}
        {wa?.hours && <p className="text-sm text-muted-foreground">{wa.hours}</p>}
        {settings?.contact_phone && <a href={`tel:${settings.contact_phone}`} className="flex items-center gap-3 rounded-xl border p-3" dir="ltr"><Phone className="h-5 w-5" />{settings.contact_phone}</a>}
        {settings?.email && <a href={`mailto:${settings.email}`} className="flex items-center gap-3 rounded-xl border p-3" dir="ltr"><Mail className="h-5 w-5" />{settings.email}</a>}
        <SocialIcons className="pt-2" />
      </div>
    </div>
  );
}
