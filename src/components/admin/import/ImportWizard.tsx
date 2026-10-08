import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Download, FileSpreadsheet, Upload } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { fetchCategories, fetchFacets, fetchProfiles } from "@/lib/queries";
import {
  IMPORT_BATCH,
  IMPORT_MAX_BYTES,
  IMPORT_MAX_ROWS,
  toPayload,
  toRows,
  validateRows,
  type CheckedRow,
} from "@/lib/product-import";
import {
  downloadErrorReport,
  downloadTemplate,
  exportProducts,
  readSheet,
} from "@/lib/product-import-xlsx";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Switch } from "@/components/ui/switch";
import type { Json } from "@/integrations/supabase/types";
import { Badge } from "@/components/ui/badge";

type Summary = ReturnType<typeof validateRows>["summary"];
const STATUS = {
  valid: ["سليم", "default"],
  warning: ["تحذير", "secondary"],
  error: ["خطأ", "destructive"],
} as const;

async function existingKeys(codes: string[], skus: string[]) {
  const productCodes = new Set<string>(),
    variantSkus = new Set<string>();
  for (let i = 0; i < codes.length; i += 200) {
    // A failed lookup must stop the preview, or existing products would be counted as new.
    const { data, error } = await supabase
      .from("products")
      .select("sku")
      .in("sku", codes.slice(i, i + 200));
    if (error) throw error;
    data?.forEach((d) => d.sku && productCodes.add(d.sku));
  }
  for (let i = 0; i < skus.length; i += 200) {
    const { data, error } = await supabase
      .from("product_variants")
      .select("sku")
      .in("sku", skus.slice(i, i + 200));
    if (error) throw error;
    data?.forEach((d) => d.sku && variantSkus.add(d.sku));
  }
  return { productCodes, variantSkus };
}

