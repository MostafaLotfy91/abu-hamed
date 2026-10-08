import { useEffect, useState } from "react";
import { BellRing } from "lucide-react";
import { Button } from "@/components/ui/button";
import { alertsOnboarded, unlockAlerts } from "@/lib/driver-alerts";

/**
 * One-time step: browsers play sound only after a tap, and notification permission must be asked from one.
 * Shown until the driver taps it once on this device.
 */
export function AlertsOnboarding({ ar }: { ar: boolean }) {
  // null until mounted: the saved choice lives in localStorage, which the server render cannot see.
  const [done, setDone] = useState<boolean | null>(null);
  const [result, setResult] = useState<string | null>(null);
  useEffect(() => setDone(alertsOnboarded()), []);
  if (done === null || (done && !result)) return null;

  const enable = async () => {
    const r = await unlockAlerts();
    const parts = [
      r.sound
        ? ar
          ? "الصوت شغال"
          : "Sound on"
        : ar
          ? "الصوت غير متاح على الجهاز ده"
          : "Sound unavailable on this device",
      r.notifications === "granted"
        ? ar
          ? "الإشعارات مفعّلة"
          : "Notifications on"
        : r.notifications === "unsupported"
          ? ar
            ? "الإشعارات غير مدعومة في المتصفح ده"
            : "Notifications not supported in this browser"
          : ar
            ? "الإشعارات مرفوضة (فعّلها من إعدادات المتصفح)"
            : "Notifications blocked (allow them in browser settings)",
    ];
    setResult(parts.join(" · "));
    setDone(true);
  };

  if (result)
    return (
      <div role="status" className="rounded-2xl bg-success/10 p-3 text-sm text-success">
        {result}
      </div>
    );

  return (
    <section className="space-y-2 rounded-2xl border-2 border-primary/40 bg-primary/5 p-4">
      <p className="flex items-center gap-2 font-bold">
        <BellRing className="h-5 w-5 text-primary" />
        {ar ? "فعّل صوت وإشعارات الطلبات" : "Turn on order sound and notifications"}
      </p>
      <p className="text-sm text-muted-foreground">
        {ar
          ? "علشان تسمع جرس الطلب الجديد حتى لو مش باصص على الشاشة. خطوة واحدة بس."
          : "So you hear new orders even when you're not looking at the screen. One tap, once."}
      </p>
      <Button className="w-full" onClick={enable}>
        {ar ? "تفعيل الصوت والإشعارات" : "Enable sound and notifications"}
      </Button>
    </section>
  );
}
