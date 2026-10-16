import type { CSSProperties, ReactNode } from "react";
import { Check, Sparkles } from "lucide-react";
import { cn } from "@/lib/utils";
import { Avatar } from "@/components/ds/Avatar";

/**
 * A card in the letter's margin, beside the paragraph it belongs to (mocks
 * f1, f5): about 256px wide, white, hairline, soft floating shadow.
 *
 *   drafthr   "DraftHR suggests" with the black sparkle box; Accept / Reject
 *   reviewer  the reviewer's suggestion or comment, with their avatar; lilac rim
 *   comment   a teammate's comment; amber rim
 *
 * Give `onAccept` / `onReject` for the standard pair, or pass your own
 * `actions`. `count` is the "1 of 3" on the right of the actions. Use `top`
 * to place it absolutely beside its paragraph (the parent positions it).
 */
export type MarginCardKind = "drafthr" | "reviewer" | "comment";

export function MarginCard({
  kind,
  author,
  meta,
  children,
  actions,
  onAccept,
  onReject,
  acceptLabel = "Accept",
  rejectLabel = "Reject",
  count,
  active = false,
  top,
  connector = kind === "drafthr",
  className,
  style,
  id,
}: {
  kind: MarginCardKind;
  /** reviewer / comment: who wrote it. */
  author?: { name: string; seed?: string; initials?: string };
  /** Right of the header: "Compliance", "Suggestion 1", "10 min ago". */
  meta?: ReactNode;
  children: ReactNode;
  actions?: ReactNode;
  onAccept?: () => void;
  onReject?: () => void;
  acceptLabel?: string;
  rejectLabel?: string;
  count?: string;
  /** The card for the paragraph in focus: a slightly stronger rim. */
  active?: boolean;
  /** Absolute top offset in px, when the parent lays cards beside paragraphs. */
  top?: number;
  /** The dashed line pointing back at the paragraph. On for DraftHR cards. */
  connector?: boolean;
  className?: string;
  style?: CSSProperties;
  id?: string;
}) {
  const hasPair = onAccept || onReject;
  return (
    <article
      id={id}
      data-slot="margin-card"
      data-kind={kind}
      className={cn(
        "relative w-64 max-w-full rounded-[12px] border bg-[var(--ds-surface)] px-3.5 pt-3.5 pb-3 text-[13px] text-[var(--ds-body)] shadow-[var(--ds-shadow-m)]",
        kind === "reviewer" ? "border-[var(--ds-lilac-bd)]" : kind === "comment" ? "border-[var(--ds-amber-bd)]" : "border-[var(--ds-line)]",
        active && "border-[var(--ds-line-hover)]",
        top != null && "absolute",
        className
      )}
      style={top != null ? { top, ...style } : style}
    >
      {connector && (
        <span
          aria-hidden
          className="absolute top-[22px] -left-[21px] w-5 border-t border-dashed border-[var(--ds-amber-bd)]"
        />
      )}
      <header className="flex items-center gap-2 text-[13px] font-medium text-[var(--ds-ink)]">
        {kind === "drafthr" ? (
          <span aria-hidden className="grid size-[22px] shrink-0 place-items-center rounded-[6px] bg-[var(--ds-ink)] text-white">
            <Sparkles className="size-3" />
          </span>
        ) : author ? (
          <Avatar size="sm" name={author.name} seed={author.seed ?? author.name} initials={author.initials} />
        ) : null}
        <span className="min-w-0 truncate">{kind === "drafthr" ? "DraftHR suggests" : author?.name}</span>
        {meta && <span className="ml-auto shrink-0 text-[12px] font-normal text-[var(--ds-subtle)]">{meta}</span>}
      </header>
      <div className="mt-2 mb-3 leading-[1.45] text-[var(--ds-muted)] [&_b]:font-medium [&_b]:text-[var(--ds-ink)]">
        {children}
      </div>
      {(hasPair || actions || count) && (
        <div className="flex items-center gap-1.5">
          {onAccept && (
            <button
              type="button"
              onClick={onAccept}
              className="inline-flex h-7 items-center gap-1.5 rounded-[7px] bg-[var(--ds-accent)] px-2.5 text-[12.5px] font-medium text-[var(--ds-on-accent)] transition-colors duration-[120ms] hover:bg-[var(--ds-accent-hover)] active:bg-[var(--ds-accent-press)]"
            >
              <Check aria-hidden className="size-[13px]" strokeWidth={2.2} />
              {acceptLabel}
            </button>
          )}
          {onReject && (
            <button
              type="button"
              onClick={onReject}
              className="inline-flex h-7 items-center rounded-[7px] border border-[var(--ds-line)] bg-[var(--ds-surface)] px-2.5 text-[12.5px] font-medium text-[var(--ds-ink)] transition-colors duration-[120ms] hover:bg-[var(--ds-surface-2)] active:bg-[var(--ds-surface-3)]"
            >
              {rejectLabel}
            </button>
          )}
          {actions}
          {count && <span className="ml-auto text-[12.5px] text-[var(--ds-muted)]">{count}</span>}
        </div>
      )}
    </article>
  );
}
