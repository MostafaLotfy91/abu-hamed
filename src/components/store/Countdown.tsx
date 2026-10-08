import { useEffect, useState } from "react";

export function Countdown({ to }: { to: string }) {
  const [now, setNow] = useState<number | null>(null);
  useEffect(() => {
    setNow(Date.now());
    const i = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(i);
  }, []);
  if (now == null) return <span className="tabular-nums">--:--:--</span>;
  const ms = Math.max(0, new Date(to).getTime() - now);
  const h = Math.floor(ms / 3600000),
    m = Math.floor((ms % 3600000) / 60000),
    s = Math.floor((ms % 60000) / 1000);
  const pad = (n: number) => String(n).padStart(2, "0");
  return (
    <span dir="ltr" className="inline-flex gap-1 tabular-nums">
      {[pad(h), pad(m), pad(s)].map((x, i) => (
        <span
          key={i}
          className="rounded-md bg-deal px-1.5 py-0.5 text-xs font-bold text-deal-foreground"
        >
          {x}
        </span>
      ))}
    </span>
  );
}
