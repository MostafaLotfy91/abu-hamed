import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Undo2 } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useI18n, type DictKey } from "@/lib/i18n";
import { useSettings } from "@/lib/store-settings";
import { rpcErrorMessage } from "@/lib/queries";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";

type Item = {
  id: string;
  name_ar: string;
  name_en: string;
  size: string | null;
  color_ar: string | null;
  color_en: string | null;
};

/** Days left to request a return, based on the delivered timestamp and the store's return window. */
export function returnDaysLeft(deliveredAt: string | null, windowDays: number, now = Date.now()) {
  if (!deliveredAt) return -1;
  const end = new Date(deliveredAt).getTime() + windowDays * 86400000;
  return Math.ceil((end - now) / 86400000);
}

export function ReturnSection({
  orderId,
  status,
  deliveredAt,
  items,
}: {
  orderId: string;
  status: string;
  deliveredAt: string | null;
  items: Item[];
}) {
  const { t, tx, lang } = useI18n();
  const { settings } = useSettings();
  const qc = useQueryClient();
  const windowDays = Number(settings?.return_window_days ?? 0);
  const left = returnDaysLeft(deliveredAt, windowDays);
  const reqs = useQuery({
    queryKey: ["returns", orderId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("return_requests")
        .select("*")
        .eq("order_id", orderId)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });
  const [open, setOpen] = useState(false);
  const [itemId, setItemId] = useState<string>("");
  const [kind, setKind] = useState<"return" | "exchange">("exchange");
  const [reason, setReason] = useState("");
  const [details, setDetails] = useState("");
  const [pref, setPref] = useState("");
  const [busy, setBusy] = useState(false);

  if (status !== "delivered") return null;
  const canRequest = left > 0;

  const submit = async () => {
    if (!reason.trim()) return toast.error(t("reason"));
    setBusy(true);
    const { error } = await supabase.rpc("request_return", {
      _order_id: orderId,
      _order_item_id: itemId || null,
      _kind: kind,
      _reason: reason,
      _details: details || null,
      _exchange_preference: kind === "exchange" ? pref || null : null,
    } as never);
    setBusy(false);
    if (error) return toast.error(rpcErrorMessage(error.message, lang));
    toast.success(t("saved"));
    setOpen(false);
    setReason("");
    setDetails("");
    setPref("");
    qc.invalidateQueries({ queryKey: ["returns", orderId] });
  };

  const itemName = (id: string | null) => {
    const i = items.find((x) => x.id === id);
    return i ? `${tx(i, "name")}${i.size ? ` · ${i.size}` : ""}` : t("whole_order");
  };

  return (
    <section className="space-y-3 rounded-3xl bg-card p-4 shadow-card">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="font-extrabold">{t("return_exchange")}</h2>
          <p className="text-xs text-muted-foreground">
            {t("return_window_note").replace("{n}", String(windowDays))}
          </p>
        </div>
        {canRequest && (
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
              <Button size="sm" variant="outline" className="gap-1">
                <Undo2 className="h-4 w-4" />
                {t("request_return")}
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>{t("request_return")}</DialogTitle>
              </DialogHeader>
              <div className="space-y-3">
                <div className="grid grid-cols-2 gap-2">
                  {(["exchange", "return"] as const).map((k) => (
                    <button
                      key={k}
                      type="button"
                      onClick={() => setKind(k)}
                      className={`rounded-xl border p-2 text-sm font-semibold ${kind === k ? "border-primary bg-primary-soft text-primary" : ""}`}
                    >
                      {t(k)}
                    </button>
                  ))}
                </div>
                <div>
                  <Label htmlFor="rr-item">{t("items")}</Label>
                  <select
                    id="rr-item"
                    className="mt-1 h-11 w-full rounded-md border bg-background px-2 text-sm"
                    value={itemId}
                    onChange={(e) => setItemId(e.target.value)}
                  >
                    <option value="">{t("whole_order")}</option>
                    {items.map((i) => (
                      <option key={i.id} value={i.id}>
                        {itemName(i.id)}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <Label htmlFor="rr-reason">{t("reason")} *</Label>
                  <Input
                    id="rr-reason"
                    className="h-11"
                    value={reason}
                    maxLength={200}
                    onChange={(e) => setReason(e.target.value)}
                  />
                </div>
                {kind === "exchange" && (
                  <div>
                    <Label htmlFor="rr-pref">{t("exchange_pref")}</Label>
                    <Input
                      id="rr-pref"
                      className="h-11"
                      value={pref}
                      maxLength={200}
                      onChange={(e) => setPref(e.target.value)}
                    />
                  </div>
                )}
                <div>
                  <Label htmlFor="rr-notes">{t("notes")}</Label>
                  <Textarea
                    id="rr-notes"
                    value={details}
                    maxLength={1000}
                    rows={2}
                    onChange={(e) => setDetails(e.target.value)}
                  />
                </div>
                <Button className="h-11 w-full" disabled={busy} onClick={submit}>
                  {t("submit")}
                </Button>
              </div>
            </DialogContent>
          </Dialog>
        )}
      </div>
      {!!reqs.data?.length && (
        <ul className="divide-y text-sm">
          {reqs.data.map((r) => (
            <li key={r.id} className="flex items-center justify-between gap-2 py-2">
              <div>
                <p className="font-semibold">
                  {t(r.kind as DictKey)} · {itemName(r.order_item_id)}
                </p>
                <p className="text-xs text-muted-foreground">{r.reason}</p>
                {r.admin_note && <p className="text-xs">{r.admin_note}</p>}
              </div>
              <span className="rounded-full bg-secondary px-2 py-0.5 text-xs font-semibold">
                {t(`rr_${r.status}` as DictKey)}
              </span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
