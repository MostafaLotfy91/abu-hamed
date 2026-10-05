import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { fetchCategories } from "@/lib/queries";
import { CrudPage } from "@/components/admin/CrudPage";

export const Route = createFileRoute("/_authenticated/admin/categories")({ component: Page });

function Page() {
  const cats = useQuery({ queryKey: ["categories"], queryFn: fetchCategories });
  const options = (cats.data ?? []).map((c) => ({ value: c.id, label: `${c.name_ar} / ${c.name_en}` }));
  return (
    <CrudPage table="categories" title="الأقسام / Categories" order="sort_order" ascending fields={[
      { key: "image_url", label: "Image", type: "image", list: true },
      { key: "name_ar", label: "الاسم (عربي)", required: true, list: true },
      { key: "name_en", label: "Name (EN)", required: true, list: true },
      { key: "parent_id", label: "Parent / القسم الأب", type: "select", options, list: true },
      { key: "sort_order", label: "Sort", type: "number", default: 0, list: true },
      { key: "is_active", label: "Active", type: "bool", list: true },
    ]} />
  );
}
