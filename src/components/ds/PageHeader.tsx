import { useLayoutEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { Link } from "react-router-dom";
import { ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";
import { Count } from "./Pill";

export type Crumb = {
  label: string;
  href?: string;
};

export type PageTab = {
  id: string;
  label: string;
  /** Optional count shown after the label. */
  count?: number;
  /** Render the tab as a link (route-driven tabs). */
  href?: string;
  /** Tint the count amber (something here needs you). */
  attention?: boolean;
};

/**
 * Canonical page header: the mist band from the mocks (design/hifi/base.css
 * `.band`, shell.mjs `band()`).
 *
 *   crumbs  quiet 13px breadcrumb line
 *   title   Newsreader, about 46px (34px on phones), weight 400
 *   lede    15px muted line under the title (bold parts in ink)
 *   actions buttons on the right, bottom-aligned with the title
 *   tabs    underline tabs along the bottom edge of the band
 *
 * The mist wash and the hairline under it run the full width of the page's
 * <main>, even when the header sits inside a centred, padded container, and
 * reach up to the top of <main> when the header is the first thing on the
 * page. So a page only has to render <PageHeader> at the top of its usual
 * container; it does not need to restructure its layout.
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
  band = true,
  mark,
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
  /** Render the title in Newsreader. Set false for compact sans titles. */
  serif?: boolean;
  /** Paint the mist band behind the header. Default on. */
  band?: boolean;
  /** Optional mark before the title (a letter-type tile, an avatar). */
  mark?: ReactNode;
  className?: string;
}) {
  const ref = useRef<HTMLElement>(null);
  const bleed = useBandBleed(ref, band);
  const hasTabs = !!tabs && tabs.length > 0;

  return (
    <header
      ref={ref}
      data-slot="page-header"
      className={cn("relative isolate mb-[30px] min-w-0", !hasTabs && "pb-7", className)}
    >
      {band && (
        <div
          aria-hidden
          data-slot="page-band"
          className="pointer-events-none absolute -z-10 border-b border-[var(--ds-line-2)]"
          style={{
            background: "var(--ds-mist)",
            bottom: 0,
            top: bleed ? -bleed.top : 0,
            left: bleed ? -bleed.left : 0,
            width: bleed ? bleed.width : "100%",
          }}
        />
      )}
      <Breadcrumbs crumbs={crumbs} />
      <div
        className={cn(
          "flex flex-wrap items-end justify-between gap-x-6 gap-y-4 min-w-0",
          crumbs.length > 0 && "mt-2.5"
        )}
      >
        <div className="min-w-0 flex-1 basis-[300px]">
          <div className="flex min-w-0 items-center gap-3">
            {mark}
            <h1
              className={cn(
                "m-0 min-w-0 [overflow-wrap:anywhere]",
                serif
                  ? "ds-title text-[34px] leading-[1.08] md:text-[46px] md:leading-[1.05] [font-variation-settings:'opsz'_72]"
                  : "text-[32px] font-semibold leading-[1.1] tracking-[-0.03em] text-[var(--ds-ink)] md:text-[40px]"
              )}
            >
              {title}
            </h1>
          </div>
          {lede && (
            <p className="m-0 mt-2.5 max-w-[680px] text-[15px] leading-relaxed text-[var(--ds-muted)] [&_b]:font-medium [&_b]:text-[var(--ds-ink)] [&_strong]:font-medium [&_strong]:text-[var(--ds-ink)]">
              {lede}
            </p>
          )}
        </div>
        {actions && (
          <div className="flex shrink-0 flex-wrap items-center gap-2.5 md:pb-1.5">{actions}</div>
        )}
      </div>
      {hasTabs && (
        <UnderlineTabs
          tabs={tabs!}
          activeTab={activeTab ?? tabs![0].id}
          onTabChange={onTabChange}
          className="mt-[26px]"
        />
      )}
    </header>
  );
}

/**
 * Measure how far the band must reach to cover the full width of the page's
 * <main> and, when only the container's top padding sits above the header,
 * up to the top of <main>.
 */
