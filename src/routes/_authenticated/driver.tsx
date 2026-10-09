import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  BellRing,
  Bike,
  CheckCircle2,
  Wallet,
  LogOut,
  MapPin,
  Navigation,
  Package,
  Phone,
  Radio,
  Settings,
  Sun,
  Volume2,
  BellOff,
} from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { useI18n } from "@/lib/i18n";
import { useSettings } from "@/lib/store-settings";
import { DRIVER_STATUSES, driverStatusLabel, mapsUrl, type DriverStatus } from "@/lib/drivers";
import { useMoney } from "@/components/store/use-money";
import { StatusBadge } from "@/components/store/OrderTimeline";
import { addressLine } from "@/components/store/AddressForm";
import { EmptyState, RowSkeleton } from "@/components/store/states";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { pageHead } from "@/lib/seo";
import { cn } from "@/lib/utils";
import { useDriverOffers } from "@/lib/driver-offers";
import {
  alertsOnboarded,
  notifyInBackground,
  resumeSound,
  soundReady,
  startRinging,
  stopRinging,
  useWakeLock,
} from "@/lib/driver-alerts";
import { OfferAlert, OfferClosedNotice } from "@/components/driver/OfferAlert";
import { AlertsOnboarding } from "@/components/driver/AlertsOnboarding";
import { PushSettings } from "@/components/driver/PushSettings";
import { devicePushProblem } from "@/lib/push-status";
import { refreshPushRegistration, type DevicePush } from "@/lib/push";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { ThemeToggle } from "@/lib/theme";
import { countLabel, formatCount } from "@/lib/format";

export const Route = createFileRoute("/_authenticated/driver")({
  head: ({ matches }) => {
    const h = pageHead(matches, {
      title: { ar: "تطبيق المندوب", en: "Driver app" },
      noindex: true,
    });
    return {
      ...h,
      // Installable driver app (needed for push notifications on iPhone).
      meta: [
        ...h.meta,
        { name: "apple-mobile-web-app-capable", content: "yes" },
        { name: "mobile-web-app-capable", content: "yes" },
        { name: "apple-mobile-web-app-title", content: "Driver" },
      ],
      links: [
        { rel: "manifest", href: "/driver.webmanifest" },
        { rel: "apple-touch-icon", href: "/driver-icon-192.png" },
      ],
    };
  },
  component: DriverApp,
});

type DriverOrder = {
  id: string;
  order_number: number;
  status: string;
  address: unknown;
  total: number;
  payment_method: string;
  payment_status: string;
  driver_accepted_at: string | null;
  updated_at: string;
  order_items: { quantity: number }[];
};

