import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { GripVertical, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import type { StoreSettings } from "@/lib/store-settings";
import { fillTemplate, isSafeHttpsUrl, normalizeEgyptPhone, waLink, WA_VARIABLES } from "@/lib/whatsapp";
import { PLATFORMS, socialLinksQuery, type Platform } from "@/lib/social";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";

type Props = { s: StoreSettings; set: <K extends keyof StoreSettings>(k: K, v: StoreSettings[K]) => void };

const TEMPLATES = [
  ["whatsapp_message_general", "رسالة عامة / General"],
  ["whatsapp_message_product", "رسالة المنتج / Product"],
  ["whatsapp_message_order", "رسالة الطلب / Order"],
  ["whatsapp_reply_hours_text", "مواعيد الرد / Reply hours"],
] as const;

const SAMPLE = { store_name: "", product_name: "قميص كتان", product_url: "https://example.com/product/1", size: "L", color: "أزرق", order_number: 1024 };

/** WhatsApp fields (saved with the main Save button) + social links manager (saved per row). */
export function ContactSocialSettings({ s, set }: Props) {
  const [phone, setPhone] = useState(s.whatsapp_number ?? "");
  const phoneOk = phone === "" || !!normalizeEgyptPhone(phone);
  const sample = { ...SAMPLE, store_name: s.name_ar };
  const general = fillTemplate(s.whatsapp_message_general_ar ?? "", sample);

  return (
    <section className="space-y-4 rounded-2xl bg-card p-4 shadow-card">
      <div className="flex items-center justify-between">
        <h2 className="font-bold">التواصل وواتساب / Contact & WhatsApp</h2>
        <div className="flex items-center gap-2 text-sm"><span>تفعيل / Enabled</span><Switch checked={s.whatsapp_enabled} onCheckedChange={(v) => set("whatsapp_enabled", v)} /></div>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <Label>رقم واتساب / WhatsApp number</Label>
          <Input dir="ltr" placeholder="01xxxxxxxxx" value={phone} onChange={(e) => {
            setPhone(e.target.value);
            const n = normalizeEgyptPhone(e.target.value);
            set("whatsapp_number", e.target.value.trim() === "" ? null : n ?? s.whatsapp_number);
          }} />
          {!phoneOk ? <p className="mt-1 text-xs text-destructive">رقم مصري غير صحيح / Invalid Egyptian number</p>
            : s.whatsapp_number && <p className="mt-1 text-xs text-muted-foreground" dir="ltr">→ {s.whatsapp_number}</p>}
        </div>
        <div className="flex items-end">
          <Button type="button" variant="outline" disabled={!s.whatsapp_number || !phoneOk}
            onClick={() => window.open(waLink(s.whatsapp_number!, general), "_blank", "noopener,noreferrer")}>اختبار / Test</Button>
        </div>
      </div>
      <p className="text-xs text-muted-foreground">المتغيرات / Variables: <span dir="ltr">{WA_VARIABLES.join(" ")}</span></p>
      {TEMPLATES.map(([k, label]) => (
        <div key={k} className="grid gap-3 sm:grid-cols-2">
          {(["ar", "en"] as const).map((l) => {
            const key = `${k}_${l}` as keyof StoreSettings;
            const v = (s[key] as string | null) ?? "";
            return (
              <div key={l}>
                <Label>{label} ({l.toUpperCase()})</Label>
                <Textarea dir={l === "ar" ? "rtl" : "ltr"} rows={2} value={v} onChange={(e) => set(key, e.target.value as never)} />
                <p className="mt-1 rounded-lg bg-muted p-2 text-xs" dir={l === "ar" ? "rtl" : "ltr"}>{fillTemplate(v, { ...sample, store_name: l === "ar" ? s.name_ar : s.name_en })}</p>
              </div>
            );
          })}
        </div>
      ))}
      <SocialManager />
    </section>
  );
}

function SocialManager() {
  const qc = useQueryClient();
  const { data = [] } = useQuery(socialLinksQuery);
  const [drag, setDrag] = useState<number | null>(null);
  const refresh = () => qc.invalidateQueries({ queryKey: socialLinksQuery.queryKey });
  const fail = (e: { message: string } | null) => { if (e) { toast.error(e.message); return true; } return false; };

  const add = async () => {
    const used = new Set(data.map((d) => d.platform));
    const platform = PLATFORMS.find((p) => !used.has(p)) ?? "facebook";
    if (fail((await supabase.from("social_links").insert({ platform, url: `https://${platform}.com/`, is_active: false, sort_order: data.length + 1 })).error)) return;
    refresh();
  };
  const update = async (id: string, patch: { platform?: string; url?: string; is_active?: boolean }) => {
    if (patch.url !== undefined && !isSafeHttpsUrl(patch.url)) return toast.error("الرابط يجب أن يبدأ بـ https:// / URL must start with https://");
    if (fail((await supabase.from("social_links").update(patch).eq("id", id)).error)) return;
    toast.success("✓"); refresh();
  };
  const remove = async (id: string) => { if (!fail((await supabase.from("social_links").delete().eq("id", id)).error)) refresh(); };
  const drop = async (to: number) => {
    if (drag === null || drag === to) return;
    const list = [...data]; const [m] = list.splice(drag, 1); list.splice(to, 0, m); setDrag(null);
    qc.setQueryData(socialLinksQuery.queryKey, list);
    await Promise.all(list.map((l, i) => supabase.from("social_links").update({ sort_order: i + 1 }).eq("id", l.id)));
    refresh();
  };

  return (
    <div className="space-y-2 border-t pt-4">
      <div className="flex items-center justify-between"><h3 className="font-bold">روابط التواصل / Social links</h3><Button size="sm" variant="outline" onClick={add}><Plus className="h-4 w-4" />إضافة / Add</Button></div>
      {data.map((l, i) => (
        <div key={l.id} draggable onDragStart={() => setDrag(i)} onDragOver={(e) => e.preventDefault()} onDrop={() => drop(i)}
          className="flex flex-wrap items-center gap-2 rounded-xl border p-2">
          <GripVertical className="h-4 w-4 cursor-grab text-muted-foreground" />
          <select className="h-9 rounded-md border bg-background px-2 text-sm" value={l.platform} onChange={(e) => update(l.id, { platform: e.target.value as Platform })}>
            {PLATFORMS.map((p) => <option key={p} value={p}>{p}</option>)}
          </select>
          <Input dir="ltr" className="min-w-[180px] flex-1" defaultValue={l.url} onBlur={(e) => e.target.value !== l.url && update(l.id, { url: e.target.value.trim() })} />
          <Switch checked={l.is_active} onCheckedChange={(v) => update(l.id, { is_active: v })} />
          <Button size="icon" variant="ghost" onClick={() => remove(l.id)} aria-label="delete"><Trash2 className="h-4 w-4" /></Button>
        </div>
      ))}
    </div>
  );
}
