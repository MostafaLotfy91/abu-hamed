import { useEffect, useState } from "react";
import { BellOff, BellRing, Share, Smartphone } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import {
  currentSubscription,
  disablePush,
  enablePush,
  pushSupport,
  sendTestPush,
  type PushSupport,
} from "@/lib/push";

/** Driver settings: push notifications on this device (works with the app closed or the screen locked). */
export function PushSettings({ ar }: { ar: boolean }) {
  const [support, setSupport] = useState<PushSupport | null>(null);
  const [on, setOn] = useState(false);
  const [busy, setBusy] = useState(false);
  const [blocked, setBlocked] = useState(false);

  useEffect(() => {
    const s = pushSupport();
    setSupport(s);
    if (s !== "ok") return;
    setBlocked(Notification.permission === "denied");
    currentSubscription()
      .then((sub) => setOn(!!sub))
      .catch(() => setOn(false));
  }, []);

  const toggle = async (next: boolean) => {
    setBusy(true);
    if (next) {
      const r = await enablePush();
      setOn(r === "enabled");
      setBlocked(r === "denied");
      if (r === "error")
        toast.error(ar ? "تعذر تفعيل الإشعارات، حاول تاني" : "Could not turn on notifications");
    } else {
      await disablePush();
      setOn(false);
    }
    setBusy(false);
  };

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
      {blocked && (
        <p className="rounded-xl bg-destructive/10 p-2 text-destructive">
          {ar
            ? "الإشعارات مرفوضة من المتصفح. فعّلها من إعدادات الموقع/التطبيق ثم جرّب تاني."
            : "Notifications are blocked by the browser. Allow them in the site/app settings, then try again."}
        </p>
      )}
      <Button variant="outline" className="w-full" disabled={!on || busy} onClick={test}>
        {ar ? "إرسال إشعار تجريبي" : "Send a test notification"}
      </Button>
    </div>
  );
}
