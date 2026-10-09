import { Link } from "@tanstack/react-router";
import { CategoryImage } from "./CategoryImage";
import { cn } from "@/lib/utils";

/**
 * The one category card used wherever categories are shown with a picture.
 *  - "tile": tall editorial picture (2:3) with the name in the display face (home "shop by department")
 *  - "card": picture with the name underneath (/categories subcategories)
 */
export function CategoryCard({
  id,
  name,
  image,
  profileKey,
  variant,
  priority,
}: {
  id: string;
  name: string;
  image: string | null | undefined;
  profileKey?: string | null;
  variant: "tile" | "card";
  priority?: boolean;
}) {
  if (variant === "tile")
    return (
      <Link
        to="/category/$id"
        params={{ id }}
        data-category-card={id}
        className="group relative block aspect-[2/3] overflow-hidden bg-muted outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <CategoryImage
          src={image}
          name={name}
          profileKey={profileKey}
          showName={false}
          priority={priority}
          className="img-zoom"
        />
        <span className="absolute inset-0 bg-gradient-to-t from-black/60 via-black/5 to-transparent" />
        <span className="absolute inset-x-0 bottom-0 flex flex-col items-center gap-2 p-4 pb-6 text-center text-white md:pb-8">
          <span className="font-display text-2xl md:text-3xl">{name}</span>
          <span className="h-px w-8 bg-white/70 transition-all duration-700 group-hover:w-14" />
        </span>
      </Link>
    );
  return (
    <Link
      to="/category/$id"
      params={{ id }}
      data-category-card={id}
      className={cn(
        "group flex flex-col overflow-hidden rounded-2xl bg-card shadow-card outline-none transition hover:shadow-md focus-visible:ring-2 focus-visible:ring-ring",
      )}
    >
      <div className="aspect-[4/3] overflow-hidden">
        <CategoryImage
          src={image}
          name={name}
          profileKey={profileKey}
          showName={false}
          priority={priority}
          className="transition duration-500 group-hover:scale-105"
        />
      </div>
      <div className="line-clamp-2 p-2.5 text-sm font-semibold">{name}</div>
    </Link>
  );
}
