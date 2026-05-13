import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { EditorContent, useEditor } from "@tiptap/react";

import type { Draft } from "@/lib/letters/types";
import { useDraftStore } from "@/lib/store";

import {
  PAGE_WIDTH_PX,
  MARGIN_TOP_PX,
  MARGIN_BOTTOM_PX,
  MARGIN_SIDE_PX,
} from "./printCss";
import {
  EDITOR_EXTENSIONS,
  PagedEditToolbar,
  buildMergedHtml,
  splitHtmlBySection,
} from "./editorShared";
import { usePageBreakPositions } from "./usePageBreakPositions";
import { PageBreakOverlay } from "./PageBreakOverlay";

/**
 * Edit-on-page V2 — the pixel-perfect render path gated behind
 * VITE_FEATURE_PIXEL_PERFECT_EDIT.
 *
 * Same TipTap editor, same A4 width / margins / typography as V1
 * (sourced from paged-edit/printCss.ts so all three letter surfaces
 * agree to the fractional point). The new piece is `usePageBreakPositions`:
 * a background paged.js Chunker runs off-screen on every debounced
 * keystroke and reports where the printed letter would break.
 *
 * In THIS commit the hook is wired but its output is only exposed as a
 * live page count in the toolbar — enough to verify the data flow.
 * The actual visual break-strip overlay lands in the next commit.
 *
 * Save / unmount-flush behaviour mirrors V1 exactly so the user can
 * flip the flag mid-edit without losing work.
 */

const SAVE_DELAY_MS = 500;

export function PaginatedEditableLetterV2({
  draft,
  onDone,
}: {
  draft: Draft;
  onDone: () => void;
}) {
  const updateSection = useDraftStore((state) => state.updateSection);

  const initialHtml = useMemo(() => buildMergedHtml(draft), [draft.id]);

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
      editorProps: { attributes: { class: "outline-none" } },
      onUpdate: ({ editor }) => {
        setDirty(true);
        if (saveTimerRef.current) window.clearTimeout(saveTimerRef.current);
        saveTimerRef.current = window.setTimeout(() => {
          const splits = splitHtmlBySection(editor.getHTML());
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
    [draft.id],
  );

  useEffect(() => {
    return () => {
      if (saveTimerRef.current) {
        window.clearTimeout(saveTimerRef.current);
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

  // Off-screen paged.js Chunker that reports where breaks fall. Used
  // by PageBreakOverlay in the next commit; here we only surface the
  // page count so we can verify the hook fires.
  const { pageCount, breakOffsets } = usePageBreakPositions(editor);

  const styleScope = `pev2-${draft.id.slice(0, 8)}`;

  return (
    <div className="paginated-editable-shell">
      <PagedEditToolbar
        editor={editor}
        draft={draft}
        dirty={dirty}
        onDone={flushAndDone}
        rightSlot={
          <span
            className="text-[10px] text-[var(--ds-muted)] tabular-nums"
            title={`paged.js pixel-perfect mode — ${breakOffsets.length} break${breakOffsets.length === 1 ? "" : "s"} detected`}
          >
            {pageCount} page{pageCount === 1 ? "" : "s"}
          </span>
        }
      />

      <style>{`
        .${styleScope} {
          display: flex;
          justify-content: center;
          padding: 20px 0 32px;
          min-height: 100%;
        }

        .${styleScope} .ProseMirror {
          position: relative;
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

        .${styleScope} .ProseMirror div[data-section-anchor] {
          display: none !important;
          height: 0 !important;
          margin: 0 !important;
        }

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
        {/* Relative shell wraps the editor + overlay so the absolute
         * page-break strips share a coordinate origin with .ProseMirror.
         * The shell is sized to the page so the overlay's bounding box
         * matches the visible card. */}
        <div
          style={{
            position: "relative",
            width: PAGE_WIDTH_PX,
            maxWidth: "100%",
          }}
        >
          <EditorContent editor={editor} />
          <PageBreakOverlay
            breakOffsets={breakOffsets}
            pageWidthPx={PAGE_WIDTH_PX}
          />
        </div>
      </div>
    </div>
  );
}
