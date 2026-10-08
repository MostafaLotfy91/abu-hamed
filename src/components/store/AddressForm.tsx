import { useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { useI18n, type DictKey } from "@/lib/i18n";
import type { Tables } from "@/integrations/supabase/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export type Address = Tables<"addresses">;

export function AddressForm({
  initial,
  onDone,
  onCancel,
}: {
  initial?: Address | null;
  onDone: (a: Address) => void;
  onCancel?: () => void;
}) {
  const { t } = useI18n();
  const { user } = useAuth();
  const [f, setF] = useState({
    label: initial?.label ?? "",
    recipient_name: initial?.recipient_name ?? "",
    phone: initial?.phone ?? "",
    city: initial?.city ?? "",
    area: initial?.area ?? "",
    street: initial?.street ?? "",
    building: initial?.building ?? "",
    floor: initial?.floor ?? "",
    apartment: initial?.apartment ?? "",
    notes: initial?.notes ?? "",
  });
  const [busy, setBusy] = useState(false);
  const field = (k: keyof typeof f, label: DictKey, req = false, type = "text") => (
    <div>
      <Label htmlFor={`addr-${String(k)}`}>
        {t(label)}
        {req && " *"}
      </Label>
      <Input
        id={`addr-${String(k)}`}
        type={type}
        inputMode={type === "tel" ? "tel" : undefined}
        dir={type === "tel" ? "ltr" : undefined}
        className="h-11"
        value={f[k]}
        required={req}
        maxLength={200}
        onChange={(e) => setF({ ...f, [k]: e.target.value })}
      />
    </div>
  );
  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;
    setBusy(true);
    const payload = { ...f, label: f.label || "home", user_id: user.id };
    const res = initial
      ? await supabase.from("addresses").update(payload).eq("id", initial.id).select().single()
      : await supabase.from("addresses").insert(payload).select().single();
    setBusy(false);
    if (res.error) return toast.error(res.error.message);
    onDone(res.data);
  };
  return (
    <form onSubmit={save} className="grid grid-cols-2 gap-3">
      {field("label", "label")}
      {field("phone", "phone", true, "tel")}
      {field("recipient_name", "full_name")}
      {field("city", "city", true)}
      {field("area", "area")}
      {field("street", "street", true)}
      {field("building", "building")}
      {field("floor", "floor")}
      {field("apartment", "apartment")}
      {field("notes", "notes")}
      <div className="col-span-2 flex gap-2">
        <Button type="submit" disabled={busy}>
          {t("save")}
        </Button>
        {onCancel && (
          <Button type="button" variant="ghost" onClick={onCancel}>
            {t("cancel")}
          </Button>
        )}
      </div>
    </form>
  );
}

export function addressLine(a: Partial<Address>) {
  return [a.street, a.building, a.area, a.city].filter(Boolean).join("، ");
}
