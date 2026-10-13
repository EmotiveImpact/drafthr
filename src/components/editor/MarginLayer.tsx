import { useCallback, useLayoutEffect, useMemo, useRef, useState, type RefObject } from "react";
import type { Comment, Draft } from "@/lib/letters/types";
import type { JourneyInfo } from "@/lib/journey/stage";
import { currentRound, type ReviewRequest } from "@/lib/journey/reviews";
import { ActivityCard, MarginCard, type ActivityEvent } from "@/components/journey/ui";
import { cn } from "@/lib/utils";
import { acceptWithSettle, decideEdit, prefersReducedMotion, suggestedEdits, type SuggestedEdit } from "./suggestion-groups";
import { useLetterWorkspace } from "./workspace-store";

/**
 * The margin beside the page (mocks f1, f5, f6 to f8): a 256px column of
 * cards, each level with the paragraph it belongs to and stacked so they
 * never overlap. DraftHR suggestions (Accept / Reject, "1 of N"), a
 * reviewer's suggestions and comments (lilac), and from Approval on the
 * Activity card at the top.
 */

const SOURCE_CATEGORY: Record<string, string> = {
  tighten: "Clarity",
  addClause: "Compliance",
  regenerate: "Rewrite",
  chat: "Rewrite",
};

type Item =
  | { key: string; kind: "edit"; edit: SuggestedEdit; n: number; total: number; reviewerN?: number }
  | { key: string; kind: "comment"; comment: Comment }
  | { key: string; kind: "activity" };

const GAP = 12;

/** Offset of an element from an ancestor, in the ancestor's own CSS pixels. */
function offsetWithin(el: HTMLElement, ancestor: HTMLElement): number | null {
  let top = 0;
  let cur: HTMLElement | null = el;
  while (cur && cur !== ancestor) {
    top += cur.offsetTop;
    const parent = cur.offsetParent as HTMLElement | null;
    if (!parent) return null;
    if (parent !== ancestor && !ancestor.contains(parent)) return null;
    cur = parent;
  }
  return cur === ancestor ? top : null;
}

