import { useRef, useState } from "react";
import { ChevronsLeft, ChevronsRight } from "lucide-react";
import { cn } from "@/lib/utils";

/** Fraction of the track the thumb must travel to count as a swipe. */
export const SWIPE_THRESHOLD = 0.85;

/**
 * Accept by sliding the thumb across the track, so a tap in a pocket can't accept an order. Slides toward the
 * reading direction's end (left in Arabic). Keyboard and screen readers: it is a button; Enter/Space accept.
 */
export function SwipeToAccept({
  label,
  disabled,
  onAccept,
  dir,
}: {
  label: string;
  disabled?: boolean;
  onAccept: () => void;
  dir: "rtl" | "ltr";
}) {
  const track = useRef<HTMLDivElement>(null);
  const start = useRef<number | null>(null);
  const [progress, setProgressState] = useState(0);
  // Read on release, so a quick flick can never use a stale value from the last render.
  const latest = useRef(0);
  const setProgress = (p: number) => {
    latest.current = p;
    setProgressState(p);
  };
  const sign = dir === "rtl" ? -1 : 1;

  const travel = () => {
    const el = track.current;
    return Math.max(1, (el?.clientWidth ?? 0) - 56); // track minus thumb width
  };
  const onDown = (e: React.PointerEvent) => {
    if (disabled) return;
    start.current = e.clientX;
    (e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId);
  };
  const onMove = (e: React.PointerEvent) => {
    if (start.current == null) return;
    const moved = ((e.clientX - start.current) * sign) / travel();
    setProgress(Math.min(1, Math.max(0, moved)));
  };
  const onUp = () => {
    if (start.current == null) return;
    start.current = null;
    if (latest.current >= SWIPE_THRESHOLD) {
      setProgress(1);
      onAccept();
    } else setProgress(0);
  };
  const Icon = dir === "rtl" ? ChevronsLeft : ChevronsRight;

  return (
    <div
      ref={track}
      role="button"
      tabIndex={disabled ? -1 : 0}
      aria-label={label}
      aria-disabled={disabled || undefined}
      onKeyDown={(e) => {
        if (disabled) return;
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onAccept();
        }
      }}
      className={cn(
        "relative h-14 select-none overflow-hidden rounded-xl bg-success/15 text-success outline-none focus-visible:ring-2 focus-visible:ring-success",
        disabled && "opacity-50",
      )}
    >
      <div
        className="absolute inset-y-0 start-0 bg-success/25"
        style={{ width: `calc(56px + ${progress} * (100% - 56px))` }}
        aria-hidden
      />
      <span className="pointer-events-none absolute inset-0 flex items-center justify-center text-base font-bold">
        {label}
      </span>
      <div
        data-testid="swipe-thumb"
        onPointerDown={onDown}
        onPointerMove={onMove}
        onPointerUp={onUp}
        onPointerCancel={onUp}
        className="absolute inset-y-1 start-1 flex w-12 touch-none items-center justify-center rounded-lg bg-success text-background shadow"
        style={{
          transform: `translateX(${sign * progress * travel()}px)`,
          // Moves with the finger; springs back when let go early.
          transition: start.current == null ? "transform 0.2s" : "none",
        }}
      >
        <Icon className="h-6 w-6" />
      </div>
    </div>
  );
}