export function ImportWizard() {
  const qc = useQueryClient();
  const [file, setFile] = useState<File | null>(null);
  const [checked, setChecked] = useState<CheckedRow[] | null>(null);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [createCats, setCreateCats] = useState(false);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState<number | null>(null);
  const [filter, setFilter] = useState<"all" | "error" | "warning">("all");

  const analyze = async (f: File, create = createCats) => {
    if (f.size > IMPORT_MAX_BYTES) return toast.error("حجم الملف أكبر من 5 ميجا");
    setBusy(true);
    try {
      // Colour names in the sheet are matched against the colours the store already uses.
      const palette = (await fetchFacets()).colors;
      const { rows, unknownHeaders } = toRows(await readSheet(f), palette);
      if (!rows.length) throw new Error("الملف فاضي أو العناوين غير صحيحة");
      if (rows.length > IMPORT_MAX_ROWS) throw new Error(`الحد الأقصى ${IMPORT_MAX_ROWS} صف`);
      if (unknownHeaders.length)
        toast.warning(`أعمدة غير معروفة سيتم تجاهلها: ${unknownHeaders.join("، ")}`);
      const [cats, existing, profiles] = await Promise.all([
        fetchCategories(),
        existingKeys(
          [...new Set(rows.map((r) => r.product_code).filter(Boolean))],
          rows.map((r) => r.sku).filter(Boolean),
        ),
        fetchProfiles(),
      ]);
      // Sizes are checked against each category's profile (e.g. no clothing sizes for perfumes).
      const res = validateRows(rows, cats, existing, create, profiles);
      setFile(f);
      setChecked(res.checked);
      setSummary(res.summary);
      setProgress(null);
    } catch (e) {
      toast.error((e as Error).message);
    }
    setBusy(false);
  };

  const run = async () => {
    if (!checked || !file) return;
    const ok = checked.filter((c) => c.status !== "error").map((c) => toPayload(c.data));
    if (!ok.length) return toast.error("لا توجد صفوف صالحة");
    setBusy(true);
    setProgress(0);
    const { data: job, error } = await supabase
      .from("import_jobs")
      .insert({
        file_name: file.name,
        total_rows: checked.length,
        error_rows: checked.length - ok.length,
      })
      .select("id")
      .single();
    if (error || !job) {
      toast.error(error?.message ?? "error");
      setBusy(false);
      return;
    }
    const jobId = job.id;
    let failed = 0,
      serverErrors = 0;
    for (let i = 0; i < ok.length; i += IMPORT_BATCH) {
      const batch = ok.slice(i, i + IMPORT_BATCH);
      const { data, error: e } = await supabase.rpc("admin_import_batch", {
        _job_id: jobId,
        _rows: batch as unknown as Json,
        _create_categories: createCats,
      });
      if (e) {
        failed += batch.length;
        console.error(e);
      } else serverErrors += ((data as { errors?: unknown[] } | null)?.errors ?? []).length;
      setProgress(Math.round(((i + batch.length) / ok.length) * 100));
    }
    const { error: finishError } = await supabase.rpc("admin_finish_import", {
      _job_id: jobId,
      _status: failed === ok.length ? "failed" : "completed",
      _extra_errors: failed,
    });
    if (finishError)
      toast.error(
        `تعذر إنهاء سجل الاستيراد / Could not close the import job: ${finishError.message}`,
      );
    const msg =
      `تم استيراد ${ok.length - failed - serverErrors} صف` +
      (failed + serverErrors ? ` — فشل ${failed + serverErrors}` : "");
    (failed ? toast.warning : toast.success)(msg);
    qc.invalidateQueries({ queryKey: ["admin"] });
    qc.invalidateQueries({ queryKey: ["import_jobs"] });
    setBusy(false);
    setChecked(null);
    setSummary(null);
    setFile(null);
  };

  const shown = (checked ?? []).filter((c) => filter === "all" || c.status === filter);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2">
        <Button
          variant="outline"
          onClick={async () => {
            try {
              const [cats, facets, profiles] = await Promise.all([
                fetchCategories(),
                fetchFacets(),
                fetchProfiles(),
              ]);
              await downloadTemplate(cats, facets.colors, profiles);
            } catch (e) {
              toast.error((e as Error).message);
            }
          }}
        >
          <Download className="h-4 w-4" />
          تحميل القالب
        </Button>
        <Button
          variant="outline"
          onClick={async () => {
            try {
              await exportProducts(await fetchCategories());
            } catch (e) {
              toast.error((e as Error).message);
            }
          }}
        >
          <FileSpreadsheet className="h-4 w-4" />
          تصدير المنتجات إلى Excel
        </Button>
      </div>

      <label className="flex cursor-pointer flex-col items-center gap-2 rounded-2xl border-2 border-dashed p-8 text-center hover:bg-accent">
        <Upload className="h-8 w-8 text-muted-foreground" />
        <span className="font-semibold">1. ارفع ملف Excel أو CSV</span>
        <span className="text-xs text-muted-foreground">
          حتى 5 ميجا و{IMPORT_MAX_ROWS} صف — لن يتم حفظ أي شيء قبل التأكيد
        </span>
        {file && <span className="text-sm">{file.name}</span>}
        <input
          type="file"
          hidden
          accept=".xlsx,.xls,.csv"
          disabled={busy}
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) analyze(f);
            e.target.value = "";
          }}
        />
      </label>

      <label className="flex items-center gap-2 text-sm">
        <Switch
          checked={createCats}
          onCheckedChange={(v) => {
            setCreateCats(v);
            if (file) analyze(file, v);
          }}
        />
        إنشاء الأقسام غير الموجودة تلقائياً
      </label>

      {summary && checked && (
        <div className="space-y-3">
          <h3 className="font-bold">2. مراجعة البيانات</h3>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            {[
              ["منتجات جديدة", summary.newProducts],
              ["منتجات ستُحدّث", summary.updatedProducts],
              ["مقاسات/ألوان جديدة", summary.newVariants],
              ["صفوف بها أخطاء", summary.errors],
            ].map(([l, v]) => (
              <div key={l as string} className="rounded-xl border bg-card p-3">
                <div className="text-xs text-muted-foreground">{l}</div>
                <div className="text-2xl font-bold">{v}</div>
              </div>
            ))}
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {(["all", "error", "warning"] as const).map((f) => (
              <Button
                key={f}
                size="sm"
                variant={filter === f ? "default" : "outline"}
                onClick={() => setFilter(f)}
              >
                {f === "all" ? "الكل" : STATUS[f][0]}
              </Button>
            ))}
            <Button
              size="sm"
              variant="ghost"
              onClick={() =>
                downloadErrorReport(
                  checked
                    .filter((c) => c.status !== "valid")
                    .map((c) => ({
                      row: c.data.row,
                      code: c.data.product_code,
                      status: STATUS[c.status][0],
                      messages: c.messages.join(" | "),
                    })),
                )
              }
            >
              <Download className="h-4 w-4" />
              تقرير الأخطاء
            </Button>
          </div>
          <div className="max-h-[50vh] overflow-auto rounded-xl border">
            <table className="w-full text-sm">
              <thead className="sticky top-0 bg-muted text-start">
                <tr>
                  {[
                    "صف",
                    "الحالة",
                    "الكود",
                    "الاسم",
                    "المقاس",
                    "اللون",
                    "السعر",
                    "المخزون",
                    "الملاحظات",
                  ].map((h) => (
                    <th key={h} className="p-2 text-start">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {shown.slice(0, 500).map((c) => (
                  <tr key={c.data.row} className="border-t align-top">
                    <td className="p-2">{c.data.row}</td>
                    <td className="p-2">
                      <Badge variant={STATUS[c.status][1]}>{STATUS[c.status][0]}</Badge>
                    </td>
                    <td className="p-2">{c.data.product_code}</td>
                    <td className="p-2">{c.data.name_ar}</td>
                    <td className="p-2">{c.data.size}</td>
                    <td className="p-2">{c.data.color_ar}</td>
                    <td className="p-2">{c.data.price ?? ""}</td>
                    <td className="p-2">{c.data.stock ?? ""}</td>
                    <td className="p-2 text-xs">{c.messages.join("، ")}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {progress !== null && <Progress value={progress} />}
          <Button disabled={busy || checked.length === summary.errors} onClick={run}>
            3. تأكيد الاستيراد ({checked.length - summary.errors} صف — سيتم تخطي الأخطاء)
          </Button>
        </div>
      )}
    </div>
  );
}
