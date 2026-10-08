import { useState } from "react";
import { ImagePlus } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { uploadMedia } from "@/lib/queries";
import { matchCategoryFile } from "@/lib/category-image";
import { ALLOWED_IMAGE_TYPES } from "@/lib/image-compress";
import { useBi } from "@/lib/bilingual";
import { cn } from "@/lib/utils";

type Cat = { id: string; name_ar: string; name_en: string };
type Result = { file: string; category?: string; error?: string };

/**
 * Bulk category images: drop (or pick) files named after categories — "t-shirts.jpg", "تيشيرتات.webp" or the
 * category id. Each match is compressed to WebP, uploaded and saved; unmatched files are listed.
 */
export function CategoryBulkImages({
  categories,
  onDone,
}: {
  categories: Cat[];
  onDone: () => void;
}) {
  const bi = useBi();
  const [busy, setBusy] = useState(false);
  const [over, setOver] = useState(false);
  const [results, setResults] = useState<Result[]>([]);

  const run = async (files: File[]) => {
    if (!files.length) return;
    setBusy(true);
    const out: Result[] = [];
    for (const f of files) {
      const id = matchCategoryFile(f.name, categories);
      const cat = categories.find((c) => c.id === id);
      if (!cat) {
        out.push({ file: f.name });
        continue;
      }
      try {
        const url = await uploadMedia(f, "categories");
        const { error } = await supabase
          .from("categories")
          .update({ image_url: url })
          .eq("id", cat.id);
        if (error) throw error;
        out.push({ file: f.name, category: bi(`${cat.name_ar} / ${cat.name_en}`) });
      } catch (e) {
        out.push({ file: f.name, category: cat.name_ar, error: bi((e as Error).message) });
      }
    }
    setResults(out);
    setBusy(false);
    const ok = out.filter((r) => r.category && !r.error).length;
    if (ok) toast.success(bi(`تم حفظ ${ok} صورة / Saved ${ok} images`));
    if (out.some((r) => !r.category || r.error))
      toast.error(
        bi("بعض الملفات لم تُحفظ — راجع القائمة / Some files were not saved — see the list"),
      );
    onDone();
  };

  return (
    <div className="space-y-2">
      <label
        onDragOver={(e) => {
          e.preventDefault();
          setOver(true);
        }}
        onDragLeave={() => setOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          setOver(false);
          run([...e.dataTransfer.files]);
        }}
        className={cn(
          "flex cursor-pointer flex-col items-center gap-1 rounded-xl border-2 border-dashed p-4 text-center text-sm",
          over ? "border-primary bg-primary-soft" : "border-border",
          busy && "pointer-events-none opacity-60",
        )}
      >
        <ImagePlus className="h-6 w-6 text-muted-foreground" />
        <span className="font-semibold">
          {busy
            ? bi("جاري الرفع… / Uploading…")
            : bi("اسحب صور الأقسام هنا أو اختارها / Drop category images here or pick them")}
        </span>
        <span className="text-xs text-muted-foreground">
          {bi(
            "اسم الملف = اسم القسم، مثال: t-shirts.jpg أو تيشيرتات.webp / File name = category name, e.g. t-shirts.jpg",
          )}
        </span>
        <input
          type="file"
          multiple
          hidden
          accept={ALLOWED_IMAGE_TYPES.join(",")}
          aria-label={bi("رفع صور الأقسام / Upload category images")}
          onChange={(e) => {
            const files = [...(e.target.files ?? [])];
            e.target.value = "";
            run(files);
          }}
        />
      </label>
      {results.length > 0 && (
        <ul aria-label={bi("نتيجة الرفع / Upload result")} className="space-y-1 text-xs">
          {results.map((r) => (
            <li
              key={r.file}
              className={cn(
                "flex justify-between gap-2 rounded-md px-2 py-1",
                r.category && !r.error ? "bg-success/10" : "bg-destructive/10",
              )}
            >
              <span dir="ltr">{r.file}</span>
              <span>
                {r.error
                  ? r.error
                  : r.category
                    ? `✓ ${r.category}`
                    : bi("لا يوجد قسم بهذا الاسم / No category with this name")}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
