import { createFileRoute } from "@tanstack/react-router";
import { Printer } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useI18n } from "@/lib/i18n";
import { useSettings } from "@/lib/store-settings";
import { formatCount } from "@/lib/format";
import { useOrder } from "../orders.$id";
import { useMoney } from "@/components/store/use-money";
import { ALL_STATUSES, OrderTimeline, StatusBadge, canMoveTo, statusKey } from "@/components/store/OrderTimeline";
import { useConfirm } from "@/components/admin/ConfirmDialog";
import { addressLine } from "@/components/store/AddressForm";
import { ErrorState, RowSkeleton } from "@/components/store/states";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { DRIVER_STATUSES, DriverStatusBadge, driverStatusLabel, useDrivers, useLatestLocation } from "@/lib/drivers";
import { LiveMap } from "@/components/store/LiveMap";

export const Route = createFileRoute("/_authenticated/admin/orders/$id")({ component: Page });

function DriverAssign({ orderId, driverId, status, onDone }: { orderId: string; driverId: string | null; status: string; onDone: () => void }) {
  const { lang } = useI18n();
  const ar = lang === "ar";
  const drivers = useDrivers();
  const loc = useLatestLocation(orderId, status === "out_for_delivery");
  const assign = async (v: string) => {
    const { error } = await supabase.from("orders").update({ driver_id: v === "none" ? null : v, driver_accepted_at: null }).eq("id", orderId);
    if (error) toast.error(error.message); else { toast.success(ar ? "تم التعيين" : "Assigned"); onDone(); }
  };
  const rank = (s: string) => DRIVER_STATUSES.indexOf(s as never);
  const list = [...(drivers.data ?? [])].filter((d) => d.is_active || d.user_id === driverId).sort((a, b) => rank(a.status) - rank(b.status));
  const current = drivers.data?.find((d) => d.user_id === driverId);
  return (
    <div className="space-y-2">
      <p className="text-sm font-bold">{ar ? "المندوب" : "Driver"}</p>
      {current && (
        <div className="flex items-center justify-between rounded-xl bg-muted/50 p-2 text-sm">
          <div><p className="font-semibold">{current.full_name ?? current.email}</p>{current.phone && <a className="text-xs text-primary" dir="ltr" href={`tel:${current.phone}`}>{current.phone}</a>}</div>
          <DriverStatusBadge status={current.status} active={current.is_active} />
        </div>
      )}
      <Select value={driverId ?? "none"} onValueChange={assign} disabled={status === "delivered" || status === "cancelled"}>
        <SelectTrigger><SelectValue /></SelectTrigger>
        <SelectContent>
          <SelectItem value="none">{ar ? "بدون مندوب" : "Unassigned"}</SelectItem>
          {list.map((d) => (
            <SelectItem key={d.user_id} value={d.user_id}>{d.full_name ?? d.email} · {driverStatusLabel(d.status, ar)}</SelectItem>
          ))}
        </SelectContent>
      </Select>
      {status === "out_for_delivery" && loc.data && <LiveMap lat={loc.data.lat} lng={loc.data.lng} className="z-0 h-48 w-full overflow-hidden rounded-xl border" />}
    </div>
  );
}