export function MarginLayer({
  draft,
  journey,
  review,
  wrapperRef,
  canResolve,
  activity,
  onAllVersions,
  onReplyComment,
  onResolveComment,
  onJumpToSection,
  left,
}: {
  draft: Draft;
  journey: JourneyInfo;
  review: ReviewRequest | null;
  /** The positioned box holding the page and this layer (same coordinates). */
  wrapperRef: RefObject<HTMLDivElement | null>;
  /** Accept and Reject show only when the person can edit. */
  canResolve: boolean;
  activity: ActivityEvent[] | null;
  onAllVersions: () => void;
  onReplyComment: (commentId: string) => void;
  onResolveComment: (commentId: string) => void;
  onJumpToSection: (sectionId: string) => void;
  /** Left edge of the margin column in the wrapper (page width + 20). */
  left: number;
}) {
  const fixCategory = useLetterWorkspace((s) => (s.draftId === draft.id ? s.fixCategory : null));
  const edits = useMemo(() => suggestedEdits(draft), [draft]);

  // Open comments from the reviewer's current round (Back to you).
  const reviewComments = useMemo(() => {
    if (!review || review.status !== "back") return [] as Comment[];
    const ids = new Set(currentRound(review)?.commentIds ?? []);
    return (draft.comments ?? []).filter((c) => ids.has(c.id) && !c.resolved && !c.parentId);
  }, [draft.comments, review]);

  const items: Item[] = useMemo(() => {
    const out: Item[] = [];
    if (activity) out.push({ key: "activity", kind: "activity" });
    let reviewerN = 0;
    edits.forEach((edit, i) => {
      out.push({
        key: edit.key,
        kind: "edit",
        edit,
        n: i + 1,
        total: edits.length,
        reviewerN: edit.ai ? undefined : ++reviewerN,
      });
    });
    for (const c of reviewComments) out.push({ key: `c:${c.id}`, kind: "comment", comment: c });
    return out;
  }, [activity, edits, reviewComments]);

  const [leaving, setLeaving] = useState<Record<string, boolean>>({});
  const [tops, setTops] = useState<Record<string, number>>({});
  const cardRefs = useRef(new Map<string, HTMLElement>());
  const [tick, setTick] = useState(0);

  const anchorTop = useCallback(
    (item: Item): number => {
      const wrap = wrapperRef.current;
      if (!wrap) return 0;
      if (item.kind === "activity") return journey.stage === "sent" ? 120 : 42;
      let el: HTMLElement | null = null;
      if (item.kind === "edit") {
        const id = item.edit.ids[0];
        if (id) el = wrap.querySelector<HTMLElement>(`[data-suggestion-id="${CSS.escape(id)}"]`);
        el = el?.closest<HTMLElement>("p, li, h1, h2, h3, blockquote") ?? el;
        if (!el) el = wrap.querySelector<HTMLElement>(`[data-section-id="${CSS.escape(item.edit.section.id)}"]`);
      } else {
        el = wrap.querySelector<HTMLElement>(`mark[data-comment-id="${CSS.escape(item.comment.id)}"]`);
        el = el?.closest<HTMLElement>("p, li, h1, h2, h3, blockquote") ?? el;
        if (!el) el = wrap.querySelector<HTMLElement>(`[data-section-id="${CSS.escape(item.comment.sectionId)}"]`);
      }
      if (!el) return 0;
      const t = offsetWithin(el, wrap);
      return t == null ? 0 : Math.max(0, t - 14);
    },
    [wrapperRef, journey.stage]
  );

  // Lay the cards out: each at its paragraph, pushed down past the one above.
  useLayoutEffect(() => {
    const desired = items.map((it) => ({ it, top: anchorTop(it) }));
    // Activity first, then the rest in document order.
    desired.sort((a, b) => (a.it.kind === "activity" ? -1 : b.it.kind === "activity" ? 1 : a.top - b.top));
    const next: Record<string, number> = {};
    let bottom = -Infinity;
    for (const { it, top } of desired) {
      const h = cardRefs.current.get(it.key)?.offsetHeight ?? 150;
      const t = Math.max(top, bottom + GAP);
      next[it.key] = t;
      bottom = t + h;
    }
    setTops((prev) => {
      const same = Object.keys(next).length === Object.keys(prev).length && Object.keys(next).every((k) => prev[k] === next[k]);
      return same ? prev : next;
    });
  }, [items, anchorTop, tick, draft]);

  // Re-measure when the page reflows (fonts load, the window resizes, zoom).
  useLayoutEffect(() => {
    const wrap = wrapperRef.current;
    if (!wrap || typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(() => setTick((n) => n + 1));
    ro.observe(wrap);
    cardRefs.current.forEach((el) => ro.observe(el));
    return () => ro.disconnect();
  }, [wrapperRef, items]);

  const leave = (key: string, then: () => void) => {
    if (prefersReducedMotion()) {
      then();
      return;
    }
    setLeaving((l) => ({ ...l, [key]: true }));
    window.setTimeout(then, 220);
  };

  const categoryFor = (edit: SuggestedEdit): string => {
    const fc = fixCategory?.[edit.section.id];
    if (fc && edit.pending && fc.at <= edit.pending.createdAt) return fc.category;
    return SOURCE_CATEGORY[edit.pending?.source ?? ""] ?? "Rewrite";
  };

  return (
    <div
      data-slot="margin-layer"
      aria-label="Margin notes"
      className="pointer-events-none absolute top-0 w-64"
      style={{ left }}
    >
      {items.map((it) => {
        const top = tops[it.key] ?? anchorTop(it);
        const common = {
          ref: (el: HTMLElement | null) => {
            if (el) cardRefs.current.set(it.key, el);
            else cardRefs.current.delete(it.key);
          },
        };
        if (it.kind === "activity") {
          return (
            <div key={it.key} {...common} className="lw-margin-card pointer-events-auto absolute left-0" style={{ top }}>
              <ActivityCard events={activity ?? []} onAllVersions={onAllVersions} />
            </div>
          );
        }
        if (it.kind === "comment") {
          const c = it.comment;
          return (
            <div
              key={it.key}
              {...common}
              data-leaving={leaving[it.key] || undefined}
              className="lw-margin-card pointer-events-auto absolute left-0"
              style={{ top }}
            >
              <MarginCard
                kind="reviewer"
                author={{ name: c.authorName, seed: c.authorEmail || c.authorId || c.authorName }}
                meta="Comment"
                actions={
                  <>
                    <QuietAction onClick={() => onReplyComment(c.id)}>Reply</QuietAction>
                    {canResolve && (
                      <QuietAction onClick={() => leave(it.key, () => onResolveComment(c.id))}>Resolve</QuietAction>
                    )}
                  </>
                }
              >
                {c.body}
              </MarginCard>
            </div>
          );
        }
        const { edit } = it;
        const accept = () =>
          leave(it.key, () => {
            acceptWithSettle(draft.id, edit);
          });
        const reject = () => leave(it.key, () => decideEdit(draft.id, edit, false));
        return (
          <div
            key={it.key}
            {...common}
            data-leaving={leaving[it.key] || undefined}
            className="lw-margin-card pointer-events-auto absolute left-0"
            style={{ top }}
            onClick={(e) => {
              if ((e.target as HTMLElement).closest("button")) return;
              onJumpToSection(edit.section.id);
            }}
          >
            {edit.ai ? (
              <MarginCard
                kind="drafthr"
                meta={categoryFor(edit)}
                onAccept={canResolve ? accept : undefined}
                onReject={canResolve ? reject : undefined}
                count={`${it.n} of ${it.total}`}
              >
                {edit.note ?? "A clearer way to say this paragraph."}
              </MarginCard>
            ) : (
              <MarginCard
                kind="reviewer"
                connector
                author={{ name: edit.author || "Reviewer", seed: edit.authorId || edit.author }}
                meta={`Suggestion ${it.reviewerN ?? it.n}`}
                onAccept={canResolve ? accept : undefined}
                onReject={canResolve ? reject : undefined}
                count={`${it.n} of ${it.total}`}
                className={cn("[&>span[aria-hidden]:first-child]:border-[var(--ds-lilac-bd)]")}
              >
                {edit.note ?? "A suggested change to this paragraph."}
              </MarginCard>
            )}
          </div>
        );
      })}
    </div>
  );
}

function QuietAction({ onClick, children }: { onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="inline-flex h-[26px] items-center rounded-[7px] border border-[var(--ds-line)] bg-[var(--ds-surface)] px-2.5 text-[12.5px] font-medium text-[var(--ds-ink)] transition-colors duration-[120ms] hover:bg-[var(--ds-hover)] active:bg-[var(--ds-surface-3)] focus-visible:outline-none focus-visible:shadow-[var(--ds-focus-ring)]"
    >
      {children}
    </button>
  );
}
