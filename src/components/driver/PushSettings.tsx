import { useEffect, useState } from "react";
import { AlertTriangle, BellOff, BellRing, RefreshCw, Share, Smartphone } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import {
  devicePushStatus,
  disablePush,
  enablePush,
  pushSupport,
  sendTestPush,
  type DevicePush,
  type PushSupport,
} from "@/lib/push";
import { ageText, devicePushProblem } from "@/lib/push-status";

/** Driver settings: push notifications on this device (works with the app closed or the screen locked). */
export function PushSettings({ ar }: { ar: boolean }) {
  const [support, setSupport] = useState<PushSupport | null>(null);
  const [device, setDevice] = useState<DevicePush | null>(null);
  const [busy, setBusy] = useState(false);

  const reload = () =>
    devicePushStatus()
      .then(setDevice)
      .catch(() => setDevice(null));
  useEffect(() => {
    const s = pushSupport();
    setSupport(s);
    if (s === "ok") reload();
  }, []);

  const on = !!device && device.state !== "off" && device.state !== "blocked";
  const turnOn = async (fresh: boolean) => {
    const r = await enablePush({ fresh });
    if (r === "error")
      toast.error(ar ? "تعذر تفعيل الإشعارات، حاول تاني" : "Could not turn on notifications");
    else if (r === "enabled" && fresh)
      toast.success(ar ? "تم تجديد الاشتراك" : "Subscription renewed");
    await reload();
  };
  const toggle = async (next: boolean) => {
    setBusy(true);
    if (next) await turnOn(false);
    else {
      await disablePush();
      await reload();
    }
    setBusy(false);
  };
  const resubscribe = async () => {
    setBusy(true);
    await turnOn(true);
    setBusy(false);
  };
  const problem = devicePushProblem(device, ar);

  const test = async () => {
    setBusy(true);
    const r = await sendTestPush();
    setBusy(false);
    if ("error" in r) toast.error(ar ? "تعذر إرسال الإشعار التجريبي" : "Could not send the test");
    else if (r.sent > 0)
      toast.success(
        ar ? "تم الإرسال، هيوصلك خلال ثواني" : "Sent, it should arrive in a few seconds",
      );
    else toast.error(ar ? "مفيش جهاز مسجل للإشعارات" : "No device is registered for notifications");
    await reload();
  };

  if (support === null) return null;

  if (support === "ios_install")
    return (
      <div className="space-y-2 text-sm">
        <p className="flex items-center gap-2 font-bold">
          <Smartphone className="h-4 w-4" />
          {ar ? "على الآيفون: ثبّت التطبيق الأول" : "On iPhone: install the app first"}
        </p>
        <p className="text-muted-foreground">
          {ar
            ? "آبل بتسمح بالإشعارات بس للتطبيقات المضافة للشاشة الرئيسية (iOS 16.4 أو أحدث):"
            : "Apple allows notifications only for apps added to the Home Screen (iOS 16.4 or later):"}
        </p>
        <ol className="list-decimal space-y-1 ps-5">
          <li>{ar ? "افتح الصفحة دي في Safari" : "Open this page in Safari"}</li>
          <li className="flex items-center gap-1">
            {ar ? "اضغط زر المشاركة" : "Tap the Share button"} <Share className="inline h-4 w-4" />
          </li>
          <li>{ar ? "اختار «إضافة إلى الشاشة الرئيسية»" : "Choose “Add to Home Screen”"}</li>
          <li>
            {ar
              ? "افتح التطبيق من الأيقونة الجديدة وارجع للإعدادات دي"
              : "Open the app from the new icon and come back here"}
          </li>
        </ol>
      </div>
    );

  if (support === "unsupported")
    return (
      <p className="flex items-center gap-2 text-sm text-muted-foreground">
        <BellOff className="h-4 w-4" />
        {ar
          ? "المتصفح ده مش بيدعم إشعارات التطبيق المقفول. استخدم Chrome على أندرويد أو Safari على آيفون."
          : "This browser can't receive notifications while the app is closed. Use Chrome on Android or Safari on iPhone."}
      </p>
    );

  if (support === "not_configured")
    return (
      <p className="flex items-center gap-2 text-sm text-muted-foreground">
        <BellOff className="h-4 w-4" />
        {ar
          ? "إشعارات الجهاز مش مفعّلة للمتجر لسه."
          : "Device notifications are not set up for this store yet."}
      </p>
    );

  return (
    <div className="space-y-3 text-sm">
      <label className="flex items-center justify-between gap-3">
        <span>
          <span className="flex items-center gap-2 font-bold">
            <BellRing className="h-4 w-4" />
            {ar ? "إشعارات الطلبات على الجهاز ده" : "Order notifications on this device"}
          </span>
          <span className="block text-xs text-muted-foreground">
            {ar
              ? "توصلك حتى لو التطبيق مقفول أو الشاشة مقفولة"
              : "Arrive even when the app is closed or the screen is locked"}
          </span>
        </span>
        <Switch
          checked={on}
          disabled={busy}
          onCheckedChange={toggle}
          aria-label={ar ? "إشعارات الطلبات" : "Order notifications"}
        />
      </label>
      <dl className="space-y-1 rounded-xl bg-muted/50 p-2 text-xs" data-testid="push-device-status">
        <div className="flex justify-between gap-2">
          <dt>{ar ? "الحالة على الجهاز ده" : "This device"}</dt>
          <dd className="font-semibold">
            {device?.state === "ok"
              ? ar
                ? "مفعّلة ✓"
                : "On ✓"
              : on
                ? ar
                  ? "فيها مشكلة"
                  : "Needs attention"
                : ar
                  ? "مش مفعّلة"
                  : "Off"}
          </dd>
        </div>
        {(device?.state === "ok" || device?.state === "failing") && (
          <>
            {device.createdAt && (
              <div className="flex justify-between gap-2">
                <dt>{ar ? "مسجّلة" : "Registered"}</dt>
                <dd>{ageText(device.createdAt, ar)}</dd>
              </div>
            )}
            <div className="flex justify-between gap-2">
              <dt>{ar ? "آخر إشعار وصل" : "Last delivered"}</dt>
              <dd>
                {device.lastSuccessAt ? ageText(device.lastSuccessAt, ar) : ar ? "لسه" : "Not yet"}
              </dd>
            </div>
            {device.state === "failing" && device.lastError && (
              <div className="text-destructive" dir="ltr">
                {device.lastError}
              </div>
            )}
          </>
        )}
      </dl>
      {problem && device?.state !== "off" && (
        <p className="flex gap-2 rounded-xl bg-destructive/10 p-2 text-destructive" role="alert">
          <AlertTriangle className="h-4 w-4 shrink-0" />
          {problem}
        </p>
      )}
      {device?.state !== "blocked" && (
        <Button variant="outline" className="w-full" disabled={busy} onClick={resubscribe}>
          <RefreshCw className="h-4 w-4" />
          {ar ? "إعادة الاشتراك" : "Re-subscribe"}
        </Button>
      )}
      <Button variant="outline" className="w-full" disabled={!on || busy} onClick={test}>
        {ar ? "إرسال إشعار تجريبي" : "Send a test notification"}
      </Button>
    </div>
  );
}
