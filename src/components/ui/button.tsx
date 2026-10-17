import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"
import { Slot } from "radix-ui"

import { cn } from "@/lib/utils"

/**
 * Buttons, as drawn in design/hifi/out/kit.html (section 03).
 *
 *   default      the one near-black button per screen (primary action)
 *   outline      white with a hairline (secondary)
 *   secondary    soft grey fill
 *   ghost        text-only with a hover fill ("Text" in the kit)
 *   destructive  white with a red hairline and red text ("Danger")
 *   link         an underlined text link
 *
 * Hover darkens slightly over 120ms; press is one shade darker; nothing moves
 * or scales, so text stays sharp. Focus is a white gap and a soft blue ring.
 * Sizes: sm 32, default 38, lg 46 (icon sizes match).
 */
const buttonVariants = cva(
  "inline-flex shrink-0 items-center justify-center gap-[7px] rounded-[var(--ds-r-m)] text-[14.5px] font-medium whitespace-nowrap outline-none select-none " +
    "transition-[background-color,border-color,color,box-shadow] duration-[120ms] ease-out " +
    "focus-visible:shadow-[var(--ds-focus-ring)] disabled:pointer-events-none disabled:opacity-[.38] " +
    "aria-invalid:border-[var(--ds-red-line)] [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
  {
    variants: {
      variant: {
        default:
          "bg-[var(--ds-accent)] text-[var(--ds-on-accent)] hover:bg-[var(--ds-accent-hover)] active:bg-[var(--ds-accent-press)]",
        destructive:
          "border border-[var(--ds-red-bd)] bg-[var(--ds-surface)] text-[var(--ds-red-fg)] hover:bg-[var(--ds-red-soft)] active:bg-[var(--ds-red-bg)]",
        outline:
          "border border-[var(--ds-line)] bg-[var(--ds-surface)] text-[var(--ds-ink)] hover:bg-[var(--ds-surface-2)] active:border-[var(--ds-line-strong)] active:bg-[var(--ds-surface-3)]",
        secondary:
          "bg-[var(--ds-surface-2)] text-[var(--ds-ink)] hover:bg-[var(--ds-surface-3)] active:bg-[var(--ds-line)]",
        ghost:
          "text-[var(--ds-ink)] hover:bg-[var(--ds-surface-2)] active:bg-[var(--ds-surface-3)]",
        link: "text-[var(--ds-ink)] underline-offset-[3px] hover:underline",
      },
      size: {
        default: "h-[38px] px-3.5",
        xs: "h-7 gap-1 rounded-[var(--ds-r-s)] px-2 text-[12.5px] [&_svg:not([class*='size-'])]:size-3.5",
        sm: "h-8 gap-1.5 rounded-[8px] px-[11px] text-[13.5px]",
        lg: "h-[46px] rounded-[11px] px-5 text-[15.5px]",
        icon: "size-[38px]",
        "icon-xs": "size-7 rounded-[var(--ds-r-s)] [&_svg:not([class*='size-'])]:size-3.5",
        "icon-sm": "size-8 rounded-[8px]",
        "icon-lg": "size-[46px] rounded-[11px]",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
)

function Button({
  className,
  variant = "default",
  size = "default",
  asChild = false,
  ...props
}: React.ComponentProps<"button"> &
  VariantProps<typeof buttonVariants> & {
    asChild?: boolean
  }) {
  const Comp = asChild ? Slot.Root : "button"

  return (
    <Comp
      data-slot="button"
      data-variant={variant}
      data-size={size}
      className={cn(buttonVariants({ variant, size, className }))}
      {...props}
    />
  )
}

export { Button, buttonVariants }
