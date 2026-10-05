import { createFileRoute, Link } from "@tanstack/react-router";
import { useI18n } from "@/lib/i18n";
import { useCart } from "@/lib/cart";
import { CartLines, CartTotals } from "@/components/store/CartContents";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/cart")({
  head: () => ({
    meta: [
      { title: "سلة المشتريات · Cart" },
      { name: "description", content: "راجع منتجاتك قبل إتمام الطلب. Review your cart before checkout." },
      { property: "og:title", content: "سلة المشتريات · Cart" },
      { property: "og:description", content: "Review your cart before checkout." },
    ],
  }),
  component: CartPage,
});

function CartPage() {
  const { t } = useI18n();
  const cart = useCart();
  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_380px]">
      <section className="rounded-3xl bg-card p-4 shadow-card">
        <h1 className="mb-2 text-xl font-extrabold">{t("cart")}</h1>
        <CartLines />
      </section>
      {cart.items.length > 0 && (
        <aside className="h-fit space-y-4 rounded-3xl bg-card p-4 shadow-card lg:sticky lg:top-20">
          <CartTotals />
          <Button asChild size="lg" className="w-full font-bold"><Link to="/checkout">{t("checkout")}</Link></Button>
        </aside>
      )}
    </div>
  );
}
