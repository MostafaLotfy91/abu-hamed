import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { FileUp, Layers } from "lucide-react";
import { fetchCategories, profilesQuery } from "@/lib/queries";
import { profileOf, type FieldKey } from "@/lib/catalog";
import { useAuth } from "@/lib/auth";
import { CONCENTRATIONS, GENDERS, SEASONS } from "@/lib/fashion";
import { CrudPage } from "@/components/admin/CrudPage";
import { VariantEditor } from "@/components/admin/VariantEditor";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";

export const Route = createFileRoute("/_authenticated/admin/products")({ component: Page });

/** Bulk import lives in the Excel import wizard (validated, batched, undoable; accepts .xlsx and .csv). */
function ImportLink() {
  const { isAdmin } = useAuth();
  if (!isAdmin) return null;
  return (
    <Button variant="outline" size="sm" className="gap-1" asChild>
      <Link to="/admin/import"><FileUp className="h-4 w-4" />Excel / CSV</Link>
    </Button>
  );
}

type VariantTarget = { id: string; name: string; sku: string | null; sizes: string[] | null };

function Page() {
  const cats = useQuery({ queryKey: ["categories"], queryFn: fetchCategories });
  const [variantsFor, setVariantsFor] = useState<VariantTarget | null>(null);
  const options = (cats.data ?? []).map((c) => ({ value: c.id, label: c.name_ar }));
  const profiles = useQuery(profilesQuery);
  // The category's profile decides which optional fields the form shows and the size preset for variants.
  const profileFor = (r: Record<string, unknown>) => profileOf(r.category_id as string | null, cats.data ?? [], profiles.data ?? []);
  const uses = (field: FieldKey) => (r: Record<string, unknown>) => profileFor(r).fields.includes(field);
  return (
    <>
      <CrudPage table="products" title="المنتجات / Products" headerExtra={<ImportLink />}
        rowActions={(r) => (
          <Button size="icon" variant="ghost" title="Sizes & colors / المقاسات والألوان"
            onClick={() => setVariantsFor({ id: r.id as string, name: r.name_ar as string, sku: (r.sku as string) ?? null, sizes: profileFor(r).sizes })}>
            <Layers className="h-4 w-4" />
          </Button>
        )}
        fields={[
          { key: "images", label: "Images", type: "images", default: [], list: true },
          { key: "name_ar", label: "الاسم (عربي)", required: true, list: true },
          { key: "name_en", label: "Name (EN)", required: true },
          { key: "category_id", label: "Category / القسم", type: "select", options, list: true },
          { key: "brand", label: "Brand / الماركة", list: true },
          { key: "sku", label: "SKU" },
          { key: "price", label: "Price / السعر", type: "number", required: true, list: true },
          { key: "old_price", label: "Old price", type: "number" },
          { key: "stock", label: "Stock (بدون اختيارات فقط) / Stock if no variants", type: "number", default: 0, required: true, list: true },
          { key: "flash_price", label: "Flash price", type: "number" },
          { key: "flash_ends_at", label: "Flash ends", type: "datetime" },
          { key: "gender", label: "الفئة / Gender", type: "select", options: GENDERS.map((g) => ({ value: g.value, label: `${g.ar} / ${g.en}` })), show: uses("gender") },
          { key: "season", label: "الموسم / Season", type: "select", options: SEASONS.map((g) => ({ value: g.value, label: `${g.ar} / ${g.en}` })), show: uses("season") },
          { key: "material_ar", label: "الخامة", show: uses("material") },
          { key: "material_en", label: "Material (EN)", show: uses("material") },
          { key: "care_ar", label: "تعليمات العناية", type: "textarea", show: uses("care") },
          { key: "care_en", label: "Care instructions (EN)", type: "textarea", show: uses("care") },
          { key: "description_ar", label: "الوصف", type: "textarea" },
          { key: "description_en", label: "Description (EN)", type: "textarea" },
          { key: "top_notes", label: "عطر: المقدمة / Top notes", show: uses("notes") },
          { key: "middle_notes", label: "عطر: القلب / Heart notes", show: uses("notes") },
          { key: "base_notes", label: "عطر: القاعدة / Base notes", show: uses("notes") },
          { key: "volume_ml", label: "عطر: الحجم (مل) / Volume ml", type: "number", show: uses("volume") },
          { key: "concentration", label: "عطر: التركيز / Concentration", type: "select", options: CONCENTRATIONS.map((c) => ({ value: c, label: c })), show: uses("concentration") },
          { key: "is_featured", label: "Featured", type: "bool", default: false },
          { key: "is_active", label: "Active", type: "bool", list: true },
        ]} />
      <Dialog open={!!variantsFor} onOpenChange={(o) => !o && setVariantsFor(null)}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-3xl">
          <DialogHeader><DialogTitle>{variantsFor?.name} — المقاسات والألوان</DialogTitle></DialogHeader>
          {variantsFor && <VariantEditor productId={variantsFor.id} sku={variantsFor.sku} sizes={variantsFor.sizes} />}
        </DialogContent>
      </Dialog>
    </>
  );
}
