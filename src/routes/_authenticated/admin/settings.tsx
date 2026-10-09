import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { settingsQuery, type StoreSettings } from "@/lib/store-settings";
import { ImageInput } from "@/components/admin/CrudPage";
import { ErrorState, RowSkeleton } from "@/components/store/states";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { ContactSocialSettings } from "@/components/admin/ContactSocialSettings";
import { useBi } from "@/lib/bilingual";
import { financeSettingsError } from "@/lib/finance-settings";

export const Route = createFileRoute("/_authenticated/admin/settings")({ component: Page });

/** [column, min, max, label] — the same ranges as the database CHECK constraints. */
const DISPATCH_LIMITS = [
  ["driver_accept_timeout_seconds", 30, 1800, "مهلة رد المندوب (ثانية) / Driver answer time (s)"],
  ["max_active_orders_per_driver", 1, 20, "أقصى طلبات نشطة للمندوب / Max active orders per driver"],
  [
    "dispatch_alert_after_minutes",
    1,
    1440,
    "تنبيه بعد (دقيقة) بدون مندوب / Alert after (min) without a driver",
  ],
] as const;

const FLAGS = [
  "delivery_tracking",
  "whatsapp_button",
  "online_payment",
  "loyalty",
  "ai_assistant",
  "ai_analytics",
] as const;

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-2xl bg-card p-4 shadow-card">
      <h2 className="mb-3 font-bold">{title}</h2>
      <div className="grid gap-3 sm:grid-cols-2">{children}</div>
    </section>
  );
}

