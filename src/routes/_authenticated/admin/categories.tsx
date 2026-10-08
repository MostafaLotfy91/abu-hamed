import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { fetchCategories, profilesQuery } from "@/lib/queries";
import { CrudPage } from "@/components/admin/CrudPage";
import { useBi } from "@/lib/bilingual";

export const Route = createFileRoute("/_authenticated/admin/categories")({ component: Page });

function Page() {
  const bi = useBi();
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
  return (
    <CrudPage
      table="categories"
      title={bi("الأقسام / Categories")}
      order="sort_order"
      ascending
      fields={[
        { key: "image_url", label: "Image", type: "image", list: true },
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
