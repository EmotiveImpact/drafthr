import { useEffect, useRef, useState, type ReactNode, type RefObject } from "react";
import { createPortal } from "react-dom";
import { ArrowRight, BadgeCheck } from "lucide-react";
import type { Draft, EvidenceItem } from "@/lib/letters/types";
import { figureLabelFor } from "@/lib/evidence";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";

/**
 * 8A citations: numbered boxed markers with a hover card.
 *
 * Two pieces, both only ever showing data the app already has:
 *   - CitationLayer turns the "[See Fig N]" evidence references inside the
 *     letter page into numbered boxes (via data-cite-n, styled in
 *     letter-workspace.css) and shows the evidence item on hover.
 *   - CiteMarker is a standalone numbered box for a known source text, such
 *     as the legal basis of a tribunal deadline.
 */

const KIND_LABEL: Record<EvidenceItem["kind"], string> = {
  email: "Email",
  calendar: "Calendar entry",
  document: "Document",
  screenshot: "Screenshot",
  note: "Note",
};

/** The short marker text for a figure label: "Fig 3" → "3", "Exhibit A" → "A". */
function markerFor(label: string): string {
  const m = label.match(/(\d+)\s*$/) ?? label.match(/(\S+)\s*$/);
  return (m?.[1] ?? label).slice(0, 4);
}

type Open = { item: EvidenceItem; label: string; rect: DOMRect; el: HTMLElement };

/**
 * The evidence item a "[See Fig N]" reference points at: by its data-fig-id,
 * or, where the page view's editor dropped that attribute, by the label in
 * its text ("[See Fig 1]" is the item labelled "Fig 1").
 */
function itemForRef(el: HTMLElement, all: EvidenceItem[]): EvidenceItem | undefined {
  const id = el.getAttribute("data-fig-id");
  if (id) return all.find((e) => e.id === id);
  const label = (el.textContent ?? "").match(/^\s*\[See\s+(.+?)\]\s*$/)?.[1];
  return label ? all.find((e) => figureLabelFor(e, all) === label) : undefined;
}

export function CitationLayer({
  draft,
  containerRef,
  onViewSource,
}: {
  draft: Draft;
  containerRef: RefObject<HTMLElement | null>;
  /** "View source" in the hover card: opens the evidence drawer. */
  onViewSource: () => void;
}) {
  const [open, setOpen] = useState<Open | null>(null);
  const closeTimer = useRef<number | null>(null);
  const evidence = draft.evidence ?? [];
  const evidenceRef = useRef(evidence);
  evidenceRef.current = evidence;

  // Number every figure reference on the page. Runs after each render and
  // whenever the editors re-render their content (MutationObserver), so a
  // freshly inserted reference picks up its number straight away.
  useEffect(() => {
    const root = containerRef.current;
    if (!root) return;
    const paint = () => {
      const all = evidenceRef.current;
      root.querySelectorAll<HTMLElement>(".figure-ref").forEach((el) => {
        const item = itemForRef(el, all);
        const label = item ? figureLabelFor(item, all) : "";
        const n = label ? markerFor(label) : "";
        if (n && el.getAttribute("data-cite-n") !== n) el.setAttribute("data-cite-n", n);
        if (!n && el.hasAttribute("data-cite-n")) el.removeAttribute("data-cite-n");
      });
    };
    paint();
    const mo = new MutationObserver(() => paint());
    mo.observe(root, { childList: true, subtree: true });
    return () => mo.disconnect();
  }, [containerRef, draft.evidence]);

  useEffect(() => {
    const root = containerRef.current;
    if (!root) return;
    const cancelClose = () => {
      if (closeTimer.current) window.clearTimeout(closeTimer.current);
      closeTimer.current = null;
    };
    const show = (target: EventTarget | null) => {
      const el = (target as HTMLElement | null)?.closest?.(".figure-ref[data-cite-n]") as HTMLElement | null;
      if (!el || !root.contains(el)) return false;
      const all = evidenceRef.current;
      const item = itemForRef(el, all);
      if (!item) return false;
      cancelClose();
      setOpen((prev) => {
        prev?.el.classList.remove("is-open");
        el.classList.add("is-open");
        return { item, label: figureLabelFor(item, all), rect: el.getBoundingClientRect(), el };
      });
      return true;
    };
    const scheduleClose = () => {
      cancelClose();
      closeTimer.current = window.setTimeout(() => {
        setOpen((prev) => {
          prev?.el.classList.remove("is-open");
          return null;
        });
      }, 160);
    };
    const onOver = (e: MouseEvent) => {
      if (!show(e.target)) return;
    };
    const onOut = (e: MouseEvent) => {
      const el = (e.target as HTMLElement | null)?.closest?.(".figure-ref[data-cite-n]");
      if (el) scheduleClose();
    };
    root.addEventListener("mouseover", onOver);
    root.addEventListener("mouseout", onOut);
    return () => {
      root.removeEventListener("mouseover", onOver);
      root.removeEventListener("mouseout", onOut);
      cancelClose();
    };
  }, [containerRef]);

  // Close on scroll so the card never floats away from its marker.
  useEffect(() => {
    if (!open) return;
    const onScroll = () =>
      setOpen((prev) => {
        prev?.el.classList.remove("is-open");
        return null;
      });
    window.addEventListener("scroll", onScroll, true);
    return () => window.removeEventListener("scroll", onScroll, true);
  }, [open]);

  if (!open || typeof document === "undefined") return null;

  const width = 320;
  const left = Math.max(12, Math.min(open.rect.left - 12, window.innerWidth - width - 12));
  const below = open.rect.bottom + 8;
  const placeAbove = below + 200 > window.innerHeight;
  const style: React.CSSProperties = placeAbove
    ? { left, bottom: window.innerHeight - open.rect.top + 8, width }
    : { left, top: below, width };

  return createPortal(
    <div
      role="dialog"
      aria-label={`Source ${markerFor(open.label)}: ${open.item.filename ?? KIND_LABEL[open.item.kind]}`}
      className="fixed z-[60] rounded-[var(--ds-r-m)] border border-[var(--ds-line)] bg-[var(--ds-surface)] px-4 pb-3 pt-3.5 text-[13px] leading-[1.5] text-[var(--ds-body)] shadow-[var(--ds-shadow-l)]"
      style={style}
      onMouseEnter={() => {
        if (closeTimer.current) window.clearTimeout(closeTimer.current);
      }}
      onMouseLeave={() =>
        setOpen((prev) => {
          prev?.el.classList.remove("is-open");
          return null;
        })
      }
    >
      <SourceCard
        n={markerFor(open.label)}
        label={open.item.filename || KIND_LABEL[open.item.kind]}
        title={`${KIND_LABEL[open.item.kind]} · ${open.label}`}
        quote={open.item.parsedSummary || open.item.content}
        onView={() => {
          setOpen(null);
          onViewSource();
        }}
      />
    </div>,
    document.body,
  );
}

