import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { EditorContent, useEditor } from "@tiptap/react";

import type { Draft } from "@/lib/letters/types";
import { useDraftStore } from "@/lib/store";

import {
  PAGE_WIDTH_PX,
  MARGIN_TOP_PX,
  MARGIN_BOTTOM_PX,
  MARGIN_SIDE_PX,
} from "./paged-edit/printCss";
import {
  EDITOR_EXTENSIONS,
  PagedEditToolbar,
  buildMergedHtml,
  splitHtmlBySection,
} from "./paged-edit/editorShared";

/**
 * Editable letter — single-page contenteditable. No fake pagination, no
 * page-break strips. Renders as ONE long A4-width card with the same
 * typography as the export render. The Preview tab still uses paged.js
 * for the multi-page truth; this surface is purely for editing.
 *
 * Architecture:
 *   - ONE TipTap editor holds the whole letter. Sections are preserved
 *     by inserting an invisible `sectionAnchor` node before each
 *     section's content. The anchors survive the ProseMirror round-trip;
 *     on save we walk the doc, group children by which anchor preceded
 *     them, and emit per-section updates.
 *
 * A4 geometry (matches shared paged-edit print CSS):
 *   width 794 (8.27in × 96)
 *   horizontal padding 106 (1.1in each)
 *   vertical padding 96 / 115 (1.0in / 1.2in) — top / bottom
 */

const SAVE_DELAY_MS = 500;

