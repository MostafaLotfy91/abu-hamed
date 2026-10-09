// Driver-facing wording for the push state of this device (settings dialog and main-screen banner).
import type { DevicePush } from "./push";

/** "3 days" / "3 أيام" style age of a timestamp. */
export function ageText(iso: string, ar: boolean, now = Date.now()) {
  const mins = Math.max(0, Math.round((now - new Date(iso).getTime()) / 60_000));
  const [n, unit]: [number, "m" | "h" | "d"] =
    mins < 60
      ? [mins, "m"]
      : mins < 1440
        ? [Math.round(mins / 60), "h"]
        : [Math.round(mins / 1440), "d"];
  if (!ar) return `${n} ${{ m: "min", h: "h", d: "d" }[unit]} ago`;
  if (n === 0) return "دلوقتي";
  // [one, two, 3–10, 11+]
  const forms = {
    m: ["دقيقة", "دقيقتين", "دقايق", "دقيقة"],
    h: ["ساعة", "ساعتين", "ساعات", "ساعة"],
    d: ["يوم", "يومين", "أيام", "يوم"],
  }[unit];
  if (n === 1) return `من ${forms[0]}`;
  if (n === 2) return `من ${forms[1]}`;
  return `من ${n} ${n <= 10 ? forms[2] : forms[3]}`;
}

/** What is wrong on this device, in the driver's words (null when push works). */
export function devicePushProblem(d: DevicePush | null, ar: boolean): string | null {
  switch (d?.state) {
    case "off":
      return ar
        ? "إشعارات الطلبات مش مفعّلة على الجهاز ده: مش هتعرف بالأوردرات والتطبيق مقفول."
        : "Order notifications are off on this device: you won't hear about orders while the app is closed.";
    case "stale":
      return ar
        ? "الإشعارات وقفت على الجهاز ده (الاشتراك انتهى). اضغط «إعادة الاشتراك»."
        : "Notifications stopped on this device (subscription expired). Tap “Re-subscribe”.";
    case "key_mismatch":
      return ar
        ? "مفاتيح الإشعارات اتغيرت. اضغط «إعادة الاشتراك»."
        : "The notification keys changed. Tap “Re-subscribe”.";
    case "failing":
      return ar
        ? "آخر إشعار ماوصلش للجهاز ده. اضغط «إعادة الاشتراك» وجرّب إشعار تجريبي."
        : "The last notification did not reach this device. Tap “Re-subscribe” and send a test.";
    case "blocked":
      return ar
        ? "الإشعارات مرفوضة من المتصفح. فعّلها من إعدادات الموقع/التطبيق ثم جرّب تاني."
        : "Notifications are blocked by the browser. Allow them in the site/app settings, then try again.";
    default:
      return null;
  }
}
