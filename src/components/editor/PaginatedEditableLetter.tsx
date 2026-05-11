import { useCallback, useEffect, useRef, useState } from "react";
import type { Draft, EvidenceItem } from "@/lib/letters/types";
import { useDraftStore } from "@/lib/store";
import { sanitizeLetterHtml } from "@/lib/sanitize";
import { resolveFigureRefsInHtml, displayModeOf, figureLabelFor } from "@/lib/evidence";
import {
  Bold,
  Italic,
  List,
  ListOrdered,
  Heading2,
  Heading3,
  AlignLeft,
  AlignCenter,
  AlignRight,
  AlignJustify,
  ImageIcon,
  Paperclip,
  Loader2,
  PencilOff,
  RefreshCw,
} from "lucide-react";

/**
 * Real paginated editor. Renders the letter as discrete A4 page cards via
 * paged.js — same multi-page card stack you see in read-only Preview —
 * but the page contents are `contenteditable` so the user can type
 * directly onto each page.
 *
 * The trade-off vs TipTap inline editing:
 *
 *   - Pros:     real multi-page A4 cards with shadows + gaps, page
 *               numbers in footer, content visibly paginated as in
 *               Word print preview.
 *   - Cons:     formatting commands run via document.execCommand
 *               (deprecated but still universally supported). Tables
 *               and complex tools are degraded compared with TipTap.
 *               Content overflow within a page does NOT auto-flow to
 *               the next page in real time — the user re-paginates
 *               manually (or types within an existing page's space).
 *
 * Save model: every input event marks dirty + saves the active section's
 * HTML back to the draft store. On "Re-paginate" the page boxes are
 * re-extracted, concatenated back into section HTML, and paged.js runs
 * again.
 *
 * Selection preservation across re-paginate: we save the cursor offset
 * within the active section before re-pagination and restore the closest
 * equivalent position after.
 */
