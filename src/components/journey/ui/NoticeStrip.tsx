import type { ReactNode } from "react";
import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * One calm line above the letter when something has happened (mocks f3, f5,
 * f6, f7, f8): out for review (lilac), back to you (lilac, with the count of
 * changes), approved (green), sent (green, with Undo). Optional actions sit on
 * the right as underlined links; `onUndo` adds the Undo button. `chips` go
 * on the line under the strip (matter, employee, appeal window, review round).
 */
export type NoticeTone = "lilac" | "green" | "amber" | "blue" | "red";

const TONE: Record<NoticeTone, { box: string; icon: string }> = {
  lilac: {
    box: "bg-[var(--ds-lilac-soft)] border-[var(--ds-lilac-bd)] text-[var(--ds-lilac-ink)]",
    icon: "text-[var(--ds-lilac-fg)]",
  },
  green: {
    box: "bg-[var(--ds-green-soft)] border-[var(--ds-green-bd)] text-[var(--ds-green-ink)]",
    icon: "text-[var(--ds-green-solid)]",
  },
  amber: {
    box: "bg-[var(--ds-amber-soft)] border-[var(--ds-amber-bd)] text-[var(--ds-body)]",
    icon: "text-[var(--ds-amber-fg)]",
  },
  blue: {
    box: "bg-[var(--ds-blue-soft)] border-[var(--ds-blue-bg)] text-[var(--ds-body)]",
    icon: "text-[var(--ds-blue-fg)]",
  },
  red: {
    box: "bg-[var(--ds-red-soft)] border-[var(--ds-red-bd)] text-[var(--ds-body)]",
    icon: "text-[var(--ds-red-fg)]",
  },
};

export function NoticeStrip({
  tone,
  icon: Icon,
  title,
  children,
  actions,
  onUndo,
  undoLabel = "Undo",
  chips,
  animate = false,
  className,
}: {
  tone: NoticeTone;
  icon?: LucideIcon;
  /** The bold lead ("With Claire Donnelly for review."). */
  title: ReactNode;
  /** The rest of the line. */
  children?: ReactNode;
  /** Links or buttons on the right ("Message"). */
  actions?: ReactNode;
  onUndo?: () => void;
  undoLabel?: string;
  /** Chips on the line under the strip. */
  chips?: ReactNode;
  /** Rise in once (used for the sent banner). Respects reduced motion. */
  animate?: boolean;
  className?: string;
}) {
  const t = TONE[tone];
  return (
    <div data-slot="notice-strip" data-tone={tone} className={cn("min-w-0", className)}>
      <div
        role="status"
        className={cn(
          "flex items-start gap-2.5 rounded-[12px] border px-3.5 py-3 text-[13.5px] leading-[1.45]",
          t.box,
          animate && "ds-rise-in"
        )}
      >
        {Icon && <Icon aria-hidden className={cn("mt-px size-[17px] shrink-0", t.icon)} />}
        <div className="min-w-0 flex-1">
          <b className="font-medium">{title}</b>
          {children ? <> {children}</> : null}
        </div>
        {(actions || onUndo) && (
          <span className="ml-auto flex shrink-0 items-center gap-3.5 whitespace-nowrap [&_a]:font-medium [&_a]:underline [&_a]:underline-offset-[3px] [&_button]:font-medium [&_button]:underline [&_button]:underline-offset-[3px]">
            {actions}
            {onUndo && (
              <button type="button" onClick={onUndo} className="rounded-[4px]">
                {undoLabel}
              </button>
            )}
          </span>
        )}
      </div>
      {chips && <div className="mt-3 flex flex-wrap items-center gap-1.5">{chips}</div>}
    </div>
  );
}

/** A chip for the line under the notice strip (matter, employee, window). */
export function NoticeChip({
  icon: Icon,
  children,
  tone = "plain",
  className,
}: {
  icon?: LucideIcon;
  children: ReactNode;
  /** "warn" is the amber appeal-window chip; "lilac" the review round. */
  tone?: "plain" | "warn" | "lilac";
  className?: string;
}) {
  return (
    <span
      data-slot="notice-chip"
      className={cn(
        "inline-flex items-center gap-1.5 whitespace-nowrap rounded-[7px] border px-[9px] py-[3px] text-[12.5px]",
        tone === "warn"
          ? "border-[var(--ds-amber-chip-bd)] bg-[var(--ds-amber-chip)] text-[var(--ds-amber-chip-fg)]"
          : tone === "lilac"
            ? "border-[var(--ds-lilac-bd)] bg-[var(--ds-lilac-soft)] text-[var(--ds-lilac-fg)]"
            : "border-[var(--ds-line)] bg-[var(--ds-surface)] text-[var(--ds-body)]",
        className
      )}
    >
      {Icon && (
        <Icon
          aria-hidden
          className={cn(
            "size-[13px] shrink-0",
            tone === "warn" ? "text-[var(--ds-amber-dot)]" : tone === "lilac" ? "text-[var(--ds-lilac-fg)]" : "text-[var(--ds-subtle)]"
          )}
        />
      )}
      {children}
    </span>
  );
}
