import type { Editor } from "@tiptap/react";
import type { Draft, EvidenceItem } from "@/lib/letters/types";
import { displayModeOf, figureLabelFor } from "@/lib/evidence";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { FileText, Mail, NotebookText, Image as ImageIcon, CalendarDays, Plus } from "lucide-react";
import { Link } from "react-router-dom";
import { isSafeImageDataUrl } from "@/lib/safe-data-url";

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
}: {
  draft: Draft;
  editor: Editor;
  open: boolean;
  onOpenChange: (next: boolean) => void;
  trigger: React.ReactNode;
}) {
  const items = draft.evidence ?? [];

  const insert = (item: EvidenceItem) => {
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
      editor.chain().focus().insertContent(buildInlineHtml(item)).run();
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
        className="w-[360px] p-0 overflow-hidden"
        onOpenAutoFocus={(e) => e.preventDefault()}
      >
        <div className="px-3 py-2 border-b border-[var(--ds-line-2)]">
          <p className="text-[12px] font-medium text-[var(--ds-ink)]">
            Insert evidence at cursor
          </p>
          <p className="text-[10.5px] text-[var(--ds-muted)] leading-snug mt-0.5">
            Figures get a [See Fig N] reference. Inline items embed directly.
          </p>
        </div>

        <div className="max-h-[280px] overflow-y-auto">
          {items.length === 0 ? (
            <p className="text-[11px] text-[var(--ds-muted)] text-center py-6 px-4">
              No evidence yet. Add some on the Evidence & Attachments page.
            </p>
          ) : (
            items.map((item) => {
              const Icon = KIND_ICON[item.kind];
              const mode = displayModeOf(item);
              const label = figureLabelFor(item, items);
              const modeLabel =
                mode === "figure"
                  ? label || "Figure"
                  : mode === "inline"
                  ? "Inline"
                  : mode === "attached"
                  ? "Attachment"
                  : "Pack only";
              const modeColour =
                mode === "figure"
                  ? "bg-[var(--ds-blue-bg)] text-[var(--ds-blue-fg)]"
                  : mode === "inline"
                  ? "bg-[var(--ds-violet-bg)] text-[var(--ds-violet-fg)]"
                  : mode === "attached"
                  ? "bg-[var(--ds-amber-bg)] text-[var(--ds-amber-fg)]"
                  : "bg-[var(--ds-line-2)] text-[var(--ds-muted)]";
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => insert(item)}
                  disabled={mode === "pack_only"}
                  className="flex w-full items-start gap-2 px-3 py-2 text-left text-[12px] hover:bg-[var(--ds-line-2)] disabled:opacity-50 disabled:cursor-not-allowed transition"
                  title={
                    mode === "pack_only"
                      ? "Pack-only items aren't inserted into the letter"
                      : `Insert at cursor: ${modeLabel}`
                  }
                >
                  <Icon className="size-3.5 mt-0.5 text-[var(--ds-muted)] shrink-0" />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5">
                      <span className="font-medium text-[var(--ds-ink)] truncate">
                        {item.filename || item.kind}
                      </span>
                      <span
                        className={
                          "shrink-0 inline-block text-[9.5px] uppercase tracking-[0.04em] font-semibold px-1.5 py-0.5 rounded-full " +
                          modeColour
                        }
                      >
                        {modeLabel}
                      </span>
                    </div>
                    {item.content && (
                      <div className="text-[11px] text-[var(--ds-muted)] line-clamp-2 mt-0.5">
                        {item.content}
                      </div>
                    )}
                  </div>
                </button>
              );
            })
          )}
        </div>

        <Link
          to={`/editor/${draft.id}/evidence`}
          className="flex items-center justify-center gap-1.5 px-3 py-2 text-[11px] text-[var(--ds-muted)] hover:text-[var(--ds-ink)] hover:bg-[var(--ds-line-2)] border-t border-[var(--ds-line-2)]"
          onClick={() => onOpenChange(false)}
        >
          <Plus className="size-3" /> Add or edit evidence
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
function buildInlineHtml(item: EvidenceItem): string {
  const caption = item.filename
    ? ` (${escHtml(item.filename)})`
    : "";
  if (item.kind === "screenshot" && isSafeImageDataUrl(item.fileDataUrl)) {
    return `<figure><img src="${escAttr(item.fileDataUrl)}" alt="${escAttr(item.filename || "screenshot")}" />${
      item.content
        ? `<figcaption>${escHtml(item.content)}</figcaption>`
        : item.filename
        ? `<figcaption>${escHtml(item.filename)}</figcaption>`
        : ""
    }</figure>`;
  }
  if (item.kind === "note" || item.kind === "email" || item.kind === "calendar") {
    const text = item.content || item.filename || "Evidence";
    const kindLabel =
      item.kind === "email" ? "Email" : item.kind === "calendar" ? "Calendar entry" : "Note";
    return `<blockquote>${escHtml(text)}<br/><em>— ${kindLabel}${caption}</em></blockquote>`;
  }
  // Documents (no inline render possible)
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

function escAttr(s: string): string {
  return escHtml(s);
}
