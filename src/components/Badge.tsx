import type { HTMLAttributes } from "react";
import { cn } from "@/lib/utils";

/** Quiet grey label (kit.html "Draft" pill without the dot). Pass tone
 * classes through className for anything that carries meaning, or use
 * <Pill> from @/components/ds for status. */
export function Badge({
  className,
  ...rest
}: HTMLAttributes<HTMLSpanElement>) {
  return (
    <span
      {...rest}
      className={cn(
        "inline-flex items-center rounded-[6px] bg-[var(--ds-chip)] px-2 py-0.5 text-[12px] font-medium text-[var(--ds-muted)]",
        className
      )}
    />
  );
}