function DriverApp() {
  const { user, roles, rolesLoading, signOut } = useAuth();
  const { features, loading: settingsLoading } = useSettings();
  const { lang, toggle } = useI18n();
  const ar = lang === "ar";
  const L = ar ? "ar" : "en";
  const money = useMoney();
  const qc = useQueryClient();
  const isDriver = roles.includes("driver");
  const enabled = isDriver && !!features.delivery_tracking;

  const profile = useQuery({
    queryKey: ["my_driver_profile", user?.id],
    enabled,
    queryFn: async () =>
      (await supabase.from("driver_profiles").select("*").eq("user_id", user!.id).maybeSingle())
        .data as { status: DriverStatus; is_active: boolean } | null,
  });
  const orders = useQuery({
    queryKey: ["driver_orders", user?.id],
    enabled,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("orders")
        .select(
          "id,order_number,status,address,total,payment_method,payment_status,driver_accepted_at,updated_at,order_items(quantity)",
        )
        .eq("driver_id", user!.id)
        .in("status", ["confirmed", "preparing", "out_for_delivery", "delivered"])
        .order("created_at", { ascending: false })
        .limit(60);
      if (error) throw error;
      return data as unknown as DriverOrder[];
    },
  });
  const customers = useQuery({
    queryKey: ["driver_customers", user?.id],
    enabled,
    queryFn: async () => {
      const { data } = await supabase.rpc("driver_order_customers" as never);
      return new Map(
        (
          (data ?? []) as { order_id: string; full_name: string | null; phone: string | null }[]
        ).map((c) => [c.order_id, c]),
      );
    },
  });
  useEffect(() => {
    if (!enabled || !user) return;
    const ch = supabase
      .channel(`driver-${user.id}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "orders", filter: `driver_id=eq.${user.id}` },
        () => {
          qc.invalidateQueries({ queryKey: ["driver_orders"] });
          qc.invalidateQueries({ queryKey: ["driver_customers"] });
        },
      )
      .subscribe();
    return () => {
      supabase.removeChannel(ch);
    };
  }, [enabled, user, qc]);

  const offersOn = enabled && !!profile.data?.is_active;
  const offers = useDriverOffers(user?.id ?? null, offersOn);
  const [tab, setTab] = useState("new");
  const [answering, setAnswering] = useState(false);
  const [needsTap, setNeedsTap] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);

  // A device that already receives push is re-linked to whoever is signed in now; anything wrong with push on
  // this device is shown on the main screen (rechecked when the settings dialog closes).
  const [push, setPush] = useState<DevicePush | null>(null);
  useEffect(() => {
    if (offersOn && !settingsOpen)
      refreshPushRegistration()
        .then(setPush)
        .catch(() => setPush(null));
  }, [offersOn, settingsOpen]);
  const pushProblem = offersOn ? devicePushProblem(push, ar) : null;

  // Ring and vibrate when a new offer arrives; a system notification too if the app is in the background.
  const seen = useRef(new Set<string>());
  useEffect(() => {
    const fresh = offers.offers.filter((o) => !seen.current.has(o.offer_id));
    for (const o of offers.offers) seen.current.add(o.offer_id);
    if (fresh.length) {
      startRinging();
      const o = fresh[0];
      notifyInBackground(
        ar ? `أوردر جديد #${o.order_number}` : `New order #${o.order_number}`,
        [o.area, o.city].filter(Boolean).join("، "),
      );
    }
    if (!offers.offers.length) stopRinging();
  }, [offers.offers, ar]);
  useEffect(() => () => stopRinging(), []);

  // After a reload the browser locks audio until the next tap: unlock on the first tap anywhere.
  useEffect(() => {
    if (!offersOn || !alertsOnboarded()) return;
    if (soundReady()) return setNeedsTap(false);
    setNeedsTap(true);
    const unlock = async () => setNeedsTap(!(await resumeSound()));
    window.addEventListener("pointerdown", unlock, { once: true });
    return () => window.removeEventListener("pointerdown", unlock);
  }, [offersOn]);

  const answer = useCallback(
    async (offerId: string, accept: boolean) => {
      setAnswering(true);
      stopRinging();
      const r = await offers.respond(offerId, accept);
      setAnswering(false);
      if (r === "accepted") {
        toast.success(ar ? "تم قبول الطلب" : "Order accepted");
        setTab("active");
      } else if (r === "error")
        toast.error(ar ? "تعذر إرسال الرد، حاول تاني" : "Could not send, try again");
    },
    [offers, ar],
  );

  const activeDelivery = orders.data?.find((o) => o.status === "out_for_delivery");
  // Keep the screen on while waiting for orders or delivering one.
  const wake = useWakeLock(offersOn && (profile.data?.status === "available" || !!activeDelivery));
  const tracking = useLocationTracker(
    enabled && profile.data?.is_active ? (activeDelivery?.id ?? null) : null,
    user?.id ?? null,
  );

  if (rolesLoading || settingsLoading)
    return (
      <div className="p-4">
        <RowSkeleton n={3} />
      </div>
    );
  if (!isDriver)
    return (
      <Centered>
        <EmptyState
          title={ar ? "هذا التطبيق للمندوبين فقط" : "Drivers only"}
          hint={ar ? "اطلب من الإدارة إضافتك كمندوب" : "Ask the store admin to add you as a driver"}
          action={
            <Button asChild>
              <Link to="/">{ar ? "الرئيسية" : "Home"}</Link>
            </Button>
          }
        />
      </Centered>
    );
  if (!features.delivery_tracking)
    return (
      <Centered>
        <EmptyState
          title={ar ? "خدمة التوصيل غير مفعّلة حالياً" : "Delivery tracking is turned off"}
          hint={ar ? "تواصل مع الإدارة" : "Contact the store admin"}
        />
      </Centered>
    );

  const setStatus = async (s: DriverStatus) => {
    const { error } = await supabase
      .from("driver_profiles")
      .update({ status: s } as never)
      .eq("user_id", user!.id);
    if (error) toast.error(error.message);
    else profile.refetch();
  };
  const act = async (fn: () => PromiseLike<{ error: { message: string } | null }>) => {
    const { error } = await fn();
    if (error) toast.error(error.message);
    else qc.invalidateQueries({ queryKey: ["driver_orders"] });
  };

  const all = orders.data ?? [];
  const groups = {
    new: all.filter((o) => ["confirmed", "preparing"].includes(o.status) && !o.driver_accepted_at),
    active: all.filter(
      (o) =>
        o.status === "out_for_delivery" ||
        (["confirmed", "preparing"].includes(o.status) && o.driver_accepted_at),
    ),
    completed: all.filter((o) => o.status === "delivered").slice(0, 20),
  };
  const deactivated = profile.data && !profile.data.is_active;
  // Today on this phone's calendar: deliveries done and the cash to hand over.
  const today = new Date().toDateString();
  const doneToday = groups.completed.filter((o) => new Date(o.updated_at).toDateString() === today);
  const cashToday = doneToday
    .filter((o) => o.payment_method === "cod")
    .reduce((n, o) => n + Number(o.total), 0);

  return (
    <div className="mx-auto min-h-screen max-w-lg bg-background pb-24">
      <header className="sticky top-0 z-10 flex items-center justify-between bg-primary px-4 py-3 text-primary-foreground">
        <h1 className="flex items-center gap-2 text-base font-extrabold">
          <Bike className="h-5 w-5" />
          {ar ? "تطبيق المندوب" : "Driver"}
        </h1>
        <div className="flex items-center gap-1">
          <Button
            size="icon"
            variant="ghost"
            className="text-primary-foreground hover:bg-primary-foreground/10"
            onClick={() => setSettingsOpen(true)}
            aria-label={ar ? "الإعدادات" : "Settings"}
          >
            <Settings className="h-4 w-4" />
          </Button>
          <ThemeToggle ar={ar} className="text-primary-foreground hover:bg-primary-foreground/10" />
          <Button
            size="sm"
            variant="ghost"
            className="text-primary-foreground hover:bg-primary-foreground/10"
            onClick={toggle}
          >
            {ar ? "EN" : "ع"}
          </Button>
          <Button
            size="icon"
            variant="ghost"
            className="text-primary-foreground hover:bg-primary-foreground/10"
            onClick={signOut}
            aria-label="sign out"
          >
            <LogOut className="h-4 w-4" />
          </Button>
        </div>
      </header>

      <div className="space-y-4 p-4">
        {deactivated ? (
          <div className="rounded-2xl bg-destructive/10 p-4 text-sm font-bold text-destructive">
            {ar ? "حسابك موقوف من الإدارة" : "Your driver account is deactivated by the admin"}
          </div>
        ) : (
          <section className="space-y-2 rounded-2xl bg-card p-4 shadow-card">
            <p className="text-sm font-bold">{ar ? "حالتي" : "My status"}</p>
            <div className="grid grid-cols-3 gap-2">
              {DRIVER_STATUSES.map((s) => (
                <Button
                  key={s}
                  size="sm"
                  variant={profile.data?.status === s ? "default" : "outline"}
                  onClick={() => setStatus(s)}
                >
                  {driverStatusLabel(s, ar)}
                </Button>
              ))}
            </div>
          </section>
        )}

        {!deactivated && <AlertsOnboarding ar={ar} />}
        {offers.closed && (
          <OfferClosedNotice
            outcome={offers.closed.outcome}
            ar={ar}
            onDismiss={offers.dismissClosed}
          />
        )}
        {pushProblem && !deactivated && (
          <button
            type="button"
            role="alert"
            onClick={() => setSettingsOpen(true)}
            className="flex w-full items-center gap-2 rounded-2xl bg-destructive/10 p-3 text-start text-sm text-destructive"
          >
            <BellOff className="h-4 w-4 shrink-0" />
            <span className="flex-1">{pushProblem}</span>
            <span className="font-semibold underline">{ar ? "الإعدادات" : "Settings"}</span>
          </button>
        )}
        {needsTap && !deactivated && (
          <p className="flex items-center gap-2 rounded-2xl bg-muted p-3 text-sm">
            <Volume2 className="h-4 w-4" />
            {ar ? "اضغط في أي مكان لتشغيل صوت الطلبات" : "Tap anywhere to turn order sound on"}
          </p>
        )}
        {(wake === "unsupported" || wake === "error") && !deactivated && (
          <p className="flex items-center gap-2 rounded-2xl bg-muted p-3 text-sm">
            <Sun className="h-4 w-4" />
            {ar
              ? "الجهاز ده مش بيسمح للتطبيق يخلي الشاشة منورة. خلّي مدة قفل الشاشة أطول من الإعدادات علشان ما يفوتكش طلب."
              : "This device can't keep the screen on for the app. Set a longer screen timeout in settings so you don't miss orders."}
          </p>
        )}

        {!deactivated && (
          <section aria-label={ar ? "ملخص اليوم" : "Today"} className="grid grid-cols-2 gap-3">
            <div className="rounded-2xl bg-card p-3 shadow-card">
              <p className="flex items-center gap-1 text-xs text-muted-foreground">
                <CheckCircle2 className="h-3.5 w-3.5" />
                {ar ? "اتسلّم النهارده" : "Delivered today"}
              </p>
              <p className="mt-1 text-lg font-extrabold">
                {countLabel(doneToday.length, L, "order")}
              </p>
            </div>
            <div className="rounded-2xl bg-card p-3 shadow-card">
              <p className="flex items-center gap-1 text-xs text-muted-foreground">
                <Wallet className="h-3.5 w-3.5" />
                {ar ? "كاش معاك للتسليم" : "Cash to hand over"}
              </p>
              <p className="mt-1 text-lg font-extrabold">{money(cashToday)}</p>
            </div>
          </section>
        )}

        {activeDelivery && !deactivated && (
          <div className="flex items-center gap-2 rounded-2xl bg-success/10 p-3 text-sm text-success">
            <Radio className="h-4 w-4 animate-pulse" />
            {tracking.error
              ? tracking.error
              : ar
                ? `يتم مشاركة موقعك مع العميل${tracking.last ? " · آخر تحديث " + tracking.last.toLocaleTimeString() : ""}`
                : `Sharing location with customer${tracking.last ? " · updated " + tracking.last.toLocaleTimeString() : ""}`}
          </div>
        )}

        <Tabs value={tab} onValueChange={setTab}>
          {/* Bottom tab bar: reachable with the thumb. */}
          <TabsList className="fixed inset-x-0 bottom-0 z-20 mx-auto grid h-auto w-full max-w-lg grid-cols-3 rounded-none border-t bg-background p-1 pb-[calc(0.25rem+env(safe-area-inset-bottom))]">
            <TabsTrigger value="new" className="relative h-14 flex-col gap-0.5 text-xs">
              <BellRing className="h-5 w-5" />
              {ar ? "جديدة" : "New"} ({formatCount(groups.new.length + offers.offers.length, L)})
              {offers.offers.length > 0 && (
                <span
                  aria-label={
                    ar
                      ? `عروض جديدة: ${formatCount(offers.offers.length, "ar")}`
                      : `New offers: ${offers.offers.length}`
                  }
                  className="absolute -top-1 end-1 flex h-5 min-w-5 items-center justify-center rounded-full bg-destructive px-1 text-[11px] font-bold text-white"
                >
                  {formatCount(offers.offers.length, L)}
                </span>
              )}
            </TabsTrigger>
            <TabsTrigger value="active" className="h-14 flex-col gap-0.5 text-xs">
              <Bike className="h-5 w-5" />
              {ar ? "نشطة" : "Active"} ({formatCount(groups.active.length, L)})
            </TabsTrigger>
            <TabsTrigger value="completed" className="h-14 flex-col gap-0.5 text-xs">
              <CheckCircle2 className="h-5 w-5" />
              {ar ? "مكتملة" : "Completed"}
            </TabsTrigger>
          </TabsList>
          {(["new", "active", "completed"] as const).map((tab) => (
            <TabsContent key={tab} value={tab} className="space-y-3">
              {orders.isLoading ? (
                <RowSkeleton n={3} />
              ) : groups[tab].length === 0 ? (
                <EmptyState title={ar ? "لا توجد طلبات" : "No orders"} />
              ) : (
                groups[tab].map((o) => (
                  <OrderCard
                    key={o.id}
                    o={o}
                    ar={ar}
                    customer={customers.data?.get(o.id)}
                    disabled={!!deactivated}
                    onAccept={() =>
                      act(() => supabase.rpc("driver_accept_order", { _order_id: o.id }))
                    }
                    onStart={() =>
                      act(() =>
                        supabase.rpc("driver_set_status", {
                          _order_id: o.id,
                          _status: "out_for_delivery",
                        }),
                      )
                    }
                    onDeliver={() =>
                      act(() =>
                        supabase.rpc("driver_set_status", {
                          _order_id: o.id,
                          _status: "delivered",
                        }),
                      )
                    }
                  />
                ))
              )}
            </TabsContent>
          ))}
        </Tabs>
      </div>
      <Dialog open={settingsOpen} onOpenChange={setSettingsOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{ar ? "الإعدادات" : "Settings"}</DialogTitle>
            <DialogDescription>
              {ar ? "إشعارات الطلبات الجديدة" : "New order notifications"}
            </DialogDescription>
          </DialogHeader>
          {settingsOpen && <PushSettings ar={ar} />}
        </DialogContent>
      </Dialog>
      {offers.offers[0] && !deactivated && (
        <OfferAlert
          key={offers.offers[0].offer_id}
          offer={offers.offers[0]}
          offset={offers.offset}
          ar={ar}
          more={offers.offers.length - 1}
          busy={answering}
          onAccept={() => answer(offers.offers[0].offer_id, true)}
          onReject={() => answer(offers.offers[0].offer_id, false)}
        />
      )}
    </div>
  );
}

