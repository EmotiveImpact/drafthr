import { useCallback, useEffect, useLayoutEffect, useMemo, useState, type RefObject } from "react";
import { Pencil, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { MarginCard } from "@/components/journey/ui";
import { useDraftStore } from "@/lib/store";
import { uid, cn } from "@/lib/utils";
import { currentRound, firstName, useLatestReview, type ReviewRequest } from "@/lib/journey/reviews";
import type { Comment, Draft } from "@/lib/letters/types";
import { collectReviewerWork } from "./model";
import { SelectionBubble, changeKind, suggestionTitle, useLetterSelection, type MyPoint } from "./reviewer";
import { CommentComposer, SuggestComposer } from "./Composers";
import { useReviewUI, useReviewerMode, openTeammateComposer } from "./review-ui";
import type { Me } from "./actions";

/**
 * The named teammate reviewer's own points on the letter, in the app (V1,
 * mock f4): what they suggested and commented this round, their margin
 * cards with Edit and Remove, the amber highlight and bar on the words they
 * commented on, and the suggestion and comment boxes. The page, the margin,
 * Your review and the phone layout all read the same points.
 */

/** The reviewer's points this round, in the order of the letter. */
export function useTeammatePoints(draft: Draft | undefined, review: ReviewRequest | null | undefined): MyPoint[] {
  const round = review ? currentRound(review) : undefined;
  return useMemo(() => {
    if (!draft || !review || !round) return [];
    const work = collectReviewerWork(draft, review.reviewer, round.sentAt);
    const order = new Map(draft.sections.map((s, i) => [s.id, i]));
    const points = work.points.map((p): MyPoint => {
      const section = draft.sections.find((s) => s.id === p.sectionId);
      if (p.kind === "suggestion") {
        const pc = section?.pendingChange;
        const before = pc?.prevHtml ?? section?.html ?? "";
        const after = pc?.proposedHtml ?? "";
        return {
          id: p.id,
          kind: "suggestion",
          sectionId: p.sectionId ?? "",
          title: p.title,
          where: section?.title ?? "Letter",
          change: changeKind(before, after),
          note: pc?.instruction,
          proposedHtml: after,
        };
      }
      const c = draft.comments?.find((x) => x.id === p.id);
      return {
        id: p.id,
        kind: "comment",
        sectionId: p.sectionId ?? "",
        title: p.title,
        where: section?.title ?? "Letter",
        change: "comment",
        note: c?.body,
        quote: c?.quote,
      };
    });
    return points.sort((a, b) => (order.get(a.sectionId) ?? 999) - (order.get(b.sectionId) ?? 999));
  }, [draft, review, round]);
}

/* ------------------------------------------------------------------ */
/*  Writing, editing and removing a point                              */
/* ------------------------------------------------------------------ */

function authorOf(me: Me) {
  return { authorId: me.email || me.name, authorName: me.name };
}

/** Propose new wording for a section (or replace the reviewer's own
 *  suggestion there). Returns false when the section already holds someone
 *  else's pending change. */
export function proposeTeammateSuggestion(
  draftId: string,
  sectionId: string,
  proposedHtml: string,
  note: string | undefined,
  editId: string | undefined,
  me: Me,
  askerFirst: string
): boolean {
  const ds = useDraftStore.getState();
  const s = ds.drafts[draftId]?.sections.find((x) => x.id === sectionId);
  if (!s) return false;
  if (s.pendingChange && s.pendingChange.id !== editId) {
    toast.error("This section already has a pending suggestion. Resolve it first.");
    return false;
  }
  const before = s.pendingChange?.prevHtml ?? s.html ?? "";
  if (editId) ds.rejectSectionPending(draftId, sectionId);
  ds.proposeSectionChange(draftId, sectionId, {
    id: uid("sug"),
    createdAt: Date.now(),
    proposedHtml,
    instruction: note?.trim() || suggestionTitle(before, proposedHtml),
    source: "review",
    ...authorOf(me),
    diffViewMode: "inline",
  });
  toast(editId ? "Suggestion updated." : `Suggestion added. ${askerFirst} accepts or rejects it.`);
  return true;
}

/** Comment on a section (or replace the reviewer's own comment). */
export function addTeammateComment(draftId: string, sectionId: string, body: string, quote: string | undefined, editId: string | undefined, me: Me): void {
  const ds = useDraftStore.getState();
  if (editId) ds.deleteComment(draftId, editId);
  ds.addComment(draftId, {
    sectionId,
    ...authorOf(me),
    authorEmail: me.email,
    authorUserId: me.userId,
    body,
    quote,
  });
}

/** Take back one of the reviewer's own points before sending it back. */
export function removeTeammatePoint(draftId: string, p: Pick<MyPoint, "id" | "kind" | "sectionId">): void {
  const ds = useDraftStore.getState();
  if (p.kind === "suggestion") ds.rejectSectionPending(draftId, p.sectionId);
  else ds.deleteComment(draftId, p.id);
}

/** Open the right box to edit one of the reviewer's points. */
export function editTeammatePoint(draftId: string, p: MyPoint): void {
  if (p.kind === "suggestion") openTeammateComposer({ draftId, kind: "suggest", sectionId: p.sectionId, editId: p.id });
  else openTeammateComposer({ draftId, kind: "comment", sectionId: p.sectionId, quote: p.quote, editId: p.id, body: p.note });
}

/* ------------------------------------------------------------------ */
/*  The boxes (rendered once, by ReviewDialogsHost)                    */
/* ------------------------------------------------------------------ */

export function TeammateComposerHost({ me }: { me: Me }) {
  const composer = useReviewUI((s) => s.teammateComposer);
  const draft = useDraftStore((s) => (composer ? s.drafts[composer.draftId] : undefined));
  const latest = useLatestReview(composer?.draftId);
  const review = latest?.status === "out" ? latest : null;
  const close = useCallback(() => useReviewUI.getState().set({ teammateComposer: null }), []);
  // Nothing to write on once the review is closed (sent back or recalled).
  useEffect(() => {
    if (composer && (!draft || !review)) close();
  }, [composer, draft, review, close]);
  if (!composer || !draft || !review) return null;
  const section = draft.sections.find((s) => s.id === composer.sectionId);
  if (!section) return null;
  const askerFirst = firstName(review.asker?.name ?? "") || "They";
  if (composer.kind === "suggest") {
    const editing = composer.editId ? section.pendingChange : undefined;
    return (
      <SuggestComposer
        open
        onOpenChange={(o) => !o && close()}
        sectionTitle={section.title}
        html={editing?.proposedHtml ?? section.html ?? ""}
        quote={composer.quote}
        initialNote={
          editing && editing.instruction !== suggestionTitle(editing.prevHtml ?? "", editing.proposedHtml) ? editing.instruction : undefined
        }
        onSubmit={(html, note) => proposeTeammateSuggestion(draft.id, section.id, html, note, composer.editId, me, askerFirst)}
      />
    );
  }
  return (
    <CommentComposer
      open
      onOpenChange={(o) => !o && close()}
      sectionTitle={section.title}
      quote={composer.quote}
      initialBody={composer.body}
      onSubmit={(body) => addTeammateComment(draft.id, section.id, body, composer.quote, composer.editId, me)}
    />
  );
}

/** Selecting words in the letter offers "Suggest a change" or "Comment",
 *  by mode (Read offers nothing). Mounted by the letter screen, so it works
 *  whichever side panel tab is open. */
export function TeammateSelection({ draftId, enabled, paperRef }: { draftId: string; enabled: boolean; paperRef: RefObject<HTMLElement | null> }) {
  const [mode] = useReviewerMode(draftId);
  const root = useCallback(() => paperRef.current, [paperRef]);
  const anchor = useLetterSelection(enabled && mode !== "read", root);
  if (!enabled) return null;
  return (
    <SelectionBubble
      anchor={anchor}
      mode={mode}
      onSuggest={(a) => openTeammateComposer({ draftId, kind: "suggest", sectionId: a.sectionId, quote: a.quote })}
      onComment={(a) => openTeammateComposer({ draftId, kind: "comment", sectionId: a.sectionId, quote: a.quote })}
    />
  );
}

/* ------------------------------------------------------------------ */
/*  A point's card (margin and phone)                                  */
/* ------------------------------------------------------------------ */

export function TeammatePointCard({
  point,
  n,
  me,
  canWork,
  onEdit,
  onRemove,
  className,
}: {
  point: MyPoint;
  /** "Suggestion 2": the suggestion's number among the reviewer's own. */
  n?: number;
  me: Me;
  canWork: boolean;
  onEdit: () => void;
  onRemove: () => void;
  className?: string;
}) {
  return (
    <MarginCard
      kind={point.kind === "suggestion" ? "reviewer" : "comment"}
      author={{ name: me.name, seed: me.email || me.name }}
      meta={point.kind === "suggestion" ? (n ? `Suggestion ${n}` : "Suggestion") : "Comment"}
      className={cn("w-full max-w-full", className)}
      actions={
        canWork ? (
          <div className="-ml-2 flex gap-1">
            <button
              type="button"
              onClick={onEdit}
              aria-label={`Edit: ${point.title}`}
              className="inline-flex h-7 items-center gap-1 rounded-[7px] px-2 text-[12.5px] text-[var(--ds-muted)] transition-colors duration-[120ms] hover:bg-[var(--ds-hover)] hover:text-[var(--ds-ink)] focus-visible:outline-none focus-visible:shadow-[var(--ds-focus-ring)]"
            >
              <Pencil className="size-3" aria-hidden />
              Edit
            </button>
            <button
              type="button"
              onClick={onRemove}
              aria-label={`Remove: ${point.title}`}
              className="inline-flex h-7 items-center gap-1 rounded-[7px] px-2 text-[12.5px] text-[var(--ds-muted)] transition-colors duration-[120ms] hover:bg-[var(--ds-hover)] hover:text-[var(--ds-ink)] focus-visible:outline-none focus-visible:shadow-[var(--ds-focus-ring)]"
            >
              <Trash2 className="size-3" aria-hidden />
              Remove
            </button>
          </div>
        ) : undefined
      }
    >
      {point.kind === "suggestion" ? point.note || point.title : point.note}
    </MarginCard>
  );
}

/** Numbers for the reviewer's suggestions ("Suggestion 1", "Suggestion 2"). */
export function suggestionNumbers(points: MyPoint[]): Map<string, number> {
  const out = new Map<string, number>();
  let n = 0;
  for (const p of points) if (p.kind === "suggestion") out.set(p.id, ++n);
  return out;
}

/* ------------------------------------------------------------------ */
/*  Commented words: amber highlight and an amber bar                  */
/* ------------------------------------------------------------------ */

type HighlightRegistry = { set: (name: string, h: unknown) => void; delete: (name: string) => void };
type HighlightCtor = new (...ranges: Range[]) => unknown;

const BLOCKS = "p, li, h1, h2, h3, blockquote";

/** The range of `quote` inside `root`, across text runs (bold, links). */
function rangeOf(root: HTMLElement, quote: string): Range | null {
  const needle = quote.replace(/\s+/g, " ").trim();
  if (!needle) return null;
  const nodes: Text[] = [];
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  let n: Node | null;
  while ((n = walker.nextNode())) {
    // Words a suggestion takes out are not the words that were commented on.
    if ((n.parentElement as HTMLElement | null)?.closest("del")) continue;
    nodes.push(n as Text);
  }
  // One flat string with whitespace folded, and where each character came from.
  let flat = "";
  const from: { node: Text; i: number }[] = [];
  for (const t of nodes) {
    const s = t.data;
    for (let i = 0; i < s.length; i++) {
      const ch = /\s/.test(s[i]) ? " " : s[i];
      if (ch === " " && flat.endsWith(" ")) continue;
      flat += ch;
      from.push({ node: t, i });
    }
  }
  const at = flat.indexOf(needle);
  if (at < 0) return null;
  const start = from[at];
  const end = from[at + needle.length - 1];
  const r = document.createRange();
  r.setStart(start.node, start.i);
  r.setEnd(end.node, end.i + 1);
  return r;
}

type Bar = { key: string; top: number; height: number; left: number };

/**
 * Paints the commented words of `comments` in amber (the CSS Custom
 * Highlight API, so the editor's own DOM is never touched; a comment saved
 * with its own highlight mark keeps it) and draws a 2px amber bar in the
 * left margin beside each commented paragraph, unless a suggestion's lilac
 * bar is already there. Lives inside the wrapper that holds the page.
 */
export function CommentQuoteMarks({
  comments,
  paperRef,
  wrapperRef,
  version,
}: {
  comments: Comment[];
  paperRef: RefObject<HTMLElement | null>;
  wrapperRef: RefObject<HTMLDivElement | null>;
  /** Changes when the letter's words change (draft.updatedAt). */
  version: unknown;
}) {
  const [bars, setBars] = useState<Bar[]>([]);
  const [tick, setTick] = useState(0);

  useLayoutEffect(() => {
    const css = (globalThis as unknown as { CSS?: { highlights?: HighlightRegistry } }).CSS;
    const Ctor = (globalThis as unknown as { Highlight?: HighlightCtor }).Highlight;
    const paper = paperRef.current;
    const wrap = wrapperRef.current;
    if (!paper || !wrap) return;
    const ranges: Range[] = [];
    const blocks: { key: string; el: HTMLElement }[] = [];
    for (const c of comments) {
      const mark = paper.querySelector<HTMLElement>(`mark[data-comment-id="${CSS.escape(c.id)}"]`);
      let block: HTMLElement | null = mark?.closest<HTMLElement>(BLOCKS) ?? null;
      if (!mark && c.quote) {
        const sectionEl = paper.querySelector<HTMLElement>(`[data-section-id="${CSS.escape(c.sectionId)}"]`);
        const r = sectionEl ? rangeOf(sectionEl, c.quote) : null;
        if (r) {
          ranges.push(r);
          const startEl = r.startContainer.parentElement;
          block = startEl?.closest<HTMLElement>(BLOCKS) ?? null;
        }
      }
      if (block && !blocks.some((b) => b.el === block)) blocks.push({ key: c.id, el: block });
    }
    if (css?.highlights && Ctor) {
      if (ranges.length) css.highlights.set("lw-cmt", new Ctor(...ranges));
      else css.highlights.delete("lw-cmt");
    }
    const w = wrap.getBoundingClientRect();
    const next: Bar[] = blocks
      // A suggestion's lilac bar already marks that paragraph.
      .filter(({ el }) => !el.querySelector('[data-suggestion-id][data-status="pending"]'))
      .map(({ key, el }) => {
        const r = el.getBoundingClientRect();
        return { key, top: r.top - w.top + 3, height: Math.max(8, r.height - 6), left: r.left - w.left - 22 };
      });
    setBars((prev) =>
      prev.length === next.length && prev.every((b, i) => b.key === next[i].key && Math.abs(b.top - next[i].top) < 1 && Math.abs(b.left - next[i].left) < 1 && Math.abs(b.height - next[i].height) < 1)
        ? prev
        : next
    );
    return () => {
      css?.highlights?.delete("lw-cmt");
    };
  }, [comments, paperRef, wrapperRef, version, tick]);

  // Follow the page as it reflows (fonts, zoom, the window).
  useEffect(() => {
    const wrap = wrapperRef.current;
    if (!wrap || typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(() => setTick((t) => t + 1));
    ro.observe(wrap);
    return () => ro.disconnect();
  }, [wrapperRef]);

  return (
    <>
      {bars.map((b) => (
        <span
          key={b.key}
          aria-hidden
          data-slot="comment-bar"
          className="pointer-events-none absolute w-[2px] rounded-[2px] bg-[var(--ds-amber-dot)]"
          style={{ top: b.top, height: b.height, left: b.left }}
        />
      ))}
    </>
  );
}
