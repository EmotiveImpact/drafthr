import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type RefObject } from "react";
import type { Comment, Draft } from "@/lib/letters/types";
import type { JourneyInfo } from "@/lib/journey/stage";
import { currentRound, type ReviewRequest } from "@/lib/journey/reviews";
import { ActivityCard, MarginCard, type ActivityEvent } from "@/components/journey/ui";
import { cn } from "@/lib/utils";
import { acceptWithSettle, blockWithText, decideEdit, openAnchoredComments, prefersReducedMotion, suggestedEdits, suggestionCategory, type SuggestedEdit } from "./suggestion-groups";
import { useLetterWorkspace } from "./workspace-store";
import type { MyPoint } from "@/components/journey/review/reviewer";
import type { Me } from "@/components/journey/review/actions";
import { TeammatePointCard, editTeammatePoint, removeTeammatePoint, suggestionNumbers } from "@/components/journey/review/teammate";

/**
 * The margin beside the page (mocks f1, f5, f6 to f8): a 256px column of
 * cards, each level with the paragraph it belongs to and stacked so they
 * never overlap. DraftHR suggestions (Accept / Reject, "1 of N"), a
 * reviewer's suggestions and comments (lilac), and from Approval on the
 * Activity card at the top.
 */

type Item =
  | { key: string; kind: "edit"; edit: SuggestedEdit; n: number; total: number; reviewerN?: number }
  | { key: string; kind: "comment"; comment: Comment; fromReviewer: boolean }
  | { key: string; kind: "point"; point: MyPoint; n?: number }
  | { key: string; kind: "activity" };

/** The named teammate reviewer's own view (V1): only their own points, each
 *  with Edit and Remove while the review is open (mock f4 `.rnote`). */
export type ReviewerMargin = { points: MyPoint[]; me: Me; canWork: boolean };

const GAP = 12;

/** Offset of an element from an ancestor, in the ancestor's pixels. Read
 *  from the rendered boxes, so it stays right when the page is zoomed (only
 *  the page scales; this layer does not). */
