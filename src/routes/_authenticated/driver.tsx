import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import { Bike, CheckCircle2, LogOut, MapPin, Navigation, Phone, Radio } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { useI18n } from "@/lib/i18n";
import { mapsUrl } from "@/lib/drivers";
import { useMoney } from "@/components/store/use-money";
import { StatusBadge } from "@/components/store/OrderTimeline";
import { addressLine } from "@/components/store/AddressForm";
import { EmptyState, RowSkeleton } from "@/components/store/states";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";

export const Route = createFileRoute("/_authenticated/driver")({
  head: () => ({
    meta: [
      { title: "تطبيق المندوب · Driver app" },
      { name: "description", content: "Assigned deliveries, navigation and live status for store drivers." },
      { property: "og:title", content: "Driver app" },
      { property: "og:description", content: "Assigned deliveries and live status for drivers." },
      { name: "theme-color", content: "#0f8a5f" },
      { name: "apple-mobile-web-app-capable", content: "yes" },
      { name: "robots", content: "noindex" },
    ],
    links: [
      { rel: "manifest", href: "/driver.webmanifest" },
      { rel: "apple-touch-icon", href: "/driver-icon-192.png" },
    ],
  }),
  component: DriverApp,
});

const ACTIVE = ["confirmed", "preparing", "out_for_delivery"];