function Centered({ children }: { children: React.ReactNode }) {
  return <div className="flex min-h-screen items-center justify-center p-4">{children}</div>;
}

function OrderCard({
  o,
  ar,
  customer,
  disabled,
  onAccept,
  onStart,
  onDeliver,
}: {
  o: DriverOrder;
  ar: boolean;
  customer?: { full_name: string | null; phone: string | null };
  disabled: boolean;
  onAccept: () => void;
  onStart: () => void;
  onDeliver: () => void;
}) {
  const money = useMoney();
  const a = o.address as Record<string, string>;
  const name = a.recipient_name || customer?.full_name || a.label;
  const phone = a.phone || customer?.phone || "";
  const items = o.order_items.reduce((s, i) => s + Number(i.quantity), 0);
  const cod = o.payment_method === "cod";
  const open = o.status !== "delivered";
  return (
    <article className="space-y-3 rounded-2xl bg-card p-4 shadow-card">
      <div className="flex items-center justify-between">
        <p className="font-extrabold">#{o.order_number}</p>
        <StatusBadge status={o.status} />
      </div>
      <div className="space-y-1 text-sm">
        <p className="font-semibold">{name}</p>
        {phone && (
          <p className="text-muted-foreground" dir="ltr">
            {phone}
          </p>
        )}
        <p className="text-muted-foreground">
          <MapPin className="me-1 inline h-3.5 w-3.5" />
          {addressLine(a)}
          {a.floor && ` · ${ar ? "دور" : "Floor"} ${a.floor}`}
          {a.apartment && ` · ${ar ? "شقة" : "Apt"} ${a.apartment}`}
        </p>
        {a.notes && <p className="text-xs italic text-muted-foreground">{a.notes}</p>}
        <div className="flex flex-wrap gap-x-4 gap-y-1 pt-1 text-xs">
          <span>
            <Package className="me-1 inline h-3.5 w-3.5" />
            {countLabel(items, ar ? "ar" : "en", "piece")}
          </span>
          <span>
            {ar ? "الإجمالي: " : "Total: "}
            {money(o.total)}
          </span>
          <span>
            {cod
              ? ar
                ? "دفع عند الاستلام"
                : "Cash on delivery"
              : ar
                ? "مدفوع أونلاين"
                : "Paid online"}
          </span>
        </div>
        {cod && open && (
          <p className={cn("mt-1 rounded-lg bg-brand-secondary/20 px-2 py-1 font-extrabold")}>
            {ar ? "المطلوب تحصيله: " : "Collect: "}
            {money(o.total)}
          </p>
        )}
      </div>
      {open && (
        <>
          <div className="grid grid-cols-2 gap-2">
            <Button variant="outline" asChild disabled={!phone}>
              <a href={`tel:${phone}`}>
                <Phone className="me-1 h-4 w-4" />
                {ar ? "اتصال" : "Call"}
              </a>
            </Button>
            <Button variant="outline" asChild>
              <a href={mapsUrl(a)} target="_blank" rel="noreferrer">
                <Navigation className="me-1 h-4 w-4" />
                {ar ? "الخريطة" : "Maps"}
              </a>
            </Button>
          </div>
          {!disabled && o.status !== "out_for_delivery" && !o.driver_accepted_at && (
            <Button className="w-full" variant="secondary" onClick={onAccept}>
              {ar ? "قبول الطلب" : "Accept order"}
            </Button>
          )}
          {!disabled && o.status !== "out_for_delivery" && o.driver_accepted_at && (
            <Button className="w-full" onClick={onStart}>
              <Bike className="me-1 h-4 w-4" />
              {ar ? "بدء التوصيل" : "Start delivery"}
            </Button>
          )}
          {!disabled && o.status === "out_for_delivery" && (
            <Button
              className="w-full bg-success text-background hover:bg-success/90"
              onClick={onDeliver}
            >
              <CheckCircle2 className="me-1 h-4 w-4" />
              {ar ? "تم التسليم" : "Mark delivered"}
            </Button>
          )}
        </>
      )}
      {!open && (
        <p className="text-xs text-muted-foreground">
          {new Date(o.updated_at).toLocaleString(ar ? "ar-EG" : "en-US")}
        </p>
      )}
    </article>
  );
}

