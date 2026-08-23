import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";
import { type ButtonHTMLAttributes, type Ref } from "react";
import { cn } from "@/lib/utils";

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 font-medium select-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent disabled:pointer-events-none disabled:opacity-40",
  {
    variants: {
      variant: {
        primary:
          "bg-accent text-accent-fg hover:bg-fg active:not-disabled:scale-[0.96]",
        ghost:
          "bg-transparent text-fg hover:bg-elevated active:not-disabled:scale-[0.96]",
        outline:
          "bg-transparent text-fg ring-1 ring-line hover:bg-elevated active:not-disabled:scale-[0.96]",
        subtle:
          "bg-elevated text-fg hover:bg-line active:not-disabled:scale-[0.96]",
        danger:
          "bg-danger text-fg hover:opacity-90 active:not-disabled:scale-[0.96]",
      },
      size: {
        sm: "h-9 rounded-sm px-3 text-sm",
        md: "h-11 rounded-md px-4 text-sm",
        lg: "h-12 rounded-md px-5 text-base",
        icon: "size-11 rounded-md",
        "icon-sm": "size-9 rounded-sm",
      },
    },
    defaultVariants: {
      variant: "primary",
      size: "md",
    },
  },
);

export interface ButtonProps
  extends ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean;
  ref?: Ref<HTMLButtonElement>;
}

export function Button({
  className,
  variant,
  size,
  asChild = false,
  ref,
  type,
  ...props
}: ButtonProps) {
  const Comp = asChild ? Slot : "button";
  return (
    <Comp
      ref={ref}
      type={asChild ? undefined : (type ?? "button")}
      className={cn(
        buttonVariants({ variant, size }),
        "transition-[scale,background-color,color,opacity] duration-150 ease-out",
        className,
      )}
      {...props}
    />
  );
}
