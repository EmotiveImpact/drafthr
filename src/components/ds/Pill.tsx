import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

/**
 * Status pill (kit.html section 05). The same colour always means the same
 * thing across every screen:
 *   amber  needs you          lilac  someone else has it, or the reviewer
 *   green  done               blue   neutral info, in progress
 *   red    errors and failing checks only
 *   grey   draft, nothing to say
 */
export type PillTone = "amber" | "green" | "blue" | "red" | "grey" | "lilac";

const TONES: Record<PillTone, string> = {
  amber: "bg-[var(--ds-amber-bg)] text-[var(--ds-amber-fg)]",
  green: "bg-[var(--ds-green-bg)] text-[var(--ds-green-fg)]",
  blue: "bg-[var(--ds-blue-bg)] text-[var(--ds-blue-fg)]",
  red: "bg-[var(--ds-red-bg)] text-[var(--ds-red-fg)]",
  grey: "bg-[var(--ds-chip)] text-[var(--ds-muted)]",
  lilac: "bg-[var(--ds-lilac-bg)] text-[var(--ds-lilac-fg)]",
};

export function Pill({
  tone = "grey",
  dot = true,
  children,
  className,
  title,
}: {
  tone?: PillTone;
  /** The small leading dot in the pill's colour. On by default. */
  dot?: boolean;
  children: ReactNode;
  className?: string;
  title?: string;
}) {
  return (
    <span
      data-slot="pill"
      data-tone={tone}
      title={title}
      className={cn(
        "inline-flex items-center gap-1.5 whitespace-nowrap rounded-[6px] px-2 py-0.5 text-[12px] leading-[18px] font-medium",
        TONES[tone],
        className
      )}
    >
      {dot && <span aria-hidden className="size-1.5 shrink-0 rounded-full bg-current" />}
      {children}
    </span>
  );
}

/** Small count chip (tabs, nav rows). `strong` is the black one for the current tab. */
export function Count({
  children,
  strong = false,
  tone,
  className,
}: {
  children: ReactNode;
  strong?: boolean;
  /** amber marks a count that needs you. */
  tone?: "amber";
  className?: string;
}) {
  return (
    <span
      data-slot="count"
      className={cn(
        "ds-mono inline-grid h-5 min-w-5 place-items-center rounded-[6px] px-1.5 text-[12px] font-medium",
        strong
          ? "bg-[var(--ds-ink)] text-[var(--ds-on-accent)]"
          : tone === "amber"
            ? "bg-[var(--ds-amber-bg)] text-[var(--ds-amber-fg)]"
            : "bg-[var(--ds-chip)] text-[var(--ds-muted)]",
        className
      )}
    >
      {children}
    </span>
  );
}

/** Hairline tag ("England and Wales", "Counsel"). */
export function Tag({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <span
      data-slot="tag"
      className={cn(
        "inline-flex h-[26px] items-center gap-1.5 whitespace-nowrap rounded-[7px] border border-[var(--ds-line)] bg-[var(--ds-surface)] px-2.5 text-[12.5px] text-[var(--ds-body)] [&_svg]:size-[13px] [&_svg]:text-[var(--ds-subtle)]",
        className
      )}
    >
      {children}
    </span>
  );
}
