import { ShoppingAssistant } from "./ShoppingAssistant";
import { WhatsAppButton } from "./WhatsAppButton";
import { FloatingHelp } from "./FloatingHelp";
import { SiteFooter } from "./SiteFooter";
import type { ReactNode } from "react";
import { Link, useNavigate, useRouterState } from "@tanstack/react-router";
import {
  Bike,
  CheckCircle2,
  Home,
  LayoutGrid,
  Languages,
  LayoutDashboard,
  ReceiptText,
  ShoppingCart,
  User,
} from "lucide-react";
import { useI18n, type DictKey } from "@/lib/i18n";
import { useCart } from "@/lib/cart";
import { useAuth } from "@/lib/auth";
import { useSettings } from "@/lib/store-settings";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { SearchBox } from "./SearchBox";
import { CartLines, CartTotals } from "./CartContents";
import { cn } from "@/lib/utils";
import { ThemeToggle } from "@/lib/theme";
import { formatCount } from "@/lib/format";
import { usableImage } from "@/lib/category-image";

const NAV: {
  to: "/" | "/categories" | "/cart" | "/orders" | "/account";
  icon: typeof Home;
  key: DictKey;
}[] = [
  { to: "/", icon: Home, key: "home" },
  { to: "/categories", icon: LayoutGrid, key: "categories" },
  { to: "/cart", icon: ShoppingCart, key: "cart" },
  { to: "/orders", icon: ReceiptText, key: "orders" },
  { to: "/account", icon: User, key: "account" },
];

export function StoreLogo() {
  const { settings } = useSettings();
  const { tx } = useI18n();
  const name = tx(settings as Record<string, unknown> | null, "name");
  return (
    // Logo keeps its own proportions (wide wordmarks or square marks); the name shows when there is no logo,
    // and next to the logo from tablet width up.
    <Link to="/" aria-label={name} className="flex min-h-11 shrink-0 items-center gap-2">
      {usableImage(settings?.logo_url) ? (
        <img
          src={usableImage(settings?.logo_url)!}
          alt=""
          width={160}
          height={44}
          // Logos are usually drawn for a light background: give them a light plate in dark mode.
          className="h-9 w-auto max-w-[120px] object-contain md:h-11 md:max-w-[160px] dark:rounded-md dark:bg-white dark:p-0.5"
        />
      ) : (
        <span className="max-w-[40vw] truncate text-lg font-extrabold tracking-tight sm:hidden">
          {name}
        </span>
      )}
      <span className="hidden max-w-[16rem] truncate whitespace-nowrap text-xl font-extrabold tracking-tight sm:inline">
        {name}
      </span>
    </Link>
  );
}