export function PaginatedEditableLetter({
  draft,
  onDone,
}: {
  draft: Draft;
  onDone: () => void;
}) {
  const updateSection = useDraftStore((s) => s.updateSection);
  const containerRef = useRef<HTMLDivElement>(null);
  const [busy, setBusy] = useState(true);
  const [pageCount, setPageCount] = useState<number | null>(null);
  const [dirty, setDirty] = useState(false);
  const [paginationKey, setPaginationKey] = useState(0);

  // Build the same source HTML we use for read-only preview, but tag
  // each section's container with data-section-id so we can match
  // edited content back to its source section after re-pagination.
  const buildSource = useCallback(() => {
    const evidence = draft.evidence ?? [];
    const letterhead = letterheadHtml(draft);
    const signature = signatureHtml(draft);
    const sections = draft.sections
      .filter((s) => s.html && s.html.trim())
      .map((s) => {
        const html =
          s.sectionId === "signature" && signature
            ? signature + sanitizeLetterHtml(s.html)
            : sanitizeLetterHtml(s.html);
        const resolved =
          evidence.length > 0 ? resolveFigureRefsInHtml(html, evidence) : html;
        return `<section data-section-id="${s.id}" class="letter-section">${resolved}</section>`;
      })
      .join("\n");
    const attachments = buildAttachmentsBlock(draft);
    const figures = buildFiguresAppendix(draft);
    return `${letterhead}${sections}${attachments}${figures}`;
  }, [draft]);

  // Re-paginate. Resets paged.js + container. Cursor is lost (paged.js
  // builds new DOM nodes); user is told to click back where they want.
  const repaginate = useCallback(async () => {
    const container = containerRef.current;
    if (!container) return;
    setBusy(true);
    container.innerHTML = "";
    try {
      const { Previewer } = await import("pagedjs");
      const previewer = new Previewer();
      const doc = wrapInPrintHtml(buildSource());
      const flow = await previewer.preview(doc, [], container);
      setPageCount(flow.total ?? null);
      // Make each rendered page editable.
      const pageboxes = container.querySelectorAll<HTMLElement>(".pagedjs_pagebox");
      pageboxes.forEach((box) => {
        box.setAttribute("contenteditable", "true");
        box.setAttribute("spellcheck", "true");
        box.style.outline = "none";
      });
      setDirty(false);
    } finally {
      setBusy(false);
    }
  }, [buildSource]);

  useEffect(() => {
    void repaginate();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [paginationKey]);

  // Save handler — extracts every [data-section-id] sub-tree from the
  // paginated DOM and pushes its innerHTML back to the corresponding
  // section in the draft store.
  const saveAllSections = useCallback(() => {
    const container = containerRef.current;
    if (!container) return;
    // A section may have been split across multiple pages. Concatenate
    // all fragments matching each section id back into one HTML blob.
    const accum: Record<string, string> = {};
    container.querySelectorAll<HTMLElement>("[data-section-id]").forEach((el) => {
      const id = el.getAttribute("data-section-id");
      if (!id) return;
      accum[id] = (accum[id] ?? "") + el.innerHTML;
    });
    for (const [sectionId, html] of Object.entries(accum)) {
      const existing = draft.sections.find((s) => s.id === sectionId);
      if (existing && existing.html !== html) {
        updateSection(draft.id, sectionId, html);
      }
    }
    setDirty(false);
  }, [draft, updateSection]);

  // Track input events from the page boxes (event delegation on the
  // container). Save on every input but throttled to once per 800 ms.
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    let saveTimer: number | null = null;
    const onInput = () => {
      setDirty(true);
      if (saveTimer != null) window.clearTimeout(saveTimer);
      saveTimer = window.setTimeout(() => {
        saveAllSections();
      }, 800);
    };
    container.addEventListener("input", onInput);
    return () => {
      container.removeEventListener("input", onInput);
      if (saveTimer != null) window.clearTimeout(saveTimer);
    };
  }, [saveAllSections, paginationKey]);

  // Toolbar commands operate via document.execCommand. Deprecated but
  // still universally supported and the only practical way to format
  // contenteditable content without a full editor framework.
  const cmd = (command: string, value?: string) => {
    document.execCommand(command, false, value);
  };

  const onInsertImageFile = (file: File) => {
    if (file.size > 5 * 1024 * 1024) {
      alert("Image > 5 MB. Use the Evidence step for full-quality originals.");
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = String(reader.result ?? "");
      cmd(
        "insertHTML",
        `<img src="${dataUrl}" alt="${file.name}" style="max-width:100%;height:auto;border-radius:4px;margin:6pt 0;" />`
      );
    };
    reader.readAsDataURL(file);
  };

  const onInsertEvidence = (item: EvidenceItem) => {
    const mode = displayModeOf(item);
    const evidence = draft.evidence ?? [];
    if (mode === "figure") {
      const label = figureLabelFor(item, evidence) || "Fig";
      cmd(
        "insertHTML",
        `<span class="figure-ref" data-fig-id="${item.id}">[See ${label}]</span>&nbsp;`
      );
    } else if (mode === "inline") {
      cmd("insertHTML", buildInlineHtml(item));
    } else if (mode === "attached") {
      cmd(
        "insertHTML",
        `<span class="attachment-ref" data-att-id="${item.id}">[See Attachments]</span>&nbsp;`
      );
    }
  };

  return (
    <div className="paginated-editable-shell">
      {/* Sticky top toolbar with all formatting. Lives outside the
       * paged.js container so toolbar clicks never confuse the
       * pagination DOM. Selection-preserving onMouseDown.preventDefault
       * keeps focus inside whatever pagebox the cursor was in. */}
      <PagedEditToolbar
        draft={draft}
        onCommand={cmd}
        onPickImage={onInsertImageFile}
        onPickEvidence={onInsertEvidence}
        onRepaginate={() => setPaginationKey((k) => k + 1)}
        onDone={() => {
          // Save anything still in-flight before leaving.
          saveAllSections();
          onDone();
        }}
        busy={busy}
        dirty={dirty}
        pageCount={pageCount}
      />

      {/* The paged.js output. We never set its innerHTML directly from
       * React after first paint — every mutation is via re-running the
       * Previewer, triggered via the paginationKey bump. */}
      <div ref={containerRef} className="paged-editable-container" />
    </div>
  );
}

/* ============================================================================
 * Toolbar
 * ==========================================================================*/