function SourceCard({
  n,
  label,
  title,
  quote,
  verified,
  onView,
  viewLabel = "View source",
}: {
  n: string;
  label: string;
  title?: string;
  quote?: string;
  verified?: boolean;
  onView?: () => void;
  viewLabel?: string;
}) {
  return (
    <>
      <div className="mb-1 flex items-center justify-between gap-2">
        <span className="text-[11.5px] text-[var(--ds-muted)]">Source {n}</span>
        {verified && (
          <span className="inline-flex items-center gap-1 text-[11.5px] text-[var(--ds-green-fg)]">
            <BadgeCheck className="size-[13px]" />
            Verified
          </span>
        )}
      </div>
      <div className="truncate text-[13.5px] font-semibold text-[var(--ds-ink)]">{label}</div>
      {title && <div className="mt-0.5 text-[12.5px] text-[var(--ds-muted)]">{title}</div>}
      {quote && (
        <p className="m-0 mt-2.5 line-clamp-5 text-[13px] leading-[1.55] text-[var(--ds-blue-fg)]">{quote}</p>
      )}
      {onView && (
        <div className="mt-2.5 flex justify-end">
          <button
            type="button"
            onClick={onView}
            className="-mr-1 inline-flex items-center gap-1 rounded px-1 py-0.5 text-[12.5px] font-medium text-[var(--ds-ink)] hover:bg-[var(--ds-surface-2)]"
          >
            {viewLabel}
            <ArrowRight className="size-[13px]" />
          </button>
        </div>
      )}
    </>
  );
}

/**
 * A standalone 8A marker for a source the app already holds as text (for
 * example the statutory basis of a deadline). Opens on hover or click.
 */
export function CiteMarker({
  n,
  label,
  title,
  quote,
  children,
}: {
  n: number | string;
  label: string;
  title?: string;
  quote?: string;
  children?: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const timer = useRef<number | null>(null);
  const hold = () => {
    if (timer.current) window.clearTimeout(timer.current);
    timer.current = null;
  };
  const release = () => {
    hold();
    timer.current = window.setTimeout(() => setOpen(false), 160);
  };
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          className="lw-cite"
          aria-label={`Source ${n}: ${label}`}
          onMouseEnter={() => {
            hold();
            setOpen(true);
          }}
          onMouseLeave={release}
        >
          {n}
        </button>
      </PopoverTrigger>
      <PopoverContent
        align="start"
        sideOffset={6}
        className="w-[320px] max-w-[calc(100vw-2rem)] rounded-[var(--ds-r-m)] border-[var(--ds-line)] px-4 pb-3 pt-3.5 text-[13px] leading-[1.5] text-[var(--ds-body)] shadow-[var(--ds-shadow-l)]"
        onMouseEnter={hold}
        onMouseLeave={release}
        onOpenAutoFocus={(e) => e.preventDefault()}
      >
        <SourceCard n={String(n)} label={label} title={title} quote={quote} />
        {children}
      </PopoverContent>
    </Popover>
  );
}
