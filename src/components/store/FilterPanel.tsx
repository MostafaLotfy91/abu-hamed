import type { ReactNode } from "react";
import { useI18n } from "@/lib/i18n";
import { GENDERS, SEASONS, sizeLabel, sortSizes } from "@/lib/fashion";
import type { FilterKey, ListState } from "@/lib/catalog";
import type { FilterOptions } from "@/lib/queries";
import { cn } from "@/lib/utils";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";

export type Extra = ListState;
export type TypeOption = { id: string; label: string; count: number };

const pill = (on: boolean) =>
  cn(
    "rounded-full border px-3 py-1 text-sm transition",
    on ? "border-foreground bg-foreground text-background" : "bg-card hover:border-foreground",
  );
const Count = ({ n }: { n: number }) => (
  <span className="ms-1 text-xs opacity-60 tabular-nums">{n}</span>
);

function Section({ label, children }: { label: string; children: ReactNode }) {
  return (
    <section>
      <Label className="text-xs font-semibold uppercase tracking-wide">{label}</Label>
      <div className="mt-2 flex flex-wrap gap-2">{children}</div>
    </section>
  );
}

/**
 * Filter controls for one listing. Only filters in `allowed` (the category profile) are shown, and only values present
 * in the current results (`options`, with counts). A selected value stays visible so it can be turned off.
 */
