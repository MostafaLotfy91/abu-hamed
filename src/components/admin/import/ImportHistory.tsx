import { useQuery, useQueryClient } from "@tanstack/react-query";
import { EmptyState, ErrorState, RowSkeleton } from "@/components/store/states";
import { useConfirm } from "@/components/admin/ConfirmDialog";
import { Undo2 } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

type Job = {
  id: string;
  file_name: string;
  created_at: string;
  status: string;
  total_rows: number;
  products_created: number;
  products_updated: number;
  variants_created: number;
  variants_updated: number;
  error_rows: number;
};
const LABEL: Record<string, string> = {
  running: "جارٍ",
  completed: "مكتمل",
  failed: "فشل",
  undone: "تم التراجع",
};

export function ImportHistory() {
  const qc = useQueryClient();
  const q = useQuery({
    queryKey: ["import_jobs"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("import_jobs" as any)
        .select("*")
        .order("created_at", { ascending: false })
        .limit(30);
      if (error) throw error;
      return data as unknown as Job[];
    },
  });
  const [confirm, confirmDialog] = useConfirm();
  const last = q.data?.find((j) => j.status === "completed" || j.status === "failed");
  const undo = async (id: string) => {
    if (
      !(await confirm({
        title: "التراجع عن هذا الاستيراد؟ / Undo this import?",
        description:
          "سيتم إخفاء كل المنتجات التي أُنشئت فيه. / All products it created will be hidden.",
        confirmLabel: "تراجع / Undo",
        destructive: true,
      }))
    )
      return;
    const { data, error } = await supabase.rpc("admin_undo_import" as any, { _job_id: id } as any);
    if (error) return toast.error(error.message);
    toast.success(`تم إخفاء ${data} منتج`);
    qc.invalidateQueries({ queryKey: ["import_jobs"] });
    qc.invalidateQueries({ queryKey: ["admin"] });
  };
  if (q.isLoading) return <RowSkeleton n={3} />;
  if (q.error)
    return <ErrorState onRetry={() => q.refetch()} message={(q.error as Error).message} />;
  if (!q.data?.length) return <EmptyState title="لا توجد عمليات استيراد بعد / No imports yet" />;
  return (
    <div className="space-y-3">
      {confirmDialog}
      {last && (
        <Button variant="outline" onClick={() => undo(last.id)}>
          <Undo2 className="h-4 w-4" />
          التراجع عن آخر استيراد ({last.file_name})
        </Button>
      )}
      <div className="overflow-auto rounded-xl border">
        <table className="w-full text-sm">
          <thead className="bg-muted">
            <tr>
              {[
                "التاريخ",
                "الملف",
                "الحالة",
                "صفوف",
                "منتجات جديدة",
                "منتجات محدثة",
                "مقاسات جديدة",
                "مقاسات محدثة",
                "أخطاء",
              ].map((h) => (
                <th key={h} className="p-2 text-start">
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {(q.data ?? []).map((j) => (
              <tr key={j.id} className="border-t">
                <td className="p-2 whitespace-nowrap">
                  {new Date(j.created_at).toLocaleString("ar-EG")}
                </td>
                <td className="p-2">{j.file_name}</td>
                <td className="p-2">
                  <Badge variant={j.status === "failed" ? "destructive" : "secondary"}>
                    {LABEL[j.status] ?? j.status}
                  </Badge>
                </td>
                <td className="p-2">{j.total_rows}</td>
                <td className="p-2">{j.products_created}</td>
                <td className="p-2">{j.products_updated}</td>
                <td className="p-2">{j.variants_created}</td>
                <td className="p-2">{j.variants_updated}</td>
                <td className="p-2">{j.error_rows}</td>
              </tr>
            ))}
            {q.data?.length === 0 && (
              <tr>
                <td colSpan={9} className="p-4 text-center text-muted-foreground">
                  لا يوجد استيراد سابق
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
