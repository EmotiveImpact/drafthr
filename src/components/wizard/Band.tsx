import {
  useLayoutEffect,
  useRef,
  useState,
  type ReactNode,
  type RefObject,
} from "react";
import { Link } from "react-router-dom";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * The mist header band (design/hifi/base.css `.band`) with a free slot for
 * the row along its bottom edge. Same geometry as the shared PageHeader
 * (crumbs, 46px Newsreader title, lede, actions bottom-aligned with the
 * lede); used where a page needs its own tab row, such as Templates with
 * its counts and sliding underline.
 */
export function Band({
  crumbs = [],
  title,
  lede,
  actions,
  bottom,
  className,
}: {
  crumbs?: { label: string; href?: string }[];
  title: ReactNode;
  lede?: ReactNode;
  actions?: ReactNode;
  /** Tabs (or anything else) along the bottom edge of the band. */
  bottom?: ReactNode;
  className?: string;
}) {
  const ref = useRef<HTMLElement>(null);
  const bleed = useBandBleed(ref);
  return (
    <header
      ref={ref}
      data-slot="page-header"
      className={cn("relative isolate mb-[22px] min-w-0", !bottom && "pb-7", className)}
    >
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
      {crumbs.length > 0 && (
        <nav aria-label="Breadcrumb" className="flex min-w-0 items-center gap-2 text-[13px] text-[var(--ds-muted)]">
          {crumbs.map((c, i) => (
            <span key={i} className="flex min-w-0 items-center gap-2">
              {c.href ? (
                <Link
                  to={c.href}
                  className="truncate rounded-[4px] transition-colors duration-[120ms] hover:text-[var(--ds-ink)]"
                >
                  {c.label}
                </Link>
              ) : (
                <span className="truncate" aria-current={i === crumbs.length - 1 ? "page" : undefined}>
                  {c.label}
                </span>
              )}
              {i < crumbs.length - 1 && (
                <ChevronRight aria-hidden className="size-[13px] shrink-0 text-[var(--ds-subtle)]" />
              )}
            </span>
          ))}
        </nav>
      )}
      <div
        className={cn(
          "flex min-w-0 flex-wrap items-end justify-between gap-x-6 gap-y-4",
          crumbs.length > 0 && "mt-2.5"
        )}
      >
        <div className="min-w-0 flex-1 basis-[300px]">
          <h1 className="ds-title m-0 min-w-0 text-[34px] leading-[1.08] [font-variation-settings:'opsz'_72] [overflow-wrap:anywhere] md:text-[46px] md:leading-[1.05]">
            {title}
          </h1>
          {lede && (
            <div className="m-0 mt-2.5 text-[15px] leading-[1.5] text-[var(--ds-muted)] [&_b]:font-medium [&_b]:text-[var(--ds-ink)]">
              {lede}
            </div>
          )}
        </div>
        {actions && (
          <div className="flex w-full shrink-0 flex-wrap items-center gap-2.5 sm:w-auto md:pb-1.5">{actions}</div>
        )}
      </div>
      {bottom}
    </header>
  );
}

/** Reach the band across the full width of <main> and up behind the phone
 * top bar, like the shared PageHeader does. */
function useBandBleed(ref: RefObject<HTMLElement | null>) {
  const [bleed, setBleed] = useState<{ top: number; left: number; width: number } | null>(null);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const main = el.closest<HTMLElement>("[data-page-main], main") ?? document.getElementById("main");
    if (!main) return;
    const inset = el.closest<HTMLElement>('[data-slot="sidebar-inset"]') ?? main;
    const measure = () => {
      const h = el.getBoundingClientRect();
      const m = main.getBoundingClientRect();
      const gap = h.top - m.top;
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
  }, [ref]);
  return bleed;
}

export type SlideTab = { id: string; label: string; count?: number };

/**
 * Underline tabs (kit 06) whose 2px ink underline slides to the chosen tab
 * (MOTION "Tabs and switches"; instant with reduced motion). Counts sit in
 * subtle grey after the label. Scrolls sideways inside its own row.
 */
