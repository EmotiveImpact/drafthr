import { useEffect, useMemo, useRef, useState, type MutableRefObject } from "react";
import { toast } from "sonner";
import {
  LetterEditor,
  type EditorFeatures,
  type EditorHandle,
  type LetterEditorChange,
} from "pagedly";
import "pagedly/styles.css";

import type { Draft } from "@/lib/letters/types";
import { countDraftWords } from "@/lib/letters/wordCount";
import { useDraftStore } from "@/lib/store";
import { toLetterDraft } from "@/lib/letters/toLetterDraft";
import type { PagedEditorActions } from "./types";
import { handlePagedImagePaste } from "@/lib/storage/paged-paste";

/**
 * Edit-on-page engine, backed by the vendored **pagedly** library. This is the
 * sole on-page editor (the home-grown paged.js engine it replaced has been
 * removed). It exposes the small `{ draft, readOnly?, onDone?, actionsRef? }`
 * contract (see ./types `PagedEditorActions`) so LetterPreview and the editor's
 * File/Edit/Tools menubar drive it directly. Toggling the "Page" view mounts THIS.
 *
 * SOURCE OF TRUTH stays the app store: user edits flow back per-section through
 * updateSection. The draft is mapped to pagedly's LetterDraft once per editor
 * mount; safe external Section/AI changes trigger a guarded remount with scroll
 * restoration. persist() writes ONLY sections the user actually changed on the
 * page and NEVER clobbers content that moved underneath it:
 *
 *   - baseline guard: a section whose STORE copy changed since we mounted (or
 *     since our last write) was edited elsewhere → the external edit wins, skip.
 *   - streaming guard: never fight an in-flight AI stream on a section.
 *   - app-marks guard: pagedly's sanitiser cannot round-trip the app's inline
 *     markup — comment anchors (<mark data-comment-id>), figure refs
 *     (data-fig-id) and suggestion diffs (data-suggestion-*). Editing such a
 *     section here would silently strip them, so we refuse to persist it and
 *     point the user at the Sections view (which owns comments/suggestions).
 *   - blank-artifact guard: pagedly can momentarily emit "" for a section during
 *     reflow; never blank non-empty stored content.
 *
 * (These guards replaced a naive "write every diverged section" loop that caused
 * cross-section data loss — see BUGS_AND_FIXES 2026-07-02.)
 *
 * comments + inline-AI are OFF: pagedly stores comment spans inside section HTML
 * (comments are app-owned), and the AI adapter is a separate follow-up.
 */
const FEATURES: EditorFeatures = {
  // — Inline text formatting a letter actually uses —
  bold: true,
  italic: true,
  underline: true,
  removeFormat: true,
  // — Block structure —
  headings: true,
  bulletList: true,
  numberedList: true,
  alignment: true,
  link: true,
  // — Quality-of-life behaviours (little/no toolbar footprint) —
  find: true,
  paste: true,
  // Pagedly's toolbar subscribes before its imperative editor ref is ready,
  // so existing content can display as "0 words" until the first keystroke.
  // The app renders the store-backed count below instead.
  wordCount: false,
  markdownShortcuts: true,
  smartTypography: true,
  autoLink: true,
  slashMenu: true,
  commandPalette: true,
  hyphenation: true,
  widowControl: true,
  // — Off: not appropriate for a fixed-format HR letter —
  strikethrough: false,
  superscript: false,
  subscript: false,
  inlineCode: false,
  fontColor: false,
  highlight: false,
  fontFamily: false,
  fontSize: false,
  blockquote: false,
  codeBlock: false,
  indent: false,
  lineSpacing: false,
  footnotes: "off",
  checklist: false,
  image: false,
  table: false,
  horizontalRule: false,
  pageBreak: false,
  outline: false,
  toc: false,
  sections: false,
  columns: false,
  leaders: false,
  // — Off: duplicate paths / app-owned —
  print: false,
  downloadPdf: false,
  exportDocx: false,
  importDocx: false,
  exportMarkdown: false,
  importMarkdown: false,
  trackChanges: false, // app owns the suggestion/diff review surface
  comments: false, // app-owned (spans would pollute stored section HTML)
  ai: false, // inline-AI adapter is a separate follow-up
};

