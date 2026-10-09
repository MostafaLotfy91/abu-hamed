import { useRef, useState } from "react";
import { ZoomIn } from "lucide-react";
import { useI18n } from "@/lib/i18n";
import { cn } from "@/lib/utils";
import { ProductImage } from "./ProductCard";
import { ImageViewer } from "./ImageViewer";

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
  // The viewer keeps its own position: gallery scroll events (e.g. when the dialog locks scrolling) must not move it.
  const [viewIdx, setViewIdx] = useState(0);
  // Only real photos open in the viewer (a product without photos shows the placeholder, nothing to zoom).
  const photos = images.filter((x): x is string => !!x);

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
    <div className="flex gap-4 md:flex-row-reverse rtl:md:flex-row">
      <div className="relative min-w-0 flex-1">
        <div
          ref={track}
          onScroll={onScroll}
          className="-mx-3 flex snap-x snap-mandatory overflow-x-auto bg-muted scrollbar-none md:mx-0"
        >
          {images.map((src, i) => (
            <button
              key={i}
              type="button"
              disabled={!src}
              onClick={() => {
                setViewIdx(i);
                setZoom(true);
              }}
              aria-label={t("zoom")}
              className="w-full shrink-0 snap-start cursor-zoom-in disabled:cursor-default"
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
        {photos.length > 0 && (
          <ZoomIn
            className="pointer-events-none absolute bottom-3 end-3 hidden h-5 w-5 text-foreground/70 md:block"
            aria-hidden
          />
        )}
        {images.length > 1 && (
          <div className="absolute inset-x-0 bottom-4 flex justify-center gap-2 md:hidden">
            {images.map((_, i) => (
              <span
                key={i}
                className={cn(
                  "h-px bg-foreground transition-all duration-500",
                  i === idx ? "w-8 opacity-90" : "w-4 opacity-35",
                )}
              />
            ))}
          </div>
        )}
      </div>
      {images.length > 1 && (
        <div className="hidden w-20 shrink-0 flex-col gap-3 md:flex">
          {images.map((src, i) => (
            <button
              key={i}
              type="button"
              onClick={() => go(i)}
              aria-label={`${i + 1}`}
              className={cn(
                "overflow-hidden border transition-[opacity,border-color] duration-300",
                i === idx ? "border-foreground" : "border-transparent opacity-60 hover:opacity-100",
              )}
            >
              <ProductImage src={src} alt="" className="aspect-[4/5] w-full" />
            </button>
          ))}
        </div>
      )}
      <ImageViewer
        images={photos}
        alt={alt}
        index={Math.min(viewIdx, Math.max(0, photos.length - 1))}
        open={zoom && photos.length > 0}
        onIndex={(i) => {
          setViewIdx(i);
          go(i);
        }}
        onOpenChange={setZoom}
      />
    </div>
  );
}