export function FilterPanel({
  value: v,
  onChange,
  options: o,
  allowed,
  types = [],
}: {
  value: Extra;
  onChange: (v: Extra) => void;
  options: FilterOptions;
  allowed: FilterKey[];
  types?: TypeOption[];
}) {
  const { t, lang } = useI18n();
  const ar = lang === "ar";
  const set = (patch: Partial<Extra>) => onChange({ ...v, ...patch });
  const num = (s: string) => (s ? Number(s) : undefined);
  const has = (k: FilterKey) => allowed.includes(k);
  const toggle = <K extends keyof Extra>(k: K, val: Extra[K]) =>
    set({ [k]: v[k] === val ? undefined : val } as Partial<Extra>);

  const genders = GENDERS.flatMap((g) => {
    const f = o.genders.find((x) => x.value === g.value);
    return f ? [{ ...g, count: f.count }] : [];
  });
  const seasons = SEASONS.flatMap((s) => {
    const f = o.seasons.find((x) => x.value === s.value);
    return f ? [{ ...s, count: f.count }] : [];
  });
  const sizes = sortSizes(o.sizes.map((s) => s.value)).map((value) => ({
    value,
    count: o.sizes.find((s) => s.value === value)!.count,
  }));
  const typeOptions = types.filter((x) => x.count > 0 || v.type === x.id);

  return (
    <div className="space-y-6">
      {has("type") && typeOptions.length > 0 && (
        <Section label={ar ? "النوع" : "Type"}>
          {typeOptions.map((x) => (
            <button
              key={x.id}
              aria-pressed={v.type === x.id}
              onClick={() => toggle("type", x.id)}
              className={pill(v.type === x.id)}
            >
              {x.label}
              <Count n={x.count} />
            </button>
          ))}
        </Section>
      )}
      {has("gender") && genders.length > 0 && (
        <Section label={t("gender")}>
          {genders.map((g) => (
            <button
              key={g.value}
              aria-pressed={v.gender === g.value}
              onClick={() => toggle("gender", g.value)}
              className={pill(v.gender === g.value)}
            >
              {g[lang]}
              <Count n={g.count} />
            </button>
          ))}
        </Section>
      )}
      {has("size") && sizes.length > 0 && (
        <Section label={t("size")}>
          {sizes.map((s) => (
            <button
              key={s.value}
              aria-pressed={v.size === s.value}
              onClick={() => toggle("size", s.value)}
              title={`${s.count}`}
              className={cn(
                "min-w-10 rounded-md border px-2 py-1 text-xs font-semibold transition",
                v.size === s.value
                  ? "border-foreground bg-foreground text-background"
                  : "bg-card hover:border-foreground",
              )}
            >
              {sizeLabel(s.value, lang)}
            </button>
          ))}
        </Section>
      )}
      {has("color") && o.colors.length > 0 && (
        <Section label={t("color")}>
          {o.colors.map((c) => {
            const name = (ar ? c.ar : c.en) ?? c.en;
            return (
              <button
                key={c.en}
                title={`${name} (${c.count})`}
                aria-label={`${name} (${c.count})`}
                aria-pressed={v.color === c.en}
                onClick={() => toggle("color", c.en)}
                className={cn(
                  "h-8 w-8 rounded-full border p-0.5",
                  v.color === c.en ? "border-foreground" : "border-transparent",
                )}
              >
                <span
                  className="block h-full w-full rounded-full border border-border"
                  style={{ background: c.hex ?? undefined }}
                />
              </button>
            );
          })}
        </Section>
      )}
      {has("concentration") && o.concentrations.length > 0 && (
        <Section label={ar ? "التركيز" : "Concentration"}>
          {o.concentrations.map((c) => (
            <button
              key={c.value}
              aria-pressed={v.concentration === c.value}
              onClick={() => toggle("concentration", c.value)}
              className={pill(v.concentration === c.value)}
            >
              {c.value}
              <Count n={c.count} />
            </button>
          ))}
        </Section>
      )}
      {has("volume") && o.volumes.length > 0 && (
        <Section label={ar ? "الحجم" : "Volume"}>
          {o.volumes.map((c) => (
            <button
              key={c.value}
              aria-pressed={v.volume === c.value}
              onClick={() => toggle("volume", c.value)}
              className={pill(v.volume === c.value)}
            >
              <span dir="ltr">{c.value} ml</span>
              <Count n={c.count} />
            </button>
          ))}
        </Section>
      )}
      {has("season") && seasons.length > 0 && (
        <Section label={ar ? "الموسم" : "Season"}>
          {seasons.map((s) => (
            <button
              key={s.value}
              aria-pressed={v.season === s.value}
              onClick={() => toggle("season", s.value)}
              className={pill(v.season === s.value)}
            >
              {s[lang]}
              <Count n={s.count} />
            </button>
          ))}
        </Section>
      )}
      {has("material") && o.materials.length > 0 && (
        <Section label={ar ? "الخامة" : "Material"}>
          {o.materials.map((m) => (
            <button
              key={m.value}
              aria-pressed={v.material === m.value}
              onClick={() => toggle("material", m.value)}
              className={pill(v.material === m.value)}
            >
              {(ar ? m.value : m.en) || m.value}
              <Count n={m.count} />
            </button>
          ))}
        </Section>
      )}
      {has("price") && (
        <section>
          <Label className="text-xs font-semibold uppercase tracking-wide">{t("price")}</Label>
          <div className="mt-2 flex gap-2">
            <Input
              type="number"
              inputMode="decimal"
              aria-label={t("min")}
              placeholder={o.price.min != null ? String(Math.floor(o.price.min)) : t("min")}
              value={v.minPrice ?? ""}
              onChange={(e) => set({ minPrice: num(e.target.value) })}
            />
            <Input
              type="number"
              inputMode="decimal"
              aria-label={t("max")}
              placeholder={o.price.max != null ? String(Math.ceil(o.price.max)) : t("max")}
              value={v.maxPrice ?? ""}
              onChange={(e) => set({ maxPrice: num(e.target.value) })}
            />
          </div>
        </section>
      )}
      {has("brand") && o.brands.length > 0 && (
        <Section label={t("brand")}>
          {o.brands.map((b) => (
            <button
              key={b.value}
              aria-pressed={v.brand === b.value}
              onClick={() => toggle("brand", b.value)}
              className={pill(v.brand === b.value)}
            >
              {b.value}
              <Count n={b.count} />
            </button>
          ))}
        </Section>
      )}
      {has("discount") && (o.discounted > 0 || v.discounted) && (
        <div className="flex items-center justify-between">
          <Label htmlFor="flt-discount">
            {t("discounted_only")} <Count n={o.discounted} />
          </Label>
          <Switch
            id="flt-discount"
            checked={!!v.discounted}
            onCheckedChange={(x) => set({ discounted: x || undefined })}
          />
        </div>
      )}
      {has("in_stock") && (o.in_stock > 0 || v.inStock) && (
        <div className="flex items-center justify-between">
          <Label htmlFor="flt-stock">
            {t("in_stock_only")} <Count n={o.in_stock} />
          </Label>
          <Switch
            id="flt-stock"
            checked={!!v.inStock}
            onCheckedChange={(x) => set({ inStock: x || undefined })}
          />
        </div>
      )}
    </div>
  );
}
