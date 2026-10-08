import { useState } from "react";
import { ImageUp } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { matchImageFile } from "@/lib/product-import";
import { toWebp } from "@/lib/image-compress";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";

const IMG = /\.(jpe?g|png|webp|gif|avif)$/i;

async function expand(files: File[]) {
  const out: File[] = [];
  for (const f of files) {
    if (/\.zip$/i.test(f.name)) {
      const JSZip = (await import("jszip")).default;
      const zip = await JSZip.loadAsync(f);
      for (const e of Object.values(zip.files)) if (!e.dir && IMG.test(e.name) && !e.name.startsWith("__MACOSX"))
        out.push(new File([await e.async("blob")], e.name.split("/").pop()!));
    } else if (IMG.test(f.name)) out.push(f);
  }
  return out;
}

async function upload(blob: Blob, path: string) {
  const s = supabase.storage.from("store-media");
  const { error } = await s.upload(path, blob, { contentType: "image/webp", upsert: true });
  if (error) throw error;
  return s.getPublicUrl(path).data.publicUrl;
}

export function BulkImages() {
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState<number | null>(null);
  const [report, setReport] = useState<{ matched: number; unmatched: string[] } | null>(null);

  const run = async (list: File[]) => {
    setBusy(true); setReport(null); setProgress(0);
    try {
      const files = await expand(list);
      const { data: prods, error } = await supabase.from("products").select("id,sku,images,thumbnails").not("sku", "is", null);
      if (error) throw error;
      const byCode = new Map(prods!.map((p) => [p.sku!.toLowerCase(), p]));
      const codes = prods!.map((p) => p.sku!);
      const unmatched: string[] = [];
      const plan = new Map<string, { file: File; color: string | null; index: number }[]>();
      for (const f of files) {
        const m = matchImageFile(f.name, codes);
        if (!m) { unmatched.push(f.name); continue; }
        const k = m.code.toLowerCase();
        plan.set(k, [...(plan.get(k) ?? []), { file: f, color: m.color, index: m.index }]);
      }
      let done = 0, matched = 0;
      for (const [code, items] of plan) {
        const p = byCode.get(code)!;
        items.sort((a, b) => (a.color ?? "").localeCompare(b.color ?? "") || a.index - b.index);
        const hasColor = items.some((i) => i.color);
        const images = hasColor ? [] : [...(p.images ?? [])];
        const thumbs = hasColor ? [] : [...((p as any).thumbnails ?? [])];
        for (const [pos, it] of items.entries()) {
          const slot = hasColor ? pos : it.index - 1;
          const id = crypto.randomUUID();
          const [full, thumb] = await Promise.all([toWebp(it.file, 1600, 0.8), toWebp(it.file, 400, 0.75)]);
          images[slot] = await upload(full, `bulk/${code}/${id}.webp`);
          thumbs[slot] = await upload(thumb, `bulk/${code}/${id}_thumb.webp`);
          matched++; setProgress(Math.round((++done / files.length) * 100));
        }
        const compact = <T,>(a: T[]) => a.filter(Boolean);
        const { error: e } = await supabase.from("products").update({ images: compact(images), thumbnails: compact(thumbs) } as any).eq("id", p.id);
        if (e) throw e;
      }
      setReport({ matched, unmatched });
      toast.success(`تم رفع ${matched} صورة`);
    } catch (e) { toast.error((e as Error).message); }
    setBusy(false); setProgress(null);
  };

  return (
    <div className="space-y-4">
      <label
        className="flex cursor-pointer flex-col items-center gap-2 rounded-2xl border-2 border-dashed p-8 text-center hover:bg-accent"
        onDragOver={(e) => e.preventDefault()}
        onDrop={(e) => { e.preventDefault(); if (!busy) run([...e.dataTransfer.files]); }}>
        <ImageUp className="h-8 w-8 text-muted-foreground" />
        <span className="font-semibold">اسحب الصور أو ملف ZIP هنا</span>
        <span className="text-xs text-muted-foreground">سمِّ الملفات بكود المنتج: SKU-001_1.jpg أو SKU-001_أسود_1.jpg — يتم ضغطها وتحويلها إلى WebP تلقائياً</span>
        <input type="file" hidden multiple accept="image/*,.zip" disabled={busy} onChange={(e) => { const f = [...(e.target.files ?? [])]; if (f.length) run(f); e.target.value = ""; }} />
      </label>
      {progress !== null && <Progress value={progress} />}
      {report && (
        <div className="rounded-xl border bg-card p-4 text-sm">
          <p className="font-semibold">تمت مطابقة {report.matched} صورة.</p>
          {report.unmatched.length > 0 && (
            <>
              <p className="mt-2 text-destructive">ملفات لم تتم مطابقتها ({report.unmatched.length}):</p>
              <ul className="mt-1 max-h-40 list-inside list-disc overflow-auto text-xs">{report.unmatched.map((n) => <li key={n}>{n}</li>)}</ul>
            </>
          )}
          <Button size="sm" variant="ghost" className="mt-2" onClick={() => setReport(null)}>إغلاق</Button>
        </div>
      )}
    </div>
  );
}
