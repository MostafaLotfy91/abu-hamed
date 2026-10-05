import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { FileUp, Layers } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { fetchCategories } from "@/lib/queries";
import { parseCsv } from "@/lib/csv";
import { CrudPage } from "@/components/admin/CrudPage";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";

export const Route = createFileRoute("/_authenticated/admin/products")({ component: Page });

const UNITS = [
  { value: "piece", label: "Piece / قطعة" }, { value: "kg", label: "Kg / كجم" }, { value: "gram", label: "Gram / جم" },
  { value: "pack", label: "Pack / عبوة" }, { value: "liter", label: "Liter / لتر" },
];

function CsvImport() {
  const qc = useQueryClient();
  const [busy, setBusy] = useState(false);
  const run = async (file: File) => {
    setBusy(true);
    try {
      const rows = parseCsv(await file.text());
      const cats = await fetchCategories();
      const findCat = (v: string) => cats.find((c) => c.id === v || c.name_ar === v || c.name_en.toLowerCase() === v.toLowerCase())?.id ?? null;
      const num = (v: string | undefined, d: number | null = null) => (v === undefined || v === "" ? d : Number(v));
      const payload = rows.filter((r) => r.name_ar && r.price).map((r) => ({
        name_ar: r.name_ar, name_en: r.name_en || r.name_ar, price: Number(r.price), old_price: num(r.old_price),
        unit: UNITS.some((u) => u.value === r.unit) ? r.unit : "piece", step: num(r.step, 1)!, min_qty: num(r.min_qty, 1)!,
        stock: num(r.stock, 0)!, brand: r.brand || null, sku: r.sku || null, category_id: r.category ? findCat(r.category) : null,
        images: r.image_url ? r.image_url.split("|") : [], description_ar: r.description_ar || null, description_en: r.description_en || null,
      }));
      if (!payload.length) throw new Error("No valid rows (need name_ar, price)");
      const withSku = payload.filter((p) => p.sku), noSku = payload.filter((p) => !p.sku);
      if (withSku.length) { const { error } = await supabase.from("products").upsert(withSku, { onConflict: "sku" }); if (error) throw error; }
      if (noSku.length) { const { error } = await supabase.from("products").insert(noSku); if (error) throw error; }
      toast.success(`Imported ${payload.length}`);
      qc.invalidateQueries({ queryKey: ["admin", "products"] });
    } catch (e) { toast.error((e as Error).message); }
    setBusy(false);
  };
  return (
    <label className="inline-flex h-9 cursor-pointer items-center gap-1 rounded-md border px-3 text-sm" title="Columns: name_ar,name_en,price,old_price,unit,step,min_qty,stock,brand,sku,category,image_url,description_ar,description_en">
      <FileUp className="h-4 w-4" />{busy ? "..." : "CSV"}
      <input type="file" accept=".csv,text/csv" hidden onChange={(e) => { const f = e.target.files?.[0]; if (f) run(f); e.target.value = ""; }} />
    </label>
  );
}

function Page() {
  const cats = useQuery({ queryKey: ["categories"], queryFn: fetchCategories });
  const [variantsFor, setVariantsFor] = useState<{ id: string; name: string } | null>(null);
  const options = (cats.data ?? []).map((c) => ({ value: c.id, label: c.name_ar }));
  return (
    <>
      <CrudPage table="products" title="المنتجات / Products" headerExtra={<CsvImport />}
        rowActions={(r) => <Button size="icon" variant="ghost" title="Variants" onClick={() => setVariantsFor({ id: r.id as string, name: r.name_ar as string })}><Layers className="h-4 w-4" /></Button>}
        fields={[
          { key: "images", label: "Images", type: "images", default: [], list: true },
          { key: "name_ar", label: "الاسم (عربي)", required: true, list: true },
          { key: "name_en", label: "Name (EN)", required: true },
          { key: "category_id", label: "Category / القسم", type: "select", options, list: true },
          { key: "brand", label: "Brand" },
          { key: "sku", label: "SKU" },
          { key: "price", label: "Price", type: "number", required: true, list: true },
          { key: "old_price", label: "Old price", type: "number" },
          { key: "unit", label: "Unit", type: "select", options: UNITS, default: "piece", required: true, list: true },
          { key: "step", label: "Qty step (e.g. 0.5)", type: "number", default: 1, required: true },
          { key: "min_qty", label: "Min qty", type: "number", default: 1, required: true },
          { key: "stock", label: "Stock", type: "number", default: 0, required: true, list: true },
          { key: "flash_price", label: "Flash price", type: "number" },
          { key: "flash_ends_at", label: "Flash ends", type: "datetime" },
          { key: "description_ar", label: "الوصف", type: "textarea" },
          { key: "description_en", label: "Description (EN)", type: "textarea" },
          { key: "is_featured", label: "Featured", type: "bool", default: false },
          { key: "is_active", label: "Active", type: "bool", list: true },
        ]} />
      <Dialog open={!!variantsFor} onOpenChange={(o) => !o && setVariantsFor(null)}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-3xl">
          <DialogHeader><DialogTitle>{variantsFor?.name}</DialogTitle></DialogHeader>
          {variantsFor && (
            <CrudPage table="product_variants" title="Variants / الاختيارات" order="sort_order" ascending filter={{ product_id: variantsFor.id }} fixed={{ product_id: variantsFor.id }} fields={[
              { key: "name_ar", label: "الاسم", required: true, list: true },
              { key: "name_en", label: "Name (EN)", required: true, list: true },
              { key: "price", label: "Price", type: "number", required: true, list: true },
              { key: "old_price", label: "Old price", type: "number" },
              { key: "stock", label: "Stock", type: "number", default: 0, list: true },
              { key: "sort_order", label: "Sort", type: "number", default: 0 },
              { key: "is_active", label: "Active", type: "bool", list: true },
            ]} />
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
