import { createFileRoute } from "@tanstack/react-router";
import { useAuth } from "@/lib/auth";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { EmptyState } from "@/components/store/states";
import { ImportWizard } from "@/components/admin/import/ImportWizard";
import { BulkImages } from "@/components/admin/import/BulkImages";
import { ImportHistory } from "@/components/admin/import/ImportHistory";

export const Route = createFileRoute("/_authenticated/admin/import")({
  head: () => ({ meta: [{ title: "استيراد المنتجات · Product import" }, { name: "robots", content: "noindex" }] }),
  component: Page,
});

function Page() {
  const { isAdmin } = useAuth();
  if (!isAdmin) return <EmptyState title="للمدير فقط" hint="هذه الصفحة متاحة لحساب المدير فقط" />;
  return (
    <div dir="rtl" className="mx-auto max-w-6xl space-y-4">
      <h1 className="text-2xl font-bold">استيراد المنتجات من Excel</h1>
      <Tabs defaultValue="import">
        <TabsList className="flex-wrap">
          <TabsTrigger value="import">استيراد</TabsTrigger>
          <TabsTrigger value="images">رفع الصور</TabsTrigger>
          <TabsTrigger value="history">السجل</TabsTrigger>
        </TabsList>
        <TabsContent value="import"><ImportWizard /></TabsContent>
        <TabsContent value="images"><BulkImages /></TabsContent>
        <TabsContent value="history"><ImportHistory /></TabsContent>
      </Tabs>
    </div>
  );
}
