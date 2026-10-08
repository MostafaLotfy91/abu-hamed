import { useState } from "react";
import { categoryIcon, usableImage } from "@/lib/category-image";
import { cn } from "@/lib/utils";

/**
 * Category picture with a designed fallback. Shows the image when there is a usable one; when it is missing,
 * an old/invalid path, or fails to load, shows a soft tinted panel (theme colours) with the category-type icon
 * and, unless the card prints the name itself, the name. Never a bare gray box, never an invented image.
 */
export function CategoryImage({
  src,
  name,
  profileKey,
  showName = true,
  priority = false,
  className,
}: {
  src: string | null | undefined;
  name: string;
  profileKey?: string | null;
  /** Off when the surrounding card already shows the name. */
  showName?: boolean;
  priority?: boolean;
  className?: string;
}) {
  const url = usableImage(src);
  const [failed, setFailed] = useState<string | null>(null);
  if (url && failed !== url)
    return (
      <img
        src={url}
        alt=""
        width={600}
        height={800}
        loading={priority ? "eager" : "lazy"}
        decoding="async"
        onError={() => setFailed(url)}
        data-category-image="photo"
        className={cn("h-full w-full object-cover", className)}
      />
    );
  const Icon = categoryIcon(profileKey);
  return (
    <div
      data-category-image="fallback"
      className={cn(
        "flex h-full w-full flex-col items-center justify-center gap-2 bg-gradient-to-br from-brand-secondary/30 via-primary-soft to-primary/15 p-3 text-center text-primary",
        className,
      )}
      aria-hidden={!showName || undefined}
    >
      <span className="flex h-12 w-12 items-center justify-center rounded-full bg-background/70 shadow-sm">
        <Icon className="h-6 w-6" strokeWidth={1.75} />
      </span>
      {showName && (
        <span className="line-clamp-2 text-sm font-bold leading-snug text-foreground">{name}</span>
      )}
    </div>
  );
}