function Page() {
  const bi = useBi();
  const qc = useQueryClient();
  const q = useQuery(settingsQuery);
  const [s, setS] = useState<StoreSettings | null>(null);
  useEffect(() => {
    if (q.data) setS(q.data);
  }, [q.data]);
  if (q.error)
    return <ErrorState onRetry={() => q.refetch()} message={(q.error as Error).message} />;
  if (!s) return <RowSkeleton n={6} />;
  const set = <K extends keyof StoreSettings>(k: K, v: StoreSettings[K]) => setS({ ...s, [k]: v });
  const txt = (k: keyof StoreSettings, label: string, type = "text") => (
    <div>
      <Label htmlFor={`settings-${String(k)}`}>{bi(label)}</Label>
      <Input
        id={`settings-${String(k)}`}
        type={type}
        step="any"
        value={(s[k] as string | number | null) ?? ""}
        onChange={(e) =>
          set(
            k,
            (type === "number"
              ? e.target.value === ""
                ? null
                : Number(e.target.value)
              : e.target.value) as never,
          )
        }
      />
    </div>
  );
  const features = (s.features ?? {}) as Record<string, boolean>;
  const hours = (s.working_hours ?? {}) as Record<string, string>;
  const social = (s.social_links ?? {}) as Record<string, string>;
  const slots = ((s.delivery_slots as string[]) ?? []).join(", ");

  const save = async () => {
    const bad = DISPATCH_LIMITS.find(([k, min, max]) => {
      const v = Number(s[k]);
      return !Number.isInteger(v) || v < min || v > max;
    });
    if (bad) return toast.error(`${bi(bad[3])}: ${bad[1]}–${bad[2]}`);
    const financeError = financeSettingsError(s);
    if (financeError) return toast.error(bi(financeError));
    const { id: _id, updated_at: _u, ...rest } = s;
    const { error } = await supabase.from("store_settings").update(rest).eq("id", 1);
    if (error) return toast.error(error.message);
    toast.success("✓");
    qc.invalidateQueries({ queryKey: settingsQuery.queryKey });
  };

  return (
    <div className="max-w-4xl space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-extrabold">{bi("إعدادات المتجر / Store settings")}</h1>
        <Button onClick={save}>{bi("Save / حفظ")}</Button>
      </div>
      <Section title={bi("الهوية / Branding")}>
        {txt("name_ar", "اسم المتجر")}
        {txt("name_en", "Store name (EN)")}
        {txt("tagline_ar", "الشعار النصي")}
        {txt("tagline_en", "Tagline (EN)")}
        <div>
          <Label>Logo</Label>
          <ImageInput
            value={s.logo_url}
            onChange={(v) => set("logo_url", v)}
            folder="branding"
            label="Logo"
          />
        </div>
        <div className="flex gap-4">
          <div>
            <Label htmlFor="settings-primary_color">Primary</Label>
            <Input
              id="settings-primary_color"
              type="color"
              className="h-10 w-20"
              value={s.primary_color}
              onChange={(e) => set("primary_color", e.target.value)}
            />
          </div>
          <div>
            <Label htmlFor="settings-secondary_color">Secondary</Label>
            <Input
              id="settings-secondary_color"
              type="color"
              className="h-10 w-20"
              value={s.secondary_color}
              onChange={(e) => set("secondary_color", e.target.value)}
            />
          </div>
        </div>
        <div>
          <Label htmlFor="settings-default_language">Default language</Label>
          <select
            id="settings-default_language"
            className="h-9 w-full rounded-md border bg-background px-2"
            value={s.default_language}
            onChange={(e) => set("default_language", e.target.value)}
          >
            <option value="ar">العربية</option>
            <option value="en">English</option>
          </select>
        </div>
      </Section>
      <Section title={bi("العملة / Currency")}>
        {txt("currency_code", "Code (EGP, SAR...)")}
        {txt("currency_symbol_ar", "الرمز (عربي)")}
        {txt("currency_symbol_en", "Symbol (EN)")}
      </Section>
      <Section title={bi("التوصيل / Delivery")}>
        {txt("delivery_fee", "Delivery fee", "number")}
        {txt("free_delivery_threshold", "Free delivery over", "number")}
        {txt("min_order_amount", "Minimum order", "number")}
        {txt("return_window_days", "مدة الاسترجاع (أيام) / Return window (days)", "number")}
        <div>
          <Label htmlFor="settings-delivery_slots">Delivery slots (comma separated)</Label>
          <Input
            id="settings-delivery_slots"
            dir="ltr"
            defaultValue={slots}
            onBlur={(e) =>
              set(
                "delivery_slots",
                e.target.value
                  .split(",")
                  .map((x) => x.trim())
                  .filter(Boolean),
              )
            }
          />
        </div>
        <div>
          <Label htmlFor="settings-opens">Opens</Label>
          <Input
            id="settings-opens"
            type="time"
            value={hours.open ?? ""}
            onChange={(e) => set("working_hours", { ...hours, open: e.target.value })}
          />
        </div>
        <div>
          <Label htmlFor="settings-closes">Closes</Label>
          <Input
            id="settings-closes"
            type="time"
            value={hours.close ?? ""}
            onChange={(e) => set("working_hours", { ...hours, close: e.target.value })}
          />
        </div>
      </Section>
      <Section title={bi("التوزيع التلقائي / Auto dispatch")}>
        <div className="flex items-center justify-between rounded-xl border p-3 sm:col-span-2">
          <span>
            <span id="feature-auto_dispatch_enabled" className="block text-sm font-semibold">
              {bi("توزيع الطلبات تلقائياً على المناديب / Offer orders to drivers automatically")}
            </span>
            <span className="block text-xs text-muted-foreground">
              {features.delivery_tracking
                ? "عند الوصول لحالة البدء يُعرض الطلب على أنسب مندوب متاح / When an order reaches the start status it is offered to the best available driver"
                : "يحتاج تفعيل delivery_tracking أولاً / Needs delivery_tracking turned on first"}
            </span>
          </span>
          <Switch
            aria-labelledby="feature-auto_dispatch_enabled"
            checked={!!features.auto_dispatch_enabled}
            disabled={!features.delivery_tracking}
            onCheckedChange={async (v) => {
              const next = { ...features, auto_dispatch_enabled: v };
              set("features", next);
              const { error } = await supabase
                .from("store_settings")
                .update({ features: next })
                .eq("id", 1);
              if (error) return toast.error(error.message);
              toast.success("✓");
              qc.invalidateQueries({ queryKey: settingsQuery.queryKey });
            }}
          />
        </div>
        <div>
          <Label htmlFor="settings-dispatch_trigger_status">
            {bi("يبدأ التوزيع عند / Start dispatching when the order is")}
          </Label>
          <select
            id="settings-dispatch_trigger_status"
            className="h-9 w-full rounded-md border bg-background px-2"
            value={s.dispatch_trigger_status}
            onChange={(e) => set("dispatch_trigger_status", e.target.value)}
          >
            <option value="confirmed">{bi("مؤكد / Confirmed")}</option>
            <option value="preparing">{bi("قيد التجهيز / Preparing")}</option>
          </select>
        </div>
        {DISPATCH_LIMITS.map(([k, min, max, label]) => (
          <div key={k}>
            <Label htmlFor={`settings-${k}`}>
              {bi(label)} ({min}–{max})
            </Label>
            <Input
              id={`settings-${k}`}
              type="number"
              inputMode="numeric"
              min={min}
              max={max}
              step={1}
              value={s[k] ?? ""}
              onChange={(e) =>
                set(k, (e.target.value === "" ? "" : Number(e.target.value)) as never)
              }
            />
          </div>
        ))}
      </Section>
      <Section title={bi("مستحقات المناديب / Driver payments")}>
        <div>
          <Label htmlFor="settings-driver_commission_type">
            {bi("نوع العمولة / Commission type")}
          </Label>
          <select
            id="settings-driver_commission_type"
            className="h-9 w-full rounded-md border bg-background px-2"
            value={s.driver_commission_type}
            onChange={(e) => set("driver_commission_type", e.target.value)}
          >
            <option value="fixed">{bi("مبلغ ثابت لكل طلب / Fixed per order")}</option>
            <option value="percent_of_delivery_fee">
              {bi("نسبة من رسوم التوصيل / Percent of delivery fee")}
            </option>
          </select>
        </div>
        {txt(
          "driver_commission_value",
          s.driver_commission_type === "percent_of_delivery_fee"
            ? "النسبة % / Percent %"
            : "قيمة العمولة / Commission amount",
          "number",
        )}
        <div className="flex items-center justify-between rounded-xl border p-3 sm:col-span-2">
          <span>
            <span id="settings-keeps" className="block text-sm font-semibold">
              {bi("المندوب يخصم عمولته من الكاش / Driver keeps commission from cash")}
            </span>
            <span className="block text-xs text-muted-foreground">
              {bi(
                "لو مقفولة: يسلّم الكاش كله والعمولة تتصرف منفصلة / Off: hands over all cash, commission paid separately",
              )}
            </span>
          </span>
          <Switch
            aria-labelledby="settings-keeps"
            checked={s.driver_keeps_commission_from_cash}
            onCheckedChange={(v) => set("driver_keeps_commission_from_cash", v)}
          />
        </div>
        <div>
          <Label htmlFor="settings-settlement_mode">{bi("التسوية / Settlement")}</Label>
          <select
            id="settings-settlement_mode"
            className="h-9 w-full rounded-md border bg-background px-2"
            value={s.settlement_mode}
            onChange={(e) => set("settlement_mode", e.target.value)}
          >
            <option value="end_of_day">{bi("آخر اليوم / End of day")}</option>
            <option value="per_order">{bi("بعد كل طلب / Per order")}</option>
          </select>
        </div>
        {txt(
          "driver_cash_limit",
          "حد الكاش مع المندوب (٠ = بدون) / Driver cash limit (0 = none)",
          "number",
        )}
        {txt("timezone", "المنطقة الزمنية لليوم / Timezone for the day")}
        <div className="flex items-center justify-between rounded-xl border p-3">
          <span id="settings-staff-settle" className="text-sm font-semibold">
            {bi("الموظفين يقدروا يستلموا تسويات / Staff may record settlements")}
          </span>
          <Switch
            aria-labelledby="settings-staff-settle"
            checked={s.staff_can_record_settlements}
            onCheckedChange={(v) => set("staff_can_record_settlements", v)}
          />
        </div>
      </Section>
      <Section title={bi("التواصل / Contact")}>
        {txt("contact_phone", "Phone")}
        {txt("email", "Email")}
      </Section>
      <ContactSocialSettings s={s} set={set} />
      <Section title={bi("المزايا / Feature flags")}>
        {FLAGS.map((f) => (
          <div key={f} className="flex items-center justify-between rounded-xl border p-3">
            <span id={`feature-${f}`} className="text-sm font-semibold">
              {f}
            </span>
            <Switch
              aria-labelledby={`feature-${f}`}
              checked={!!features[f]}
              onCheckedChange={async (v) => {
                const next = { ...features, [f]: v };
                set("features", next);
                const { error } = await supabase
                  .from("store_settings")
                  .update({ features: next })
                  .eq("id", 1);
                if (error) return toast.error(error.message);
                toast.success("✓");
                qc.invalidateQueries({ queryKey: settingsQuery.queryKey });
              }}
            />
          </div>
        ))}
      </Section>
    </div>
  );
}