export function PaginatedEditableLetter({
  draft,
  onDone,
}: {
  draft: Draft;
  onDone: () => void;
}) {
  const updateSection = useDraftStore((state) => state.updateSection);

  const initialHtml = useMemo(() => buildMergedHtml(draft), [
    // Only build once per Edit-on-page session — we use draft.id as the
    // memo key so the merged content is rebuilt if the user switches drafts.
    draft.id,
  ]);

  // Snapshot of last-saved HTML per section. Initialised once on mount
  // from the draft's stored section HTML; updated on every successful save.
  const savedHtmlByIdRef = useRef<Record<string, string> | null>(null);
  if (savedHtmlByIdRef.current === null) {
    const seed: Record<string, string> = {};
    for (const s of draft.sections) seed[s.id] = s.html || "";
    savedHtmlByIdRef.current = seed;
  }

  const [dirty, setDirty] = useState(false);
  const saveTimerRef = useRef<number | null>(null);

  const editor = useEditor(
    {
      extensions: EDITOR_EXTENSIONS,
      content: initialHtml,
      editorProps: {
        attributes: { class: "outline-none" },
      },
      onUpdate: ({ editor }) => {
        setDirty(true);
        if (saveTimerRef.current) window.clearTimeout(saveTimerRef.current);
        saveTimerRef.current = window.setTimeout(() => {
          const fullHtml = editor.getHTML();
          const splits = splitHtmlBySection(fullHtml);
          const saved = savedHtmlByIdRef.current as Record<string, string>;
          for (const section of draft.sections) {
            const next = splits[section.id] ?? "";
            if (next !== saved[section.id]) {
              updateSection(draft.id, section.id, next);
              saved[section.id] = next;
            }
          }
          setDirty(false);
          saveTimerRef.current = null;
        }, SAVE_DELAY_MS);
      },
    },
    // Re-create when the draft id changes (rare, but covers the case of
    // switching draft while Edit-on-page is mounted).
    [draft.id],
  );

  // Flush any pending save on unmount so nothing is lost.
  useEffect(() => {
    return () => {
      if (saveTimerRef.current) {
        window.clearTimeout(saveTimerRef.current);
        // Best-effort sync flush.
        if (editor) {
          const splits = splitHtmlBySection(editor.getHTML());
          const saved = savedHtmlByIdRef.current as Record<string, string>;
          for (const section of draft.sections) {
            const next = splits[section.id] ?? "";
            if (next !== saved[section.id]) {
              updateSection(draft.id, section.id, next);
            }
          }
        }
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editor]);

  const flushAndDone = useCallback(() => {
    if (saveTimerRef.current) {
      window.clearTimeout(saveTimerRef.current);
      saveTimerRef.current = null;
    }
    if (editor) {
      const splits = splitHtmlBySection(editor.getHTML());
      const saved = savedHtmlByIdRef.current as Record<string, string>;
      for (const section of draft.sections) {
        const next = splits[section.id] ?? "";
        if (next !== saved[section.id]) {
          updateSection(draft.id, section.id, next);
          saved[section.id] = next;
        }
      }
    }
    setDirty(false);
    onDone();
  }, [draft.id, draft.sections, editor, onDone, updateSection]);

  const styleScope = `pe-${draft.id.slice(0, 8)}`;

  return (
    <div className="paginated-editable-shell">
      <PagedEditToolbar
        editor={editor}
        draft={draft}
        dirty={dirty}
        onDone={flushAndDone}
      />

      {/* Scoped CSS — single-page contenteditable. No fake pagination,
       * no page-break strips. One long A4-width card with the same
       * typography as the Preview render. Vertical growth is natural —
       * the surface extends as content is added. */}
      <style>{`
        .${styleScope} {
          display: flex;
          justify-content: center;
          padding: 20px 0 32px;
          min-height: 100%;
        }

        /* The ProseMirror container IS the paper. A4 width, paper-card
         * styling, print-margin padding so the text column matches the
         * Preview/PDF render. Height grows with content. */
        .${styleScope} .ProseMirror {
          width: ${PAGE_WIDTH_PX}px;
          max-width: 100%;
          padding: ${MARGIN_TOP_PX}px ${MARGIN_SIDE_PX}px ${MARGIN_BOTTOM_PX}px;
          background: #ffffff;
          border: 1px solid #e2e8f0;
          border-radius: 4px;
          box-shadow:
            0 2px 8px rgba(0, 0, 0, 0.04),
            0 6px 24px rgba(0, 0, 0, 0.06);
          font-family: "Geist Variable", -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
          font-size: 11pt;
          line-height: 1.55;
          color: #0f172a;
          outline: none;
        }

        /* Hide section anchors entirely — they're invariant atoms used
         * only for save-time section reconstruction. */
        .${styleScope} .ProseMirror div[data-section-anchor] {
          display: none !important;
          height: 0 !important;
          margin: 0 !important;
        }

        /* Typography matches the shared paged-edit print CSS. */
        .${styleScope} .ProseMirror > *:first-child { margin-top: 0; }
        .${styleScope} .ProseMirror > *:last-child { margin-bottom: 0; }
        .${styleScope} .ProseMirror p { margin: 0 0 8pt 0; }
        .${styleScope} .ProseMirror h1,
        .${styleScope} .ProseMirror h2,
        .${styleScope} .ProseMirror h3 {
          margin: 14pt 0 6pt;
          line-height: 1.25;
        }
        .${styleScope} .ProseMirror h2 { font-size: 14pt; font-weight: 600; }
        .${styleScope} .ProseMirror h3 { font-size: 12pt; font-weight: 600; }
        .${styleScope} .ProseMirror strong { font-weight: 600; }
        .${styleScope} .ProseMirror em { color: #475569; font-style: italic; }
        .${styleScope} .ProseMirror ul { list-style: disc; padding-left: 1.5em; margin: 6pt 0; }
        .${styleScope} .ProseMirror ol { list-style: decimal; padding-left: 1.5em; margin: 6pt 0; }
        .${styleScope} .ProseMirror li { margin: 2pt 0; }
        .${styleScope} .ProseMirror blockquote {
          margin: 8pt 0;
          padding-left: 1em;
          border-left: 2px solid #cbd5e1;
          color: #334155;
          font-style: italic;
        }
        .${styleScope} .ProseMirror hr {
          border: 0;
          border-top: 1px solid #cbd5e1;
          margin: 14pt 0;
        }
        .${styleScope} .ProseMirror table {
          width: 100%;
          border-collapse: collapse;
          margin: 6pt 0;
        }
        .${styleScope} .ProseMirror th,
        .${styleScope} .ProseMirror td {
          border: 1px solid #cbd5e1;
          padding: 4pt 8pt;
          text-align: left;
        }
        .${styleScope} .ProseMirror img {
          max-width: 100%;
          height: auto;
          margin: 6pt 0;
          border-radius: 3px;
        }
        .${styleScope} .ProseMirror .figure-ref,
        .${styleScope} .ProseMirror .attachment-ref {
          font-style: italic;
          color: #475569;
        }
        .${styleScope} .ProseMirror p.is-editor-empty:first-child::before {
          content: attr(data-placeholder);
          color: #94a3b8;
          float: left;
          height: 0;
          pointer-events: none;
        }
      `}</style>

      <div className={styleScope}>
        <EditorContent editor={editor} />
      </div>
    </div>
  );
}
