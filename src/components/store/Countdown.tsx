import { useEffect, useState } from "react";
import { useI18n } from "@/lib/i18n";
import { countLabel } from "@/lib/format";

/** Parts of the time left: whole days, then hours/minutes/seconds (never negative). */
export function timeLeft(to: string, now: number) {
  const ms = Math.max(0, new Date(to).getTime() - now);
  return {
    days: Math.floor(ms / 86_400_000),
    h: Math.floor((ms % 86_400_000) / 3_600_000),
    m: Math.floor((ms % 3_600_000) / 60_000),
    s: Math.floor((ms % 60_000) / 1000),
  };
}

/** "يومان ٠٥:١٢:٠٩" / "2 days 05:12:09", in the page language's digits. */
export function Countdown({ to }: { to: string }) {
  const { lang } = useI18n();
  const [now, setNow] = useState<number | null>(null);
  useEffect(() => {
    setNow(Date.now());
    const i = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(i);
  }, []);
  const two = new Intl.NumberFormat(lang === "ar" ? "ar-EG" : "en-US", {
    minimumIntegerDigits: 2,
    useGrouping: false,
  });
  if (now == null) return <span className="tabular-nums">--:--:--</span>;
  const { days, h, m, s } = timeLeft(to, now);
  return (
    <span className="inline-flex items-center gap-1 tabular-nums" role="timer">
      {days > 0 && <span className="text-xs font-bold">{countLabel(days, lang, "day")}</span>}
      <span dir="ltr" className="inline-flex gap-1">
        {[h, m, s].map((x, i) => (
          <span
            key={i}
            className="rounded-md bg-deal px-1.5 py-0.5 text-xs font-bold text-deal-foreground"
          >
            {two.format(x)}
          </span>
        ))}
      </span>
    </span>
  );
}
