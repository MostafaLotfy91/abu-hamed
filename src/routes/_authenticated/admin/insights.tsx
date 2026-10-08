import { createFileRoute } from "@tanstack/react-router";
import { useAuth } from "@/lib/auth";
import { useI18n } from "@/lib/i18n";
import { useSettings } from "@/lib/store-settings";
import { EmptyState } from "@/components/store/states";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { AskPanel } from "@/components/admin/insights/AskPanel";
import { WeeklyPanel } from "@/components/admin/insights/WeeklyPanel";
import { pageHead } from "@/lib/seo";
import { AlertsPanel, ReturnsPanel } from "@/components/admin/insights/StockPanels";

export const Route = createFileRoute("/_authenticated/admin/insights")({
  head: ({ matches }) =>
    pageHead(matches, { title: { ar: "التحليلات الذكية", en: "AI insights" }, noindex: true }),
  component: InsightsPage,
});

function InsightsPage() {
  const { isAdmin } = useAuth();
  const { features } = useSettings();
  const { lang } = useI18n();
  const ar = lang === "ar";
  if (!isAdmin) return <EmptyState title={ar ? "للمدير فقط" : "Admins only"} />;
  if (!features.ai_analytics)
    return (
      <EmptyState
        title={ar ? "التحليلات الذكية غير مفعلة" : "AI analytics is off"}
        hint={ar ? "فعّل ai_analytics من الإعدادات" : "Turn on ai_analytics in Settings"}
      />
    );
  return (
    <div className="max-w-5xl space-y-4">
      <h1 className="text-xl font-extrabold">{ar ? "التحليلات الذكية" : "AI insights"}</h1>
      <Tabs defaultValue="weekly">
        <TabsList className="flex-wrap">
          <TabsTrigger value="weekly">{ar ? "ملخص الأسبوع" : "Weekly"}</TabsTrigger>
          <TabsTrigger value="ask">{ar ? "اسأل" : "Ask"}</TabsTrigger>
          <TabsTrigger value="alerts">{ar ? "تنبيهات المخزون" : "Stock alerts"}</TabsTrigger>
          <TabsTrigger value="returns">{ar ? "المرتجعات" : "Returns"}</TabsTrigger>
        </TabsList>
        <div className="mt-3 rounded-2xl bg-card p-4 shadow-card">
          <TabsContent value="weekly">
            <WeeklyPanel ar={ar} />
          </TabsContent>
          <TabsContent value="ask">
            <AskPanel ar={ar} />
          </TabsContent>
          <TabsContent value="alerts">
            <AlertsPanel ar={ar} />
          </TabsContent>
          <TabsContent value="returns">
            <ReturnsPanel ar={ar} />
          </TabsContent>
        </div>
      </Tabs>
    </div>
  );
}
