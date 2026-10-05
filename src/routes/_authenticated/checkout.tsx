import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { MapPin, Plus } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useI18n } from "@/lib/i18n";
import { useCart } from "@/lib/cart";
import { useSettings } from "@/lib/store-settings";
import { rpcErrorMessage } from "@/lib/queries";
import { CartLines, CartTotals } from "@/components/store/CartContents";
import { AddressForm, addressLine } from "@/components/store/AddressForm";
import { EmptyState, RowSkeleton } from "@/components/store/states";
import { useMoney } from "@/components/store/use-money";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/checkout")({
  head: () => ({ meta: [{ title: "إتمام الطلب · Checkout" }, { name: "description", content: "Checkout" }, { property: "og:title", content: "Checkout" }, { property: "og:description", content: "Complete your order" }] }),
  component: Checkout,
});

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return <section className="space-y-3 rounded-3xl bg-card p-4 shadow-card"><h2 className="font-extrabold">{title}</h2>{children}</section>;
}

function Checkout() {
  const { t } = useI18n();
  const cart = useCart();
  const money = useMoney();
  const { settings, features } = useSettings();
  const nav = useNavigate();
  const qc = useQueryClient();
  const [addressId, setAddressId] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [slotMode, setSlotMode] = useState<"asap" | "slot">("asap");
  const [slot, setSlot] = useState("");
  const [pay, setPay] = useState<"cod" | "online">("cod");
  const [notes, setNotes] = useState("");
  const [couponInput, setCouponInput] = useState(cart.coupon ?? "");
  const [discount, setDiscount] = useState(0);
  const [busy, setBusy] = useState(false);

  const addresses = useQuery({
    queryKey: ["addresses"],
    queryFn: async () => (await supabase.from("addresses").select("*").order("is_default", { ascending: false }).order("created_at", { ascending: false })).data ?? [],
  });
  useEffect(() => {
    if (!addressId && addresses.data?.length) setAddressId(addresses.data[0].id);
  }, [addresses.data, addressId]);

  const applyCoupon = async (code = couponInput) => {
    if (!code.trim()) { cart.setCoupon(null); setDiscount(0); return; }
    const { data } = await supabase.rpc("validate_coupon", { _code: code, _subtotal: cart.subtotal });
    const r = data as { valid: boolean; discount?: number; code?: string } | null;
    if (r?.valid) { cart.setCoupon(r.code!); setDiscount(Number(r.discount)); toast.success(`${t("discount")}: ${money(r.discount)}`); }
    else { cart.setCoupon(null); setDiscount(0); toast.error(rpcErrorMessage("invalid_coupon", "ar")); }
  };
  useEffect(() => { if (cart.coupon) applyCoupon(cart.coupon); /* revalidate on subtotal change */ // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cart.subtotal]);

  if (cart.items.length === 0) return <CartLines />;
  const slots = (settings?.delivery_slots as string[] | null) ?? [];

  const place = async () => {
    if (!addressId) return toast.error(t("delivery_address"));
    setBusy(true);
    const { data, error } = await supabase.rpc("place_order", {
      _items: cart.items.map((i) => ({ product_id: i.productId, variant_id: i.variantId, quantity: i.quantity, notes: i.notes || null })),
      _address_id: addressId,
      _delivery_slot: slotMode === "asap" ? "asap" : slot,
      _payment_method: pay,
      _coupon: cart.coupon ?? "",
      _notes: notes.slice(0, 500),
    });
    setBusy(false);
    if (error) return toast.error(rpcErrorMessage(error.message, document.documentElement.lang === "en" ? "en" : "ar"));
    cart.clear();
    qc.invalidateQueries({ queryKey: ["orders"] });
    toast.success(t("order_placed"));
    nav({ to: "/orders/$id", params: { id: data as string } });
  };

  return (
    <div className="grid gap-5 lg:grid-cols-[1fr_380px]">
      <div className="space-y-4">
        <Card title={t("delivery_address")}>
          {addresses.isLoading ? <RowSkeleton n={2} /> : (
            <div className="space-y-2">
              {addresses.data?.map((a) => (
                <button key={a.id} onClick={() => setAddressId(a.id)} className={cn("flex w-full items-start gap-3 rounded-2xl border p-3 text-start", addressId === a.id && "border-primary bg-primary-soft")}>
                  <MapPin className="mt-0.5 h-4 w-4 text-primary" />
                  <div><p className="font-semibold">{a.label}</p><p className="text-sm text-muted-foreground">{addressLine(a)}</p></div>
                </button>
              ))}
              {!addresses.data?.length && !adding && <EmptyState title={t("no_addresses")} />}
              {adding ? (
                <AddressForm onCancel={() => setAdding(false)} onDone={(a) => { setAdding(false); setAddressId(a.id); addresses.refetch(); }} />
              ) : (
                <Button variant="outline" onClick={() => setAdding(true)} className="gap-1"><Plus className="h-4 w-4" />{t("add_address")}</Button>
              )}
            </div>
          )}
        </Card>
        <Card title={t("delivery_time")}>
          <div className="grid grid-cols-2 gap-2">
            {(["asap", "slot"] as const).map((m) => (
              <button key={m} onClick={() => setSlotMode(m)} className={cn("rounded-xl border p-3 text-sm font-semibold", slotMode === m && "border-primary bg-primary-soft text-primary")}>{m === "asap" ? t("asap") : t("scheduled")}</button>
            ))}
          </div>
          {slotMode === "slot" && (
            <div className="flex flex-wrap gap-2">
              {slots.map((s) => <button key={s} dir="ltr" onClick={() => setSlot(s)} className={cn("rounded-full border px-3 py-1.5 text-sm", slot === s && "border-primary bg-primary text-primary-foreground")}>{s}</button>)}
            </div>
          )}
        </Card>
        <Card title={t("payment_method")}>
          <div className="grid grid-cols-2 gap-2">
            <button onClick={() => setPay("cod")} className={cn("rounded-xl border p-3 text-sm font-semibold", pay === "cod" && "border-primary bg-primary-soft text-primary")}>{t("cod")}</button>
            <button disabled={!features.online_payment} onClick={() => setPay("online")} className={cn("rounded-xl border p-3 text-sm font-semibold disabled:opacity-50", pay === "online" && "border-primary bg-primary-soft text-primary")}>
              {t("online")} {!features.online_payment && <span className="block text-xs font-normal">{t("coming_soon")}</span>}
            </button>
          </div>
        </Card>
        <Card title={t("order_notes")}><Textarea value={notes} onChange={(e) => setNotes(e.target.value)} maxLength={500} rows={2} /></Card>
      </div>
      <aside className="h-fit space-y-4 rounded-3xl bg-card p-4 shadow-card lg:sticky lg:top-20">
        <h2 className="font-extrabold">{t("order_summary")}</h2>
        <div className="max-h-60 overflow-y-auto"><CartLines editableNotes={false} /></div>
        <div className="flex gap-2">
          <Input value={couponInput} onChange={(e) => setCouponInput(e.target.value.toUpperCase())} placeholder={t("coupon")} dir="ltr" />
          <Button variant="outline" onClick={() => applyCoupon()}>{t("apply_coupon")}</Button>
        </div>
        <CartTotals discount={cart.coupon ? discount : 0} />
        <Button size="lg" className="w-full font-bold" disabled={busy || (slotMode === "slot" && !slot) || cart.subtotal < Number(settings?.min_order_amount ?? 0)} onClick={place}>{t("place_order")}</Button>
      </aside>
    </div>
  );
}