function DriverApp() {
  const { user, roles, rolesLoading, signOut } = useAuth();
  const { lang, toggle } = useI18n();
  const ar = lang === "ar";
  const qc = useQueryClient();
  const isDriver = roles.includes("driver");

  const profile = useQuery({
    queryKey: ["my_driver_profile", user?.id],
    enabled: isDriver,
    queryFn: async () => (await supabase.from("driver_profiles").select("*").eq("user_id", user!.id).maybeSingle()).data,
  });
  const orders = useQuery({
    queryKey: ["driver_orders", user?.id],
    enabled: isDriver,
    queryFn: async () => {
      const { data, error } = await supabase.from("orders").select("*").eq("driver_id", user!.id).in("status", [...ACTIVE, "delivered"]).order("created_at", { ascending: false }).limit(50);
      if (error) throw error;
      return data;
    },
  });
  useEffect(() => {
    if (!isDriver || !user) return;
    const ch = supabase.channel(`driver-${user.id}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "orders", filter: `driver_id=eq.${user.id}` }, () => qc.invalidateQueries({ queryKey: ["driver_orders"] }))
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [isDriver, user, qc]);

  const activeDelivery = orders.data?.find((o) => o.status === "out_for_delivery");
  const tracking = useLocationTracker(activeDelivery?.id ?? null, user?.id ?? null);

  if (rolesLoading) return <div className="p-4"><RowSkeleton n={3} /></div>;
  if (!isDriver)
    return <div className="flex min-h-screen items-center justify-center p-4"><EmptyState title={ar ? "هذا التطبيق للمندوبين فقط" : "Drivers only"} hint={ar ? "اطلب من الإدارة إضافتك كمندوب" : "Ask the store admin to add you as a driver"} action={<Button asChild><Link to="/">{ar ? "الرئيسية" : "Home"}</Link></Button>} /></div>;

  const setAvailable = async (v: boolean) => {
    const { error } = await supabase.from("driver_profiles").update({ is_available: v }).eq("user_id", user!.id);
    if (error) toast.error(error.message); else profile.refetch();
  };
  const act = async (fn: () => PromiseLike<{ error: { message: string } | null }>) => {
    const { error } = await fn();
    if (error) toast.error(error.message); else qc.invalidateQueries({ queryKey: ["driver_orders"] });
  };

  const active = (orders.data ?? []).filter((o) => ACTIVE.includes(o.status));
  const done = (orders.data ?? []).filter((o) => o.status === "delivered").slice(0, 10);

  return (
    <div className="mx-auto min-h-screen max-w-lg bg-background pb-10">
      <header className="sticky top-0 z-10 flex items-center justify-between bg-primary px-4 py-3 text-primary-foreground">
        <div className="flex items-center gap-2 font-extrabold"><Bike className="h-5 w-5" />{ar ? "تطبيق المندوب" : "Driver"}</div>
        <div className="flex items-center gap-1">
          <Button size="sm" variant="ghost" className="text-primary-foreground hover:bg-primary-foreground/10" onClick={toggle}>{ar ? "EN" : "ع"}</Button>
          <Button size="icon" variant="ghost" className="text-primary-foreground hover:bg-primary-foreground/10" onClick={signOut} aria-label="sign out"><LogOut className="h-4 w-4" /></Button>
        </div>
      </header>

      <div className="space-y-4 p-4">
        <section className="flex items-center justify-between rounded-2xl bg-card p-4 shadow-card">
          <div>
            <p className="font-bold">{profile.data?.is_available ? (ar ? "متاح لاستلام الطلبات" : "Available") : (ar ? "غير متاح" : "Offline")}</p>
            <p className="text-xs text-muted-foreground">{ar ? "الإدارة ترى حالتك عند توزيع الطلبات" : "Admins see this when assigning orders"}</p>
          </div>
          <Switch checked={!!profile.data?.is_available} onCheckedChange={setAvailable} />
        </section>

        {activeDelivery && (
          <div className="flex items-center gap-2 rounded-2xl bg-success/10 p-3 text-sm text-success">
            <Radio className="h-4 w-4 animate-pulse" />
            {tracking.error ? tracking.error : ar ? `يتم مشاركة موقعك مع العميل${tracking.last ? " · آخر تحديث " + tracking.last.toLocaleTimeString() : ""}` : `Sharing location with customer${tracking.last ? " · updated " + tracking.last.toLocaleTimeString() : ""}`}
          </div>
        )}

        <h2 className="font-extrabold">{ar ? "الطلبات المسندة" : "Assigned orders"}</h2>
        {orders.isLoading ? <RowSkeleton n={3} /> : active.length === 0 ? <EmptyState title={ar ? "لا توجد طلبات حالياً" : "No assigned orders"} /> : active.map((o) => {
          const a = o.address as Record<string, string>;
          return (
            <article key={o.id} className="space-y-3 rounded-2xl bg-card p-4 shadow-card">
              <div className="flex items-center justify-between"><p className="font-extrabold">#{o.order_number}</p><StatusBadge status={o.status} /></div>
              <div className="text-sm">
                <p className="font-semibold">{a.recipient_name ?? a.label}</p>
                <p className="text-muted-foreground"><MapPin className="me-1 inline h-3.5 w-3.5" />{addressLine(a)}{a.floor && ` · ${ar ? "دور" : "Floor"} ${a.floor}`}{a.apartment && ` · ${ar ? "شقة" : "Apt"} ${a.apartment}`}</p>
                {a.notes && <p className="text-xs italic text-muted-foreground">{a.notes}</p>}
                <OrderTotal total={o.total} cod={o.payment_method === "cod"} ar={ar} />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <Button variant="outline" asChild disabled={!a.phone}><a href={`tel:${a.phone ?? ""}`}><Phone className="me-1 h-4 w-4" />{ar ? "اتصال" : "Call"}</a></Button>
                <Button variant="outline" asChild><a href={mapsUrl(a)} target="_blank" rel="noreferrer"><Navigation className="me-1 h-4 w-4" />{ar ? "الخريطة" : "Maps"}</a></Button>
              </div>
              {o.status !== "out_for_delivery" && !o.driver_accepted_at && (
                <Button className="w-full" variant="secondary" onClick={() => act(() => supabase.rpc("driver_accept_order", { _order_id: o.id }))}>{ar ? "قبول الطلب" : "Accept order"}</Button>
              )}
              {o.status !== "out_for_delivery" && (
                <Button className="w-full" onClick={() => act(() => supabase.rpc("driver_set_status", { _order_id: o.id, _status: "out_for_delivery" }))}><Bike className="me-1 h-4 w-4" />{ar ? "بدء التوصيل" : "Start delivery"}</Button>
              )}
              {o.status === "out_for_delivery" && (
                <Button className="w-full bg-success text-success-foreground hover:bg-success/90" onClick={() => act(() => supabase.rpc("driver_set_status", { _order_id: o.id, _status: "delivered" }))}><CheckCircle2 className="me-1 h-4 w-4" />{ar ? "تم التسليم" : "Mark delivered"}</Button>
              )}
            </article>
          );
        })}

        {done.length > 0 && (
          <>
            <h2 className="pt-2 font-extrabold">{ar ? "تم توصيلها مؤخراً" : "Recently delivered"}</h2>
            <ul className="divide-y rounded-2xl bg-card shadow-card">
              {done.map((o) => <li key={o.id} className="flex justify-between p-3 text-sm"><span>#{o.order_number}</span><span className="text-muted-foreground">{new Date(o.updated_at).toLocaleString(ar ? "ar-EG" : "en-US")}</span></li>)}
            </ul>
          </>
        )}
      </div>
    </div>
  );
}

function OrderTotal({ total, cod, ar }: { total: number; cod: boolean; ar: boolean }) {
  const money = useMoney();
  return <p className="mt-1 font-bold">{cod ? (ar ? "تحصيل: " : "Collect: ") : (ar ? "مدفوع: " : "Paid: ")}{money(total)}</p>;
}

/** While an order is out for delivery, saves the driver's position every 10 seconds. */
function useLocationTracker(orderId: string | null, driverId: string | null) {
  const [last, setLast] = useState<Date | null>(null);
  const [error, setError] = useState<string | null>(null);
  const pos = useRef<GeolocationPosition | null>(null);
  useEffect(() => {
    if (!orderId || !driverId) return;
    if (!("geolocation" in navigator)) { setError("Location not supported on this device"); return; }
    const watch = navigator.geolocation.watchPosition((p) => { pos.current = p; setError(null); }, (e) => setError(e.message), { enableHighAccuracy: true, maximumAge: 5000 });
    const send = async () => {
      const p = pos.current;
      if (!p) return;
      const { error } = await supabase.from("driver_locations").insert({ order_id: orderId, driver_id: driverId, lat: p.coords.latitude, lng: p.coords.longitude, heading: p.coords.heading, speed: p.coords.speed, accuracy: p.coords.accuracy });
      if (!error) setLast(new Date());
    };
    const first = setTimeout(send, 1500);
    const iv = setInterval(send, 10000);
    return () => { navigator.geolocation.clearWatch(watch); clearTimeout(first); clearInterval(iv); };
  }, [orderId, driverId]);
  return { last, error };
}
