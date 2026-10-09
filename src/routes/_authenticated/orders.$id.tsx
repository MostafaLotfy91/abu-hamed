import { createFileRoute, Link } from "@tanstack/react-router";
import { WhatsAppOrderButton } from "@/components/store/WhatsAppButton";
import { usePublishWaContext } from "@/lib/whatsapp";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { useI18n } from "@/lib/i18n";
import { Ornament } from "@/components/luxe/Ornament";
import { formatCount } from "@/lib/format";
import { VariantLine } from "@/components/store/CartContents";
import { ReturnSection } from "@/components/store/ReturnRequest";
import { rpcErrorMessage } from "@/lib/queries";
import { useMoney } from "@/components/store/use-money";
import { OrderTimeline, StatusBadge } from "@/components/store/OrderTimeline";
import { addressLine } from "@/components/store/AddressForm";
import { EmptyState, ErrorState, RowSkeleton } from "@/components/store/states";
import { ProductImage } from "@/components/store/ProductCard";
import { Button } from "@/components/ui/button";
import { useLatestLocation } from "@/lib/drivers";
import { LiveMap } from "@/components/store/LiveMap";
import { pageHead } from "@/lib/seo";
import { useSettings } from "@/lib/store-settings";

function LiveTracking({ orderId }: { orderId: string }) {
  const { lang } = useI18n();
  const ar = lang === "ar";
  const loc = useLatestLocation(orderId, true);
  const driver = useQuery({
    queryKey: ["order_driver", orderId],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("order_driver_info", { _order_id: orderId });
      if (error) throw error;
      return data as { name: string | null; phone: string | null } | null;
    },
  });
  return (
    <section className="space-y-3 rounded-3xl bg-card p-4 shadow-card">
      <div className="flex items-center justify-between">
        <h2 className="font-extrabold">{ar ? "تتبع المندوب مباشرة" : "Live driver tracking"}</h2>
        {driver.data?.phone && (
          <Button size="sm" variant="outline" asChild>
            <a href={`tel:${driver.data.phone}`}>{ar ? "اتصل بالمندوب" : "Call driver"}</a>
          </Button>
        )}
      </div>
      {driver.data?.name && <p className="text-sm text-muted-foreground">{driver.data.name}</p>}
      {loc.data ? (
        <>
          <LiveMap lat={loc.data.lat} lng={loc.data.lng} />
          <p className="text-xs text-muted-foreground">
            {ar ? "آخر تحديث: " : "Updated: "}
            {new Date(loc.data.created_at).toLocaleTimeString(ar ? "ar-EG" : "en-US")}
          </p>
        </>
      ) : (
        <p className="text-sm text-muted-foreground">
          {ar ? "في انتظار موقع المندوب…" : "Waiting for the driver's location…"}
        </p>
      )}
    </section>
  );
}

export const Route = createFileRoute("/_authenticated/orders/$id")({
  // ?placed=1 right after checkout shows the confirmation banner.
  validateSearch: (s: Record<string, unknown>): { placed?: 1 } =>
    s.placed === 1 || s.placed === "1" ? { placed: 1 } : {},
  head: ({ matches }) =>
    pageHead(matches, { title: { ar: "تفاصيل الطلب", en: "Order details" }, noindex: true }),
  component: OrderDetail,
});

export function useOrder(id: string) {
  const qc = useQueryClient();
  const q = useQuery({
    queryKey: ["order", id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("orders")
        .select("*, order_items(*), order_status_history(status,created_at,note)")
        .eq("id", id)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });
  useEffect(() => {
    const ch = supabase
      .channel(`order-${id}`)
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "orders", filter: `id=eq.${id}` },
        () => qc.invalidateQueries({ queryKey: ["order", id] }),
      )
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "order_status_history",
          filter: `order_id=eq.${id}`,
        },
        () => qc.invalidateQueries({ queryKey: ["order", id] }),
      )
      .subscribe();
    return () => {
      supabase.removeChannel(ch);
    };
  }, [id, qc]);
  usePublishWaContext(q.data ? { kind: "order", orderNumber: q.data.order_number } : null);
  return q;
}