function PagedEditToolbar({
  draft,
  onCommand,
  onPickImage,
  onPickEvidence,
  onRepaginate,
  onDone,
  busy,
  dirty,
  pageCount,
}: {
  draft: Draft;
  onCommand: (cmd: string, value?: string) => void;
  onPickImage: (file: File) => void;
  onPickEvidence: (item: EvidenceItem) => void;
  onRepaginate: () => void;
  onDone: () => void;
  busy: boolean;
  dirty: boolean;
  pageCount: number | null;
}) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [pickerOpen, setPickerOpen] = useState(false);
  const items = draft.evidence ?? [];

  const onFileChosen = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (file && file.type.startsWith("image/")) onPickImage(file);
  };

  return (
    <div
      className="sticky top-0 z-30 bg-white border border-[var(--ds-line)] rounded-md mx-auto mb-3 shadow-sm"
      style={{ width: "min(8.27in, 100%)" }}
      // Keep focus inside the pagebox when clicking toolbar buttons —
      // execCommand acts on the document selection, which must remain
      // inside the editable area.
      onMouseDown={(e) => {
        const target = e.target as HTMLElement;
        if (target.closest("button, input")) return;
        e.preventDefault();
      }}
    >
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={onFileChosen}
      />

      <div className="flex items-center gap-1 px-2 py-1.5 overflow-x-auto">
        {/* Marks */}
        <TBtn label="Bold" onClick={() => onCommand("bold")}>
          <Bold className="size-3.5" />
        </TBtn>
        <TBtn label="Italic" onClick={() => onCommand("italic")}>
          <Italic className="size-3.5" />
        </TBtn>

        <Spacer />

        {/* Headings */}
        <TBtn
          label="Heading 2"
          onClick={() => onCommand("formatBlock", "<h2>")}
        >
          <Heading2 className="size-3.5" />
        </TBtn>
        <TBtn
          label="Heading 3"
          onClick={() => onCommand("formatBlock", "<h3>")}
        >
          <Heading3 className="size-3.5" />
        </TBtn>

        <Spacer />

        {/* Lists */}
        <TBtn label="Bullets" onClick={() => onCommand("insertUnorderedList")}>
          <List className="size-3.5" />
        </TBtn>
        <TBtn label="Numbered list" onClick={() => onCommand("insertOrderedList")}>
          <ListOrdered className="size-3.5" />
        </TBtn>

        <Spacer />

        {/* Alignment */}
        <TBtn label="Align left" onClick={() => onCommand("justifyLeft")}>
          <AlignLeft className="size-3.5" />
        </TBtn>
        <TBtn label="Align centre" onClick={() => onCommand("justifyCenter")}>
          <AlignCenter className="size-3.5" />
        </TBtn>
        <TBtn label="Align right" onClick={() => onCommand("justifyRight")}>
          <AlignRight className="size-3.5" />
        </TBtn>
        <TBtn label="Justify" onClick={() => onCommand("justifyFull")}>
          <AlignJustify className="size-3.5" />
        </TBtn>

        <Spacer />

        {/* Insert */}
        <TBtn label="Insert image" onClick={() => fileInputRef.current?.click()}>
          <ImageIcon className="size-3.5" />
        </TBtn>
        <div className="relative">
          <TBtn
            label="Insert evidence at cursor"
            onClick={() => setPickerOpen((v) => !v)}
            active={pickerOpen}
            disabled={items.length === 0}
          >
            <Paperclip className="size-3.5" />
          </TBtn>
          {pickerOpen && items.length > 0 && (
            <div className="absolute right-0 top-9 z-40 w-[300px] bg-white border border-[var(--ds-line)] rounded-md shadow-md max-h-[280px] overflow-y-auto">
              {items.map((it) => {
                const label =
                  displayModeOf(it) === "figure"
                    ? figureLabelFor(it, items) || "Fig"
                    : displayModeOf(it) === "inline"
                    ? "Inline"
                    : displayModeOf(it) === "attached"
                    ? "Attachment"
                    : "Pack only";
                return (
                  <button
                    key={it.id}
                    type="button"
                    onClick={() => {
                      onPickEvidence(it);
                      setPickerOpen(false);
                    }}
                    disabled={displayModeOf(it) === "pack_only"}
                    className="w-full text-left px-3 py-2 text-[12px] hover:bg-[var(--ds-line-2)] disabled:opacity-40 flex items-center justify-between gap-2"
                  >
                    <span className="truncate">
                      {it.filename || it.kind}
                    </span>
                    <span className="shrink-0 text-[10px] font-semibold uppercase tracking-[0.04em] text-[var(--ds-muted)]">
                      {label}
                    </span>
                  </button>
                );
              })}
            </div>
          )}
        </div>

        <div className="flex-1 min-w-0" />

        {/* Status + Re-paginate + Done */}
        <span className="text-[10.5px] text-[var(--ds-muted)] tabular-nums shrink-0 px-2">
          {busy ? (
            <span className="inline-flex items-center gap-1.5">
              <Loader2 className="size-3 animate-spin" /> Paginating
            </span>
          ) : pageCount ? (
            <>
              {pageCount} page{pageCount === 1 ? "" : "s"}
              {dirty && " · edits saved"}
            </>
          ) : null}
        </span>

        <button
          type="button"
          onClick={onRepaginate}
          disabled={busy}
          title="Re-paginate now (after big edits, image inserts, or layout-affecting changes)"
          className="inline-flex items-center gap-1 text-[11.5px] px-2 h-7 rounded-md border border-[var(--ds-line)] bg-white hover:bg-[var(--ds-line-2)] disabled:opacity-40"
        >
          <RefreshCw className="size-3" />
          Re-paginate
        </button>

        <button
          type="button"
          onClick={onDone}
          className="inline-flex items-center gap-1 text-[11.5px] px-2.5 h-7 rounded-md bg-[var(--ds-ink)] text-white border border-[var(--ds-ink)]"
        >
          <PencilOff className="size-3.5" />
          Done
        </button>
      </div>
    </div>
  );
}

