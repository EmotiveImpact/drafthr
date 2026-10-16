import * as React from "react"

import { cn } from "@/lib/utils"

/** Text field (kit.html section 04): 40px, 10px corners, hairline border,
 * a darker border on hover, a black border on focus, red border when invalid,
 * a soft grey fill when disabled. */
function Input({ className, type, ...props }: React.ComponentProps<"input">) {
  return (
    <input
      type={type}
      data-slot="input"
      className={cn(
        "h-10 w-full min-w-0 rounded-[10px] border border-[var(--ds-line)] bg-[var(--ds-surface)] px-3 py-1 text-[14.5px] text-[var(--ds-ink)] transition-[border-color,box-shadow] duration-[120ms] outline-none",
        "selection:bg-[var(--ds-ink)] selection:text-white placeholder:text-[var(--ds-subtle)]",
        "file:inline-flex file:h-7 file:border-0 file:bg-transparent file:text-sm file:font-medium file:text-[var(--ds-ink)]",
        "hover:border-[var(--ds-line-hover)] focus-visible:border-[var(--ds-ink)]",
        "disabled:pointer-events-none disabled:cursor-not-allowed disabled:bg-[var(--ds-surface-2)] disabled:text-[var(--ds-faint)]",
        "aria-invalid:border-[var(--ds-red-line)]",
        className
      )}
      {...props}
    />
  )
}

export { Input }
