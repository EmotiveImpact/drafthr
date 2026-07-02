import { useEffect, useMemo, useRef, type MutableRefObject } from "react";
import { toast } from "sonner";
import {
  LetterEditor,
  type EditorFeatures,
  type EditorHandle,
  type LetterEditorChange,
} from "pagedly";
import "pagedly/styles.css";

import type { Draft } from "@/lib/letters/types";
import { useDraftStore } from "@/lib/store";
import { toLetterDraft } from "@/lib/letters/toLetterDraft";
import type { PagedEditorActions } from "./types";

/**
 * Edit-on-page engine, backed by the vendored **pagedly** library. This is the
 * sole on-page editor (the home-grown paged.js engine it replaced has been
 * removed). It exposes the small `{ draft, readOnly?, onDone?, actionsRef? }`
 * contract (see ./types `PagedEditorActions`) so LetterPreview and the editor's
 * File/Edit/Tools menubar drive it directly. Toggling the "Page" view mounts THIS.
 *
 * SOURCE OF TRUTH stays the app store: user edits flow back per-section through
 * updateSection. The draft is mapped to pagedly's LetterDraft ONCE per mount —
 * pagedly then keeps its own live copy. That mount-once design means the store
 * can legitimately move ahead of pagedly while this is open (an AI rewrite from
 * the still-reachable AI rail, an Accept-all, a streaming generation, another
 * browser tab), so persist() is written to WRITE ONLY sections the user actually
 * changed on the page and NEVER to clobber content that moved on underneath it:
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
  wordCount: true,
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
}): SectionWriteDecision {
  const { incomingHtml, currentHtml, currentStatus, baselineHtml } = args;
  if (currentHtml === incomingHtml) return "noop";
  if (currentStatus === "streaming") return "streaming";
  // External change since our last write (AI / other tab / Accept-all) → store wins.
  if ((baselineHtml ?? currentHtml) !== currentHtml) return "external";
  if (hasAppMarks(currentHtml)) return "marked";
  if (incomingHtml === "" && currentHtml.trim() !== "") return "blank";
  return "write";
}

export function PagedlyDocEditor({
  draft,
  readOnly,
  actionsRef,
}: {
  draft: Draft;
  /** Render non-editable (e.g. while a draft is locked for review). Pagination
   *  + selection still work; the content just can't be changed. */
  readOnly?: boolean;
  /** Present for contract parity with the old PagedEditor; pagedly has no
   *  in-surface "done" affordance — the parent toggle owns exit. */
  onDone?: () => void;
  actionsRef?: MutableRefObject<PagedEditorActions | null>;
}) {
  const updateSection = useDraftStore((s) => s.updateSection);
  const editorRef = useRef<EditorHandle | null>(null);
  const draftId = draft.id;

  // Map once per draft — re-mapping on every store change would fight pagedly's
  // internal live copy and clobber in-progress edits.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const mapped = useMemo(() => toLetterDraft(draft), [draftId]);

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
    return () => {
      void editorRef.current?.flush();
    };
  }, []);

  // The single write path — safe by construction (see the component doc).
  const persist = (change: LetterEditorChange) => {
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

  return (
    <LetterEditor
      key={draftId}
      draft={mapped}
      editorRef={editorRef}
      readOnly={readOnly}
      toolbar
      toolbarPosition="sticky"
      toolbarLayout="compact"
      features={FEATURES}
      showPageNumbers
      pageSize="A4"
      // No write-back when read-only (review-locked): guarantees the surface
      // can never mutate the store even if pagedly emits an initial change.
      onChange={readOnly ? undefined : persist}
      className="h-full"
      canvasClassName="bg-[var(--ds-canvas)]"
    />
  );
}
