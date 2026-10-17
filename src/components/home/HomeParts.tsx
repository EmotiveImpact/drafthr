/** Layout pieces shared by the HR and employee Home pages (mock home). */
import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import { cn } from "@/lib/utils";
import { Skeleton } from "@/components/ui/skeleton";

export { BAND_BTN_DARK as BTN_PRIMARY, BAND_BTN_GHOST as BTN_OUTLINE } from "./HomeBand";

/**
 * The content under the band (mock `.content`): the main column and a
 * 340px rail, 36px apart, 30px top and 48px side padding. On phones the
 * rail follows the ask box so what needs you comes before the long lists.
 */
export function HomeGrid({
  top,
  rail,
  bottom,
  className,
}: {
  top: ReactNode;
  rail?: ReactNode;
  bottom?: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "grid min-w-0 grid-cols-1 gap-x-9 px-4 pt-4 pb-10 md:px-12 md:pt-[30px]",
        rail && "lg:grid-cols-[minmax(0,1fr)_340px] lg:grid-rows-[auto_1fr]",
        className
      )}
    >
      <div className="min-w-0 lg:col-start-1 lg:row-start-1">{top}</div>
      {rail && (
        <div className="mt-[26px] flex min-w-0 flex-col gap-[18px] lg:col-start-2 lg:row-span-2 lg:row-start-1 lg:mt-0">
          {rail}
        </div>
      )}
      {bottom && <div className="flex min-w-0 flex-col lg:col-start-1 lg:row-start-2">{bottom}</div>}
    </div>
  );
}

/** Section heading (mock `secHead`): 17px semibold title, a sub line and a link. */
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
    <div className="mb-3.5 flex min-w-0 items-end justify-between gap-4">
      <div className="min-w-0">
        <h2 className="m-0 text-[17px] font-semibold tracking-[-0.012em] text-[var(--ds-ink)]">{title}</h2>
        {sub && <p className="m-0 mt-[3px] text-[13.5px] text-[var(--ds-muted)]">{sub}</p>}
      </div>
      {action && (
        <Link
          to={action.to}
          className="shrink-0 rounded-[4px] text-[14px] text-[var(--ds-ink)] underline-offset-[3px] transition-colors duration-[120ms] hover:underline"
        >
          {action.label}
        </Link>
      )}
    </div>
  );
}

/** White rail card with a serif title (mock `card`). */
export function RailBox({
  title,
  badge,
  action,
  children,
  label,
  className,
}: {
  title: string;
  badge?: ReactNode;
  action?: { label: string; to: string };
  children: ReactNode;
  label?: string;
  className?: string;
}) {
  return (
    <section
      aria-label={label ?? title}
      className={cn("min-w-0 rounded-[16px] border border-[var(--ds-line)] bg-[var(--ds-surface)] px-5 pt-5 pb-2", className)}
    >
      <header className="mb-3 flex items-center justify-between gap-3">
        <div className="flex min-w-0 items-center">
          <h2 className="ds-title m-0 text-[22px] leading-tight tracking-[-0.015em]">{title}</h2>
          {badge}
        </div>
        {action && (
          <Link
            to={action.to}
            className="shrink-0 rounded-[4px] text-[13.5px] text-[var(--ds-ink)] underline-offset-[3px] hover:underline"
          >
            {action.label}
          </Link>
        )}
      </header>
      {children}
    </section>
  );
}

/**
 * Soft grey rows while a list is still loading (motion map, Quiet tier):
 * a thumbnail and two lines per row. The real rows replace them and fade
 * in together.
 */
export function ListPlaceholder({
  rows = 3,
  label = "Loading letters",
  thumb = true,
  className,
}: {
  rows?: number;
  label?: string;
  thumb?: boolean;
  className?: string;
}) {
  return (
    <div role="status" aria-label={label} data-placeholder className={cn("flex flex-col", className)}>
      {Array.from({ length: rows }, (_, i) => (
        <div key={i} className="flex items-center gap-3 border-b border-[var(--ds-line-2)] py-3 last:border-b-0">
          {thumb && <Skeleton className="size-[34px] shrink-0 rounded-[8px]" />}
          <div className="min-w-0 flex-1">
            <Skeleton className="h-3 rounded-full" style={{ width: `${62 - i * 9}%` }} />
            <Skeleton className="mt-2 h-2.5 rounded-full" style={{ width: `${40 - i * 5}%` }} />
          </div>
        </div>
      ))}
    </div>
  );
}

/** A group of rows that fades in together once (never one by one). */
export const FADE_IN_GROUP = "animate-in fade-in-0 duration-200 motion-reduce:animate-none";
