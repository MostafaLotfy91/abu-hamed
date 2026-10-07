import { useQuery } from "@tanstack/react-query";
import { useI18n } from "@/lib/i18n";
import { COLORS, GENDERS, SIZE_SETS, sizeLabel } from "@/lib/fashion";
import { fetchBrands, type ListFilters } from "@/lib/queries";
import { cn } from "@/lib/utils";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";

export type Extra = Omit<ListFilters, "q" | "categoryIds">;

const pill = (on: boolean) => cn("rounded-full border px-3 py-1 text-sm transition", on ? "border-foreground bg-foreground text-background" : "bg-card hover:border-foreground");

/** Shared filter controls: used live in the desktop sidebar and as a draft in the mobile sheet. */
export function FilterPanel({ value: v, onChange }: { value: Extra; onChange: (v: Extra) => void }) {
  const { t, lang } = useI18n();
  const brands = useQuery({ queryKey: ["brands"], queryFn: fetchBrands });
  const set = (patch: Partial<Extra>) => onChange({ ...v, ...patch });
  const num = (s: string) => (s ? Number(s) : undefined);

  return (
    <div className="space-y-6">
      <section>
        <Label className="text-xs font-semibold uppercase tracking-wide">{t("gender")}</Label>
        <div className="mt-2 flex flex-wrap gap-2">
          {GENDERS.map((g) => <button key={g.value} onClick={() => set({ gender: v.gender === g.value ? undefined : g.value })} className={pill(v.gender === g.value)}>{g[lang]}</button>)}
        </div>
      </section>
      <section>
        <Label className="text-xs font-semibold uppercase tracking-wide">{t("size")}</Label>
        {(["clothes", "shoes", "kids"] as const).map((k) => (
          <div key={k} className="mt-2 flex flex-wrap gap-1.5">
            {SIZE_SETS[k].map((sz) => (
              <button key={sz} onClick={() => set({ size: v.size === sz ? undefined : sz })}
                className={cn("min-w-10 rounded-md border px-2 py-1 text-xs font-semibold transition", v.size === sz ? "border-foreground bg-foreground text-background" : "bg-card hover:border-foreground")}>{sizeLabel(sz, lang)}</button>
            ))}
          </div>
        ))}
      </section>
      <section>
        <Label className="text-xs font-semibold uppercase tracking-wide">{t("color")}</Label>
        <div className="mt-2 flex flex-wrap gap-2">
          {COLORS.map((c) => (
            <button key={c.en} title={c[lang]} aria-label={c[lang]} aria-pressed={v.color === c.en} onClick={() => set({ color: v.color === c.en ? undefined : c.en })}
              className={cn("h-8 w-8 rounded-full border p-0.5", v.color === c.en ? "border-foreground" : "border-transparent")}>
              <span className="block h-full w-full rounded-full border border-border" style={{ background: c.hex }} />
            </button>
          ))}
        </div>
      </section>
      <section>
        <Label className="text-xs font-semibold uppercase tracking-wide">{t("price")}</Label>
        <div className="mt-2 flex gap-2">
          <Input type="number" inputMode="decimal" placeholder={t("min")} value={v.minPrice ?? ""} onChange={(e) => set({ minPrice: num(e.target.value) })} />
          <Input type="number" inputMode="decimal" placeholder={t("max")} value={v.maxPrice ?? ""} onChange={(e) => set({ maxPrice: num(e.target.value) })} />
        </div>
      </section>
      {!!brands.data?.length && (
        <section>
          <Label className="text-xs font-semibold uppercase tracking-wide">{t("brand")}</Label>
          <div className="mt-2 flex flex-wrap gap-2">
            {brands.data.map((b) => <button key={b} onClick={() => set({ brand: v.brand === b ? undefined : b })} className={pill(v.brand === b)}>{b}</button>)}
          </div>
        </section>
      )}
      <div className="flex items-center justify-between"><Label>{t("discounted_only")}</Label><Switch checked={!!v.discounted} onCheckedChange={(x) => set({ discounted: x || undefined })} /></div>
      <div className="flex items-center justify-between"><Label>{t("in_stock_only")}</Label><Switch checked={!!v.inStock} onCheckedChange={(x) => set({ inStock: x || undefined })} /></div>
    </div>
  );
}