function Page() {
  const { id } = Route.useParams();
  const { t, tx, lang } = useI18n();
  const { settings } = useSettings();
  const money = useMoney();
  const q = useOrder(id);
  const [confirm, confirmDialog] = useConfirm();
  if (q.isLoading) return <RowSkeleton n={4} />;
  if (q.error || !q.data) return <ErrorState onRetry={() => q.refetch()} />;
  const o = q.data;
  const a = o.address as Record<string, string>;
  const setStatus = async (s: string) => {
    if (s === "cancelled" && !(await confirm({ title: lang === "ar" ? "إلغاء هذا الطلب؟" : "Cancel this order?", description: lang === "ar" ? "يرجع المخزون والكوبون تلقائياً، ولا يمكن إعادة فتح الطلب." : "Stock and coupon use are restored; the order can't be reopened.", destructive: true }))) return;
    const { error } = await supabase.from("orders").update({ status: s }).eq("id", id);
    if (error) toast.error(error.message); else q.refetch();
  };
  return (
    <div className="grid gap-4 lg:grid-cols-[1fr_320px]">
      <section className="space-y-4 rounded-2xl bg-card p-5 shadow-card print:shadow-none">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-lg font-extrabold">{tx(settings as Record<string, unknown> | null, "name")}</p>
            <p className="text-xs text-muted-foreground" dir="ltr">{settings?.contact_phone}</p>
          </div>
          <div className="text-end">
            <p className="text-xl font-extrabold">{t("order")} #{o.order_number}</p>
            <p className="text-xs text-muted-foreground">{new Date(o.created_at).toLocaleString(lang === "ar" ? "ar-EG" : "en-US")}</p>
            <div className="mt-1"><StatusBadge status={o.status} /></div>
          </div>
        </div>
        <div className="rounded-xl bg-secondary p-3 text-sm">
          <p className="font-semibold">{a.recipient_name ?? a.label} · <span dir="ltr">{a.phone}</span></p>
          <p>{addressLine(a)} {a.floor && `· ${t("floor")} ${a.floor}`} {a.apartment && `· ${t("apartment")} ${a.apartment}`}</p>
          {a.notes && <p className="text-muted-foreground">{a.notes}</p>}
          <p className="mt-1">{t("delivery_time")}: {o.delivery_slot === "asap" ? t("asap") : o.delivery_slot} · {o.payment_method === "cod" ? t("cod") : t("online")}</p>
          {o.notes && <p className="mt-1 font-semibold">{t("order_notes")}: {o.notes}</p>}
        </div>
        <table className="w-full text-sm">
          <thead className="border-b text-xs text-muted-foreground"><tr><th className="py-2 text-start">#</th><th className="text-start">{t("description")}</th><th>{t("quantity")}</th><th>{t("price")}</th><th className="text-end">{t("total")}</th></tr></thead>
          <tbody className="divide-y">
            {o.order_items.map((i, n) => (
              <tr key={i.id}>
                <td className="py-2">{n + 1}</td>
                <td>{tx(i, "name")}{(i.size || i.color_ar) ? ` · ${[i.size, tx(i, "color")].filter(Boolean).join(" / ")}` : i.variant_name_ar ? ` · ${tx(i, "variant_name")}` : ""}{i.notes && <div className="text-xs italic text-muted-foreground">{i.notes}</div>}</td>
                <td className="text-center">{formatCount(Number(i.quantity), lang)}</td>
                <td className="text-center">{money(i.unit_price)}</td>
                <td className="text-end font-semibold">{money(i.line_total)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <div className="ms-auto max-w-xs space-y-1 text-sm">
          <div className="flex justify-between"><span>{t("subtotal")}</span><span>{money(o.subtotal)}</span></div>
          <div className="flex justify-between"><span>{t("delivery_fee")}</span><span>{money(o.delivery_fee)}</span></div>
          {Number(o.discount) > 0 && <div className="flex justify-between"><span>{t("discount")} {o.coupon_code && `(${o.coupon_code})`}</span><span>- {money(o.discount)}</span></div>}
          <div className="flex justify-between border-t pt-1 text-base font-extrabold"><span>{t("total")}</span><span>{money(o.total)}</span></div>
        </div>
      </section>
      <aside className="no-print h-fit space-y-4 rounded-2xl bg-card p-4 shadow-card">
        <Button className="w-full gap-1" variant="outline" onClick={() => window.print()}><Printer className="h-4 w-4" />{lang === "ar" ? "طباعة الفاتورة" : "Print invoice"}</Button>
        <div className="grid grid-cols-2 gap-2">
          {confirmDialog}
          {/* Current status plus the moves the order flow allows (delivered/cancelled are final). */}
          {ALL_STATUSES.filter((s) => s === o.status || canMoveTo(o.status, s)).map((s) => (
            <Button key={s} size="sm" variant={o.status === s ? "default" : "outline"} className={s === "cancelled" && o.status !== s ? "text-destructive" : undefined} onClick={() => setStatus(s)} disabled={o.status === s}>{t(statusKey(s))}</Button>
          ))}
        </div>
        <DriverAssign orderId={o.id} driverId={o.driver_id} status={o.status} onDone={() => q.refetch()} />
        <OrderTimeline status={o.status} history={o.order_status_history} />
      </aside>
    </div>
  );
}
