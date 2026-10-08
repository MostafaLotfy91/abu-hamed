import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { useI18n } from "@/lib/i18n";
import { categoryImagesQuery, fetchCategories } from "@/lib/queries";
import { ErrorState, EmptyState } from "@/components/store/states";
import { Skeleton } from "@/components/ui/skeleton";
import { pageHead } from "@/lib/seo";
import { cn } from "@/lib/utils";
import { CategoryCard } from "@/components/store/CategoryCard";
import { profileKeyOf } from "@/lib/catalog";

export const Route = createFileRoute("/categories")({
  head: ({ matches }) => pageHead(matches, { title: { ar: "الأقسام", en: "Categories" } }),
  component: CategoriesPage,
});

function CategoriesPage() {
  const { t, tx, dir } = useI18n();
  // Own image or a real product photo per category (falls back to image_url if the view is unavailable).
  const images = useQuery(categoryImagesQuery);
  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ["categories"],
    queryFn: fetchCategories,
  });
  const [sel, setSel] = useState<string | null>(null);
  if (error) return <ErrorState onRetry={() => refetch()} />;
  if (isLoading)
    return (
      <div className="grid grid-cols-3 gap-3">
        {Array.from({ length: 9 }).map((_, i) => (
          <Skeleton key={i} className="aspect-square rounded-2xl" />
        ))}
      </div>
    );
  const all = (data ?? []).filter((c) => c.is_active);
  const roots = all.filter((c) => !c.parent_id);
  if (!roots.length) return <EmptyState title={t("no_products")} />;
  const active = sel ?? roots[0].id;
  const children = all.filter((c) => c.parent_id === active);
  const Chevron = dir === "rtl" ? ChevronLeft : ChevronRight;

  return (
    <div className="flex gap-3">
      <aside className="w-28 shrink-0 space-y-1 md:w-56">
        {roots.map((c) => (
          <button
            key={c.id}
            onClick={() => setSel(c.id)}
            className={cn(
              "w-full rounded-xl px-3 py-3 text-start text-sm font-semibold",
              c.id === active ? "bg-primary text-primary-foreground" : "bg-card hover:bg-accent",
            )}
          >
            {tx(c, "name")}
          </button>
        ))}
      </aside>
      <section className="flex-1 space-y-3">
        <Link
          to="/category/$id"
          params={{ id: active }}
          className="flex items-center justify-between rounded-2xl bg-primary-soft p-4 font-bold text-primary"
        >
          {t("all_products")} —{" "}
          {tx(
            roots.find((r) => r.id === active),
            "name",
          )}{" "}
          <Chevron className="h-4 w-4" />
        </Link>
        {children.length > 0 && (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
            {children.map((c) => (
              <CategoryCard
                key={c.id}
                id={c.id}
                name={tx(c, "name")}
                image={images.data?.get(c.id) ?? c.image_url}
                profileKey={profileKeyOf(c.id, all)}
                variant="card"
              />
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
