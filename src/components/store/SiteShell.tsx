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
import { useAtTop } from "@/lib/hero-header";

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

/** `plate`: a light backing for logos drawn for light backgrounds (dark mode, or over the hero image). */
export function StoreLogo({ plate = false }: { plate?: boolean } = {}) {
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
          className={cn(
            "h-9 w-auto max-w-[120px] object-contain md:h-11 md:max-w-[160px] dark:rounded-sm dark:bg-white dark:p-0.5",
            plate && "rounded-sm bg-white/90 p-0.5",
          )}
        />
      ) : (
        <span className="max-w-[40vw] truncate font-display text-xl sm:hidden">{name}</span>
      )}
      <span className="hidden max-w-[16rem] truncate whitespace-nowrap font-display text-2xl sm:inline">
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
  // Home: the header floats over the full-screen hero, transparent until the page scrolls.
  const home = path === "/";
  const clear = useAtTop(home) && home;

  return (
    <div className="min-h-screen pb-safe-nav md:pb-0">
      <header
        className={cn(
          "top-0 z-40 transition-[background-color,color,border-color] duration-500",
          home ? "fixed inset-x-0" : "sticky",
          clear
            ? "bg-gradient-to-b from-black/50 via-black/20 to-transparent text-white [&_button:hover]:bg-white/10"
            : "border-b bg-background/95 text-foreground backdrop-blur",
        )}
      >
        <div className="mx-auto flex max-w-[90rem] items-center gap-3 px-3 py-2 md:gap-4 md:px-10 md:py-3">
          <StoreLogo plate={clear} />
          <div className="flex-1 md:max-w-sm">
            <SearchBox onImage={clear} />
          </div>
          <div className="hidden flex-1 md:block" />
          <nav className="hidden items-center gap-1 md:flex">
            {NAV.filter((n) => n.to !== "/cart").map((n) => (
              <Link
                key={n.to}
                to={n.to}
                className="link-luxe mx-3 py-1 text-sm font-medium"
                activeProps={{ style: { backgroundSize: "100% 1px" } }}
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
            className={cn(
              "relative hidden h-10 w-10 items-center justify-center rounded-full md:flex",
              clear ? "hover:bg-white/10" : "hover:bg-muted",
            )}
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
            <Button
              asChild
              size="sm"
              variant="outline"
              className={cn(
                "hidden md:inline-flex",
                clear && "border-white/60 bg-transparent text-white hover:bg-white/10",
              )}
            >
              <Link to="/auth">{t("sign_in")}</Link>
            </Button>
          )}
        </div>
      </header>

      {/* The home page lays out its own full-bleed sections; other pages use the standard column. */}
      <main className={home ? undefined : "mx-auto max-w-7xl px-3 py-4 md:px-6"}>{children}</main>
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
                  "relative flex min-h-14 flex-col items-center justify-center gap-0.5 py-2 text-[11px] font-medium",
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
    <div className="mb-6 flex items-end justify-between gap-2 md:mb-8">
      <h2 className="font-display text-2xl md:text-3xl">{title}</h2>
      {action}
    </div>
  );
}
