import { useEffect, useState } from "react";
import { Link } from "@tanstack/react-router";
import { useI18n } from "@/lib/i18n";
import { useSettings } from "@/lib/store-settings";
import { isSafeLink } from "@/lib/whatsapp";
import { cn } from "@/lib/utils";
import type { Tables } from "@/integrations/supabase/types";

type Banner = Tables<"banners">;

const SLIDE_MS = 6500;

function usePrefersReducedMotion() {
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    const m = window.matchMedia("(prefers-reduced-motion: reduce)");
    setReduced(m.matches);
    const on = () => setReduced(m.matches);
    m.addEventListener("change", on);
    return () => m.removeEventListener("change", on);
  }, []);
  return reduced;
}

/** One understated call to action, light on the image. */
function HeroCta({ href, label }: { href: string | null; label: string }) {
  const cls =
    "inline-flex h-12 items-center border border-white/70 px-10 text-sm tracking-[0.08em] text-white transition-colors duration-500 hover:bg-white hover:text-[#1c1a18] rtl:tracking-normal";
  // A banner's own link (already checked by isSafeLink) is used as written; otherwise all products.
  if (href)
    return (
      <a href={href} className={cls}>
        {label}
      </a>
    );
  return (
    <Link to="/products" className={cls}>
      {label}
    </Link>
  );
}

/**
 * Full-screen cinematic hero: the store's banners as a slow crossfade (with a slight zoom), the headline from the
 * banner title (or the store tagline), one call to action. Without banners: a quiet dark band with the store name
 * and tagline, never a placeholder picture.
 */
export function Hero({ banners, loading }: { banners: Banner[]; loading: boolean }) {
  const { t, tx } = useI18n();
  const { settings } = useSettings();
  const [idx, setIdx] = useState(0);
  // Slides already shown stay mounted (they fade out smoothly); others mount just before their turn.
  const [shown, setShown] = useState<Set<number>>(() => new Set([0]));
  useEffect(() => setShown((s) => (s.has(idx) ? s : new Set(s).add(idx))), [idx]);
  const reduced = usePrefersReducedMotion();
  const count = banners.length;

  useEffect(() => {
    if (count < 2 || reduced) return;
    const i = setInterval(() => setIdx((n) => (n + 1) % count), SLIDE_MS);
    return () => clearInterval(i);
  }, [count, reduced]);

  const name = tx(settings as Record<string, unknown> | null, "name");
  const tagline = tx(settings as Record<string, unknown> | null, "tagline");

  if (loading)
    return <section aria-busy="true" className="h-[100svh] min-h-[540px] bg-surface-dark" />;

  if (!count)
    return (
      <section className="surface-dark flex h-[78svh] min-h-[480px] items-end">
        <div className="container-wide w-full pb-24 pt-32 md:pb-28">
          <p className="eyebrow text-on-dark/70">{name}</p>
          <h1 className="mt-4 max-w-3xl font-display text-4xl text-on-dark md:text-6xl lg:text-7xl">
            {tagline || name}
          </h1>
          <div className="mt-10">
            <HeroCta href={null} label={t("shop_now")} />
          </div>
        </div>
      </section>
    );

  const current = banners[Math.min(idx, count - 1)];
  const headline = tx(current, "title") || tagline || name;
  const sub = tx(current, "subtitle");
  const link = current.link && isSafeLink(current.link) ? current.link : null;

  return (
    <section
      aria-roledescription="carousel"
      aria-label={name}
      className="relative h-[100svh] min-h-[540px] overflow-hidden bg-surface-dark"
    >
      {banners.map((b, i) =>
        !shown.has(i) && i !== (idx + 1) % count ? null : (
          // The whole picture opens the banner's link (the button below is the keyboard path).
          <a
            key={b.id}
            href={b.link && isSafeLink(b.link) ? b.link : "/products"}
            tabIndex={-1}
            aria-hidden={i !== idx || undefined}
            className={cn("absolute inset-0", i !== idx && "pointer-events-none")}
          >
            <img
              src={b.image_url}
              alt={i === idx ? tx(b, "title") || name : ""}
              loading={i === 0 ? "eager" : "lazy"}
              decoding="async"
              {...(i === 0 ? { fetchPriority: "high" as const } : {})}
              className={cn(
                "h-full w-full object-cover transition-[opacity,transform] ease-[var(--ease-luxe)]",
                "duration-[1600ms] motion-reduce:transition-none",
                i === idx ? "scale-100 opacity-100" : "scale-[1.04] opacity-0",
              )}
            />
          </a>
        ),
      )}
      {/* Readability: darker at the bottom (text) and a little at the top (header). */}
      <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/65 via-black/10 to-black/25" />

      <div className="pointer-events-none absolute inset-x-0 bottom-0 pb-24 md:pb-28 [&_a]:pointer-events-auto">
        <div className="container-wide">
          <div key={current.id} className="max-w-3xl animate-[hero-in_900ms_var(--ease-luxe)_both]">
            <p className="eyebrow text-white/75">{name}</p>
            <h1 className="mt-4 font-display text-4xl text-white md:text-6xl lg:text-7xl">
              {headline}
            </h1>
            {sub && (
              <p className="mt-4 max-w-xl text-base leading-relaxed text-white/85 md:text-lg">
                {sub}
              </p>
            )}
            <div className="mt-10">
              <HeroCta href={link} label={t("shop_now")} />
            </div>
          </div>
        </div>
      </div>

      {count > 1 && (
        <div className="absolute inset-x-0 bottom-10 z-10 flex justify-center gap-3 md:bottom-12">
          {banners.map((b, i) => (
            <button
              key={b.id}
              type="button"
              onClick={() => setIdx(i)}
              aria-label={`${i + 1} / ${count}`}
              aria-current={i === idx || undefined}
              className="flex h-6 items-center"
            >
              <span
                className={cn(
                  "block h-px bg-white transition-all duration-700",
                  i === idx ? "w-10 opacity-100" : "w-5 opacity-50",
                )}
              />
            </button>
          ))}
        </div>
      )}
    </section>
  );
}