/** While an order is out for delivery and the app is open, saves the driver's position every 10 seconds. Stops when orderId becomes null. */
function useLocationTracker(orderId: string | null, driverId: string | null) {
  const [last, setLast] = useState<Date | null>(null);
  const [error, setError] = useState<string | null>(null);
  const pos = useRef<GeolocationPosition | null>(null);
  useEffect(() => {
    if (!orderId || !driverId) return;
    if (!("geolocation" in navigator)) {
      setError("Location not supported on this device");
      return;
    }
    const watch = navigator.geolocation.watchPosition(
      (p) => {
        pos.current = p;
        setError(null);
      },
      (e) => setError(e.message),
      { enableHighAccuracy: true, maximumAge: 5000 },
    );
    const send = async () => {
      const p = pos.current;
      if (!p || document.visibilityState !== "visible") return;
      const { error } = await supabase.from("driver_locations").insert({
        order_id: orderId,
        driver_id: driverId,
        lat: p.coords.latitude,
        lng: p.coords.longitude,
        heading: p.coords.heading,
        speed: p.coords.speed,
        accuracy: p.coords.accuracy,
      });
      if (!error) setLast(new Date());
    };
    const first = setTimeout(send, 1500);
    const iv = setInterval(send, 10000);
    return () => {
      navigator.geolocation.clearWatch(watch);
      clearTimeout(first);
      clearInterval(iv);
      pos.current = null;
    };
  }, [orderId, driverId]);
  return { last, error };
}
