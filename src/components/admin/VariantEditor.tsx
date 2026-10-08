import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Trash2 } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { sortSizes } from "@/lib/fashion";
import { fetchFacets } from "@/lib/queries";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";

type PaletteColor = { ar: string; en: string; hex: string };

/** Admin variant editor: bulk-generate size × color combinations, then edit stock/price/SKU per row. */
/** `sizes` is the category profile's size preset (null = this kind of product has no sizes). */
export function VariantEditor({ productId, sku, sizes: preset }: { productId: string; sku: string | null; sizes: string[] | null }) {
  const qc = useQueryClient();
  const key = ["admin", "variants", productId];
  const q = useQuery({
    queryKey: key,
    queryFn: async () => {
      const { data, error } = await supabase.from("product_variants").select("*").eq("product_id", productId).order("sort_order");
      if (error) throw error;
      return data;
    },
  });
  const [sizes, setSizes] = useState<string[]>([]);
  const [colors, setColors] = useState<string[]>([]);
  // Palette = colours already used in the catalogue + any the admin adds here (nothing hardcoded).
  const used = useQuery({ queryKey: ["facets", null], queryFn: () => fetchFacets(), staleTime: 60_000 });
  const [custom, setCustom] = useState<PaletteColor[]>([]);
  const [draft, setDraft] = useState<PaletteColor>({ ar: "", en: "", hex: "#000000" });
  const palette: PaletteColor[] = [
    ...(used.data?.colors ?? []).map((c) => ({ en: c.en, ar: c.ar ?? c.en, hex: c.hex ?? "" })),
    ...custom,
  ].filter((c, i, all) => all.findIndex((x) => x.en.toLowerCase() === c.en.toLowerCase()) === i);
  const addColor = () => {
    const c = { ar: draft.ar.trim(), en: draft.en.trim(), hex: draft.hex };
    if (!c.ar || !c.en) return toast.error("اكتب اسم اللون بالعربي والإنجليزي / Enter the colour name in Arabic and English");
    if (palette.some((x) => x.en.toLowerCase() === c.en.toLowerCase())) return toast.error("اللون موجود / Colour already exists");
    setCustom([...custom, c]);
    setColors([...colors, c.en]);
    setDraft({ ar: "", en: "", hex: "#000000" });
  };
  const [stock, setStock] = useState(10);
  const [busy, setBusy] = useState(false);
  const sizeSet: string[] = preset ?? [];
  const toggle = (arr: string[], v: string) => (arr.includes(v) ? arr.filter((x) => x !== v) : [...arr, v]);

  const generate = async () => {
    const ss = sizes.length ? sortSizes(sizes) : [null];
    const cs = colors.length ? palette.filter((c) => colors.includes(c.en)) : [null];
    if (!sizes.length && !colors.length) return toast.error("Pick sizes and/or colors");
    const existing = new Set((q.data ?? []).map((v) => `${v.size ?? ""}|${v.color_en ?? ""}`));
    const rows = cs.flatMap((c, ci) => ss.map((s, si) => ({ c, s, ci, si })))
      .filter(({ c, s }) => !existing.has(`${s ?? ""}|${c?.en ?? ""}`))
      .map(({ c, s, ci, si }) => ({
        product_id: productId, size: s, color_ar: c?.ar ?? null, color_en: c?.en ?? null, color_hex: c?.hex ?? null,
        name_ar: [s, c?.ar].filter(Boolean).join(" / "), name_en: [s, c?.en].filter(Boolean).join(" / "),
        sku: sku ? [sku, c?.en.slice(0, 3).toUpperCase(), s].filter(Boolean).join("-") : null,
        stock, sort_order: (ci + 1) * 100 + si, price: null,
      }));
    if (!rows.length) return toast("Nothing new to add");
    setBusy(true);
    const { error } = await supabase.from("product_variants").insert(rows);
    setBusy(false);
    if (error) return toast.error(error.message);
    toast.success(`+${rows.length}`);
    qc.invalidateQueries({ queryKey: key });
  };

  const update = async (id: string, patch: Record<string, unknown>) => {
    const { error } = await supabase.from("product_variants").update(patch as never).eq("id", id);
    if (error) toast.error(error.message); else qc.invalidateQueries({ queryKey: key });
  };
  const del = async (id: string) => {
    const { error } = await supabase.from("product_variants").delete().eq("id", id);
    if (error) toast.error(error.message); else qc.invalidateQueries({ queryKey: key });
  };

  return (
    <div className="space-y-4">
      <div className="space-y-3 rounded-2xl bg-secondary p-3">
        <p className="text-sm font-bold">إضافة مجمعة / Bulk add</p>
        {!!sizeSet.length && (
          <div><Label id="variant-sizes-label">المقاسات / Sizes</Label>
            <div role="group" aria-labelledby="variant-sizes-label" className="mt-1 flex flex-wrap gap-1.5">
              {sizeSet.map((s) => <button key={s} type="button" aria-pressed={sizes.includes(s)} onClick={() => setSizes(toggle(sizes, s))} className={`rounded-lg border px-2 py-1 text-xs font-semibold ${sizes.includes(s) ? "border-primary bg-primary text-primary-foreground" : "bg-card"}`}>{s}</button>)}
              <button type="button" className="text-xs text-primary underline" onClick={() => setSizes(sizes.length === sizeSet.length ? [] : sizeSet)}>All</button>
            </div>
          </div>
        )}
        <div><Label id="variant-colors-label">الألوان / Colors</Label>
          <div role="group" aria-labelledby="variant-colors-label" className="mt-1 flex flex-wrap gap-1.5">
            {palette.map((c) => (
              <button key={c.en} type="button" title={`${c.ar} / ${c.en}`} aria-label={`${c.ar} / ${c.en}`} aria-pressed={colors.includes(c.en)} onClick={() => setColors(toggle(colors, c.en))} className={`h-7 w-7 rounded-full border-2 p-0.5 ${colors.includes(c.en) ? "border-primary" : "border-transparent"}`}>
                <span className="block h-full w-full rounded-full border" style={{ background: c.hex || undefined }} />
              </button>
            ))}
            {!palette.length && <span className="text-xs text-muted-foreground">لا توجد ألوان بعد — أضف لوناً / No colours yet — add one</span>}
          </div>
          <div className="mt-2 flex flex-wrap items-end gap-2">
            <Input aria-label="اسم اللون (عربي) / Colour name (Arabic)" placeholder="اسم اللون" className="h-9 w-28" value={draft.ar} onChange={(e) => setDraft({ ...draft, ar: e.target.value })} />
            <Input aria-label="Colour name (English)" placeholder="Colour" dir="ltr" className="h-9 w-28" value={draft.en} onChange={(e) => setDraft({ ...draft, en: e.target.value })} />
            <Input aria-label="درجة اللون / Swatch" type="color" className="h-9 w-12 p-1" value={draft.hex} onChange={(e) => setDraft({ ...draft, hex: e.target.value })} />
            <Button type="button" size="sm" variant="outline" onClick={addColor}>إضافة لون / Add colour</Button>
          </div>
        </div>
        <div className="flex items-end gap-2">
          <div><Label htmlFor="variant-bulk-stock">Stock / المخزون لكل اختيار</Label><Input id="variant-bulk-stock" type="number" min={0} className="h-9 w-28" value={stock} onChange={(e) => setStock(Math.max(0, Math.round(Number(e.target.value))))} /></div>
          <Button size="sm" onClick={generate} disabled={busy}>Generate / توليد</Button>
        </div>
      </div>

      <div className="overflow-x-auto rounded-2xl border">
        <table className="w-full text-sm">
          <thead className="bg-secondary text-xs text-muted-foreground"><tr><th className="p-2 text-start">Size</th><th className="text-start">Color</th><th className="text-start">SKU</th><th>Stock</th><th>Price override</th><th>Active</th><th /></tr></thead>
          <tbody className="divide-y">
            {(q.data ?? []).map((v) => (
              <tr key={v.id}>
                <td className="p-2 font-semibold">{v.size ?? "—"}</td>
                <td><span className="flex items-center gap-1">{v.color_hex && <span className="h-3 w-3 rounded-full border" style={{ background: v.color_hex }} />}{v.color_ar ?? "—"}</span></td>
                <td><Input aria-label={`SKU ${[v.size, v.color_en].filter(Boolean).join(" / ")}`} dir="ltr" className="h-8 w-36" defaultValue={v.sku ?? ""} onBlur={(e) => e.target.value !== (v.sku ?? "") && update(v.id, { sku: e.target.value || null })} /></td>
                <td><Input aria-label={`المخزون / Stock ${[v.size, v.color_en].filter(Boolean).join(" / ")}`} type="number" min={0} className="h-8 w-20" defaultValue={v.stock} onBlur={(e) => Number(e.target.value) !== v.stock && update(v.id, { stock: Math.max(0, Math.round(Number(e.target.value))) })} /></td>
                <td><Input aria-label={`سعر خاص / Price override ${[v.size, v.color_en].filter(Boolean).join(" / ")}`} type="number" step="any" placeholder="—" className="h-8 w-24" defaultValue={v.price ?? ""} onBlur={(e) => update(v.id, { price: e.target.value === "" ? null : Number(e.target.value) })} /></td>
                <td className="text-center"><Switch aria-label={`نشط / Active ${[v.size, v.color_en].filter(Boolean).join(" / ")}`} checked={v.is_active} onCheckedChange={(c) => update(v.id, { is_active: c })} /></td>
                <td><Button size="icon" variant="ghost" aria-label={`حذف / Delete ${[v.size, v.color_en].filter(Boolean).join(" / ")}`} title="حذف / Delete" onClick={() => del(v.id)}><Trash2 className="h-4 w-4 text-destructive" /></Button></td>
              </tr>
            ))}
            {!q.data?.length && <tr><td colSpan={7} className="p-4 text-center text-muted-foreground">لا توجد اختيارات — المنتج يباع بمخزونه العام / No variants</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}
