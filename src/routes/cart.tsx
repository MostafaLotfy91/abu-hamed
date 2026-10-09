import { createFileRoute, Link } from "@tanstack/react-router";
import { useI18n } from "@/lib/i18n";
import { useCart } from "@/lib/cart";
import { CartLines, CartTotals } from "@/components/store/CartContents";
import { pageHead } from "@/lib/seo";
import { Button } from "@/components/ui/button";
import { formatCount } from "@/lib/format";

export const Route = createFileRoute("/cart")({
  head: ({ matches }) =>
    pageHead(matches, { title: { ar: "سلة المشتريات", en: "Cart" }, noindex: true }),
  component: CartPage,
});

function CartPage() {
  const { t, lang } = useI18n();
  const cart = useCart();
  return (
    <div className="grid gap-10 lg:grid-cols-[1fr_380px] lg:gap-16">
      <section>
        <h1 className="mb-2 border-b pb-5 font-display text-3xl md:text-4xl">
          {t("cart")}{" "}
          {cart.count > 0 && (
            <span className="text-base font-normal text-muted-foreground">
              {t("items_in_cart").replace("{n}", formatCount(cart.count, lang))}
            </span>
          )}
        </h1>
        <CartLines />
      </section>
      {cart.items.length > 0 && (
        <aside className="h-fit space-y-5 border bg-card p-6 lg:sticky lg:top-24">
          <CartTotals />
          <Button asChild size="lg" className="h-12 w-full">
            <Link to="/checkout">{t("checkout")}</Link>
          </Button>
        </aside>
      )}
    </div>
  );
}