export function SiteShell({ children }: { children: ReactNode }) {
  const { t, toggle, lang } = useI18n();
  const cart = useCart();
  const { isStaff, user, roles } = useAuth();
  const isDriver = roles.includes("driver");
  const nav = useNavigate();
  const path = useRouterState({ select: (s) => s.location.pathname });

  return (
    <div className="min-h-screen pb-safe-nav md:pb-0">
      <header className="sticky top-0 z-40 border-b bg-background/95 backdrop-blur">
        <div className="mx-auto flex max-w-7xl items-center gap-3 px-3 py-2 md:px-6">
          <StoreLogo />
          <div className="flex-1">
            <SearchBox />
          </div>
          <nav className="hidden items-center gap-1 md:flex">
            {NAV.filter((n) => n.to !== "/cart").map((n) => (
              <Link
                key={n.to}
                to={n.to}
                className="px-3 py-2 text-sm font-semibold underline-offset-8 hover:underline"
                activeProps={{ className: "underline" }}
                activeOptions={{ exact: n.to === "/" }}
              >
                {t(n.key)}
              </Link>
            ))}
          </nav>
          {isStaff && (
            <Button asChild variant="ghost" size="icon" aria-label={t("admin")}>
              <Link to="/admin">
                <LayoutDashboard className="h-5 w-5" />
              </Link>
            </Button>
          )}
          {isDriver && (
            <Button
              asChild
              size="sm"
              className="gap-1 px-2"
              aria-label={lang === "ar" ? "تطبيق المندوب" : "Driver app"}
            >
              <Link to="/driver">
                <Bike className="h-4 w-4" />
                <span className="hidden sm:inline">
                  {lang === "ar" ? "تطبيق المندوب" : "Driver app"}
                </span>
              </Link>
            </Button>
          )}
          <ThemeToggle ar={lang === "ar"} className="h-11 w-11" />
          <Button
            variant="ghost"
            size="sm"
            onClick={toggle}
            className="h-11 min-w-11 gap-1 px-2"
            aria-label={lang === "ar" ? "English" : "العربية"}
          >
            <Languages className="h-4 w-4" />
            <span className="hidden sm:inline">{t("language")}</span>
          </Button>
          <button
            onClick={() => cart.setDrawerOpen(true)}
            className="relative hidden h-10 w-10 items-center justify-center rounded-full hover:bg-muted md:flex"
            aria-label={t("cart")}
          >
            <ShoppingCart className="h-5 w-5" />
            {cart.count > 0 && (
              <span className="absolute -end-1 -top-1 flex h-5 min-w-5 items-center justify-center rounded-full bg-brand-secondary px-1 text-xs font-bold text-brand-secondary-foreground">
                {cart.count}
              </span>
            )}
          </button>
          {!user && (
            <Button asChild size="sm" variant="outline" className="hidden md:inline-flex">
              <Link to="/auth">{t("sign_in")}</Link>
            </Button>
          )}
        </div>
      </header>

      <main className="mx-auto max-w-7xl px-3 py-4 md:px-6">{children}</main>
      <SiteFooter />
      <ShoppingAssistant />
      <WhatsAppButton />
      <FloatingHelp />

      <nav
        className="fixed inset-x-0 bottom-0 z-40 border-t bg-background md:hidden"
        style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
      >
        <div className="grid grid-cols-5">
          {NAV.map((n) => {
            const active = n.to === "/" ? path === "/" : path.startsWith(n.to);
            return (
              <Link
                key={n.to}
                to={n.to}
                className={cn(
                  "relative flex min-h-14 flex-col items-center justify-center gap-0.5 py-2 text-[11px] font-semibold",
                  active ? "text-foreground" : "text-muted-foreground",
                )}
              >
                <n.icon className="h-5 w-5" />
                {t(n.key)}
                {n.to === "/cart" && cart.count > 0 && (
                  <span className="absolute end-1/4 top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-brand-secondary px-1 text-[10px] font-bold text-brand-secondary-foreground">
                    {cart.count}
                  </span>
                )}
              </Link>
            );
          })}
        </div>
      </nav>

      <Sheet open={cart.drawerOpen} onOpenChange={cart.setDrawerOpen}>
        <SheetContent
          side={lang === "ar" ? "left" : "right"}
          className="flex w-full flex-col gap-0 p-0 sm:max-w-md"
        >
          <SheetHeader className="border-b p-4 text-start">
            <SheetTitle className="text-base font-semibold">
              {t("cart")}{" "}
              {cart.count > 0 && (
                <span className="font-normal text-muted-foreground">
                  {t("items_in_cart").replace("{n}", formatCount(cart.count, lang))}
                </span>
              )}
            </SheetTitle>
          </SheetHeader>
          {cart.lastAdded && (
            <p
              role="status"
              className="flex items-center gap-2 border-b bg-success/10 px-4 py-2 text-sm font-semibold text-success"
            >
              <CheckCircle2 className="h-4 w-4" />
              {t("added_to_cart")}
            </p>
          )}
          <div className="flex-1 overflow-y-auto px-4">
            <CartLines onNavigate={() => cart.setDrawerOpen(false)} />
          </div>
          {cart.items.length > 0 && (
            <div className="space-y-3 border-t p-4">
              <CartTotals />
              <Button
                size="lg"
                className="h-12 w-full font-semibold"
                onClick={() => {
                  cart.setDrawerOpen(false);
                  nav({ to: "/checkout" });
                }}
              >
                {t("checkout")}
              </Button>
              <div className="grid grid-cols-2 gap-2">
                <Button variant="outline" onClick={() => cart.setDrawerOpen(false)}>
                  {t("continue_shopping")}
                </Button>
                <Button
                  variant="outline"
                  onClick={() => {
                    cart.setDrawerOpen(false);
                    nav({ to: "/cart" });
                  }}
                >
                  {t("view_cart")}
                </Button>
              </div>
            </div>
          )}
        </SheetContent>
      </Sheet>
    </div>
  );
}

export function SectionHeader({ title, action }: { title: ReactNode; action?: ReactNode }) {
  return (
    <div className="mb-4 flex items-end justify-between gap-2">
      <h2 className="text-lg font-bold tracking-tight md:text-2xl">{title}</h2>
      {action}
    </div>
  );
}
