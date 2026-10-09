import * as React from "react";

import { cn } from "@/lib/utils";

type InputProps = React.ComponentProps<"input"> & {
  /** "line": the storefront's quiet bottom-border field. "box" (default): framed, for dense admin forms. */
  variant?: "box" | "line";
};

const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ className, type, variant = "box", ...props }, ref) => {
    return (
      <input
        type={type}
        className={cn(
          "flex h-9 w-full bg-transparent text-base transition-colors duration-300 file:border-0 file:bg-transparent file:text-sm file:font-medium file:text-foreground placeholder:text-muted-foreground focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-50 md:text-sm",
          variant === "line"
            ? "h-11 rounded-none border-0 border-b border-input px-0 focus-visible:border-foreground"
            : "rounded-md border border-input px-3 py-1 focus-visible:ring-1 focus-visible:ring-ring",
          className,
        )}
        ref={ref}
        {...props}
      />
    );
  },
);
Input.displayName = "Input";

export { Input };
