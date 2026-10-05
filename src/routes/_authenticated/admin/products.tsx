import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { FileUp, Layers } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { fetchCategories } from "@/lib/queries";
import { parseCsv } from "@/lib/csv";
import { COLORS, CONCENTRATIONS, GENDERS, SEASONS, SIZE_TYPE_OPTIONS, type SizeType } from "@/lib/fashion";
import { CrudPage } from "@/components/admin/CrudPage";
import { VariantEditor } from "@/components/admin/VariantEditor";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";

export const Route = createFileRoute("/_authenticated/admin/products")({ component: Page });

const CSV_HELP =
  "One row per variant. Product columns: name_ar,name_en,price,old_price,stock,brand,sku,category,image_url,description_ar,description_en,gender,season,material_ar,size_type. " +
  "Variant columns (optional): size,color,variant_sku,variant_stock,variant_price. Rows sharing the same sku are grouped into one product.";

function CsvImport() {
  const qc = useQueryClient();
  const [busy, setBusy] = useState(false);
  const run = async (file: File) => {
    setBusy(true);
    try {
      const rows = parseCsv(await file.text()).filter((r) => r.name_ar && r.price);
      if (!rows.length) throw new Error("No valid rows (need name_ar, price)");
      const cats = await fetchCategories();
      const findCat = (v: string) => cats.find((c) => c.id === v || c.name_ar === v || c.name_en.toLowerCase() === v.toLowerCase())?.id ?? null;
      const num = (v: string | undefined) => (v === undefined || v === "" ? null : Number(v));
      const oneOf = <T extends string>(v: string | undefined, list: readonly T[]) => (list.includes(v as T) ? (v as T) : null);
      const groups = new Map<string, Record<string, string>[]>();
      rows.forEach((r, i) => { const k = r.sku || `__row${i}`; groups.set(k, [...(groups.get(k) ?? []), r]); });
      let products = 0, variants = 0;
      for (const [, g] of groups) {
        const r = g[0];
        const payload = {
          name_ar: r.name_ar, name_en: r.name_en || r.name_ar, price: Number(r.price), old_price: num(r.old_price),
          stock: Math.max(0, Math.round(num(r.stock) ?? 0)), brand: r.brand || null, sku: r.sku || null,
          category_id: r.category ? findCat(r.category) : null, images: r.image_url ? r.image_url.split("|") : [],
          description_ar: r.description_ar || null, description_en: r.description_en || null,
          gender: oneOf(r.gender, ["men", "women", "kids", "unisex"] as const), season: oneOf(r.season, ["summer", "winter", "all"] as const),
          material_ar: r.material_ar || null, size_type: oneOf(r.size_type, ["clothes", "shoes", "kids", "none"] as const),
        };
        const res = payload.sku
          ? await supabase.from("products").upsert(payload, { onConflict: "sku" }).select("id").single()
          : await supabase.from("products").insert(payload).select("id").single();
        if (res.error) throw res.error;
        products++;
        const vrows = g.filter((x) => x.size || x.color).map((x, i) => {
          const c = COLORS.find((cc) => cc.en.toLowerCase() === (x.color ?? "").toLowerCase() || cc.ar === x.color);
          return {
            product_id: res.data.id, size: x.size || null, color_en: c?.en ?? (x.color || null), color_ar: c?.ar ?? (x.color || null), color_hex: c?.hex ?? null,
            name_ar: [x.size, c?.ar ?? x.color].filter(Boolean).join(" / "), name_en: [x.size, c?.en ?? x.color].filter(Boolean).join(" / "),
            sku: x.variant_sku || null, stock: Math.max(0, Math.round(num(x.variant_stock) ?? 0)), price: num(x.variant_price), sort_order: i,
          };
        });
        if (vrows.length) {
          await supabase.from("product_variants").delete().eq("product_id", res.data.id);
          const { error } = await supabase.from("product_variants").insert(vrows);
          if (error) throw error;
          variants += vrows.length;
        }
      }
      toast.success(`Imported ${products} products, ${variants} variants`);
      qc.invalidateQueries({ queryKey: ["admin", "products"] });
    } catch (e) { toast.error((e as Error).message); }
    setBusy(false);
  };
  return (
    <label className="inline-flex h-9 cursor-pointer items-center gap-1 rounded-md border px-3 text-sm" title={CSV_HELP}>
      <FileUp className="h-4 w-4" />{busy ? "..." : "CSV"}
      <input type="file" accept=".csv,text/csv" hidden onChange={(e) => { const f = e.target.files?.[0]; if (f) run(f); e.target.value = ""; }} />
    </label>
  );
}