/** App inline markup pagedly's sanitiser cannot round-trip. A section carrying
 *  any of these must be edited in the Sections view, not on the page. */
export function hasAppMarks(html: string): boolean {
  return /data-comment-id|data-fig-id|data-suggestion-id|<mark[\s>/]/i.test(html);
}

export { countDraftWords };

export function hasExternalSectionChanges(
  sections: Draft["sections"],
  baseline: Record<string, string>,
): boolean {
  return Object.keys(baseline).some((id) => !sections.some((section) => section.id === id)) || sections.some(
    (section) =>
      section.status !== "streaming" && baseline[section.id] !== section.html,
  );
}

/** Pure decision for whether a pagedly-emitted section edit is safe to write
 *  back to the store. Extracted + exported so the guard rules are unit-tested
 *  (they are the fix for the cross-section data-loss regression). Returns one of
 *  "write" | a skip-reason. "marked" is surfaced to the user (edit in Sections). */
export type SectionWriteDecision = "write" | "noop" | "streaming" | "external" | "marked" | "blank";
export function decideSectionWrite(args: {
  incomingHtml: string;
  currentHtml: string;
  currentStatus?: string;
  baselineHtml: string | undefined;
  /** Review mode: pagedly OWNS the comment/track-change marks on the page, so a
   *  marked section is exactly what we want to persist — don't refuse it. */
  allowMarks?: boolean;
}): SectionWriteDecision {
  const { incomingHtml, currentHtml, currentStatus, baselineHtml, allowMarks } = args;
  if (currentHtml === incomingHtml) return "noop";
  if (currentStatus === "streaming") return "streaming";
  // External change since our last write (AI / other tab / Accept-all) → store wins.
  if ((baselineHtml ?? currentHtml) !== currentHtml) return "external";
  if (!allowMarks && hasAppMarks(currentHtml)) return "marked";
  if (incomingHtml === "" && currentHtml.trim() !== "") return "blank";
  return "write";
}

