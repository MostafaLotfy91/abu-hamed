import { Fragment, useEffect, useState, type ReactNode } from "react";
import { cn } from "@/lib/utils";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { Pencil, Plus, Trash2, Upload, X } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { uploadMedia } from "@/lib/queries";
import { ALLOWED_IMAGE_TYPES } from "@/lib/image-compress";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { RowSkeleton, EmptyState, ErrorState } from "@/components/store/states";
import { BulkBar, Check, PAGE, Pager, Segmented } from "./TableKit";
import { useConfirm } from "./ConfirmDialog";
import { useBi } from "@/lib/bilingual";

export type Field = {
  key: string;
  label: string;
  type?:
    "text" | "number" | "bool" | "image" | "images" | "select" | "datetime" | "textarea" | "color";
  options?: { value: string; label: string }[];
  required?: boolean;
  list?: boolean; // show in table
  default?: unknown;
  /** Show this field in the form only when it returns true for the row being edited (values are kept either way). */
  show?: (row: Record<string, unknown>) => boolean;
};

type AnyTable = "categories" | "products" | "banners" | "coupons" | "product_variants" | "branches";

export function ImageInput({
  value,
  onChange,
  folder,
  label,
}: {
  value: string | null;
  onChange: (v: string | null) => void;
  folder: string;
  label?: string;
}) {
  const bi = useBi();
  const [busy, setBusy] = useState(false);
  return (
    <div className="flex items-center gap-3">
      {value ? (
        <img src={value} alt="" className="h-16 w-16 rounded-lg object-cover" />
      ) : (
        <div className="h-16 w-16 rounded-lg bg-muted" />
      )}
      <label className="inline-flex cursor-pointer items-center gap-1 rounded-md border px-3 py-2 text-sm">
        <Upload className="h-4 w-4" />
        {busy ? "..." : bi("Upload / رفع")}
        <input
          type="file"
          accept={ALLOWED_IMAGE_TYPES.join(",")}
          hidden
          aria-label={label ? `${label} — ${bi("Upload / رفع")}` : bi("Upload / رفع")}
          onChange={async (e) => {
            const f = e.target.files?.[0];
            e.target.value = "";
            if (!f) return;
            setBusy(true);
            try {
              onChange(await uploadMedia(f, folder));
              toast.success(bi("تم رفع الصورة — احفظ للتأكيد / Image uploaded — save to keep it"));
            } catch (err) {
              toast.error(bi((err as Error).message));
            }
            setBusy(false);
          }}
        />
      </label>
      {value && (
        <Button
          type="button"
          size="icon"
          variant="ghost"
          aria-label={bi("إزالة الصورة / Remove image")}
          title={bi("إزالة الصورة / Remove image")}
          onClick={() => {
            onChange(null);
            toast(bi("تمت إزالة الصورة — احفظ للتأكيد / Image removed — save to keep it"));
          }}
        >
          <X className="h-4 w-4" />
        </Button>
      )}
    </div>
  );
}

function toInputDate(v: unknown) {
  if (!v) return "";
  const d = new Date(v as string);
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
}

