import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { settingsQuery, type StoreSettings } from "@/lib/store-settings";
import { ImageInput } from "@/components/admin/CrudPage";
import { RowSkeleton } from "@/components/store/states";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";

export const Route = createFileRoute("/_authenticated/admin/settings")({ component: Page });

const FLAGS = ["delivery_tracking", "online_payment", "loyalty", "ai_assistant", "ai_analytics"] as const;

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return <section className="rounded-2xl bg-card p-4 shadow-card"><h2 className="mb-3 font-bold">{title}</h2><div className="grid gap-3 sm:grid-cols-2">{children}</div></section>;
}

function Page() {
  const qc = useQueryClient();
  const q = useQuery(settingsQuery);
  const [s, setS] = useState<StoreSettings | null>(null);
  useEffect(() => { if (q.data) setS(q.data); }, [q.data]);
  if (!s) return <RowSkeleton n={6} />;
  const set = <K extends keyof StoreSettings>(k: K, v: StoreSettings[K]) => setS({ ...s, [k]: v });
  const txt = (k: keyof StoreSettings, label: string, type = "text") => (
    <div><Label>{label}</Label><Input type={type} step="any" value={(s[k] as string | number | null) ?? ""} onChange={(e) => set(k, (type === "number" ? (e.target.value === "" ? null : Number(e.target.value)) : e.target.value) as never)} /></div>
  );
  const features = (s.features ?? {}) as Record<string, boolean>;
  const hours = (s.working_hours ?? {}) as Record<string, string>;
  const social = (s.social_links ?? {}) as Record<string, string>;
  const slots = ((s.delivery_slots as string[]) ?? []).join(", ");

  const save = async () => {
    const { id: _id, updated_at: _u, ...rest } = s;
    const { error } = await supabase.from("store_settings").update(rest).eq("id", 1);
    if (error) return toast.error(error.message);
    toast.success("✓");
    qc.invalidateQueries({ queryKey: settingsQuery.queryKey });
  };

  return (
    <div className="max-w-4xl space-y-4">
      <div className="flex items-center justify-between"><h1 className="text-xl font-extrabold">إعدادات المتجر / Store settings</h1><Button onClick={save}>Save / حفظ</Button></div>
      <Section title="الهوية / Branding">
        {txt("name_ar", "اسم المتجر")}{txt("name_en", "Store name (EN)")}
        {txt("tagline_ar", "الشعار النصي")}{txt("tagline_en", "Tagline (EN)")}
        <div><Label>Logo</Label><ImageInput value={s.logo_url} onChange={(v) => set("logo_url", v)} folder="branding" /></div>
        <div className="flex gap-4">
          <div><Label>Primary</Label><Input type="color" className="h-10 w-20" value={s.primary_color} onChange={(e) => set("primary_color", e.target.value)} /></div>
          <div><Label>Secondary</Label><Input type="color" className="h-10 w-20" value={s.secondary_color} onChange={(e) => set("secondary_color", e.target.value)} /></div>
        </div>
        <div><Label>Default language</Label>
          <select className="h-9 w-full rounded-md border bg-background px-2" value={s.default_language} onChange={(e) => set("default_language", e.target.value)}><option value="ar">العربية</option><option value="en">English</option></select>
        </div>
      </Section>
      <Section title="العملة / Currency">
        {txt("currency_code", "Code (EGP, SAR...)")}{txt("currency_symbol_ar", "الرمز (عربي)")}{txt("currency_symbol_en", "Symbol (EN)")}
      </Section>
      <Section title="التوصيل / Delivery">
        {txt("delivery_fee", "Delivery fee", "number")}{txt("free_delivery_threshold", "Free delivery over", "number")}{txt("min_order_amount", "Minimum order", "number")}{txt("return_window_days", "مدة الاسترجاع (أيام) / Return window (days)", "number")}
        <div><Label>Delivery slots (comma separated)</Label><Input dir="ltr" defaultValue={slots} onBlur={(e) => set("delivery_slots", e.target.value.split(",").map((x) => x.trim()).filter(Boolean))} /></div>
        <div><Label>Opens</Label><Input type="time" value={hours.open ?? ""} onChange={(e) => set("working_hours", { ...hours, open: e.target.value })} /></div>
        <div><Label>Closes</Label><Input type="time" value={hours.close ?? ""} onChange={(e) => set("working_hours", { ...hours, close: e.target.value })} /></div>
      </Section>
      <Section title="التواصل / Contact">
        {txt("contact_phone", "Phone")}{txt("whatsapp_number", "WhatsApp")}{txt("email", "Email")}
        {["facebook", "instagram", "tiktok", "x"].map((k) => (
          <div key={k}><Label className="capitalize">{k}</Label><Input dir="ltr" value={social[k] ?? ""} onChange={(e) => set("social_links", { ...social, [k]: e.target.value })} /></div>
        ))}
      </Section>
      <Section title="المزايا / Feature flags">
        {FLAGS.map((f) => (
          <div key={f} className="flex items-center justify-between rounded-xl border p-3"><span className="text-sm font-semibold">{f}</span><Switch checked={!!features[f]} onCheckedChange={(v) => set("features", { ...features, [f]: v })} /></div>
        ))}
      </Section>
    </div>
  );
}
