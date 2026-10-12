/** Small layout pieces shared by the HR and employee Home pages. */
import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import { ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";

export const BTN_PRIMARY =
  "inline-flex h-9 items-center gap-1.5 rounded-[var(--ds-r-s)] bg-[var(--ds-accent)] px-3.5 text-[13.5px] font-medium text-[var(--ds-on-accent)] transition hover:bg-[var(--ds-accent-hover)]";

export const BTN_OUTLINE =
  "inline-flex h-9 items-center gap-1.5 rounded-[var(--ds-r-s)] border border-[var(--ds-line)] bg-[var(--ds-surface)] px-3.5 text-[13.5px] font-medium text-[var(--ds-ink)] transition hover:border-[var(--ds-line-strong)] hover:bg-[var(--ds-surface-2)]";

/** Page frame: the main column plus a 340px rail on wide screens. The rail
 * sits between the two main blocks on phones so what needs you comes first. */
export function HomeGrid({
  top,
  rail,
  bottom,
}: {
  top: ReactNode;
  rail?: ReactNode;
  bottom?: ReactNode;
}) {
  return (
    <div
      className={cn(
        "grid min-w-0 grid-cols-1 gap-x-8 gap-y-10",
        rail && "lg:grid-cols-[minmax(0,1fr)_340px] lg:grid-rows-[auto_1fr]"
      )}
    >
      <div className="min-w-0 lg:col-start-1 lg:row-start-1">{top}</div>
      {rail && (
        <div className="flex min-w-0 flex-col gap-6 lg:col-start-2 lg:row-span-2 lg:row-start-1">
          {rail}
        </div>
      )}
      {bottom && <div className="flex min-w-0 flex-col gap-10 lg:col-start-1 lg:row-start-2">{bottom}</div>}
    </div>
  );
}

export function SectionHead({
  title,
  sub,
  action,
}: {
  title: string;
  sub?: ReactNode;
  action?: { label: string; to: string };
}) {
  return (
    <div className="mb-4 flex min-w-0 items-end justify-between gap-4">
      <div className="min-w-0">
        <h2 className="m-0 text-[16px] font-medium tracking-[-0.005em] text-[var(--ds-ink)]">{title}</h2>
        {sub && <p className="m-0 mt-1 text-[12.5px] text-[var(--ds-muted)]">{sub}</p>}
      </div>
      {action && (
        <Link
          to={action.to}
          className="inline-flex shrink-0 items-center gap-0.5 text-[13.5px] text-[var(--ds-body)] transition hover:text-[var(--ds-ink)]"
        >
          {action.label}
          <ChevronRight className="size-3.5 text-[var(--ds-muted)]" />
        </Link>
      )}
    </div>
  );
}

/** White rail box with a title, an optional count and a link on the right. */
export function RailBox({
  title,
  count,
  action,
  children,
  label,
}: {
  title: string;
  count?: number;
  action?: { label: string; to: string };
  children: ReactNode;
  label?: string;
}) {
  return (
    <section
      aria-label={label ?? title}
      className="min-w-0 rounded-[var(--ds-r-l)] border border-[var(--ds-line)] bg-[var(--ds-surface)] p-[18px]"
    >
      <header className="mb-3.5 flex items-center justify-between gap-3">
        <h2 className="m-0 inline-flex items-center gap-2 text-[15px] font-medium text-[var(--ds-ink)]">
          {title}
          {count != null && count > 0 && (
            <span className="ds-mono inline-flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-[var(--ds-chip)] px-[5px] text-[11.5px] font-medium text-[var(--ds-muted)]">
              {count}
            </span>
          )}
        </h2>
        {action && (
          <Link
            to={action.to}
            className="shrink-0 text-[13.5px] text-[var(--ds-body)] transition hover:text-[var(--ds-ink)]"
          >
            {action.label}
          </Link>
        )}
      </header>
      {children}
    </section>
  );
}