function useBandBleed(ref: React.RefObject<HTMLElement | null>, enabled: boolean) {
  const [bleed, setBleed] = useState<{ top: number; left: number; width: number } | null>(null);
  useLayoutEffect(() => {
    if (!enabled) return;
    const el = ref.current;
    if (!el) return;
    const main = el.closest("main") ?? document.getElementById("main");
    if (!main) return;
    // On phones the compact top bar sits above <main> inside the inset; the
    // band climbs behind it too, so the mist runs to the top of the screen.
    const inset = el.closest<HTMLElement>('[data-slot="sidebar-inset"]') ?? main;
    const measure = () => {
      const h = el.getBoundingClientRect();
      const m = main.getBoundingClientRect();
      const gap = h.top - m.top;
      // Only climb over the container's own top padding, never over content
      // that sits above the header (a banner, a notice).
      const top = gap >= 0 && gap <= 72 ? h.top - Math.min(m.top, inset.getBoundingClientRect().top) : 0;
      const next = { top: Math.round(top), left: Math.round(h.left - m.left), width: Math.round(m.width) };
      setBleed((prev) =>
        prev && prev.top === next.top && prev.left === next.left && prev.width === next.width ? prev : next
      );
    };
    measure();
    if (typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(measure);
    ro.observe(main);
    ro.observe(el);
    return () => ro.disconnect();
  }, [ref, enabled]);
  return bleed;
}

function Breadcrumbs({ crumbs }: { crumbs: Crumb[] }) {
  if (crumbs.length === 0) return null;
  return (
    <nav
      aria-label="Breadcrumb"
      className="flex min-w-0 items-center gap-2 text-[13px] text-[var(--ds-muted)]"
    >
      {crumbs.map((c, i) => (
        <span key={i} className="flex min-w-0 items-center gap-2">
          {c.href ? (
            <Link to={c.href} className="truncate rounded-[4px] transition-colors duration-[120ms] hover:text-[var(--ds-ink)]">
              {c.label}
            </Link>
          ) : (
            <span className="truncate">{c.label}</span>
          )}
          {i < crumbs.length - 1 && (
            <ChevronRight aria-hidden className="size-[13px] shrink-0 text-[var(--ds-subtle)]" />
          )}
        </span>
      ))}
    </nav>
  );
}

const UNDERLINE_TAB =
  "-mb-px inline-flex items-center gap-2 whitespace-nowrap border-b-2 border-transparent px-3 pt-[7px] pb-3 text-[14px] text-[var(--ds-muted)] " +
  "transition-colors duration-[120ms] hover:text-[var(--ds-ink)] " +
  "aria-selected:border-[var(--ds-ink)] aria-selected:font-medium aria-selected:text-[var(--ds-ink)] " +
  "aria-[current=page]:border-[var(--ds-ink)] aria-[current=page]:font-medium aria-[current=page]:text-[var(--ds-ink)]";

/** Underline tabs inside a page (kit.html section 06). Scrolls sideways on phones. */
export function UnderlineTabs({
  tabs,
  activeTab,
  onTabChange,
  className,
  label = "Sections",
}: {
  tabs: PageTab[];
  activeTab: string;
  onTabChange?: (id: string) => void;
  className?: string;
  label?: string;
}) {
  const routed = tabs.every((t) => t.href);
  const track = cn(
    "no-scrollbar -mx-1 flex max-w-[calc(100%+8px)] gap-1 overflow-x-auto px-1",
    className
  );
  if (routed) {
    return (
      <nav aria-label={label} className={track}>
        {tabs.map((t) => {
          const on = t.id === activeTab;
          return (
            <Link key={t.id} to={t.href!} aria-current={on ? "page" : undefined} className={UNDERLINE_TAB}>
              {t.label}
              {t.count != null && (
                <Count strong={on} tone={!on && t.attention ? "amber" : undefined}>
                  {t.count}
                </Count>
              )}
            </Link>
          );
        })}
      </nav>
    );
  }
  return (
    <div role="tablist" aria-label={label} className={track}>
      {tabs.map((t) => {
        const on = t.id === activeTab;
        return (
          <button
            key={t.id}
            type="button"
            role="tab"
            aria-selected={on}
            onClick={() => onTabChange?.(t.id)}
            className={UNDERLINE_TAB}
          >
            {t.label}
            {t.count != null && (
              <Count strong={on} tone={!on && t.attention ? "amber" : undefined}>
                {t.count}
              </Count>
            )}
          </button>
        );
      })}
    </div>
  );
}

const SEG =
  "inline-flex h-[30px] items-center gap-[7px] whitespace-nowrap rounded-[8px] px-3 text-[13.5px] " +
  "text-[var(--ds-muted)] transition-colors duration-[120ms] hover:text-[var(--ds-ink)] " +
  "aria-selected:bg-[var(--ds-surface)] aria-selected:font-medium aria-selected:text-[var(--ds-ink)] aria-selected:shadow-[var(--ds-shadow-s)] " +
  "aria-[current=page]:bg-[var(--ds-surface)] aria-[current=page]:font-medium aria-[current=page]:text-[var(--ds-ink)] aria-[current=page]:shadow-[var(--ds-shadow-s)]";

function SegCount({ n, on }: { n?: number; on: boolean }) {
  if (n == null) return null;
  return (
    <span className={cn("ds-mono text-[12px]", on ? "text-[var(--ds-muted)]" : "text-[var(--ds-subtle)]")}>
      {n}
    </span>
  );
}

/**
 * The segmented switch for views (kit.html "Segmented"): a soft grey track
 * with the current option raised on white. Scrolls sideways on phones.
 */
export function PillTabs({
  tabs,
  activeTab,
  onTabChange,
  className,
  style,
}: {
  tabs: PageTab[];
  activeTab: string;
  onTabChange?: (id: string) => void;
  className?: string;
  style?: CSSProperties;
}) {
  const routed = tabs.every((t) => t.href);
  const track = cn(
    "mt-7 inline-flex max-w-full gap-0.5 overflow-x-auto rounded-[10px] bg-[var(--ds-surface-2)] p-[3px]",
    className
  );
  if (routed) {
    return (
      <nav aria-label="Sections" className={track} style={style}>
        {tabs.map((t) => {
          const on = t.id === activeTab;
          return (
            <Link key={t.id} to={t.href!} aria-current={on ? "page" : undefined} className={SEG}>
              {t.label}
              <SegCount n={t.count} on={on} />
            </Link>
          );
        })}
      </nav>
    );
  }
  return (
    <div role="tablist" className={track} style={style}>
      {tabs.map((t) => {
        const on = t.id === activeTab;
        return (
          <button
            key={t.id}
            type="button"
            role="tab"
            aria-selected={on}
            onClick={() => onTabChange?.(t.id)}
            className={SEG}
          >
            {t.label}
            <SegCount n={t.count} on={on} />
          </button>
        );
      })}
    </div>
  );
}
