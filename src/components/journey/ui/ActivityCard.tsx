import type { CSSProperties } from "react";
import { cn } from "@/lib/utils";

/**
 * The Activity card in the letter's margin from Approval onwards (mocks f6,
 * f7, f8): the audit record, newest first. Green dots mark the moments that
 * moved the letter on (approved, handed over).
 */
export type ActivityEvent = {
  id: string;
  title: string;
  /** "Priya Shah · 16:05". */
  meta?: string;
  /** A milestone: green dot. */
  done?: boolean;
};

export function ActivityCard({
  events,
  title = "Activity",
  onAllVersions,
  allVersionsLabel = "All versions",
  top,
  className,
  style,
  limit = 6,
}: {
  events: ActivityEvent[];
  title?: string;
  onAllVersions?: () => void;
  allVersionsLabel?: string;
  top?: number;
  className?: string;
  style?: CSSProperties;
  limit?: number;
}) {
  const shown = events.slice(0, limit);
  return (
    <section
      data-slot="activity-card"
      aria-label={title}
      className={cn(
        "w-64 max-w-full rounded-[12px] border border-[var(--ds-line)] bg-[var(--ds-surface)] px-3.5 pt-3.5 pb-1.5 shadow-[var(--ds-shadow-s)]",
        top != null && "absolute",
        className
      )}
      style={top != null ? { top, ...style } : style}
    >
      <div className="mb-2 flex items-center justify-between text-[13px] font-medium text-[var(--ds-ink)]">
        {title}
        {onAllVersions && (
          <button
            type="button"
            onClick={onAllVersions}
            className="rounded-[4px] text-[12px] font-normal text-[var(--ds-muted)] hover:text-[var(--ds-ink)]"
          >
            {allVersionsLabel}
          </button>
        )}
      </div>
      {shown.length === 0 ? (
        <p className="m-0 pb-2 text-[12.5px] text-[var(--ds-muted)]">Nothing recorded yet.</p>
      ) : (
        <ol className="m-0 list-none p-0">
          {shown.map((e, i) => (
            <li key={e.id} className="relative flex gap-2.5 py-1.5 text-[12.5px]">
              {i < shown.length - 1 && (
                <span aria-hidden className="absolute top-4 -bottom-2 left-[3px] w-px bg-[var(--ds-line)]" />
              )}
              <span
                aria-hidden
                className={cn(
                  "relative z-[1] mt-1.5 size-[7px] shrink-0 rounded-full",
                  e.done ? "bg-[var(--ds-green-solid)]" : "bg-[var(--ds-line-strong)]"
                )}
              />
              <div className="min-w-0">
                <div className="text-[var(--ds-ink)]">{e.title}</div>
                {e.meta && <div className="mt-px text-[11.5px] text-[var(--ds-subtle)]">{e.meta}</div>}
              </div>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}
