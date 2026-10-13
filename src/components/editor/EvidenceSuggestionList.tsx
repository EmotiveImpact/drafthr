import { forwardRef, useEffect, useImperativeHandle, useState } from "react";
import {
  FileText,
  Mail,
  NotebookText,
  Image as ImageIcon,
  CalendarDays,
} from "lucide-react";
import type { EvidenceItem } from "@/lib/letters/types";
import { displayModeOf, figureLabelFor } from "@/lib/evidence";

const KIND_ICON: Record<EvidenceItem["kind"], typeof FileText> = {
  email: Mail,
  calendar: CalendarDays,
  document: FileText,
  screenshot: ImageIcon,
  note: NotebookText,
};

const KIND_LABEL: Record<EvidenceItem["kind"], string> = {
  email: "Email",
  calendar: "Calendar",
  document: "Document",
  screenshot: "Screenshot",
  note: "Note",
};

export type EvidenceSuggestionItem = {
  /** The evidence row */
  item: EvidenceItem;
  /** Pre-computed "Fig N" / user-override label, or empty for non-figure modes. */
  label: string;
};

export type EvidenceSuggestionListProps = {
  /** Filtered items the menu should show (in display order). */
  items: EvidenceSuggestionItem[];
  /**
   * Called when the user picks an item (Enter or click). The extension's
   * suggestion plugin handles the actual editor mutation; this just hands
   * the choice back.
   */
  command: (entry: EvidenceSuggestionItem) => void;
};

export type EvidenceSuggestionListHandle = {
  /**
   * Forwarded from the ProseMirror plugin's handleKeyDown. Returns true if
   * the key was consumed by the menu (so the editor should NOT also act on it).
   */
  onKeyDown: (e: { event: KeyboardEvent }) => boolean;
};

/**
 * The popover UI for the `/` slash-command evidence picker (Pattern C).
 *
 * The component is purely presentational: filtering happens in the
 * extension (which knows about the current draft); we receive the
 * pre-filtered list as a prop. Keyboard navigation state lives here so
 * that ↑/↓/Enter feel native to a popover, but the actual editor mutation
 * is invoked via the `command` callback so the extension can clean up
 * the slash-query range before inserting the figure-ref HTML.
 */
export const EvidenceSuggestionList = forwardRef<
  EvidenceSuggestionListHandle,
  EvidenceSuggestionListProps
>(function EvidenceSuggestionList({ items, command }, ref) {
  const [focusedIndex, setFocusedIndex] = useState(0);

  // Reset focus when the filtered list changes (e.g. user types more
  // characters and the result set shrinks). Clamping prevents the
  // focused row from pointing past the end of the new list.
  useEffect(() => {
    setFocusedIndex((prev) => (prev >= items.length ? 0 : prev));
  }, [items]);

  const selectIndex = (index: number) => {
    const entry = items[index];
    if (!entry) return;
    command(entry);
  };

  useImperativeHandle(
    ref,
    () => ({
      onKeyDown: ({ event }) => {
        if (event.key === "ArrowUp") {
          setFocusedIndex((prev) =>
            items.length === 0 ? 0 : (prev - 1 + items.length) % items.length,
          );
          return true;
        }
        if (event.key === "ArrowDown") {
          setFocusedIndex((prev) =>
            items.length === 0 ? 0 : (prev + 1) % items.length,
          );
          return true;
        }
        if (event.key === "Enter") {
          if (items.length === 0) return false;
          selectIndex(focusedIndex);
          return true;
        }
        return false;
      },
    }),
    // selectIndex closes over items + focusedIndex via the closure above,
    // so the dependencies must mirror those.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [items, focusedIndex],
  );

  return (
    <div
      role="listbox"
      aria-label="Insert evidence"
      className="w-[280px] rounded-[10px] border border-[var(--ds-line-2)] bg-white p-1.5 shadow-[0_12px_32px_-8px_rgba(0,0,0,0.15)]"
      style={{ fontFamily: "Inter, ui-sans-serif, system-ui, sans-serif" }}
    >
      <div className="px-2.5 py-1.5 text-[10px] font-bold uppercase tracking-[0.07em] text-[var(--ds-muted)]">
        {items.length === 0
          ? "Evidence: no matches"
          : `Evidence: ${items.length} item${items.length === 1 ? "" : "s"} match`}
      </div>

      {items.length === 0 ? (
        <div className="px-2.5 py-3 text-[11px] text-[var(--ds-muted)]">
          No evidence matches your query. Add some on the Evidence &amp;
          Attachments page.
        </div>
      ) : (
        items.map((entry, index) => {
          const { item, label } = entry;
          const Icon = KIND_ICON[item.kind];
          const isFocused = index === focusedIndex;
          const mode = displayModeOf(item);
          const insertHint =
            mode === "figure" && label
              ? `would insert [See ${label}]`
              : mode === "inline"
                ? "would embed inline"
                : mode === "attached"
                  ? "would insert [See Attachments]"
                  : "pack only";
          return (
            <button
              type="button"
              key={item.id}
              role="option"
              aria-selected={isFocused}
              onMouseDown={(e) => {
                // Use mousedown so the editor doesn't lose focus before
                // the command runs.
                e.preventDefault();
                selectIndex(index);
              }}
              onMouseEnter={() => setFocusedIndex(index)}
              className={
                "flex w-full items-center gap-2.5 rounded-md px-2.5 py-2 text-left transition " +
                (isFocused
                  ? "bg-[var(--ds-blue-bg)]"
                  : "hover:bg-[var(--ds-blue-bg)]")
              }
            >
              <span className="grid size-6 shrink-0 place-items-center rounded-[5px] bg-[var(--ds-amber-bg)] text-[var(--ds-amber-fg)]">
                <Icon className="size-3" />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[12px] font-semibold text-[var(--ds-ink)]">
                  {item.filename || KIND_LABEL[item.kind]}
                </span>
                <span className="block truncate text-[10.5px] text-[var(--ds-muted)]">
                  {KIND_LABEL[item.kind]}
                  {mode === "figure" && label ? (
                    <>
                      {" · would insert "}
                      <strong className="font-semibold text-[var(--ds-ink)]">
                        [See {label}]
                      </strong>
                    </>
                  ) : (
                    ` · ${insertHint}`
                  )}
                </span>
              </span>
              {isFocused && (
                <span className="shrink-0 rounded-[3px] bg-[var(--ds-line-2)] px-1.5 py-px font-mono text-[10px] font-semibold text-[var(--ds-muted)]">
                  ↵
                </span>
              )}
            </button>
          );
        })
      )}
    </div>
  );
});

/**
 * Pure filter helper exported so the extension can use the same matching
 * rules as the UI expects. Matches against filename, content, kind, and
 * (for figure-mode items) the resolved figure label, all case-insensitive.
 *
 * An empty query returns every item (so the user sees the full list the
 * moment they type just "/").
 */
export function filterEvidenceForSlashQuery(
  allEvidence: EvidenceItem[],
  query: string,
): EvidenceSuggestionItem[] {
  const q = query.trim().toLowerCase();
  return allEvidence
    .map<EvidenceSuggestionItem>((item) => ({
      item,
      label: figureLabelFor(item, allEvidence),
    }))
    .filter(({ item, label }) => {
      if (!q) return true;
      const haystack = [
        item.filename ?? "",
        item.content ?? "",
        item.kind,
        KIND_LABEL[item.kind],
        label,
      ]
        .join(" ")
        .toLowerCase();
      return haystack.includes(q);
    });
}
