import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import { ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";

export type Crumb = {
  label: string;
  href?: string;
};

export type PageTab = {
  id: string;
  label: string;
  /** Optional count shown after the label in Geist Mono. */
  count?: number;
  /** Render the tab as a link (route-driven tabs). */
  href?: string;
};

/**
 * Canonical page header (design option 2A): a quiet breadcrumb line, a large
 * Source Serif light title, a muted subtitle, actions on the right, and
 * raised pill tabs underneath when the page has tabs.
 *
 * Tabs are either buttons (pass `onTabChange`) or links (give each tab an
 * `href`); `activeTab` marks the selected one.
 */
export function PageHeader({
  crumbs = [],
  title,
  lede,
  actions,
  tabs,
  activeTab,
  onTabChange,
  serif = true,
  className,
}: {
  crumbs?: Crumb[];
  title: string;
  /** Subtitle under the title. */
  lede?: ReactNode;
  actions?: ReactNode;
  tabs?: PageTab[];
  activeTab?: string;
  onTabChange?: (id: string) => void;
  /** @deprecated kept for backward-compat — no longer renders an X close button. */
  closeTo?: string;
  /** Render the title in Source Serif 4 light. Set false for compact pages. */
  serif?: boolean;
  className?: string;
}) {
  return (
    <header className={cn("mb-8 min-w-0", className)}>
      <Breadcrumbs crumbs={crumbs} />
      <div className="flex flex-wrap items-end justify-between gap-x-6 gap-y-4 min-w-0">
        <div className="min-w-0 flex-1 basis-[320px]">
          <h1
            className={cn(
              "m-0 min-w-0 [overflow-wrap:anywhere]",
              serif
                ? "ds-title text-[clamp(30px,4vw,40px)] leading-[1.1]"
                : "text-[24px] font-semibold leading-[1.2] tracking-[-0.015em] text-[var(--ds-ink)]"
            )}
          >
            {title}
          </h1>
          {lede && (
            <p className="m-0 mt-2.5 max-w-[640px] text-[14.5px] leading-relaxed text-[var(--ds-muted)]">
              {lede}
            </p>
          )}
        </div>
        {actions && (
          <div className="flex shrink-0 flex-wrap items-center gap-2 sm:pb-1">{actions}</div>
        )}
      </div>
      {tabs && tabs.length > 0 && (
        <PillTabs tabs={tabs} activeTab={activeTab ?? tabs[0].id} onTabChange={onTabChange} />
      )}
    </header>
  );
}

function Breadcrumbs({ crumbs }: { crumbs: Crumb[] }) {
  if (crumbs.length === 0) return null;
  return (
    <nav
      aria-label="Breadcrumb"
      className="mb-2.5 flex min-w-0 items-center gap-1.5 text-[12.5px] text-[var(--ds-muted)]"
    >
      {crumbs.map((c, i) => (
        <span key={i} className="flex min-w-0 items-center gap-1.5">
          {c.href ? (
            <Link to={c.href} className="truncate hover:text-[var(--ds-ink)]">
              {c.label}
            </Link>
          ) : (
            <span
              className={cn(
                "truncate",
                i === crumbs.length - 1 && "text-[var(--ds-body)]"
              )}
            >
              {c.label}
            </span>
          )}
          {i < crumbs.length - 1 && (
            <ChevronRight className="size-3 shrink-0 text-[var(--ds-faint)]" />
          )}
        </span>
      ))}
    </nav>
  );
}

const TAB =
  "inline-flex h-[30px] items-center gap-[7px] whitespace-nowrap rounded-[7px] px-[13px] text-[13.5px] font-medium " +
  "text-[var(--ds-muted)] hover:text-[var(--ds-ink)] " +
  "aria-selected:bg-[var(--ds-surface)] aria-selected:text-[var(--ds-ink)] aria-selected:shadow-[var(--ds-shadow-s),0_0_0_1px_var(--ds-line)] " +
  "aria-[current=page]:bg-[var(--ds-surface)] aria-[current=page]:text-[var(--ds-ink)] aria-[current=page]:shadow-[var(--ds-shadow-s),0_0_0_1px_var(--ds-line)]";

function TabCount({ n, on }: { n?: number; on: boolean }) {
  if (n == null) return null;
  return (
    <span className={cn("ds-mono text-[11.5px]", on ? "text-[var(--ds-muted)]" : "text-[var(--ds-faint)]")}>
      {n}
    </span>
  );
}

/** Harvey's raised pill tabs on a soft chip track. Scrolls sideways on phones. */
export function PillTabs({
  tabs,
  activeTab,
  onTabChange,
  className,
}: {
  tabs: PageTab[];
  activeTab: string;
  onTabChange?: (id: string) => void;
  className?: string;
}) {
  const routed = tabs.every((t) => t.href);
  const track = cn(
    "mt-7 inline-flex max-w-full gap-0.5 overflow-x-auto rounded-[var(--ds-r-m)] bg-[var(--ds-chip)] p-[3px]",
    className
  );
  if (routed) {
    return (
      <nav aria-label="Sections" className={track}>
        {tabs.map((t) => {
          const on = t.id === activeTab;
          return (
            <Link key={t.id} to={t.href!} aria-current={on ? "page" : undefined} className={TAB}>
              {t.label}
              <TabCount n={t.count} on={on} />
            </Link>
          );
        })}
      </nav>
    );
  }
  return (
    <div role="tablist" className={track}>
      {tabs.map((t) => {
        const on = t.id === activeTab;
        return (
          <button
            key={t.id}
            type="button"
            role="tab"
            aria-selected={on}
            onClick={() => onTabChange?.(t.id)}
            className={TAB}
          >
            {t.label}
            <TabCount n={t.count} on={on} />
          </button>
        );
      })}
    </div>
  );
}
