import { useEffect, useRef, useState } from "react";
import type { Draft } from "@/lib/letters/types";
import { useDraftStore } from "@/lib/store";
import { getLetterMeta } from "@/lib/letters/catalog";

/**
 * Editable letter-title bar that sits between the editor topbar and the
 * 3-column body. Click the title → text input opens with the value
 * pre-selected; blur or Enter saves; Esc cancels.
 *
 * Source-of-truth precedence:
 *   draft.title (user override)  →  letter-type meta title (fallback)
 *
 * Clearing the input restores the meta title automatically (the store
 * persists an empty override as undefined).
 *
 * Recipient + jurisdiction display alongside the title as muted submeta
 * — same info that used to live in the now-deleted topbar title block,
 * but now on its own row where the title can breathe and be edited.
 */
export function EditableTitleBar({ draft }: { draft: Draft }) {
  const setTitle = useDraftStore((s) => s.setDraftTitle);
  const meta = getLetterMeta(draft.letterType);
  const fallback = meta.title;
  const displayTitle = draft.title?.trim() || fallback;

  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(displayTitle);
  const inputRef = useRef<HTMLInputElement>(null);

  // Keep the input in sync if the underlying title changes while not
  // editing (e.g. after a regenerate-all that updates draft state).
  useEffect(() => {
    if (!editing) setValue(displayTitle);
  }, [displayTitle, editing]);

  // Auto-focus + select-all when entering edit mode.
  useEffect(() => {
    if (editing) {
      requestAnimationFrame(() => {
        inputRef.current?.focus();
        inputRef.current?.select();
      });
    }
  }, [editing]);

  const commit = () => {
    const next = value.trim();
    if (next === fallback) {
      setTitle(draft.id, "");
    } else if (next !== (draft.title ?? "")) {
      setTitle(draft.id, next);
    }
    setEditing(false);
  };

  const cancel = () => {
    setValue(displayTitle);
    setEditing(false);
  };

  const recipientLabel =
    draft.mode === "employer"
      ? draft.employee.legalName?.trim()
      : draft.employer.legalName?.trim();

  return (
    <div className="shrink-0 border-b border-[var(--ds-line-2)] bg-[var(--ds-surface)] px-4 sm:px-6 py-2 flex items-center gap-3 min-w-0">
      {editing ? (
        <input
          ref={inputRef}
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onBlur={commit}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              commit();
            } else if (e.key === "Escape") {
              e.preventDefault();
              cancel();
            }
          }}
          aria-label="Letter title"
          placeholder={fallback}
          className="flex-1 min-w-0 text-[15px] font-semibold text-[var(--ds-ink)] bg-transparent border-b border-[var(--ds-ink)] focus:outline-none px-0 py-0"
        />
      ) : (
        <button
          type="button"
          onClick={() => setEditing(true)}
          className="flex-1 min-w-0 text-left text-[15px] font-semibold text-[var(--ds-ink)] hover:text-[var(--ds-muted)] truncate transition"
          title="Click to rename"
          aria-label={`Letter title: ${displayTitle}. Click to rename.`}
        >
          {displayTitle}
          {!draft.title && (
            <span className="ml-2 text-[10px] font-normal text-[var(--ds-muted)] uppercase tracking-[0.08em]">
              auto
            </span>
          )}
        </button>
      )}

      {/* Recipient + jurisdiction submeta — only visible on md+ to keep
       * the bar one line on mobile. */}
      {(recipientLabel || draft.context.jurisdiction) && (
        <span className="hidden md:inline shrink-0 text-[12px] text-[var(--ds-muted)] truncate">
          {recipientLabel && <>· {recipientLabel}</>}
          {draft.context.jurisdiction && <> · {draft.context.jurisdiction}</>}
        </span>
      )}
    </div>
  );
}
