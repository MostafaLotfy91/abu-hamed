import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useI18n } from "@/lib/i18n";
import { DriverStatusBadge, useDrivers } from "@/lib/drivers";
import { EmptyState, RowSkeleton } from "@/components/store/states";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";

export const Route = createFileRoute("/_authenticated/admin/drivers")({ component: Page });

function Page() {
  const { lang } = useI18n();
  const ar = lang === "ar";
  const q = useDrivers();
  const [email, setEmail] = useState("");
  const add = async (e: React.FormEvent) => {
    e.preventDefault();
    const { error } = await supabase.rpc("admin_add_driver", { _email: email });
    if (error) toast.error(error.message.includes("user_not_found") ? (ar ? "لا يوجد حساب بهذا البريد — يجب أن يسجل المندوب أولاً" : "No account with that email — the driver must sign up first") : error.message);
    else { setEmail(""); toast.success(ar ? "تمت إضافة المندوب" : "Driver added"); q.refetch(); }
  };
  const remove = async (id: string) => {
    if (!confirm(ar ? "إزالة هذا المندوب؟" : "Remove this driver?")) return;
    const { error } = await supabase.rpc("admin_remove_driver", { _user_id: id });
    if (error) toast.error(error.message); else q.refetch();
  };
  const setActive = async (id: string, v: boolean) => {
    const { error } = await supabase.from("driver_profiles").update({ is_active: v } as never).eq("user_id", id);
    if (error) toast.error(error.message); else q.refetch();
  };
  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-extrabold">{ar ? "المندوبين" : "Drivers"}</h1>
      <form onSubmit={add} className="flex max-w-md gap-2">
        <Input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} placeholder={ar ? "بريد حساب المندوب" : "Driver account email"} />
        <Button type="submit">{ar ? "إضافة" : "Add"}</Button>
      </form>
      <p className="text-xs text-muted-foreground">{ar ? "يفتح المندوب التطبيق من /driver ويمكنه تثبيته على الهاتف." : "Drivers open the app at /driver and can install it on their phone."}</p>
      {q.isLoading ? <RowSkeleton n={3} /> : !q.data?.length ? <EmptyState title={ar ? "لا يوجد مندوبين" : "No drivers yet"} /> : (
        <div className="divide-y rounded-2xl bg-card shadow-card">
          {q.data.map((d) => (
            <div key={d.user_id} className="flex flex-wrap items-center gap-3 p-4">
              <div className="flex-1">
                <p className="font-semibold">{d.full_name ?? d.email}</p>
                <p className="text-xs text-muted-foreground" dir="ltr">{[d.email, d.phone].filter(Boolean).join(" · ")}</p>
              </div>
              <DriverStatusBadge status={d.status} active={d.is_active} />
              <label className="flex items-center gap-2 text-xs">{ar ? "مفعّل" : "Active"}<Switch checked={d.is_active} onCheckedChange={(v) => setActive(d.user_id, v)} /></label>
              <Button size="sm" variant="ghost" className="text-destructive" onClick={() => remove(d.user_id)}>{ar ? "إزالة" : "Remove"}</Button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