function offsetWithin(el: HTMLElement, ancestor: HTMLElement): number | null {
  if (!ancestor.contains(el)) return null;
  return el.getBoundingClientRect().top - ancestor.getBoundingClientRect().top;
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
  reviewer,
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
  /** Reply on a comment card; left out when the person can no longer reply
   *  (a teammate whose review was recalled or sent back). Gets the Reply
   *  button, so the thread opens beside its card and focus can go back to
   *  it when the thread closes. */
  onReplyComment?: (commentId: string, from: HTMLElement) => void;
  onResolveComment: (commentId: string) => void;
  onJumpToSection: (sectionId: string) => void;
  /** Left edge of the margin column in the wrapper (page width + 20). */
  left: number;
  /** Set for the named teammate reviewer: their own cards replace the rest. */
  reviewer?: ReviewerMargin | null;
}) {
  const fixCategory = useLetterWorkspace((s) => (s.draftId === draft.id ? s.fixCategory : null));
  const edits = useMemo(() => suggestedEdits(draft), [draft]);

  // Open comments from the reviewer's current round (Back to you), then
  // every other open comment pinned to words in the letter (the author's
  // own included, LETTER-X36). A reviewer's comments made while it is still
  // out reach the author with the round, not before.
  const { reviewComments, otherComments } = useMemo(() => {
    const roundIds = new Set(review && review.status === "back" ? currentRound(review)?.commentIds ?? [] : []);
    const fromRound = (draft.comments ?? []).filter((c) => roundIds.has(c.id) && !c.resolved && !c.parentId);
    const rName = review?.reviewer.name.trim().toLowerCase() ?? "";
    const rEmail = review?.reviewer.email?.trim().toLowerCase() ?? "";
    const byReviewer = (c: Comment) =>
      Boolean(review && review.status === "out") &&
      ((!!rName && c.authorName.trim().toLowerCase() === rName) || (!!rEmail && (c.authorEmail ?? "").trim().toLowerCase() === rEmail));
    const rest = openAnchoredComments(draft).filter((c) => !roundIds.has(c.id) && !byReviewer(c));
    return { reviewComments: fromRound as Comment[], otherComments: rest };
  }, [draft, review]);

  const items: Item[] = useMemo(() => {
    const out: Item[] = [];
    if (activity) out.push({ key: "activity", kind: "activity" });
    if (reviewer) {
      const numbers = suggestionNumbers(reviewer.points);
      for (const point of reviewer.points) out.push({ key: `p:${point.id}`, kind: "point", point, n: numbers.get(point.id) });
      return out;
    }
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
    for (const c of reviewComments) out.push({ key: `c:${c.id}`, kind: "comment", comment: c, fromReviewer: true });
    for (const c of otherComments) out.push({ key: `c:${c.id}`, kind: "comment", comment: c, fromReviewer: false });
    return out;
  }, [activity, edits, reviewComments, otherComments, reviewer]);

  const [leaving, setLeaving] = useState<Record<string, boolean>>({});
  // A card that has gone forgets that it was leaving, so nothing that comes
  // later under the same key starts out hidden (REVIEW-X28).
  useEffect(() => {
    setLeaving((l) => {
      const live = new Set(items.map((it) => it.key));
      const kept = Object.keys(l).filter((k) => live.has(k));
      return kept.length === Object.keys(l).length ? l : Object.fromEntries(kept.map((k) => [k, true]));
    });
  }, [items]);
  const [tops, setTops] = useState<Record<string, number>>({});
  const cardRefs = useRef(new Map<string, HTMLElement>());
  const [tick, setTick] = useState(0);

  const anchorTop = useCallback(
    (item: Item): number => {
      const wrap = wrapperRef.current;
      if (!wrap) return 0;
      if (item.kind === "activity") return journey.stage === "sent" ? 120 : 42;
      let el: HTMLElement | null = null;
      if (item.kind === "point") {
        const { point } = item;
        const sectionEl = wrap.querySelector<HTMLElement>(`[data-section-id="${CSS.escape(point.sectionId)}"]`);
        if (point.kind === "suggestion") {
          el = sectionEl?.querySelector<HTMLElement>('[data-suggestion-id][data-status="pending"]') ?? null;
        } else {
          el = wrap.querySelector<HTMLElement>(`mark[data-comment-id="${CSS.escape(point.id)}"]`);
          if (!el && sectionEl && point.quote) el = blockWithText(sectionEl, point.quote);
        }
        el = el?.closest<HTMLElement>("p, li, h1, h2, h3, blockquote") ?? el ?? sectionEl;
      } else if (item.kind === "edit") {
        const id = item.edit.ids[0];
        if (id) el = wrap.querySelector<HTMLElement>(`[data-suggestion-id="${CSS.escape(id)}"]`);
        el = el?.closest<HTMLElement>("p, li, h1, h2, h3, blockquote") ?? el;
        if (!el) el = wrap.querySelector<HTMLElement>(`[data-section-id="${CSS.escape(item.edit.section.id)}"]`);
      } else {
        // The comment's own passage: its highlight, else the quoted words.
        el = wrap.querySelector<HTMLElement>(`mark[data-comment-id="${CSS.escape(item.comment.id)}"]`);
        el = el?.closest<HTMLElement>("p, li, h1, h2, h3, blockquote") ?? el;
        const sectionEl = wrap.querySelector<HTMLElement>(`[data-section-id="${CSS.escape(item.comment.sectionId)}"]`);
        if (!el && sectionEl && item.comment.quote) el = blockWithText(sectionEl, item.comment.quote);
        if (!el) el = sectionEl;
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

  const categoryFor = (edit: SuggestedEdit): string => suggestionCategory(edit, fixCategory);

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
        if (it.kind === "point") {
          const { point } = it;
          return (
            <div
              key={it.key}
              {...common}
              data-point-id={point.id}
              data-leaving={leaving[it.key] || undefined}
              className="lw-margin-card pointer-events-auto absolute left-0 w-64"
              style={{ top }}
            >
              <TeammatePointCard
                point={point}
                n={it.n}
                me={reviewer!.me}
                canWork={reviewer!.canWork}
                onEdit={() => editTeammatePoint(draft.id, point)}
                onRemove={() => leave(it.key, () => removeTeammatePoint(draft.id, point))}
              />
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
                kind={it.fromReviewer ? "reviewer" : "comment"}
                author={{ name: c.authorName, seed: c.authorEmail || c.authorId || c.authorName }}
                meta="Comment"
                actions={
                  <>
                    {onReplyComment && (
                      <QuietAction onClick={(e) => onReplyComment(c.id, e.currentTarget)}>
                        Reply
                      </QuietAction>
                    )}
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

function QuietAction({
  onClick,
  children,
}: {
  onClick: (e: React.MouseEvent<HTMLButtonElement>) => void;
  children: React.ReactNode;
}) {
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
