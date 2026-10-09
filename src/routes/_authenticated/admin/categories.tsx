import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { ImageOff } from "lucide-react";
import { fetchCategories, profilesQuery } from "@/lib/queries";
import { CrudPage } from "@/components/admin/CrudPage";
import { CategoryBulkImages } from "@/components/admin/CategoryBulkImages";
import { Button } from "@/components/ui/button";
import { useBi } from "@/lib/bilingual";
import { useI18n } from "@/lib/i18n";
import { countLabel } from "@/lib/format";
import { usableImage } from "@/lib/category-image";

export const Route = createFileRoute("/_authenticated/admin/categories")({ component: Page });

function Page() {
  const bi = useBi();
  const { lang } = useI18n();
  const qc = useQueryClient();
  const [bulkOpen, setBulkOpen] = useState(false);
  const cats = useQuery({ queryKey: ["categories"], queryFn: fetchCategories });
  const profiles = useQuery(profilesQuery);
  const options = (cats.data ?? []).map((c) => ({
    value: c.id,
    label: `${c.name_ar} / ${c.name_en}`,
  }));
  // Empty = inherit the parent's profile (top-level categories without one use "general").
  const profileOptions = (profiles.data ?? []).map((p) => ({
    value: p.key,
    label: `${p.name_ar} / ${p.name_en}`,
  }));
  const missing = (cats.data ?? []).filter((c) => !usableImage(c.image_url));
  const refresh = () => {
    qc.invalidateQueries({ queryKey: ["categories"] });
    qc.invalidateQueries({ queryKey: ["admin", "categories"] });
    qc.invalidateQueries({ queryKey: ["category_display_images"] });
  };

  const notice = (
    <div className="space-y-3">
      {missing.length > 0 && (
        <div
          role="status"
          className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-brand-secondary/60 bg-brand-secondary/15 p-3 text-sm"
        >
          <span>
            <b>
              {countLabel(missing.length, lang, "category")} {bi("بدون صورة / without an image")}
            </b>
            {" — "}
            {bi(
              "المتجر يعرض صورة من منتجات القسم لحد ما ترفع صورة له / The shop shows a photo from the category's products until you upload one",
            )}
          </span>
        </div>
      )}
      {bulkOpen && <CategoryBulkImages categories={cats.data ?? []} onDone={refresh} />}
    </div>
  );

  return (
    <CrudPage
      table="categories"
      title={bi("الأقسام / Categories")}
      order="sort_order"
      ascending
      notice={notice}
      headerExtra={
        <Button size="sm" variant="outline" onClick={() => setBulkOpen((o) => !o)}>
          {bi("رفع صور مجمّع / Bulk images")}
        </Button>
      }
      renderCell={(f, r) =>
        f.key === "image_url" && !usableImage(r.image_url as string | null) ? (
          <span
            data-missing-image
            className="inline-flex items-center gap-1 rounded-full bg-destructive/10 px-2 py-0.5 text-xs font-semibold text-destructive"
          >
            <ImageOff className="h-3.5 w-3.5" />
            {bi("بدون صورة / No image")}
          </span>
        ) : undefined
      }
      fields={[
        { key: "image_url", label: "صورة / Image", type: "image", list: true },
        { key: "name_ar", label: "الاسم (عربي)", required: true, list: true },
        { key: "name_en", label: "Name (EN)", required: true, list: true },
        { key: "parent_id", label: "Parent / القسم الأب", type: "select", options, list: true },
        {
          key: "profile",
          label:
            "نوع المنتجات (فلاتر ومقاسات) — فارغ = مثل القسم الأب / Product type (filters, sizes) — empty = inherit",
          type: "select",
          options: profileOptions,
          list: true,
        },
        { key: "sort_order", label: "Sort", type: "number", default: 0, list: true },
        { key: "is_active", label: "Active", type: "bool", list: true },
      ]}
    />
  );
}
