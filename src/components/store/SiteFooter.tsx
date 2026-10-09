import type { ReactNode } from "react";
import { Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useI18n } from "@/lib/i18n";
import { useSettings } from "@/lib/store-settings";
import { SocialIcons } from "@/lib/social";
import { fetchCategories } from "@/lib/queries";
import { Ornament } from "@/components/luxe/Ornament";
import { useHydrated } from "@/lib/use-hydrated";

function Column({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="space-y-5">
      <h2 className="eyebrow text-on-dark/70">{title}</h2>
      <ul className="space-y-3 text-sm text-on-dark/85">{children}</ul>
    </div>
  );
}

const linkCls = "link-luxe transition-colors hover:text-on-dark";

/** Refined multi-column footer on the dark band. Every line comes from the store's own data. */
export function SiteFooter() {
  const { lang, tx, t } = useI18n();
  const { settings } = useSettings();
  const ar = lang === "ar";
  const cats = useQuery({ queryKey: ["categories"], queryFn: fetchCategories });
  // Below the fold and fed by a cache that pages seed differently on the server: list after hydration, so the
  // server HTML and the first client render always match.
  const hydrated = useHydrated();
  const roots = hydrated
    ? (cats.data ?? []).filter((c) => !c.parent_id && c.is_active).slice(0, 6)
    : [];
  const name = tx(settings as Record<string, unknown> | null, "name");
  const tagline = tx(settings as Record<string, unknown> | null, "tagline");
  const phone = settings?.contact_phone;
  const email = settings?.email;

  return (
    <footer className="surface-dark mt-16 md:mt-24">
      <div className="container-wide grid gap-12 py-16 md:grid-cols-2 md:py-20 lg:grid-cols-4">
        <div className="space-y-5">
          <p className="font-display text-3xl text-on-dark">{name}</p>
          {tagline && <p className="max-w-xs leading-relaxed text-on-dark/70">{tagline}</p>}
          <SocialIcons onDark />
        </div>
        {roots.length > 0 && (
          <Column title={ar ? "الأقسام" : "Departments"}>
            {roots.map((c) => (
              <li key={c.id}>
                <Link to="/category/$id" params={{ id: c.id }} className={linkCls}>
                  {tx(c, "name")}
                </Link>
              </li>
            ))}
          </Column>
        )}
        <Column title={ar ? "خدمة العملاء" : "Client services"}>
          <li>
            <Link to="/orders" className={linkCls}>
              {t("orders")}
            </Link>
          </li>
          <li>
            <Link to="/account" className={linkCls}>
              {t("account")}
            </Link>
          </li>
          <li>
            <Link to="/cart" className={linkCls}>
              {t("cart")}
            </Link>
          </li>
          <li>
            <Link to="/contact" className={linkCls}>
              {ar ? "تواصل معنا" : "Contact us"}
            </Link>
          </li>
        </Column>
        {(phone || email) && (
          <Column title={ar ? "تواصل" : "Get in touch"}>
            {phone && (
              <li>
                <a href={`tel:${phone}`} dir="ltr" className={linkCls}>
                  {phone}
                </a>
              </li>
            )}
            {email && (
              <li>
                <a href={`mailto:${email}`} dir="ltr" className={linkCls}>
                  {email}
                </a>
              </li>
            )}
          </Column>
        )}
      </div>
      <div className="container-wide pb-24 md:pb-10">
        <Ornament className="mb-6" />
        <p className="text-center text-xs tracking-wide text-on-dark/70">
          © {new Date().getFullYear()} {name}
        </p>
      </div>
    </footer>
  );
}
