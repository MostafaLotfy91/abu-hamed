import { cn } from "@/lib/utils";

/** Small geometric separator: gold line, rotated square, line. Decorative only. */
export function Ornament({ className }: { className?: string }) {
  return (
    <div className={cn("ornament", className)} aria-hidden="true">
      <i />
    </div>
  );
}

/** Gold hairline divider. */
export function Hairline({ className }: { className?: string }) {
  return <hr className={cn("hairline", className)} aria-hidden="true" />;
}

/**
 * Section heading in the luxury style: small label, large display title, optional ornament and intro.
 * `as` keeps the document outline right (h1 on a page title, h2 for home sections).
 */
export function SectionTitle({
  eyebrow,
  title,
  intro,
  as: Tag = "h2",
  align = "center",
  ornament = true,
  className,
}: {
  eyebrow?: string;
  title: string;
  intro?: string;
  as?: "h1" | "h2" | "h3";
  align?: "center" | "start";
  ornament?: boolean;
  className?: string;
}) {
  return (
    <header
      className={cn(
        "space-y-3",
        align === "center" ? "mx-auto max-w-2xl text-center" : "text-start",
        className,
      )}
    >
      {eyebrow && <p className="eyebrow">{eyebrow}</p>}
      <Tag className="font-display text-3xl md:text-4xl lg:text-5xl">{title}</Tag>
      {ornament && <Ornament className={align === "start" ? "justify-start" : undefined} />}
      {intro && <p className="leading-loose text-muted-foreground">{intro}</p>}
    </header>
  );
}