type VariantTarget = { id: string; name: string; sku: string | null; sizeType: SizeType };

function Page() {
  const cats = useQuery({ queryKey: ["categories"], queryFn: fetchCategories });
  const [variantsFor, setVariantsFor] = useState<VariantTarget | null>(null);
  const options = (cats.data ?? []).map((c) => ({ value: c.id, label: c.name_ar }));
  const sizeTypeOf = (r: Record<string, unknown>): SizeType => {
    if (r.size_type) return r.size_type as SizeType;
    const c = cats.data?.find((x) => x.id === r.category_id);
    const parent = c?.parent_id ? cats.data?.find((x) => x.id === c.parent_id) : null;
    return ((c?.size_type !== "none" ? c?.size_type : parent?.size_type) ?? c?.size_type ?? "none") as SizeType;
  };
  return (
    <>
      <CrudPage table="products" title="المنتجات / Products" headerExtra={<CsvImport />}
        rowActions={(r) => (
          <Button size="icon" variant="ghost" title="Sizes & colors / المقاسات والألوان"
            onClick={() => setVariantsFor({ id: r.id as string, name: r.name_ar as string, sku: (r.sku as string) ?? null, sizeType: sizeTypeOf(r) })}>
            <Layers className="h-4 w-4" />
          </Button>
        )}
        fields={[
          { key: "images", label: "Images", type: "images", default: [], list: true },
          { key: "name_ar", label: "الاسم (عربي)", required: true, list: true },
          { key: "name_en", label: "Name (EN)", required: true },
          { key: "category_id", label: "Category / القسم", type: "select", options, list: true },
          { key: "size_type", label: "نوع المقاس (اختياري، وإلا من القسم) / Size type", type: "select", options: SIZE_TYPE_OPTIONS },
          { key: "brand", label: "Brand / الماركة", list: true },
          { key: "sku", label: "SKU" },
          { key: "price", label: "Price / السعر", type: "number", required: true, list: true },
          { key: "old_price", label: "Old price", type: "number" },
          { key: "stock", label: "Stock (بدون اختيارات فقط) / Stock if no variants", type: "number", default: 0, required: true, list: true },
          { key: "flash_price", label: "Flash price", type: "number" },
          { key: "flash_ends_at", label: "Flash ends", type: "datetime" },
          { key: "gender", label: "الفئة / Gender", type: "select", options: GENDERS.map((g) => ({ value: g.value, label: `${g.ar} / ${g.en}` })) },
          { key: "season", label: "الموسم / Season", type: "select", options: SEASONS.map((g) => ({ value: g.value, label: `${g.ar} / ${g.en}` })) },
          { key: "material_ar", label: "الخامة" },
          { key: "material_en", label: "Material (EN)" },
          { key: "care_ar", label: "تعليمات العناية", type: "textarea" },
          { key: "care_en", label: "Care instructions (EN)", type: "textarea" },
          { key: "description_ar", label: "الوصف", type: "textarea" },
          { key: "description_en", label: "Description (EN)", type: "textarea" },
          { key: "top_notes", label: "عطر: المقدمة / Top notes" },
          { key: "middle_notes", label: "عطر: القلب / Heart notes" },
          { key: "base_notes", label: "عطر: القاعدة / Base notes" },
          { key: "volume_ml", label: "عطر: الحجم (مل) / Volume ml", type: "number" },
          { key: "concentration", label: "عطر: التركيز / Concentration", type: "select", options: CONCENTRATIONS.map((c) => ({ value: c, label: c })) },
          { key: "is_featured", label: "Featured", type: "bool", default: false },
          { key: "is_active", label: "Active", type: "bool", list: true },
        ]} />
      <Dialog open={!!variantsFor} onOpenChange={(o) => !o && setVariantsFor(null)}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-3xl">
          <DialogHeader><DialogTitle>{variantsFor?.name} — المقاسات والألوان</DialogTitle></DialogHeader>
          {variantsFor && <VariantEditor productId={variantsFor.id} sku={variantsFor.sku} sizeType={variantsFor.sizeType} />}
        </DialogContent>
      </Dialog>
    </>
  );
}
