import { useEffect, useRef, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { useI18n } from "@/lib/i18n";
import { formatCount } from "@/lib/format";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";

const ZOOM = 2.5;

/**
 * Full-screen photo viewer: previous/next (buttons, keyboard arrows, swipe), and tap to zoom in at the tapped
 * spot (then drag/scroll to look around), tap again to zoom out.
 */
export function ImageViewer({
  images,
  alt,
  index,
  open,
  onIndex,
  onOpenChange,
}: {
  images: string[];
  alt: string;
  index: number;
  open: boolean;
  onIndex: (i: number) => void;
  onOpenChange: (open: boolean) => void;
}) {
  const { t, lang, dir } = useI18n();
  const [zoomed, setZoomed] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  const touchX = useRef<number | null>(null);
  const n = images.length;
  const go = (d: number) => {
    setZoomed(false);
    onIndex((index + d + n) % n);
  };

  useEffect(() => setZoomed(false), [index, open]);
  useEffect(() => {
    if (!open || n < 2) return;
    const onKey = (e: KeyboardEvent) => {
      // "Next" is to the left in Arabic.
      if (e.key === "ArrowRight") go(dir === "rtl" ? -1 : 1);
      if (e.key === "ArrowLeft") go(dir === "rtl" ? 1 : -1);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  const toggleZoom = (e: React.MouseEvent<HTMLImageElement>) => {
    const el = box.current;
    if (!el) return;
    if (zoomed) return setZoomed(false);
    const r = e.currentTarget.getBoundingClientRect();
    const fx = (e.clientX - r.left) / r.width;
    const fy = (e.clientY - r.top) / r.height;
    setZoomed(true);
    // After the image grows, scroll so the tapped spot is in the middle.
    requestAnimationFrame(() => {
      el.scrollLeft = fx * el.scrollWidth - el.clientWidth / 2;
      el.scrollTop = fy * el.scrollHeight - el.clientHeight / 2;
    });
  };

  if (!n) return null;
  const Prev = dir === "rtl" ? ChevronRight : ChevronLeft;
  const Next = dir === "rtl" ? ChevronLeft : ChevronRight;
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="h-[100dvh] max-w-none border-0 bg-background p-0 sm:h-[92vh] sm:max-w-5xl sm:rounded-lg">
        <DialogTitle className="sr-only">{alt}</DialogTitle>
        <div
          ref={box}
          dir="ltr"
          className={cn(
            "flex h-full w-full overflow-auto",
            zoomed ? "items-start justify-start" : "items-center justify-center",
          )}
          onTouchStart={(e) => (touchX.current = e.touches[0].clientX)}
          onTouchEnd={(e) => {
            if (zoomed || touchX.current == null) return;
            const dx = e.changedTouches[0].clientX - touchX.current;
            touchX.current = null;
            // Swipe: finger to the left shows the next photo in English, the previous in Arabic.
            if (Math.abs(dx) > 50) go((dx < 0 ? 1 : -1) * (dir === "rtl" ? -1 : 1));
          }}
        >
          <img
            src={images[index]}
            alt={alt}
            onClick={toggleZoom}
            draggable={false}
            className={cn(
              "select-none",
              zoomed
                ? "max-w-none shrink-0 cursor-zoom-out"
                : "max-h-full max-w-full cursor-zoom-in object-contain",
            )}
            style={zoomed ? { width: `${ZOOM * 100}%` } : undefined}
          />
        </div>
        {n > 1 && (
          <>
            <button
              type="button"
              onClick={() => go(-1)}
              aria-label={t("prev_image")}
              className="absolute start-2 top-1/2 flex h-11 w-11 -translate-y-1/2 items-center justify-center rounded-full bg-background/85 shadow-card"
            >
              <Prev className="h-5 w-5" />
            </button>
            <button
              type="button"
              onClick={() => go(1)}
              aria-label={t("next_image")}
              className="absolute end-2 top-1/2 flex h-11 w-11 -translate-y-1/2 items-center justify-center rounded-full bg-background/85 shadow-card"
            >
              <Next className="h-5 w-5" />
            </button>
          </>
        )}
        <p
          aria-live="polite"
          className="pointer-events-none absolute inset-x-0 bottom-3 text-center text-xs font-semibold text-foreground/80"
        >
          {n > 1 && `${formatCount(index + 1, lang)} / ${formatCount(n, lang)} · `}
          {!zoomed && t("zoom_hint")}
        </p>
      </DialogContent>
    </Dialog>
  );
}
