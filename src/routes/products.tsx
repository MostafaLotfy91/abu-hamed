import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { useI18n } from "@/lib/i18n";
import { ProductListing } from "@/components/store/ProductListing";

export const Route = createFileRoute("/products")({
  validateSearch: z.object({ q: z.string().optional() }),
  head: () => ({
    meta: [
      { title: "كل المنتجات · All products" },
      { name: "description", content: "تصفح وابحث في كل منتجات المتجر. Browse and search all products." },
      { property: "og:title", content: "كل المنتجات · All products" },
      { property: "og:description", content: "Browse and search all products." },
    ],
  }),
  component: ProductsPage,
});

function ProductsPage() {
  const { q } = Route.useSearch();
  const { t } = useI18n();
  return <ProductListing key={q ?? ""} base={{ q }} title={q ? `${t("results_for")} "${q}"` : t("all_products")} />;
}
