import { useState, type ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import { Pencil, Plus, Trash2, Upload, X } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { uploadMedia } from "@/lib/queries";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { RowSkeleton, EmptyState, ErrorState } from "@/components/store/states";
import { BulkBar, Check, Pager, paginate, Segmented } from "./TableKit";

export type Field = {
  key: string;
  label: string;
  type?: "text" | "number" | "bool" | "image" | "images" | "select" | "datetime" | "textarea" | "color";
  options?: { value: string; label: string }[];
  required?: boolean;
  list?: boolean; // show in table
  default?: unknown;
};

type AnyTable = "categories" | "products" | "banners" | "coupons" | "product_variants" | "branches";

export function ImageInput({ value, onChange, folder }: { value: string | null; onChange: (v: string | null) => void; folder: string }) {
  const [busy, setBusy] = useState(false);
  return (
    <div className="flex items-center gap-3">
      {value ? <img src={value} alt="" className="h-16 w-16 rounded-lg object-cover" /> : <div className="h-16 w-16 rounded-lg bg-muted" />}
      <label className="inline-flex cursor-pointer items-center gap-1 rounded-md border px-3 py-2 text-sm">
        <Upload className="h-4 w-4" />{busy ? "..." : "Upload"}
        <input type="file" accept="image/*" hidden onChange={async (e) => {
          const f = e.target.files?.[0]; if (!f) return;
          setBusy(true);
          try { onChange(await uploadMedia(f, folder)); } catch (err) { toast.error((err as Error).message); }
          setBusy(false);
        }} />
      </label>
      {value && <Button type="button" size="icon" variant="ghost" onClick={() => onChange(null)}><X className="h-4 w-4" /></Button>}
    </div>
  );
}

function toInputDate(v: unknown) {
  if (!v) return "";
  const d = new Date(v as string);
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
}

export function CrudPage({
  table, title, fields, order = "created_at", ascending = false, filter, fixed, rowActions, headerExtra, renderCell,
}: {
  table: AnyTable; title: string; fields: Field[]; order?: string; ascending?: boolean;
  filter?: Record<string, string>; fixed?: Record<string, unknown>;
  rowActions?: (row: Record<string, unknown>) => ReactNode; headerExtra?: ReactNode;
  renderCell?: (f: Field, row: Record<string, unknown>) => ReactNode | undefined;
}) {
  const [editing, setEditing] = useState<Record<string, unknown> | null>(null);
  const [search, setSearch] = useState("");
  const q = useQuery({
    queryKey: ["admin", table, filter],
    queryFn: async () => {
      let qq = supabase.from(table).select("*").order(order, { ascending });
      for (const [k, v] of Object.entries(filter ?? {})) qq = qq.eq(k, v);
      const { data, error } = await qq.limit(1000);
      if (error) throw error;
      return data as Record<string, unknown>[];
    },
  });
  const hasActive = fields.some((f) => f.key === "is_active");
  const [activeF, setActiveF] = useState<"all" | "on" | "off">("all");
  const [page, setPage] = useState(0);
  const [sel, setSel] = useState<Set<string>>(new Set());
  const rows = (q.data ?? [])
    .filter((r) => !search || JSON.stringify(r).toLowerCase().includes(search.toLowerCase()))
    .filter((r) => activeF === "all" || !!r.is_active === (activeF === "on"));
  const { pageRows, pages, page: cur } = paginate(rows, page);
  const listFields = fields.filter((f) => f.list);
  const allOnPage = pageRows.length > 0 && pageRows.every((r) => sel.has(r.id as string));
  const toggle = (id: string, on: boolean) => setSel((s) => { const n = new Set(s); if (on) n.add(id); else n.delete(id); return n; });
  const bulk = async (kind: "on" | "off" | "delete") => {
    const ids = [...sel];
    if (kind === "delete" && !confirm(`Delete ${ids.length}? / حذف ${ids.length}؟`)) return;
    const res = kind === "delete" ? await supabase.from(table).delete().in("id", ids) : await supabase.from(table).update({ is_active: kind === "on" } as never).in("id", ids);
    if (res.error) return toast.error(res.error.message);
    toast.success(`✓ ${ids.length}`); setSel(new Set()); q.refetch();
  };

  const save = async () => {
    if (!editing) return;
    const payload: Record<string, unknown> = { ...fixed };
    for (const f of fields) {
      let v = editing[f.key];
      if (f.type === "number") v = v === "" || v == null ? null : Number(v);
      if (f.type === "datetime") v = v ? new Date(v as string).toISOString() : null;
      if ((f.type === "text" || f.type === "textarea" || !f.type) && v === "") v = null;
      if (f.required && (v == null || v === "")) return toast.error(`${f.label} *`);
      payload[f.key] = v;
    }
    const res = editing.id
      ? await supabase.from(table).update(payload as never).eq("id", editing.id as string)
      : await supabase.from(table).insert(payload as never);
    if (res.error) return toast.error(res.error.message);
    toast.success("✓");
    setEditing(null);
    q.refetch();
  };
  const del = async (id: string) => {
    if (!confirm("Delete?")) return;
    const { error } = await supabase.from(table).delete().eq("id", id);
    if (error) toast.error(error.message); else q.refetch();
  };
  const blank = () => Object.fromEntries(fields.map((f) => [f.key, f.default ?? (f.type === "bool" ? true : f.type === "images" ? [] : "")]));

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-xl font-bold tracking-tight">{title}</h1>
        <div className="flex flex-wrap items-center gap-2">
          {hasActive && <Segmented value={activeF} onChange={(v) => { setActiveF(v); setPage(0); }} options={[{ value: "all", label: "الكل" }, { value: "on", label: "نشط" }, { value: "off", label: "مخفي" }]} />}
          <Input placeholder="Search / بحث" value={search} onChange={(e) => { setSearch(e.target.value); setPage(0); }} className="h-9 w-48" />
          {headerExtra}
          <Button size="sm" onClick={() => setEditing(blank())}><Plus className="h-4 w-4" />Add / إضافة</Button>
        </div>
      </div>
      <BulkBar count={sel.size} onClear={() => setSel(new Set())}>
        {hasActive && <><Button size="sm" variant="outline" onClick={() => bulk("on")}>إظهار / Activate</Button><Button size="sm" variant="outline" onClick={() => bulk("off")}>إخفاء / Hide</Button></>}
        <Button size="sm" variant="outline" className="text-destructive" onClick={() => bulk("delete")}><Trash2 className="h-4 w-4" />حذف</Button>
      </BulkBar>
      {q.isLoading ? <RowSkeleton n={5} /> : q.error ? <ErrorState onRetry={() => q.refetch()} message={(q.error as Error).message} /> : !rows.length ? <EmptyState title="—" /> : (
        <div className="space-y-2"><div className="overflow-x-auto rounded-md border bg-card">
          <table className="w-full text-sm">
            <thead className="sticky top-0 bg-muted/60 text-start text-xs text-muted-foreground"><tr><th className="w-10 p-3"><Check label="select all" checked={allOnPage} onChange={(v) => setSel((s) => { const n = new Set(s); pageRows.forEach((r) => (v ? n.add(r.id as string) : n.delete(r.id as string))); return n; })} /></th>{listFields.map((f) => <th key={f.key} className="p-3 text-start font-semibold">{f.label}</th>)}<th /></tr></thead>
            <tbody className="divide-y">
              {pageRows.map((r) => (
                <tr key={r.id as string} className={sel.has(r.id as string) ? "bg-muted/40" : "hover:bg-muted/30"}>
                  <td className="p-3"><Check label="select" checked={sel.has(r.id as string)} onChange={(v) => toggle(r.id as string, v)} /></td>
                  {listFields.map((f) => (
                    <td key={f.key} className="p-3">
                      {renderCell?.(f, r) ?? (f.type === "image" ? (r[f.key] ? <img src={r[f.key] as string} alt="" className="h-10 w-10 rounded object-cover" /> : null)
                        : f.type === "images" ? ((r[f.key] as string[])?.[0] ? <img src={(r[f.key] as string[])[0]} alt="" className="h-10 w-10 rounded object-cover" /> : null)
                        : f.type === "bool" ? (r[f.key] ? "✓" : "—")
                        : f.type === "select" ? f.options?.find((o) => o.value === r[f.key])?.label ?? "—"
                        : String(r[f.key] ?? "—"))}
                    </td>
                  ))}
                  <td className="whitespace-nowrap p-2 text-end">
                    {rowActions?.(r)}
                    <Button size="icon" variant="ghost" onClick={() => setEditing({ ...r })}><Pencil className="h-4 w-4" /></Button>
                    <Button size="icon" variant="ghost" onClick={() => del(r.id as string)}><Trash2 className="h-4 w-4 text-destructive" /></Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div><Pager page={cur} pages={pages} total={rows.length} onPage={setPage} /></div>
      )}

      <Dialog open={!!editing} onOpenChange={(o) => !o && setEditing(null)}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
          <DialogHeader><DialogTitle>{title}</DialogTitle></DialogHeader>
          {editing && (
            <div className="grid gap-3 sm:grid-cols-2">
              {fields.map((f) => {
                const v = editing[f.key];
                const set = (nv: unknown) => setEditing({ ...editing, [f.key]: nv });
                const wide = f.type === "textarea" || f.type === "images";
                return (
                  <div key={f.key} className={wide ? "sm:col-span-2" : ""}>
                    <Label className="mb-1 block">{f.label}{f.required && " *"}</Label>
                    {f.type === "bool" ? <Switch checked={!!v} onCheckedChange={set} />
                      : f.type === "textarea" ? <Textarea value={(v as string) ?? ""} onChange={(e) => set(e.target.value)} />
                      : f.type === "select" ? (
                        <select className="h-9 w-full rounded-md border bg-background px-2" value={(v as string) ?? ""} onChange={(e) => set(e.target.value || null)}>
                          <option value="">—</option>{f.options?.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                        </select>)
                      : f.type === "image" ? <ImageInput value={(v as string) ?? null} onChange={set} folder={table} />
                      : f.type === "images" ? (
                        <div className="flex flex-wrap gap-2">
                          {((v as string[]) ?? []).map((src, i) => (
                            <div key={i} className="relative"><img src={src} alt="" className="h-16 w-16 rounded-lg object-cover" />
                              <button type="button" className="absolute -end-1 -top-1 rounded-full bg-destructive p-0.5 text-destructive-foreground" onClick={() => set((v as string[]).filter((_, j) => j !== i))}><X className="h-3 w-3" /></button></div>
                          ))}
                          <ImageInput value={null} onChange={(u) => u && set([...((v as string[]) ?? []), u])} folder={table} />
                        </div>)
                      : f.type === "datetime" ? <Input type="datetime-local" value={toInputDate(v)} onChange={(e) => set(e.target.value)} />
                      : f.type === "color" ? <Input type="color" value={(v as string) || "#000000"} onChange={(e) => set(e.target.value)} />
                      : <Input type={f.type === "number" ? "number" : "text"} step="any" value={(v as string | number) ?? ""} onChange={(e) => set(e.target.value)} />}
                  </div>
                );
              })}
              <div className="flex gap-2 sm:col-span-2"><Button onClick={save}>Save / حفظ</Button><Button variant="ghost" onClick={() => setEditing(null)}>Cancel</Button></div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