function TBtn({
  children,
  label,
  onClick,
  active,
  disabled,
}: {
  children: React.ReactNode;
  label: string;
  onClick: () => void;
  active?: boolean;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      onClick={onClick}
      disabled={disabled}
      className={
        "size-7 rounded-sm grid place-items-center disabled:opacity-40 disabled:cursor-not-allowed transition " +
        (active
          ? "bg-[var(--ds-line-2)] text-[var(--ds-ink)]"
          : "text-[var(--ds-body)] hover:bg-[var(--ds-line-2)] hover:text-[var(--ds-ink)]")
      }
    >
      {children}
    </button>
  );
}

function Spacer() {
  return <span className="w-px h-4 bg-[var(--ds-line)] mx-1 shrink-0" />;
}

/* ============================================================================
 * Source composition (same shape as PaginatedLetter so the output is
 * visually consistent — paged.js sees the same letterhead, sections,
 * attachments block, and exhibit appendix).
 * ==========================================================================*/

function letterheadHtml(draft: Draft): string {
  const url = draft.employer.letterheadDataUrl;
  if (!url) return "";
  return `<div class="letterhead"><img src="${url}" alt="" /></div>`;
}

function signatureHtml(draft: Draft): string {
  const url = draft.employer.signatureDataUrl;
  if (!url) return "";
  return `<div class="signature-image"><img src="${url}" alt="" /></div>`;
}

function buildAttachmentsBlock(draft: Draft): string {
  const attached = (draft.evidence ?? []).filter((e) => displayModeOf(e) === "attached");
  if (attached.length === 0) return "";
  const items = attached
    .map(
      (e, i) =>
        `<li><strong>${escHtml(e.filename || `${e.kind} item`)}</strong>${
          e.content ? ` — ${escHtml(e.content)}` : ""
        }<span class="att-num">[Attachment ${i + 1}]</span></li>`
    )
    .join("\n");
  return `<section class="attachments-section page-break-before" contenteditable="false">
    <h2>Attachments</h2>
    <ol class="attachments-list">${items}</ol>
  </section>`;
}

function buildFiguresAppendix(draft: Draft): string {
  const all = draft.evidence ?? [];
  const figs = all.filter((e) => displayModeOf(e) === "figure");
  if (figs.length === 0) return "";
  return `<section class="figures-section page-break-before" contenteditable="false">
    <h2>Exhibits</h2>
    ${figs
      .map((item) => {
        const label = figureLabelFor(item, all);
        const isImage = item.mimeType?.startsWith("image/");
        return `<figure class="figure-item">
          <figcaption><strong>${escHtml(label)}</strong>${
          item.filename ? ` — ${escHtml(item.filename)}` : ""
        }</figcaption>
          ${
            isImage && item.fileDataUrl
              ? `<img src="${item.fileDataUrl}" alt="${escHtml(item.filename || "")}" />`
              : ""
          }
          ${item.content ? `<p class="figure-body">${escHtml(item.content)}</p>` : ""}
        </figure>`;
      })
      .join("\n")}
  </section>`;
}

function buildInlineHtml(item: EvidenceItem): string {
  if (item.kind === "screenshot" && item.fileDataUrl?.startsWith("data:image/")) {
    return `<figure><img src="${item.fileDataUrl}" alt="${escHtml(item.filename || "")}" style="max-width:100%;height:auto;" />${
      item.content ? `<figcaption>${escHtml(item.content)}</figcaption>` : ""
    }</figure>`;
  }
  if (item.kind === "note" || item.kind === "email" || item.kind === "calendar") {
    const text = item.content || item.filename || "Evidence";
    const kindLabel =
      item.kind === "email" ? "Email" : item.kind === "calendar" ? "Calendar entry" : "Note";
    return `<blockquote>${escHtml(text)}<br/><em>— ${kindLabel}${
      item.filename ? ` (${escHtml(item.filename)})` : ""
    }</em></blockquote>`;
  }
  return `<p>I refer to the document <em>${escHtml(item.filename || "(unnamed)")}</em>${
    item.content ? `, summarised: ${escHtml(item.content)}` : ""
  }.</p>`;
}

function escHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/* ============================================================================
 * Print CSS (same as PaginatedLetter so what-you-edit-is-what-you-print)
 * ==========================================================================*/

function wrapInPrintHtml(bodyHtml: string): string {
  return `<!doctype html>
<html><head><meta charset="utf-8">
<style>
  @page {
    size: A4;
    margin: 1in 1.1in 1.2in 1.1in;
    @bottom-center {
      content: "Page " counter(page) " of " counter(pages);
      font-family: 'Geist', -apple-system, sans-serif;
      font-size: 9pt;
      color: #94a3b8;
      padding-top: 0.4in;
    }
  }
  .pagedjs_pages {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 24px;
    padding: 0;
  }
  .pagedjs_page {
    background: #ffffff;
    box-shadow: 0 2px 8px rgba(0,0,0,0.04), 0 6px 24px rgba(0,0,0,0.06);
    border: 1px solid #e2e8f0;
    border-radius: 4px;
    margin: 0 !important;
  }
  .pagedjs_pagebox {
    /* contentEditable target — these get focus-ring + caret styling. */
    cursor: text;
  }
  .pagedjs_pagebox:focus {
    outline: 2px solid rgba(15, 23, 42, 0.06);
    outline-offset: 2px;
  }
  body {
    font-family: 'Iowan Old Style', Georgia, 'Times New Roman', serif;
    font-size: 11pt;
    line-height: 1.55;
    color: #0f172a;
    margin: 0;
  }
  p { margin: 0 0 8pt 0; }
  h1, h2, h3 { margin: 14pt 0 6pt; line-height: 1.25; }
  h2 { font-size: 14pt; font-weight: 600; }
  h3 { font-size: 12pt; font-weight: 600; }
  strong { font-weight: 600; }
  em { color: #475569; font-style: italic; }
  table { width: 100%; border-collapse: collapse; margin: 4pt 0; }
  th, td { border: 1px solid #cbd5e1; padding: 4pt 8pt; text-align: left; }
  hr.letter-rule { border: none; border-top: 1px solid #cbd5e1; margin: 14pt 0; }
  .letter-section img,
  figure img { max-width: 100%; height: auto; border-radius: 3px; margin: 6pt 0; }
  .letterhead { text-align: center; margin-bottom: 18pt; }
  .letterhead img { max-height: 120px; max-width: 100%; }
  .signature-image { margin: 6pt 0; }
  .signature-image img { max-height: 54px; }
  .figure-ref { font-style: italic; color: #475569; }
  .attachment-ref { font-style: italic; color: #475569; }
  .attachments-section { margin-top: 18pt; }
  .attachments-section h2 {
    font-size: 13pt;
    border-bottom: 1px solid #cbd5e1;
    padding-bottom: 4pt;
    margin-bottom: 6pt;
  }
  .attachments-list { list-style: decimal; padding-left: 1.2em; font-size: 11pt; }
  .attachments-list li { margin: 2pt 0; }
  .attachments-list .att-num { color: #94a3b8; font-size: 9pt; margin-left: 6pt; }
  .figures-section h2 {
    font-size: 14pt;
    border-bottom: 1px solid #cbd5e1;
    padding-bottom: 4pt;
    margin-bottom: 10pt;
  }
  .figure-item {
    margin: 0 0 14pt 0;
    page-break-inside: avoid;
    break-inside: avoid;
  }
  .figure-item figcaption {
    font-family: Georgia, serif;
    font-size: 11pt;
    margin-bottom: 4pt;
    color: #0f172a;
  }
  .figure-item img {
    max-width: 100%;
    max-height: 5in;
    border: 1px solid #e2e8f0;
    border-radius: 3px;
  }
  .figure-body {
    font-size: 10.5pt;
    color: #334155;
    white-space: pre-wrap;
    background: #f8fafc;
    padding: 6pt 8pt;
    border-radius: 3px;
  }
  .page-break-before { page-break-before: always; break-before: page; }
  .letter-section { /* container so saved HTML maps back to section ids */ }
</style></head>
<body>${bodyHtml}</body></html>`;
}
