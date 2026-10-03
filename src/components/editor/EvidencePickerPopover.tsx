import { useMemo } from "react";
import type { Editor } from "@tiptap/react";
import type { Draft, EvidenceItem } from "@/lib/letters/types";
import { displayModeOf, figureLabelFor } from "@/lib/evidence";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { FileText, Mail, NotebookText, Image as ImageIcon, CalendarDays, Plus, ArrowRight, Check } from "lucide-react";
import { Link } from "react-router-dom";
import { evidenceInsertionHtml } from "@/lib/storage/inline-evidence";

/** Format bytes as a compact "x KB" / "x MB" string. */
function formatBytes(bytes: number | undefined): string | null {
  if (!bytes || bytes <= 0) return null;
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/** Rough byte estimate of a base64 data URL (used when item.fileSize is absent). */
function estimateDataUrlBytes(dataUrl: string | undefined): number | undefined {
  if (!dataUrl) return undefined;
  const idx = dataUrl.indexOf(",");
  if (idx < 0) return undefined;
  // base64 → ~3/4 the encoded length
  return Math.round((dataUrl.length - idx - 1) * 0.75);
}

const KIND_ICON: Record<EvidenceItem["kind"], typeof FileText> = {
  email: Mail,
  calendar: CalendarDays,
  document: FileText,
  screenshot: ImageIcon,
  note: NotebookText,
};

/**
 * Toolbar popover that inserts evidence at the editor cursor.
 *
 * For each item the insertion behaviour depends on its displayMode:
 *
 *   figure   → inserts a "[See Fig N]" text reference at the cursor.
 *              The actual exhibit lives on the index page in the ZIP.
 *   inline   → embeds the content at the cursor:
 *                - image kinds get an <img>
 *                - notes / emails get a <blockquote> with attribution
 *                - documents get a stub paragraph "I refer to …" (the
 *                  full file goes in the ZIP at original quality).
 *   attached → inserts a "[See Attachments]" reference (the item is
 *              listed in the auto-generated Attachments section at the
 *              end of the letter).
 *   pack_only → not inserted into prose at all; we still show it in
 *               the picker so the user understands what's bundled.
 */
export function EvidencePickerPopover({
  draft,
  editor,
  open,
  onOpenChange,
  trigger,
  onOpenDrawer,
}: {
  draft: Draft;
  editor: Editor;
  open: boolean;
  onOpenChange: (next: boolean) => void;
  trigger: React.ReactNode;
  /** Optional — show a "See all evidence" link at the bottom that
   * defers to the dedicated drawer (Pattern D). Wired by the toolbar. */
  onOpenDrawer?: () => void;
}) {
  const items = draft.evidence ?? [];

  // Detect which evidence ids have already been inserted into ANY section
  // by scanning each section's HTML for `data-fig-id="ID"` / `data-att-id="ID"`.
  // Drives the "Fig N ✓" inserted-badge in the item rows so the user can see
  // which exhibits are already referenced and which are still loose.
  const insertedMap = useMemo(() => {
    const map = new Map<string, { sectionTitle: string }>();
    const figRe = /data-fig-id="([^"]+)"/g;
    const attRe = /data-att-id="([^"]+)"/g;
    for (const section of draft.sections) {
      const html = section.html ?? "";
      for (const re of [figRe, attRe]) {
        re.lastIndex = 0;
        let m: RegExpExecArray | null;
        while ((m = re.exec(html))) {
          if (!map.has(m[1])) map.set(m[1], { sectionTitle: section.title });
        }
      }
    }
    return map;
  }, [draft.sections]);

  const insert = (item: EvidenceItem) => {
    if (editor.isDestroyed || !editor.isEditable) return;
    const mode = displayModeOf(item);
    if (mode === "figure") {
      const label = figureLabelFor(item, items) || "Fig";
      editor
        .chain()
        .focus()
        .insertContent(
          `<span class="figure-ref" data-fig-id="${escAttr(item.id)}">[See ${escHtml(label)}]</span>&nbsp;`
        )
        .run();
    } else if (mode === "inline") {
      try { editor.chain().focus().insertContent(evidenceInsertionHtml(item)).run(); }
      catch (error) { alert(error instanceof Error ? error.message : "Image insertion failed."); return; }
    } else if (mode === "attached") {
      editor
        .chain()
        .focus()
        .insertContent(
          `<span class="attachment-ref" data-att-id="${escAttr(item.id)}">[See Attachments]</span>&nbsp;`
        )
        .run();
    }
    // pack_only is a no-op (intentional)
    onOpenChange(false);
  };

  return (
    <Popover open={open} onOpenChange={onOpenChange}>
      <PopoverTrigger asChild>{trigger}</PopoverTrigger>
      <PopoverContent
        align="end"
        className="w-[340px] p-0 overflow-hidden"
        onOpenAutoFocus={(e) => e.preventDefault()}
      >
        <div className="px-3 py-2.5 border-b border-[var(--ds-line-2)] bg-[var(--ds-surface-2)]">
          <p className="text-[12px] font-semibold text-[var(--ds-ink)] tracking-tight">
            Insert evidence
          </p>
          <p className="text-[10.5px] text-[var(--ds-muted)] leading-snug mt-0.5">
            Figures get a <span className="font-medium text-[var(--ds-ink)]">[See Fig&nbsp;N]</span>{" "}
            reference at the cursor + appear on an Exhibits page at the end of the letter.
          </p>
        </div>

        <div className="max-h-[320px] overflow-y-auto py-1">
          {items.length === 0 ? (
            <p className="text-[11px] text-[var(--ds-muted)] text-center py-6 px-4">
              No evidence yet. Add some on the Evidence & Attachments page.
            </p>
          ) : (
            items.map((item) => {
              const Icon = KIND_ICON[item.kind];
              const mode = displayModeOf(item);
              const label = figureLabelFor(item, items);
              const isInserted = insertedMap.has(item.id);
              const insertedSection = insertedMap.get(item.id)?.sectionTitle;
              const size =
                formatBytes(
                  (item as { fileSize?: number }).fileSize ??
                    estimateDataUrlBytes(item.fileDataUrl)
                );
              const kindLabel =
                item.kind === "email" ? "Email" :
                item.kind === "calendar" ? "Calendar" :
                item.kind === "document" ? "Document" :
                item.kind === "screenshot" ? "Screenshot" :
                "Note";
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => insert(item)}
                  disabled={mode === "pack_only"}
                  className="flex w-full items-start gap-2.5 px-3 py-2.5 text-left text-[12px] hover:bg-[var(--ds-line-2)] disabled:opacity-50 disabled:cursor-not-allowed transition group"
                  title={
                    mode === "pack_only"
                      ? "Pack-only items aren't inserted into the letter"
                      : isInserted
                      ? `Already inserted in §${insertedSection} — re-insert at cursor`
                      : `Insert at cursor as ${label || mode}`
                  }
                >
                  <div className="shrink-0 size-7 rounded-md bg-[var(--ds-amber-bg)] text-[var(--ds-amber-fg)] grid place-items-center">
                    <Icon className="size-3.5" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="font-medium text-[var(--ds-ink)] truncate">
                      {item.filename || `${kindLabel} item`}
                    </div>
                    <div className="text-[10.5px] text-[var(--ds-muted)] truncate mt-0.5">
                      {kindLabel}
                      {size ? ` · ${size}` : ""}
                      {isInserted && insertedSection ? ` · in §${insertedSection}` : ""}
                    </div>
                  </div>
                  <div className="shrink-0">
                    {isInserted ? (
                      <span className="inline-flex items-center gap-0.5 rounded-full bg-emerald-100 text-emerald-700 px-1.5 py-0.5 text-[9.5px] font-bold uppercase tracking-[0.04em]">
                        <Check className="size-2.5" strokeWidth={3} />
                        {label || mode}
                      </span>
                    ) : (
                      <span className="inline-flex rounded-full bg-[var(--ds-amber-bg)] text-[var(--ds-amber-fg)] px-1.5 py-0.5 text-[9.5px] font-bold uppercase tracking-[0.04em]">
                        {label || (mode === "inline" ? "Inline" : mode === "attached" ? "Att" : "Pack")}
                      </span>
                    )}
                  </div>
                </button>
              );
            })
          )}
        </div>

        {/* "See all evidence" overflow into the dedicated drawer. Was gated at
         * 5+ items; lowered to 1+ so users with even a small library can use
         * the richer browse/search/filter UX rather than being trapped in the
         * compact popover. */}
        {onOpenDrawer && items.length >= 1 && (
          <button
            type="button"
            onClick={() => {
              onOpenChange(false);
              onOpenDrawer();
            }}
            className="flex items-center justify-center gap-1.5 w-full px-3 py-2 text-[11px] font-semibold text-[var(--ds-ink)] hover:bg-[var(--ds-line-2)] border-t border-[var(--ds-line-2)]"
          >
            Browse all evidence
            <ArrowRight className="size-3" />
          </button>
        )}
        <Link
          to={`/editor/${draft.id}/evidence`}
          className="flex items-center justify-center gap-1.5 px-3 py-2 text-[11px] text-[var(--ds-muted)] hover:text-[var(--ds-ink)] hover:bg-[var(--ds-line-2)] border-t border-[var(--ds-line-2)]"
          onClick={() => onOpenChange(false)}
        >
          <Plus className="size-3" /> Manage evidence
        </Link>
      </PopoverContent>
    </Popover>
  );
}

/**
 * Build the HTML to drop into a section when an item is "inline" mode.
 * Image items embed the image directly. Notes / emails come in as a
 * blockquote with kind + filename as attribution. Documents get a
 * stub sentence since we can't render binary docs inline — the actual
 * file is in the ZIP.
 */
function escHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function escAttr(s: string): string {
  return escHtml(s);
}
