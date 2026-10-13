import * as React from "react"

import { cn } from "@/lib/utils"

/** Multi-line field, same states as Input. */
function Textarea({ className, ...props }: React.ComponentProps<"textarea">) {
  return (
    <textarea
      data-slot="textarea"
      className={cn(
        "flex field-sizing-content min-h-16 w-full rounded-[10px] border border-[var(--ds-line)] bg-[var(--ds-surface)] px-3 py-2.5 text-[14.5px] text-[var(--ds-ink)] transition-[border-color,box-shadow] duration-[120ms] outline-none",
        "placeholder:text-[var(--ds-subtle)] hover:border-[var(--ds-line-hover)] focus-visible:border-[var(--ds-ink)]",
        "disabled:cursor-not-allowed disabled:bg-[var(--ds-surface-2)] disabled:text-[var(--ds-faint)] aria-invalid:border-[var(--ds-red-line)]",
        className
      )}
      {...props}
    />
  )
}

export { Textarea }