function OrderDetail() {
  const { id } = Route.useParams();
  const { placed } = Route.useSearch();
  const { t, tx, lang } = useI18n();
  const money = useMoney();
  const q = useOrder(id);
  const { features } = useSettings();
  const { user } = useAuth();
  if (q.isLoading) return <RowSkeleton n={4} />;
  if (q.error) return <ErrorState onRetry={() => q.refetch()} />;
  const o = q.data;
  if (!o) return <EmptyState title={t("no_orders")} />;
  const addr = o.address as Record<string, string>;
  // Staff and drivers can open other customers' orders here; customer actions are for the owner only.
  const isOwner = o.user_id === user?.id;
  const cancel = async () => {
    const { error } = await supabase.rpc("cancel_my_order", { _order_id: id });
    if (error) toast.error(rpcErrorMessage(error.message, lang));
    else q.refetch();
  };
  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_360px] lg:gap-10">
      <div className="space-y-4">
        {placed && (
          <section role="status" className="border bg-card px-6 py-12 text-center md:py-16">
            <p className="eyebrow">{lang === "ar" ? "شكراً لك" : "Thank you"}</p>
            <p className="mt-3 font-display text-3xl md:text-4xl">
              {t("order_placed")} #{o.order_number}
            </p>
            <Ornament className="mt-5" />
            <p className="mx-auto mt-5 max-w-md leading-relaxed text-muted-foreground">
              {lang === "ar"
                ? "هنراجع طلبك ونأكده قريباً، وتقدر تتابع حالته من هنا. الدفع عند الاستلام."
                : "We'll review and confirm your order shortly; track its status here. Payment is cash on delivery."}
            </p>
            <div className="mt-8 flex flex-wrap items-center justify-center gap-6">
              <Link
                to="/products"
                className="inline-flex h-12 items-center bg-primary px-8 text-sm text-primary-foreground transition-colors hover:bg-primary/88"
              >
                {lang === "ar" ? "متابعة التسوق" : "Continue shopping"}
              </Link>
              <Link to="/orders" className="link-luxe text-sm">
                {t("orders")}
              </Link>
            </div>
          </section>
        )}
        <section className="bg-card p-5 shadow-card md:p-6">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
            <h1 className="font-display text-2xl md:text-3xl">
              {t("order")} #{o.order_number}
            </h1>
            <div className="flex items-center gap-2">
              <span className="flex items-center gap-1 text-xs text-success">
                <span className="h-2 w-2 animate-pulse rounded-full bg-success" />
                {t("live")}
              </span>
              <StatusBadge status={o.status} />
            </div>
          </div>
          <OrderTimeline status={o.status} history={o.order_status_history} />
          <div className="mt-3">
            <WhatsAppOrderButton orderNumber={o.order_number} />
          </div>
        </section>
        {features.delivery_tracking && o.status === "out_for_delivery" && o.driver_id && (
          <LiveTracking orderId={o.id} />
        )}
        <section className="bg-card p-5 shadow-card md:p-6">
          <ul className="divide-y">
            {o.order_items.map((i) => (
              <li key={i.id} className="flex gap-3 py-3">
                <ProductImage src={i.image_url} alt="" className="aspect-[4/5] w-16" />
                <div className="flex-1">
                  <p className="text-[13px]">{tx(i, "name")}</p>
                  <VariantLine
                    size={i.size}
                    colorName={tx(i, "color")}
                    hex={i.color_hex}
                    fallback={tx(i, "variant_name")}
                  />
                  <p className="text-xs text-muted-foreground">
                    {formatCount(Number(i.quantity), lang)} × {money(i.unit_price)}
                  </p>
                  {i.notes && <p className="text-xs italic text-muted-foreground">{i.notes}</p>}
                </div>
                <span className="text-sm font-medium tabular-nums">{money(i.line_total)}</span>
              </li>
            ))}
          </ul>
        </section>
        {isOwner && (
          <ReturnSection
            orderId={o.id}
            status={o.status}
            items={o.order_items}
            deliveredAt={
              o.order_status_history
                .filter((h) => h.status === "delivered")
                .map((h) => h.created_at)
                .sort()
                .at(-1) ?? null
            }
          />
        )}
      </div>
      <aside className="h-fit space-y-3 bg-card p-5 text-sm shadow-card md:p-6">
        <p>
          <span className="text-muted-foreground">{t("delivery_address")}: </span>
          {addressLine(addr)}
        </p>
        <p>
          <span className="text-muted-foreground">{t("delivery_time")}: </span>
          {o.delivery_slot === "asap" ? t("asap") : o.delivery_slot}
        </p>
        <p>
          <span className="text-muted-foreground">{t("payment_method")}: </span>
          {o.payment_method === "cod" ? t("cod") : t("online")}
        </p>
        <div className="space-y-1 border-t pt-3">
          <div className="flex justify-between">
            <span>{t("subtotal")}</span>
            <span>{money(o.subtotal)}</span>
          </div>
          <div className="flex justify-between">
            <span>{t("delivery_fee")}</span>
            <span>{Number(o.delivery_fee) === 0 ? t("free") : money(o.delivery_fee)}</span>
          </div>
          {Number(o.discount) > 0 && (
            <div className="flex justify-between text-success">
              <span>{t("discount")}</span>
              <span>- {money(o.discount)}</span>
            </div>
          )}
          <div className="flex justify-between border-t pt-2 text-base font-medium">
            <span>{t("total")}</span>
            <span>{money(o.total)}</span>
          </div>
        </div>
        {isOwner && o.status === "pending" && (
          <Button variant="outline" className="w-full text-destructive" onClick={cancel}>
            {t("cancel_order")}
          </Button>
        )}
      </aside>
    </div>
  );
}
