import { useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { ArrowLeft } from "lucide-react";
import type { Draft } from "@/lib/letters/types";
import { useJourney } from "@/lib/journey/stage";
import { StatusPill } from "@/components/journey/ui";
import { cn } from "@/lib/utils";
import { EditableTitleBar } from "./EditableTitleBar";

/** Quiet white button in the letter's document bar (Evidence, Activity). */
export const BAR_BTN =
  "inline-flex h-[34px] shrink-0 items-center gap-1.5 rounded-[8px] px-2.5 text-[14px] text-[var(--ds-ink)] transition-colors duration-[120ms] hover:bg-[var(--ds-hover)] active:bg-[var(--ds-surface-3)] focus-visible:outline-none focus-visible:shadow-[var(--ds-focus-ring)]";

/** Near-black main action in the document bar. */
export const BAR_BTN_DARK =
  "inline-flex h-[34px] shrink-0 items-center gap-1.5 rounded-[8px] bg-[var(--ds-accent)] px-3 text-[14px] font-medium text-[var(--ds-on-accent)] transition-colors duration-[120ms] hover:bg-[var(--ds-accent-hover)] active:bg-[var(--ds-accent-press)] focus-visible:outline-none focus-visible:shadow-[var(--ds-focus-ring)]";

/**
 * The document bar of the letter's own pages (Evidence, Review): the same
 * 60px row as the workspace: back arrow, the letter name (rename in place),
 * the employee, the journey's status pill, then the page's actions.
 */
export function SubPageBar({
  draft,
  backLabel = "Back to letter",
  onBack,
  actions,
}: {
  draft: Draft;
  backLabel?: string;
  onBack: () => void;
  actions?: ReactNode;
}) {
  const journey = useJourney(draft.id);
  return (
    <div className="flex h-[60px] min-w-0 shrink-0 items-center gap-1.5 border-b border-[var(--ds-line-2)] bg-[var(--ds-surface)] pl-3 pr-3.5">
      <button
        type="button"
        onClick={onBack}
        aria-label={backLabel}
        title={backLabel}
        className="grid size-[34px] shrink-0 place-items-center rounded-[8px] text-[var(--ds-muted)] transition-colors duration-[120ms] hover:bg-[var(--ds-hover)] hover:text-[var(--ds-ink)] active:bg-[var(--ds-surface-3)] focus-visible:outline-none focus-visible:shadow-[var(--ds-focus-ring)]"
      >
        <ArrowLeft className="size-[18px]" />
      </button>
      {/* The name keeps room for a few words on a phone; the status pill
       * gives way there instead (FEAT-X4). */}
      <div className="ml-0.5 mr-1.5 flex min-w-[120px] shrink items-center">
        <EditableTitleBar draft={draft} variant="bar" />
      </div>
      {journey && (
        <StatusPill tone={journey.statusTone} className="ml-1.5 shrink-0 max-sm:hidden">
          {journey.statusLabel}
        </StatusPill>
      )}
      <span className="min-w-2 flex-1" />
      <div className="flex shrink-0 items-center gap-1">{actions}</div>
    </div>
  );
}

/** Grey segmented control with a sliding white thumb (side panel header). */
export function SegmentedTabs<T extends string>({
  tabs,
  value,
  onChange,
  label,
  className,
}: {
  tabs: { id: T; label: string; count?: number | string }[];
  value: T;
  onChange: (id: T) => void;
  label: string;
  className?: string;
}) {
  const listRef = useRef<HTMLDivElement>(null);
  const [thumb, setThumb] = useState<{ left: number; width: number } | null>(null);
  const key = tabs.map((t) => `${t.id}:${t.count ?? ""}`).join("|");
  useLayoutEffect(() => {
    const el = listRef.current?.querySelector<HTMLElement>(`[data-tab="${value}"]`);
    if (!el) return;
    setThumb({ left: el.offsetLeft, width: el.offsetWidth });
  }, [value, key]);

  return (
    <div
      ref={listRef}
      role="tablist"
      aria-label={label}
      className={cn("relative flex h-[34px] min-w-0 flex-1 rounded-[10px] bg-[var(--ds-surface-2)] p-[3px]", className)}
    >
      {thumb && (
        <span
          aria-hidden
          className="lw-seg-thumb absolute bottom-[3px] top-[3px] rounded-[8px] bg-[var(--ds-surface)] shadow-[var(--ds-shadow-s)]"
          style={{ transform: `translateX(${thumb.left - 3}px)`, width: thumb.width, left: 3 }}
        />
      )}
      {tabs.map((t) => (
        <button
          key={t.id}
          type="button"
          role="tab"
          data-tab={t.id}
          aria-selected={value === t.id}
          onClick={() => onChange(t.id)}
          className={cn(
            "relative z-[1] inline-flex min-w-0 flex-1 items-center justify-center gap-1.5 whitespace-nowrap rounded-[8px] px-2 text-[14px] transition-colors duration-[120ms] focus-visible:outline-none focus-visible:shadow-[var(--ds-focus-ring)]",
            value === t.id ? "font-medium text-[var(--ds-ink)]" : "text-[var(--ds-muted)] hover:text-[var(--ds-ink)]"
          )}
        >
          <span className="truncate">{t.label}</span>
          {t.count !== undefined && t.count !== 0 && (
            <span className="ds-mono text-[12px] font-normal text-[var(--ds-subtle)]">{t.count}</span>
          )}
        </button>
      ))}
    </div>
  );
}
