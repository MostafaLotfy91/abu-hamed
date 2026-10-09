import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";
import { useHydrated } from "@/lib/use-hydrated";

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-medium cursor-pointer transition-[color,background-color,border-color,opacity] duration-300 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50 disabled:cursor-not-allowed [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0",
  {
    variants: {
      variant: {
        /** Solid charcoal (the store's primary colour) with ivory text. */
        default: "bg-primary text-primary-foreground hover:bg-primary/88",
        destructive: "bg-destructive text-destructive-foreground hover:bg-destructive/90",
        outline: "border border-input bg-transparent hover:border-foreground hover:bg-accent",
        /** Secondary call to action: gold hairline frame that fills on hover. */
        gold: "border border-gold bg-transparent text-foreground hover:bg-gold hover:text-gold-foreground",
        secondary: "bg-secondary text-secondary-foreground hover:bg-secondary/80",
        ghost: "hover:bg-accent hover:text-accent-foreground",
        /** Text link with the slow drawing underline. */
        link: "h-auto px-0 py-0 text-foreground link-luxe",
      },
      size: {
        default: "h-9 px-4 py-2",
        sm: "h-8 rounded-md px-3 text-xs",
        lg: "h-10 rounded-md px-8",
        /** Storefront calls to action: tall, generous, lightly tracked. */
        xl: "h-12 px-10 text-sm tracking-[0.08em] rtl:tracking-normal",
        icon: "h-9 w-9",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  },
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>, VariantProps<typeof buttonVariants> {
  asChild?: boolean;
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, disabled, ...props }, ref) => {
    const Comp = asChild ? Slot : "button";
    // A submit button clicked before hydration would make the browser do a native GET submit of the form
    // (reloading the page and losing what was typed), so it stays disabled until React is in control.
    const hydrated = useHydrated();
    const waiting = !asChild && props.type === "submit" && !hydrated;
    return (
      <Comp
        className={cn(buttonVariants({ variant, size, className }))}
        ref={ref}
        disabled={disabled || waiting || undefined}
        {...props}
      />
    );
  },
);
Button.displayName = "Button";

export { Button, buttonVariants };
