import { createFileRoute, Link, Outlet } from "@tanstack/react-router";
import { BarChart3, FileSpreadsheet, Sparkles, Bike, FolderTree, Image, Package, ReceiptText, Settings, Store, Ticket, Undo2 } from "lucide-react";
import { useAuth } from "@/lib/auth";
import { useI18n } from "@/lib/i18n";
import { useSettings } from "@/lib/store-settings";
import { StoreLogo } from "@/components/store/SiteShell";
import { EmptyState } from "@/components/store/states";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";

export const Route = createFileRoute("/_authenticated/admin")({
  head: () => ({ meta: [{ title: "لوحة التحكم · Admin" }, { name: "robots", content: "noindex" }] }),
  component: AdminLayout,
});

const LINKS = [
  { to: "/admin", icon: BarChart3, ar: "الإحصائيات", en: "Dashboard", exact: true },
  { to: "/admin/insights", icon: Sparkles, ar: "التحليلات الذكية", en: "AI insights", adminFlag: "ai_analytics" },
  { to: "/admin/orders", icon: ReceiptText, ar: "الطلبات", en: "Orders" },
  { to: "/admin/returns", icon: Undo2, ar: "الاسترجاع", en: "Returns" },
  { to: "/admin/drivers", icon: Bike, ar: "المندوبين", en: "Drivers" },
  { to: "/admin/products", icon: Package, ar: "المنتجات", en: "Products" },
  { to: "/admin/import", icon: FileSpreadsheet, ar: "استيراد Excel", en: "Excel import", adminOnly: true },
  { to: "/admin/categories", icon: FolderTree, ar: "الأقسام", en: "Categories" },
  { to: "/admin/banners", icon: Image, ar: "البانرات", en: "Banners" },
  { to: "/admin/coupons", icon: Ticket, ar: "الكوبونات", en: "Coupons" },
  { to: "/admin/settings", icon: Settings, ar: "إعدادات المتجر", en: "Store settings" },
] as const;

function AdminLayout() {
  const { isStaff, isAdmin, rolesLoading } = useAuth();
  const { features } = useSettings();
  const { lang, toggle, t } = useI18n();
  if (rolesLoading) return <div className="p-6"><Skeleton className="h-40" /></div>;
  if (!isStaff)
    return (
      <div className="flex min-h-screen items-center justify-center p-4">
        <EmptyState title={lang === "ar" ? "غير مصرح لك بالدخول" : "You don't have access"} hint={lang === "ar" ? "هذه الصفحة للإدارة فقط" : "This area is for store staff only"}
          action={<Button asChild><Link to="/">{t("home")}</Link></Button>} />
      </div>
    );
  return (
    <div className="min-h-screen bg-background md:flex">
      <aside className="no-print border-b bg-card md:sticky md:top-0 md:h-screen md:w-60 md:border-e md:border-b-0">
        <div className="flex items-center justify-between p-4"><StoreLogo /><Button size="sm" variant="ghost" onClick={toggle}>{t("language")}</Button></div>
        <nav className="flex gap-1 overflow-x-auto px-2 pb-2 md:flex-col md:overflow-visible">
          {LINKS.filter((l) => ("adminOnly" in l ? isAdmin : true) && (!("adminFlag" in l) || (isAdmin && features[l.adminFlag]))).map((l) => (
            <Link key={l.to} to={l.to} activeOptions={{ exact: "exact" in l }} className="flex shrink-0 items-center gap-2 rounded-xl px-3 py-2 text-sm font-semibold hover:bg-accent" activeProps={{ className: "bg-primary text-primary-foreground hover:bg-primary" }}>
              <l.icon className="h-4 w-4" />{lang === "ar" ? l.ar : l.en}
            </Link>
          ))}
          <Link to="/" className="flex shrink-0 items-center gap-2 rounded-xl px-3 py-2 text-sm text-muted-foreground hover:bg-accent"><Store className="h-4 w-4" />{lang === "ar" ? "المتجر" : "Storefront"}</Link>
        </nav>
      </aside>
      <main className="flex-1 p-4 md:p-6"><Outlet /></main>
    </div>
  );
}
