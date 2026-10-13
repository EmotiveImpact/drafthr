/**
 * The header band shared by the list pages (Letters, Bulk letters, Matters,
 * Employees) and the matter and employee pages: the mist band from the
 * mocks (design/hifi base.css `.band`, shell.mjs `band()`), breadcrumbs, the
 * Newsreader title with an optional mark, the lede, the actions bottom-aligned
 * on the right and underline tabs whose underline slides to the chosen tab.
 *
 * Each page draws its tab counts its own way (f9-letters: a chip that turns
 * black when selected; matters and the matter page: a plain grey number;
 * employees and the employee page: a grey chip that stays grey).
 */
import { Fragment, type KeyboardEvent, type ReactNode } from "react";
import { Link } from "react-router-dom";
import { ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";
import { useIndicator } from "./parts";

export type ListCrumb = { label: string; href?: string };
export type ListTab = { id: string; label: string; count?: number };
export type CountStyle = "chip-strong" | "chip" | "plain";

export function ListHeader({
  crumbs = [],
  title,
  titleExtra,
  mark,
  lede,
  below,
  actions,
  tabs,
  activeTab,
  onTabChange,
  countStyle = "chip-strong",
  tabsLabel,
  className,
  headerRef,
}: {
  crumbs?: ListCrumb[];
  title: string;
  /** Muted text after the title (a preferred name). */
  titleExtra?: ReactNode;
  mark?: ReactNode;
  lede?: ReactNode;
  /** Extra lines under the lede (a matter description). */
  below?: ReactNode;
  actions?: ReactNode;
  tabs?: ListTab[];
  activeTab?: string;
  onTabChange?: (id: string) => void;
  countStyle?: CountStyle;
  tabsLabel?: string;
  className?: string;
  headerRef?: React.Ref<HTMLElement>;
}) {
  const hasTabs = !!tabs && tabs.length > 0;
  return (
    <header
      ref={headerRef}
      data-slot="list-band"
      className={cn(
        "min-w-0 border-b border-[var(--ds-line-2)] px-4 pt-5 [background:var(--ds-mist-phone)] md:px-12 md:pt-[34px] md:[background:var(--ds-mist)]",
        !hasTabs && "pb-6 md:pb-7",
        className
      )}
    >
      {crumbs.length > 0 && (
        <nav aria-label="Breadcrumb">
          <ol className="m-0 flex min-w-0 list-none flex-wrap items-center gap-2 p-0 text-[13px] text-[var(--ds-muted)]">
            {crumbs.map((c, i) => (
              <Fragment key={`${c.label}-${i}`}>
                {i > 0 && (
                  <li aria-hidden className="flex">
                    <ChevronRight className="size-[13px] text-[var(--ds-faint)]" />
                  </li>
                )}
                <li className="min-w-0 truncate">
                  {c.href ? (
                    <Link
                      to={c.href}
                      className="rounded-[4px] outline-none transition-colors duration-[120ms] hover:text-[var(--ds-ink)] focus-visible:shadow-[var(--ds-focus-ring)]"
                    >
                      {c.label}
                    </Link>
                  ) : (
                    <span aria-current={i === crumbs.length - 1 ? "page" : undefined}>{c.label}</span>
                  )}
                </li>
              </Fragment>
            ))}
          </ol>
        </nav>
      )}
      <div className={cn("flex min-w-0 flex-wrap items-end justify-between gap-x-6 gap-y-4", crumbs.length > 0 && "mt-2")}>
        <div className="min-w-0 flex-1 basis-[300px]">
          <div className="flex min-w-0 items-center gap-3.5">
            {mark}
            <h1 className="ds-title m-0 min-w-0 text-[34px] leading-[1.08] tracking-[-0.022em] [overflow-wrap:anywhere] md:text-[46px] md:leading-[1]">
              {title}
              {titleExtra && <span className="text-[var(--ds-muted)]"> {titleExtra}</span>}
            </h1>
          </div>
          {lede && (
            <div className="mt-2.5 text-[15px] leading-[1.5] text-[var(--ds-muted)] [&_b]:font-medium [&_b]:text-[var(--ds-ink)]">
              {lede}
            </div>
          )}
          {below}
        </div>
        {actions && <div className="flex min-w-0 flex-wrap items-center gap-2.5 md:pb-1.5">{actions}</div>}
      </div>
      {hasTabs && (
        <SlidingTabs
          tabs={tabs!}
          activeTab={activeTab ?? tabs![0].id}
          onTabChange={onTabChange}
          countStyle={countStyle}
          label={tabsLabel ?? title}
        />
      )}
    </header>
  );
}

/** Underline tabs whose underline slides to the selected tab (a plain jump with reduced motion). */
export function SlidingTabs({
  tabs,
  activeTab,
  onTabChange,
  countStyle,
  label,
  className,
}: {
  tabs: ListTab[];
  activeTab: string;
  onTabChange?: (id: string) => void;
  countStyle: CountStyle;
  label: string;
  className?: string;
}) {
  const { listRef, box } = useIndicator<HTMLDivElement>(activeTab);

  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    const keys = ["ArrowRight", "ArrowLeft", "Home", "End"];
    if (!keys.includes(e.key)) return;
    e.preventDefault();
    const i = Math.max(0, tabs.findIndex((t) => t.id === activeTab));
    const n = tabs.length;
    const next =
      e.key === "ArrowRight" ? (i + 1) % n : e.key === "ArrowLeft" ? (i - 1 + n) % n : e.key === "Home" ? 0 : n - 1;
    onTabChange?.(tabs[next].id);
    requestAnimationFrame(() => {
      listRef.current?.querySelector<HTMLElement>(`[data-tab-id="${CSS.escape(tabs[next].id)}"]`)?.focus();
    });
  };

  return (
    <div className={cn("-mx-4 mt-5 overflow-x-auto px-4 [scrollbar-width:none] md:mx-0 md:mt-[22px] md:overflow-visible md:px-0 [&::-webkit-scrollbar]:hidden", className)}>
      <div ref={listRef} role="tablist" aria-label={label} onKeyDown={onKeyDown} className="relative flex w-max gap-1">
        {tabs.map((t) => {
          const on = t.id === activeTab;
          return (
            <button
              key={t.id}
              type="button"
              role="tab"
              data-tab-id={t.id}
              aria-selected={on}
              tabIndex={on ? 0 : -1}
              onClick={() => onTabChange?.(t.id)}
              className={cn(
                "relative inline-flex items-center whitespace-nowrap rounded-t-[6px] px-3 pb-3 pt-[7px] text-[14px] outline-none transition-colors duration-[120ms] focus-visible:shadow-[var(--ds-focus-ring)]",
                on ? "font-medium text-[var(--ds-ink)]" : "text-[var(--ds-muted)] hover:text-[var(--ds-ink)]"
              )}
            >
              {t.label}
              {t.count != null && <TabCount n={t.count} on={on} style={countStyle} />}
            </button>
          );
        })}
        <span
          aria-hidden
          data-slot="tab-indicator"
          className="pointer-events-none absolute bottom-0 left-0 h-0.5 rounded-full bg-[var(--ds-ink)] transition-[transform,width] duration-[220ms] ease-out motion-reduce:transition-none"
          style={box ? { width: box.width, transform: `translateX(${box.left}px)` } : { width: 0 }}
        />
      </div>
    </div>
  );
}

function TabCount({ n, on, style }: { n: number; on: boolean; style: CountStyle }) {
  if (style === "plain") {
    return <span className="ds-mono ml-[5px] font-normal text-[var(--ds-subtle)]">{n}</span>;
  }
  if (style === "chip") {
    return (
      <span className="ds-mono ml-1.5 rounded-[5px] bg-[var(--ds-chip)] px-1.5 py-px text-[12px] font-medium text-[var(--ds-subtle)]">
        {n}
      </span>
    );
  }
  return (
    <span
      className={cn(
        "ds-mono ml-[7px] rounded-[6px] px-[7px] py-px text-[12px] font-medium transition-colors duration-[120ms]",
        on ? "bg-[var(--ds-ink)] text-[var(--ds-on-accent)]" : "bg-[var(--ds-chip)] text-[var(--ds-subtle)]"
      )}
    >
      {n}
    </span>
  );
}
