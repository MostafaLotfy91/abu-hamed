import { createFileRoute, Link, Outlet } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import {
  PanelLeftClose,
  PanelLeftOpen,
  BarChart3,
  FileSpreadsheet,
  Sparkles,
  Bike,
  FolderTree,
  Image,
  Package,
  ReceiptText,
  Settings,
  Store,
  Ticket,
  Undo2,
} from "lucide-react";
import { useAuth } from "@/lib/auth";
import { useI18n } from "@/lib/i18n";
import { useSettings } from "@/lib/store-settings";
import { StoreLogo } from "@/components/store/SiteShell";
import { EmptyState } from "@/components/store/states";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { pageHead } from "@/lib/seo";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/admin")({
  head: ({ matches }) =>
    pageHead(matches, { title: { ar: "لوحة التحكم", en: "Admin" }, noindex: true }),
  component: AdminLayout,
});

const LINKS = [
  { to: "/admin", icon: BarChart3, ar: "الإحصائيات", en: "Dashboard", exact: true },
  {
    to: "/admin/insights",
    icon: Sparkles,
    ar: "التحليلات الذكية",
    en: "AI insights",
    adminFlag: "ai_analytics",
  },
  { to: "/admin/orders", icon: ReceiptText, ar: "الطلبات", en: "Orders" },
  { to: "/admin/returns", icon: Undo2, ar: "الاسترجاع", en: "Returns" },
  { to: "/admin/drivers", icon: Bike, ar: "المندوبين", en: "Drivers" },
  { to: "/admin/products", icon: Package, ar: "المنتجات", en: "Products" },
  {
    to: "/admin/import",
    icon: FileSpreadsheet,
    ar: "استيراد Excel",
    en: "Excel import",
    adminOnly: true,
  },
  { to: "/admin/categories", icon: FolderTree, ar: "الأقسام", en: "Categories" },
  { to: "/admin/banners", icon: Image, ar: "البانرات", en: "Banners", adminOnly: true },
  { to: "/admin/coupons", icon: Ticket, ar: "الكوبونات", en: "Coupons", adminOnly: true },
  { to: "/admin/settings", icon: Settings, ar: "إعدادات المتجر", en: "Store settings" },
] as const;

function AdminLayout() {
  const { isStaff, isAdmin, rolesLoading } = useAuth();
  const { features } = useSettings();
  const { lang, toggle, t } = useI18n();
  const [collapsed, setCollapsed] = useState(false);
  useEffect(() => {
    setCollapsed(localStorage.getItem("admin-sidebar") === "1");
  }, []);
  const flip = () =>
    setCollapsed((c) => {
      localStorage.setItem("admin-sidebar", c ? "0" : "1");
      return !c;
    });
  if (rolesLoading)
    return (
      <div className="p-6">
        <Skeleton className="h-40" />
      </div>
    );
  if (!isStaff)
    return (
      <div className="flex min-h-screen items-center justify-center p-4">
        <EmptyState
          title={lang === "ar" ? "غير مصرح لك بالدخول" : "You don't have access"}
          hint={lang === "ar" ? "هذه الصفحة للإدارة فقط" : "This area is for store staff only"}
          action={
            <Button asChild>
              <Link to="/">{t("home")}</Link>
            </Button>
          }
        />
      </div>
    );
  return (
    <div className="min-h-screen bg-background md:flex">
      <aside
        className={cn(
          "no-print border-b bg-card transition-[width] md:sticky md:top-0 md:flex md:h-screen md:flex-col md:border-e md:border-b-0",
          collapsed ? "md:w-16" : "md:w-60",
        )}
      >
        <div
          className={cn(
            "flex items-center justify-between gap-1 p-4",
            collapsed && "md:flex-col md:px-2",
          )}
        >
          <div className={cn(collapsed && "md:hidden")}>
            <StoreLogo />
          </div>
          <div className="flex items-center gap-1">
            <Button
              size="sm"
              variant="ghost"
              className={cn(collapsed && "md:hidden")}
              onClick={toggle}
            >
              {t("language")}
            </Button>
            <Button
              size="icon"
              variant="ghost"
              className="hidden h-8 w-8 md:inline-flex"
              onClick={flip}
              aria-label={collapsed ? "Expand menu" : "Collapse menu"}
            >
              {collapsed ? (
                <PanelLeftOpen className="h-4 w-4 rtl:-scale-x-100" />
              ) : (
                <PanelLeftClose className="h-4 w-4 rtl:-scale-x-100" />
              )}
            </Button>
          </div>
        </div>
        <nav className="flex gap-1 overflow-x-auto px-2 pb-2 md:flex-1 md:flex-col md:overflow-y-auto md:overflow-x-visible">
          {LINKS.filter(
            (l) =>
              ("adminOnly" in l ? isAdmin : true) &&
              (!("adminFlag" in l) || (isAdmin && features[l.adminFlag])),
          ).map((l) => (
            <Link
              key={l.to}
              to={l.to}
              activeOptions={{ exact: "exact" in l }}
              title={lang === "ar" ? l.ar : l.en}
              className={cn(
                "flex shrink-0 items-center gap-2 rounded-md px-3 py-2 text-sm font-medium text-muted-foreground hover:bg-muted hover:text-foreground",
                collapsed && "md:justify-center md:px-0",
              )}
              activeProps={{ className: "bg-foreground !text-background hover:bg-foreground" }}
            >
              <l.icon className="h-4 w-4 shrink-0" />
              <span className={cn(collapsed && "md:sr-only")}>{lang === "ar" ? l.ar : l.en}</span>
            </Link>
          ))}
          <Link
            to="/"
            title={lang === "ar" ? "المتجر" : "Storefront"}
            className={cn(
              "flex shrink-0 items-center gap-2 rounded-md px-3 py-2 text-sm text-muted-foreground hover:bg-muted md:mt-auto",
              collapsed && "md:justify-center md:px-0",
            )}
          >
            <Store className="h-4 w-4 shrink-0" />
            <span className={cn(collapsed && "md:sr-only")}>
              {lang === "ar" ? "المتجر" : "Storefront"}
            </span>
          </Link>
        </nav>
      </aside>
      <main className="min-w-0 flex-1 p-4 md:p-8">
        <Outlet />
      </main>
    </div>
  );
}