export function SlidingTabs({
  tabs,
  active,
  onChange,
  label,
  className,
}: {
  tabs: SlideTab[];
  active: string;
  onChange: (id: string) => void;
  label: string;
  className?: string;
}) {
  const trackRef = useRef<HTMLDivElement>(null);
  const [bar, setBar] = useState<{ left: number; width: number } | null>(null);
  // When the tabs are wider than the band, the row scrolls sideways inside
  // itself; a soft fade and an arrow button on each clipped side show that
  // more tabs are there and scroll to them.
  const [edges, setEdges] = useState<{ left: boolean; right: boolean }>({ left: false, right: false });

  const measureEdges = () => {
    const track = trackRef.current;
    if (!track) return;
    const left = track.scrollLeft > 1;
    const right = track.scrollLeft + track.clientWidth < track.scrollWidth - 1;
    setEdges((prev) => (prev.left === left && prev.right === right ? prev : { left, right }));
  };

  useLayoutEffect(() => {
    const track = trackRef.current;
    if (!track) return;
    const measure = () => {
      const el = track.querySelector<HTMLElement>(`[data-tab-id="${CSS.escape(active)}"]`);
      if (!el) setBar(null);
      else setBar({ left: el.offsetLeft, width: el.offsetWidth });
      measureEdges();
    };
    measure();
    if (typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(measure);
    ro.observe(track);
    return () => ro.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active, tabs]);

  // Keep the chosen tab in view.
  useLayoutEffect(() => {
    const track = trackRef.current;
    const el = track?.querySelector<HTMLElement>(`[data-tab-id="${CSS.escape(active)}"]`);
    if (!track || !el) return;
    const pad = 36;
    if (el.offsetLeft - pad < track.scrollLeft) track.scrollLeft = Math.max(0, el.offsetLeft - pad);
    else if (el.offsetLeft + el.offsetWidth + pad > track.scrollLeft + track.clientWidth)
      track.scrollLeft = el.offsetLeft + el.offsetWidth + pad - track.clientWidth;
    measureEdges();
  }, [active]);

  const nudge = (dir: 1 | -1) => {
    const track = trackRef.current;
    if (!track) return;
    const reduce = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    track.scrollBy({ left: dir * Math.max(160, track.clientWidth * 0.6), behavior: reduce ? "auto" : "smooth" });
  };

  const focusTab = (id: string) =>
    trackRef.current?.querySelector<HTMLButtonElement>(`[data-tab-id="${CSS.escape(id)}"]`)?.focus();

  return (
    <div className={cn("relative -mx-1 mt-[26px]", className)}>
      <div
        ref={trackRef}
        role="tablist"
        aria-label={label}
        onScroll={measureEdges}
        className="no-scrollbar relative flex gap-1 overflow-x-auto px-1"
      >
        {tabs.map((t, i) => {
          const on = t.id === active;
          return (
            <button
              key={t.id}
              type="button"
              role="tab"
              data-tab-id={t.id}
              aria-selected={on}
              tabIndex={on ? 0 : -1}
              onClick={() => onChange(t.id)}
              onKeyDown={(e) => {
                if (e.key !== "ArrowRight" && e.key !== "ArrowLeft") return;
                e.preventDefault();
                const next = tabs[(i + (e.key === "ArrowRight" ? 1 : -1) + tabs.length) % tabs.length];
                onChange(next.id);
                requestAnimationFrame(() => focusTab(next.id));
              }}
              className={cn(
                "inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap px-3 pb-3 pt-[7px] text-[15px] transition-colors duration-[120ms]",
                on ? "font-medium text-[var(--ds-ink)]" : "text-[var(--ds-muted)] hover:text-[var(--ds-ink)]"
              )}
            >
              {t.label}
              {t.count != null && (
                <span className="ds-mono text-[14px] font-normal text-[var(--ds-subtle)]">{t.count}</span>
              )}
            </button>
          );
        })}
        {bar && (
          <span
            aria-hidden
            className="pointer-events-none absolute bottom-0 h-[2px] rounded-full bg-[var(--ds-ink)] transition-[left,width] duration-[220ms] ease-[var(--ds-ease)] motion-reduce:transition-none"
            style={{ left: bar.left, width: bar.width }}
          />
        )}
      </div>
      {edges.left && <TabsEdge side="left" onClick={() => nudge(-1)} />}
      {edges.right && <TabsEdge side="right" onClick={() => nudge(1)} />}
    </div>
  );
}

/** Fade plus a small round arrow over a clipped end of the tab row. */
function TabsEdge({ side, onClick }: { side: "left" | "right"; onClick: () => void }) {
  const Icon = side === "left" ? ChevronLeft : ChevronRight;
  return (
    <div
      className={cn(
        "pointer-events-none absolute bottom-[2px] top-0 flex w-16 items-center pb-[5px]",
        side === "left"
          ? "left-0 justify-start bg-gradient-to-r from-[var(--ds-surface)] via-[var(--ds-surface)]/90 to-transparent"
          : "right-0 justify-end bg-gradient-to-l from-[var(--ds-surface)] via-[var(--ds-surface)]/90 to-transparent"
      )}
    >
      <button
        type="button"
        onClick={onClick}
        aria-label={side === "left" ? "Show earlier tabs" : "Show more tabs"}
        className="pointer-events-auto grid size-8 place-items-center rounded-full border border-[var(--ds-line)] bg-[var(--ds-surface)] text-[var(--ds-muted)] shadow-[var(--ds-shadow-s)] transition-colors duration-[120ms] hover:bg-[var(--ds-hover)] hover:text-[var(--ds-ink)] focus-visible:shadow-[var(--ds-focus-ring)] focus-visible:outline-none"
      >
        <Icon aria-hidden className="size-4" />
      </button>
    </div>
  );
}
