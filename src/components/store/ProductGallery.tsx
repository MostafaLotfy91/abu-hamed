import { useRef, useState } from "react";
import { ZoomIn } from "lucide-react";
import { useI18n } from "@/lib/i18n";
import { cn } from "@/lib/utils";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { ProductImage } from "./ProductCard";

/** Swipeable gallery (scroll-snap) with dots on mobile, thumbnails on desktop and a tap-to-zoom viewer. */
export function ProductGallery({
  images,
  alt,
  overlay,
}: {
  images: (string | null)[];
  alt: string;
  overlay?: React.ReactNode;
}) {
  const { t } = useI18n();
  const track = useRef<HTMLDivElement>(null);
  const [idx, setIdx] = useState(0);
  const [zoom, setZoom] = useState(false);

  const go = (i: number) => {
    const el = track.current?.children[i] as HTMLElement | undefined;
    el?.scrollIntoView({ behavior: "smooth", block: "nearest", inline: "start" });
    setIdx(i);
  };
  const onScroll = () => {
    const el = track.current;
    if (!el) return;
    const i = Math.round(Math.abs(el.scrollLeft) / el.clientWidth);
    if (i !== idx) setIdx(i);
  };

  return (
    <div className="flex gap-3 md:flex-row-reverse rtl:md:flex-row">
      <div className="relative min-w-0 flex-1">
        <div
          ref={track}
          onScroll={onScroll}
          className="flex snap-x snap-mandatory overflow-x-auto rounded-md bg-muted scrollbar-none"
        >
          {images.map((src, i) => (
            <button
              key={i}
              type="button"
              onClick={() => {
                setIdx(i);
                setZoom(true);
              }}
              aria-label={t("zoom")}
              className="w-full shrink-0 snap-start cursor-zoom-in"
            >
              <ProductImage
                src={src}
                alt={i === 0 ? alt : ""}
                priority={i === 0}
                className="aspect-[4/5] w-full"
              />
            </button>
          ))}
        </div>
        {overlay}
        <ZoomIn
          className="pointer-events-none absolute bottom-3 end-3 hidden h-5 w-5 text-foreground/70 md:block"
          aria-hidden
        />
        {images.length > 1 && (
          <div className="absolute inset-x-0 bottom-3 flex justify-center gap-1.5 md:hidden">
            {images.map((_, i) => (
              <span
                key={i}
                className={cn(
                  "h-1.5 rounded-full bg-foreground/40 transition-all",
                  i === idx ? "w-5 bg-foreground" : "w-1.5",
                )}
              />
            ))}
          </div>
        )}
      </div>
      {images.length > 1 && (
        <div className="hidden w-16 shrink-0 flex-col gap-2 md:flex">
          {images.map((src, i) => (
            <button
              key={i}
              type="button"
              onClick={() => go(i)}
              aria-label={`${i + 1}`}
              className={cn(
                "overflow-hidden rounded-sm border transition",
                i === idx ? "border-foreground" : "border-transparent opacity-70 hover:opacity-100",
              )}
            >
              <ProductImage src={src} alt="" className="aspect-[4/5] w-full" />
            </button>
          ))}
        </div>
      )}
      <Dialog open={zoom} onOpenChange={setZoom}>
        <DialogContent className="max-w-4xl border-0 bg-background p-0">
          <DialogTitle className="sr-only">{alt}</DialogTitle>
          <div className="max-h-[90vh] overflow-auto">
            {images[idx] && <img src={images[idx]!} alt={alt} className="w-full object-contain" />}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
