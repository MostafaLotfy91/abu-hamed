import { Link } from "@tanstack/react-router";
import { CategoryImage } from "./CategoryImage";
import { cn } from "@/lib/utils";

/**
 * The one category card used wherever categories are shown with a picture.
 *  - "tile": tall picture with the name over a gradient (home "shop by department")
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
        className="group relative block aspect-[3/4] overflow-hidden rounded-md bg-muted"
      >
        <CategoryImage
          src={image}
          name={name}
          profileKey={profileKey}
          showName={false}
          priority={priority}
          className="transition duration-500 group-hover:scale-105"
        />
        <span className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/70 to-transparent p-3 pt-10 text-sm font-bold text-white md:text-base">
          {name}
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