export function CrudPage({
  table,
  title,
  fields,
  order = "created_at",
  ascending = false,
  filter,
  fixed,
  rowActions,
  headerExtra,
  renderCell,
  notice,
}: {
  table: AnyTable;
  title: string;
  fields: Field[];
  order?: string;
  ascending?: boolean;
  filter?: Record<string, string>;
  fixed?: Record<string, unknown>;
  rowActions?: (row: Record<string, unknown>) => ReactNode;
  headerExtra?: ReactNode;
  /** Shown between the header and the table (e.g. "categories missing images"). */
  notice?: ReactNode;
  renderCell?: (f: Field, row: Record<string, unknown>) => ReactNode | undefined;
}) {
  const bi = useBi();
  const [editing, setEditing] = useState<Record<string, unknown> | null>(null);
  const [search, setSearch] = useState("");
  const [term, setTerm] = useState("");
  useEffect(() => {
    const id = setTimeout(() => setTerm(search.trim()), 300);
    return () => clearTimeout(id);
  }, [search]);
  const hasActive = fields.some((f) => f.key === "is_active");
  const [activeF, setActiveF] = useState<"all" | "on" | "off">("all");
  const [page, setPage] = useState(0);
  const [sel, setSel] = useState<Set<string>>(new Set());
  const [confirm, confirmDialog] = useConfirm();
  // Server-side paging and search (text columns, case-insensitive), so large tables load one page at a time.
  const searchKeys = fields.filter((f) => !f.type || f.type === "text").map((f) => f.key);
  const q = useQuery({
    queryKey: ["admin", table, filter, page, term, activeF],
    placeholderData: keepPreviousData,
    queryFn: async () => {
      let qq = supabase.from(table).select("*", { count: "exact" }).order(order, { ascending });
      for (const [k, v] of Object.entries(filter ?? {})) qq = qq.eq(k, v);
      if (hasActive && activeF !== "all") qq = qq.eq("is_active", activeF === "on");
      // Characters that would break the PostgREST or() filter or act as wildcards.
      const s = term.replace(/[%,()*\\]/g, " ").trim();
      if (s && searchKeys.length) qq = qq.or(searchKeys.map((k) => `${k}.ilike.%${s}%`).join(","));
      const { data, error, count } = await qq.range(page * PAGE, page * PAGE + PAGE - 1);
      if (error) throw error;
      return { rows: (data ?? []) as Record<string, unknown>[], total: count ?? 0 };
    },
  });
  const pageRows = q.data?.rows ?? [];
  const total = q.data?.total ?? 0;
  const pages = Math.max(1, Math.ceil(total / PAGE));
  const cur = Math.min(page, pages - 1);
  const listFields = fields.filter((f) => f.list);
  const allOnPage = pageRows.length > 0 && pageRows.every((r) => sel.has(r.id as string));
  const toggle = (id: string, on: boolean) =>
    setSel((s) => {
      const n = new Set(s);
      if (on) n.add(id);
      else n.delete(id);
      return n;
    });
  const bulk = async (kind: "on" | "off" | "delete") => {
    const ids = [...sel];
    if (
      kind === "delete" &&
      !(await confirm({
        title: `حذف ${ids.length} عنصر؟ / Delete ${ids.length} items?`,
        description: "لا يمكن التراجع / This cannot be undone.",
        confirmLabel: "حذف / Delete",
        destructive: true,
      }))
    )
      return;
    const res =
      kind === "delete"
        ? await supabase.from(table).delete().in("id", ids)
        : await supabase
            .from(table)
            .update({ is_active: kind === "on" } as never)
            .in("id", ids);
    if (res.error) return toast.error(res.error.message);
    toast.success(`✓ ${ids.length}`);
    setSel(new Set());
    q.refetch();
  };

  const save = async () => {
    if (!editing) return;
    const payload: Record<string, unknown> = { ...fixed };
    for (const f of fields) {
      let v = editing[f.key];
      if (f.type === "number") v = v === "" || v == null ? null : Number(v);
      if (f.type === "datetime") v = v ? new Date(v as string).toISOString() : null;
      // An empty text box or an unselected "—" option means "no value" (columns like gender have CHECKs).
      if (
        (f.type === "text" || f.type === "textarea" || f.type === "select" || !f.type) &&
        v === ""
      )
        v = null;
      if (f.required && (v == null || v === "")) return toast.error(`${bi(f.label)} *`);
      payload[f.key] = v;
    }
    const res = editing.id
      ? await supabase
          .from(table)
          .update(payload as never)
          .eq("id", editing.id as string)
      : await supabase.from(table).insert(payload as never);
    if (res.error) return toast.error(res.error.message);
    toast.success("✓");
    setEditing(null);
    q.refetch();
  };
  const del = async (id: string) => {
    if (
      !(await confirm({
        title: "حذف هذا العنصر؟ / Delete this item?",
        description: "لا يمكن التراجع / This cannot be undone.",
        confirmLabel: "حذف / Delete",
        destructive: true,
      }))
    )
      return;
    const { error } = await supabase.from(table).delete().eq("id", id);
    if (error) toast.error(error.message);
    else q.refetch();
  };
  const blank = () =>
    Object.fromEntries(
      fields.map((f) => [
        f.key,
        f.default ?? (f.type === "bool" ? true : f.type === "images" ? [] : ""),
      ]),
    );

  // One renderer for table cells (wide screens) and card lines (phones).
  const cellOf = (f: Field, r: Record<string, unknown>): ReactNode =>
    renderCell?.(f, r) ??
    (f.type === "image" ? (
      r[f.key] ? (
        <img src={r[f.key] as string} alt="" className="h-10 w-10 rounded object-cover" />
      ) : null
    ) : f.type === "images" ? (
      (r[f.key] as string[])?.[0] ? (
        <img src={(r[f.key] as string[])[0]} alt="" className="h-10 w-10 rounded object-cover" />
      ) : null
    ) : f.type === "bool" ? (
      r[f.key] ? (
        "✓"
      ) : (
        "—"
      )
    ) : f.type === "select" ? (
      (f.options?.find((o) => o.value === r[f.key])?.label ?? "—")
    ) : (
      String(r[f.key] ?? "—")
    ));
  const actionsOf = (r: Record<string, unknown>) => (
    <>
      {rowActions?.(r)}
      <Button
        size="icon"
        variant="ghost"
        aria-label={bi("تعديل / Edit")}
        title={bi("تعديل / Edit")}
        onClick={() => setEditing({ ...r })}
      >
        <Pencil className="h-4 w-4" />
      </Button>
      <Button
        size="icon"
        variant="ghost"
        aria-label={bi("حذف / Delete")}
        title={bi("حذف / Delete")}
        onClick={() => del(r.id as string)}
      >
        <Trash2 className="h-4 w-4 text-destructive" />
      </Button>
    </>
  );
  const imageField = listFields.find((f) => f.type === "image" || f.type === "images");
  const titleField = listFields.find((f) => !f.type || f.type === "text") ?? listFields[0];
  const lineFields = listFields.filter((f) => f !== imageField && f !== titleField);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-xl font-bold tracking-tight">{bi(title)}</h1>
        <div className="flex flex-wrap items-center gap-2">
          {hasActive && (
            <Segmented
              value={activeF}
              onChange={(v) => {
                setActiveF(v);
                setPage(0);
              }}
              options={[
                { value: "all", label: "الكل" },
                { value: "on", label: "نشط" },
                { value: "off", label: "مخفي" },
              ]}
            />
          )}
          <Input
            placeholder={bi("Search / بحث")}
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(0);
            }}
            className="h-9 w-48"
          />
          {headerExtra}
          <Button size="sm" onClick={() => setEditing(blank())}>
            <Plus className="h-4 w-4" />
            {bi("Add / إضافة")}
          </Button>
        </div>
      </div>
      <BulkBar count={sel.size} onClear={() => setSel(new Set())}>
        {hasActive && (
          <>
            <Button size="sm" variant="outline" onClick={() => bulk("on")}>
              {bi("إظهار / Activate")}
            </Button>
            <Button size="sm" variant="outline" onClick={() => bulk("off")}>
              {bi("إخفاء / Hide")}
            </Button>
          </>
        )}
        <Button
          size="sm"
          variant="outline"
          className="text-destructive"
          onClick={() => bulk("delete")}
        >
          <Trash2 className="h-4 w-4" />
          حذف
        </Button>
      </BulkBar>
      {notice}
      {confirmDialog}
      {q.isLoading ? (
        <RowSkeleton n={5} />
      ) : q.error ? (
        <ErrorState onRetry={() => q.refetch()} message={(q.error as Error).message} />
      ) : !pageRows.length ? (
        <EmptyState
          title={term ? "لا نتائج / No results" : "لا توجد بيانات بعد / Nothing here yet"}
        />
      ) : (
        <div className="space-y-2">
          {/* Phones: one card per row. */}
          <ul aria-label={bi(title)} className="space-y-2 md:hidden">
            {pageRows.map((r) => (
              <li
                key={r.id as string}
                data-row-card
                className={cn(
                  "rounded-md border bg-card p-3",
                  sel.has(r.id as string) && "bg-muted/40",
                )}
              >
                <div className="flex items-start gap-3">
                  <Check
                    label="select"
                    checked={sel.has(r.id as string)}
                    onChange={(v) => toggle(r.id as string, v)}
                  />
                  {imageField && <div className="shrink-0">{cellOf(imageField, r)}</div>}
                  <div className="min-w-0 flex-1 space-y-1 text-sm">
                    {titleField && <p className="font-semibold">{cellOf(titleField, r)}</p>}
                    <dl className="grid grid-cols-[auto_1fr] gap-x-2 gap-y-0.5 text-xs">
                      {lineFields.map((f) => (
                        <Fragment key={f.key}>
                          <dt className="text-muted-foreground">{bi(f.label)}</dt>
                          <dd className="min-w-0 truncate">{cellOf(f, r)}</dd>
                        </Fragment>
                      ))}
                    </dl>
                  </div>
                </div>
                <div className="mt-2 flex justify-end gap-1 border-t pt-2">{actionsOf(r)}</div>
              </li>
            ))}
          </ul>
          <div className="hidden overflow-x-auto rounded-md border bg-card md:block">
            <table className="w-full whitespace-nowrap text-sm">
              <thead className="sticky top-0 bg-muted/60 text-start text-xs text-muted-foreground">
                <tr>
                  <th className="w-10 p-3">
                    <Check
                      label="select all"
                      checked={allOnPage}
                      onChange={(v) =>
                        setSel((s) => {
                          const n = new Set(s);
                          pageRows.forEach((r) =>
                            v ? n.add(r.id as string) : n.delete(r.id as string),
                          );
                          return n;
                        })
                      }
                    />
                  </th>
                  {listFields.map((f) => (
                    <th key={f.key} className="p-3 text-start font-semibold">
                      {bi(f.label)}
                    </th>
                  ))}
                  <th />
                </tr>
              </thead>
              <tbody className="divide-y">
                {pageRows.map((r) => (
                  <tr
                    key={r.id as string}
                    className={sel.has(r.id as string) ? "bg-muted/40" : "hover:bg-muted/30"}
                  >
                    <td className="p-3">
                      <Check
                        label="select"
                        checked={sel.has(r.id as string)}
                        onChange={(v) => toggle(r.id as string, v)}
                      />
                    </td>
                    {listFields.map((f) => (
                      <td key={f.key} className="p-3">
                        {cellOf(f, r)}
                      </td>
                    ))}
                    <td className="whitespace-nowrap p-2 text-end">{actionsOf(r)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <Pager page={cur} pages={pages} total={total} onPage={setPage} />
        </div>
      )}

      <Dialog open={!!editing} onOpenChange={(o) => !o && setEditing(null)}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>{bi(title)}</DialogTitle>
          </DialogHeader>
          {editing && (
            <div className="grid gap-3 sm:grid-cols-2">
              {fields
                .filter((f) => !f.show || f.show(editing))
                .map((f) => {
                  const v = editing[f.key];
                  const set = (nv: unknown) => setEditing({ ...editing, [f.key]: nv });
                  const wide = f.type === "textarea" || f.type === "images";
                  const id = `crud-${table}-${f.key}`;
                  const isImage = f.type === "image" || f.type === "images";
                  return (
                    <div key={f.key} className={wide ? "sm:col-span-2" : ""}>
                      <Label className="mb-1 block" htmlFor={isImage ? undefined : id}>
                        {bi(f.label)}
                        {f.required && " *"}
                      </Label>
                      {f.type === "bool" ? (
                        <Switch id={id} checked={!!v} onCheckedChange={set} />
                      ) : f.type === "textarea" ? (
                        <Textarea
                          id={id}
                          value={(v as string) ?? ""}
                          onChange={(e) => set(e.target.value)}
                        />
                      ) : f.type === "select" ? (
                        <select
                          id={id}
                          className="h-9 w-full rounded-md border bg-background px-2"
                          value={(v as string) ?? ""}
                          onChange={(e) => set(e.target.value || null)}
                        >
                          <option value="">—</option>
                          {f.options?.map((o) => (
                            <option key={o.value} value={o.value}>
                              {bi(o.label)}
                            </option>
                          ))}
                        </select>
                      ) : f.type === "image" ? (
                        <ImageInput
                          value={(v as string) ?? null}
                          onChange={set}
                          folder={table}
                          label={bi(f.label)}
                        />
                      ) : f.type === "images" ? (
                        <div className="flex flex-wrap gap-2">
                          {((v as string[]) ?? []).map((src, i) => (
                            <div key={i} className="relative">
                              <img src={src} alt="" className="h-16 w-16 rounded-lg object-cover" />
                              <button
                                type="button"
                                aria-label={bi(`إزالة الصورة ${i + 1} / Remove image ${i + 1}`)}
                                className="absolute -end-1 -top-1 rounded-full bg-destructive p-0.5 text-destructive-foreground"
                                onClick={() => set((v as string[]).filter((_, j) => j !== i))}
                              >
                                <X className="h-3 w-3" />
                              </button>
                            </div>
                          ))}
                          <ImageInput
                            value={null}
                            onChange={(u) => u && set([...((v as string[]) ?? []), u])}
                            folder={table}
                            label={bi(f.label)}
                          />
                        </div>
                      ) : f.type === "datetime" ? (
                        <Input
                          id={id}
                          type="datetime-local"
                          value={toInputDate(v)}
                          onChange={(e) => set(e.target.value)}
                        />
                      ) : f.type === "color" ? (
                        <Input
                          id={id}
                          type="color"
                          value={(v as string) || "#000000"}
                          onChange={(e) => set(e.target.value)}
                        />
                      ) : (
                        <Input
                          id={id}
                          type={f.type === "number" ? "number" : "text"}
                          step="any"
                          value={(v as string | number) ?? ""}
                          onChange={(e) => set(e.target.value)}
                        />
                      )}
                    </div>
                  );
                })}
              <div className="flex gap-2 sm:col-span-2">
                <Button onClick={save}>{bi("Save / حفظ")}</Button>
                <Button variant="ghost" onClick={() => setEditing(null)}>
                  Cancel
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
