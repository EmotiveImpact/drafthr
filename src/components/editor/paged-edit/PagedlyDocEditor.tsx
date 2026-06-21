import { useEffect, useMemo, useRef, type MutableRefObject } from "react";
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
 * removed). It exposes the small `{ draft, onDone?, actionsRef? }` contract
 * (see ./types `PagedEditorActions`) so LetterPreview and the editor's
 * File/Edit/Tools menubar drive it directly. Toggling "Edit on page" mounts THIS.
 *
 * Source of truth stays the app store: edits flow back per-section through
 * updateSection (the same path the section editors + AI use), so switching
 * between the section view and the on-page view stays in sync. We map the draft
 * to pagedly's LetterDraft ONCE per mount — pagedly keeps its own live copy, and
 * this surface only mounts while editing on page (the AI rail is collapsed in
 * preview), so nothing mutates the store underneath it; each re-entry remounts
 * fresh and picks up the latest sections.
 *
 * comments + inline-AI are OFF: pagedly stores comment spans inside section HTML
 * (comments are app-owned), and the AI adapter is a separate follow-up.
 *
 * The toolbar is a curated, letter-appropriate set rather than pagedly's full
 * ~45-control surface. An HR letter has a fixed format owned by the template /
 * letterhead, so document-authoring controls (font family/size, colour, tables,
 * columns, TOC, footnotes, page breaks, code, etc.) are off — they'd clutter the
 * bar and let a user break the house style. The in-toolbar export/print buttons
 * are off too: export is deliberately centralised at the /review step, so those
 * would be a duplicate path. Every flag is spelled out explicitly so the result
 * is exactly this set regardless of how partial configs merge over defaults.
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

  // Single write path — persist ONLY sections back (employer/evidence are
  // display-only inbound). Guards: skip no-ops (so reflow/remount can't flip a
  // clean section to "edited"), never blank-overwrite non-empty stored content,
  // and never blind-create an unknown section.
  const persist = (change: LetterEditorChange) => {
    const d = useDraftStore.getState().drafts[draftId];
    if (!d) return;
    for (const [key, html] of Object.entries(change.sections)) {
      const cur = d.sections.find((s) => s.id === key || s.sectionId === key);
      if (!cur) continue;
      if (cur.html === html) continue;
      if (html === "" && cur.html.trim() !== "") continue;
      updateSection(d.id, cur.id, html);
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
      onChange={persist}
      className="h-full"
      canvasClassName="bg-[var(--ds-canvas)]"
    />
  );
}
