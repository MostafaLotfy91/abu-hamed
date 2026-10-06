import { Link } from "@tanstack/react-router";
import { useI18n } from "@/lib/i18n";
import { useSettings } from "@/lib/store-settings";
import { SocialIcons } from "@/lib/social";

export function SiteFooter() {
  const { lang, tx } = useI18n();
  const { settings } = useSettings();
  const ar = lang === "ar";
  return (
    <footer className="mt-10 border-t bg-card">
      <div className="mx-auto flex max-w-7xl flex-col items-center gap-3 px-3 py-6 text-center md:flex-row md:justify-between md:px-6">
        <div className="text-sm text-muted-foreground">© {new Date().getFullYear()} {tx(settings as Record<string, unknown> | null, "name")}</div>
        <SocialIcons />
        <Link to="/contact" className="text-sm font-semibold hover:text-primary">{ar ? "تواصل معنا" : "Contact us"}</Link>
      </div>
    </footer>
  );
}
