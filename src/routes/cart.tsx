import { createFileRoute, Link } from "@tanstack/react-router";
import { useI18n } from "@/lib/i18n";
import { useCart } from "@/lib/cart";
import { CartLines, CartTotals } from "@/components/store/CartContents";
import { pageHead } from "@/lib/seo";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/cart")({
  head: ({ matches }) =>
    pageHead(matches, { title: { ar: "سلة المشتريات", en: "Cart" }, noindex: true }),
  component: CartPage,
});

function CartPage() {
  const { t } = useI18n();
  const cart = useCart();
  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_380px]">
      <section>
        <h1 className="mb-2 border-b pb-3 text-xl font-bold tracking-tight md:text-2xl">
          {t("cart")}{" "}
          {cart.count > 0 && (
            <span className="text-base font-normal text-muted-foreground">
              {t("items_in_cart").replace("{n}", String(cart.count))}
            </span>
          )}
        </h1>
        <CartLines />
      </section>
      {cart.items.length > 0 && (
        <aside className="h-fit space-y-4 rounded-md border p-5 lg:sticky lg:top-20">
          <CartTotals />
          <Button asChild size="lg" className="h-12 w-full font-semibold">
            <Link to="/checkout">{t("checkout")}</Link>
          </Button>
        </aside>
      )}
    </div>
  );
}
