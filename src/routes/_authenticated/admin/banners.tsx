import { createFileRoute } from "@tanstack/react-router";
import { CrudPage } from "@/components/admin/CrudPage";
import { useBi } from "@/lib/bilingual";

export const Route = createFileRoute("/_authenticated/admin/banners")({ component: Page });

function Page() {
  const bi = useBi();
  return (
    <CrudPage
      table="banners"
      title={bi("البانرات / Banners")}
      order="sort_order"
      ascending
      fields={[
        { key: "image_url", label: "Image", type: "image", required: true, list: true },
        { key: "title_ar", label: "العنوان", list: true },
        { key: "title_en", label: "Title (EN)", list: true },
        { key: "subtitle_ar", label: "نص فرعي" },
        { key: "subtitle_en", label: "Subtitle (EN)" },
        { key: "link", label: "Link (e.g. /products)" },
        { key: "sort_order", label: "Sort", type: "number", default: 0, list: true },
        { key: "is_active", label: "Active", type: "bool", list: true },
      ]}
    />
  );
}