export function PagedlyDocEditor({
  draft,
  readOnly,
  actionsRef,
  reviewMode = false,
  suggesting = false,
  onCommentAdd,
  onCommentClick,
}: {
  draft: Draft;
  /** Render non-editable (e.g. while a draft is locked for review). Pagination
   *  + selection still work; the content just can't be changed. */
  readOnly?: boolean;
  /** Present for contract parity with the old PagedEditor; pagedly has no
   *  in-surface "done" affordance — the parent toggle owns exit. */
  onDone?: () => void;
  actionsRef?: MutableRefObject<PagedEditorActions | null>;
  /** Review surface: turn on pagedly's native comments + track-changes so the
   *  collaboration happens ON the page. Marks are then intended, so persist
   *  writes them back (allowMarks) instead of refusing marked sections. */
  reviewMode?: boolean;
  /** Track-changes recording — reviewer edits become <ins>/<del> instead of
   *  overwriting. Only meaningful with reviewMode. */
  suggesting?: boolean;
  /** Pagedly wrapped a selection in a comment highlight (id + quoted text). */
  onCommentAdd?: (commentId: string, quotedText: string) => void;
  /** An existing comment highlight was clicked. */
  onCommentClick?: (commentId: string) => void;
}) {
  const updateSection = useDraftStore((s) => s.updateSection);
  const editorRef = useRef<EditorHandle | null>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const draftId = draft.id;
  const activeDraftIdRef = useRef(draftId);
  activeDraftIdRef.current = draftId;
  // Ignore delayed emissions from an editor replaced by an external refresh.
  const editorEpochRef = useRef(0);
  const editorEpoch = editorEpochRef.current;
  const mountedRef = useRef(true);
  const readOnlyRef = useRef(readOnly);
  readOnlyRef.current = readOnly;

  // LIVE REFRESH — pagedly maps the draft once at mount, so store
  // changes made OUTSIDE pagedly (a suggestion staged from the rail, an
  // accept/reject folding a redline in) wouldn't paint until a reload. In
  // both Page and Review modes detect those external writes (section html differing from
  // our baseline, which pagedly's own persist advances first) and remount the
  // editor with a fresh mapping, restoring the scroll position.
  const [mountVersion, setMountVersion] = useState(0);
  const savedScrollRef = useRef<number | null>(null);

  // Map once per draft (or per detected external change in review mode) —
  // re-mapping on every store change would fight pagedly's internal live copy
  // and clobber in-progress edits.
  const mapped = useMemo(
    () => toLetterDraft(useDraftStore.getState().drafts[draftId] ?? draft),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [draftId, mountVersion],
  );

  // Baseline of each section's stored HTML, captured at mount and advanced after
  // each successful write. Lets persist tell "the user edited this on the page"
  // apart from "the store moved ahead underneath us" (AI stream, another tab,
  // Accept-all): in the latter case the external change wins and we skip.
  const baselineRef = useRef<Record<string, string>>({});
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useMemo(() => {
    const d = useDraftStore.getState().drafts[draftId];
    baselineRef.current = Object.fromEntries((d?.sections ?? []).map((s) => [s.id, s.html]));
  }, [draftId]);

  const markedToastShown = useRef(false);

  // Completion is a state transition, not necessarily a text change: the last
  // streamed HTML can be identical to the final saved HTML. Include status and
  // structure so a completed stream, added section, or deletion refreshes Page.
  // Pagedly's own writes advance baselineRef before this effect runs.
  const sectionsSig = useDraftStore((s) => {
    const d = s.drafts[draftId];
    return d ? JSON.stringify(d.sections.map((x) => [x.id, x.status, x.html])) : "";
  });
  const refreshingRef = useRef(false);
  useEffect(() => {
    if (refreshingRef.current) return;
    const d = useDraftStore.getState().drafts[draftId];
    if (!d) return;
    // A streaming section's html churns token-by-token — never remount for
    // those (and a stale stuck "streaming" flag must not veto refreshes for
    // the whole draft, so the check is per-section, not draft-wide).
    const changed = hasExternalSectionChanges(d.sections, baselineRef.current);
    if (!changed) return;
    // FLUSH FIRST, then advance baselines. The outgoing pagedly instance may
    // hold a debounced user edit; flushing it now makes that write land
    // against the OLD baselines, where the "external change wins -> skip"
    // guard applies to the changed sections. If we advanced baselines first,
    // the stale flush would look like a fresh page edit and overwrite the
    // just-staged / just-accepted html (data loss).
    refreshingRef.current = true;
    const editor = editorRef.current;
    void (async () => {
      try {
        await Promise.race([
          editor?.flush(),
          new Promise((resolve) => setTimeout(resolve, 500)),
        ]);
      } catch {
        /* a failed flush must not block the refresh */
      }
      refreshingRef.current = false;
      if (!mountedRef.current || activeDraftIdRef.current !== draftId) return;
      const fresh = useDraftStore.getState().drafts[draftId];
      if (!fresh) return;
      savedScrollRef.current = findScroller(wrapRef.current)?.scrollTop ?? null;
      editorEpochRef.current++;
      baselineRef.current = Object.fromEntries(fresh.sections.map((x) => [x.id, x.html]));
      setMountVersion((v) => v + 1);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sectionsSig, draftId]);

  // After a live-refresh remount, put the scroll back where the user was.
  // Pagedly paginates asynchronously, so retry over a short window.
  useEffect(() => {
    if (mountVersion === 0 || savedScrollRef.current == null) return;
    const target = savedScrollRef.current;
    savedScrollRef.current = null;
    const timers = [60, 300, 800].map((ms) =>
      setTimeout(() => {
        const sc = findScroller(wrapRef.current);
        if (sc && Math.abs(sc.scrollTop - target) > 4) sc.scrollTop = target;
      }, ms),
    );
    return () => timers.forEach(clearTimeout);
  }, [mountVersion]);

  // Bridge pagedly's imperative handle to the app's PagedEditorActions contract
  // so the top menubar's Edit menu (Undo / Redo / Select all / Find) keeps
  // driving whatever engine is mounted.
  useEffect(() => {
    if (!actionsRef) return;
    actionsRef.current = {
      undo: () => editorRef.current?.undo(),
      redo: () => editorRef.current?.redo(),
      selectAll: () => editorRef.current?.selectAll(),
      openFind: () => editorRef.current?.openFind(),
    };
    return () => {
      actionsRef.current = null;
    };
  }, [actionsRef]);

  // Flush pagedly's debounced pending edit on unmount so a fast Page→Sections
  // toggle (or navigate-away) doesn't drop the last burst of typing.
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      void editorRef.current?.flush();
      mountedRef.current = false;
    };
  }, []);

  // The single write path — safe by construction (see the component doc).
  const persist = (change: LetterEditorChange) => {
    if (editorEpochRef.current !== editorEpoch || activeDraftIdRef.current !== draftId) return;
    const d = useDraftStore.getState().drafts[draftId];
    if (!d) return;
    for (const [key, html] of Object.entries(change.sections)) {
      const cur = d.sections.find((s) => s.id === key || s.sectionId === key);
      if (!cur) continue; // never blind-create an unknown section
      const decision = decideSectionWrite({
        incomingHtml: html,
        currentHtml: cur.html,
        currentStatus: cur.status,
        baselineHtml: baselineRef.current[cur.id],
        allowMarks: reviewMode,
      });
      if (decision === "marked" && !markedToastShown.current) {
        // Refuse rather than silently strip comment/figure/suggestion markup —
        // point the user at the Sections view (which owns those).
        markedToastShown.current = true;
        toast("Sections with comments, figures or AI suggestions edit in the Sections view.", {
          duration: 6000,
        });
      }
      if (decision !== "write") continue;
      updateSection(d.id, cur.id, html);
      baselineRef.current[cur.id] = html;
    }
  };

  // Review surface turns on pagedly's native COMMENTS only, and only when the
  // surface is editable (a comment-write needs contentEditable + a live
  // onChange to persist the span). Track-changes is deliberately OFF: pagedly's
  // raw <ins>/<del> carry no id/author, don't surface in the rail, and are
  // stripped wholesale on export — so suggestions stay in the rail's attributed,
  // export-safe pendingChange system, the app's single suggestion path.
  const enableComments = reviewMode && !readOnly;
  const features = enableComments ? { ...FEATURES, comments: true } : FEATURES;
  void suggesting; // reserved; app owns suggestions in the rail (see above)
  const wordCount = countDraftWords(draft);

  return (
    <div ref={wrapRef} className="relative h-full min-h-0" onPasteCapture={event => {
      if (!wrapRef.current) return;
      const handle = editorRef.current;
      handlePagedImagePaste(event.nativeEvent, {
        wrapper: wrapRef.current, editor: handle,
        isCurrent: () => mountedRef.current && !readOnlyRef.current && editorRef.current === handle && activeDraftIdRef.current === draftId && editorEpochRef.current === editorEpoch,
      }, pending => {
        const notification = toast.loading("Storing pasted images privately…");
        void pending.then(() => toast.dismiss(notification), error => {
          toast.dismiss(notification);
          toast.error(error instanceof Error ? error.message : "Paste failed. Existing content is unchanged.");
        });
      });
    }}>
      <div
        className="pointer-events-none absolute right-4 top-2 z-20 rounded-md border border-[var(--ds-line)] bg-[var(--ds-surface)]/95 px-2 py-1 text-[11px] tabular-nums text-[var(--ds-muted)] shadow-sm"
        role="status"
        aria-label={`${wordCount} words in letter`}
      >
        {wordCount.toLocaleString()} words
      </div>
      <LetterEditor
        key={`${draftId}:${mountVersion}`}
        draft={mapped}
        editorRef={editorRef}
        readOnly={readOnly}
        onCommentAdd={enableComments ? onCommentAdd : undefined}
        onCommentClick={reviewMode ? onCommentClick : undefined}
        toolbar
        toolbarPosition="sticky"
        toolbarLayout="compact"
        features={features}
        showPageNumbers
        pageSize="A4"
        // No write-back when read-only (review-locked): guarantees the surface
        // can never mutate the store even if pagedly emits an initial change.
        onChange={readOnly ? undefined : persist}
        className="h-full"
        canvasClassName="bg-[var(--ds-canvas)]"
      />
    </div>
  );
}

/** First scrollable descendant — pagedly's internal canvas scroller. Used to
 *  save/restore the reading position across a live-refresh remount. */
function findScroller(root: HTMLElement | null): HTMLElement | null {
  if (!root) return null;
  for (const el of root.querySelectorAll<HTMLElement>("*")) {
    if (el.scrollHeight > el.clientHeight + 20) {
      const oy = getComputedStyle(el).overflowY;
      if (oy === "auto" || oy === "scroll") return el;
    }
  }
  return null;
}
