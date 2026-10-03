import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "../../lib/cn";
import type { ButtonHTMLAttributes } from "react";

const variants = cva(
  "inline-flex items-center justify-center gap-2 rounded-md text-sm font-medium transition disabled:opacity-50 disabled:pointer-events-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-400",
  {
    variants: {
      variant: {
        primary: "bg-accent-500 text-ink-950 hover:bg-accent-400",
        secondary: "bg-white/10 text-white hover:bg-white/15",
        ghost: "text-white/80 hover:bg-white/10",
        danger: "bg-red-500/90 text-white hover:bg-red-500",
        outline: "border border-white/15 hover:bg-white/10",
      },
      size: {
        sm: "h-8 px-3",
        md: "h-10 px-4",
        icon: "h-10 w-10",
      },
    },
    defaultVariants: { variant: "primary", size: "md" },
  },
);

export function Button({
  className,
  variant,
  size,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & VariantProps<typeof variants>) {
  return <button className={cn(variants({ variant, size }), className)} {...props} />;
}
