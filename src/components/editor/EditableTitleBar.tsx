import { useEffect, useRef, useState } from "react";
import type { Draft } from "@/lib/letters/types";
import { useDraftStore } from "@/lib/store";
import { cn } from "@/lib/utils";
import { displayTitleFor, recipientNameFor, letterTypeLabelFor, hasCustomTitle, briefTitleFor } from "@/lib/letters/display";

/**
 * Editable letter title that sits at the TOP of the canvas content
 * (above the disclaimer + sections). Renders as a large heading you
 * click to rename — Google Docs / Notion pattern. Blur or Enter saves;
 * Esc cancels.
 *
 * Source-of-truth precedence:
 *   draft.title (user override)  →  letter-type meta title (fallback)
 *
 * Clearing the input restores the meta title automatically (the store
 * persists an empty override as undefined).
 *
 * Recipient + jurisdiction display below the title as muted submeta —
 * same info that used to live in the now-deleted topbar title block.
 */
export function EditableTitleBar({
  draft,
  variant = "canvas",
  stack,
}: {
  draft: Draft;
  /** "canvas" (default): the large heading above the sections.
   * "bar": the document bar's letter name (15px medium), a faint dot and
   * the employee's name in grey (mock f1). Click the name to rename.
   * "phone": the phone top bar's name in serif 20px (mock phone-letter). */
  variant?: "canvas" | "bar" | "phone";
  /** "bar" only: true puts the employee under the name, false keeps them on
   * one row. Left out, the bar's width decides (container query). */
  stack?: boolean;
}) {
  const setTitle = useDraftStore((s) => s.setDraftTitle);
  // Auto-composed default = "Letter type · Recipient name", reused
  // verywhere via displayTitleFor() so the rename input shows the
  // exact same string the user sees on Home / sidebar / matters.
  const autoTitle = displayTitleFor({ ...draft, title: undefined });
  const displayTitle = displayTitleFor(draft);
  const isCustom = hasCustomTitle(draft);

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
    // If the user types exactly the auto-composed default, treat that
    // as "no override" so the title stays auto-tracking (recipient
    // changes will keep flowing through).
    if (next === autoTitle || !next) {
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

  const recipientLabel = recipientNameFor(draft);
  // When the user sets a custom title, show the auto-composed identity
  // as the submeta line so they can still see "what kind of letter,
  // for whom" at a glance even after renaming.
  const subline = isCustom
    ? autoTitle
    : [recipientLabel, draft.context.jurisdiction].filter(Boolean).join(" · ");

  if (variant === "bar" || variant === "phone") {
    const phone = variant === "phone";
    // The bar shows the letter's own name (the rename or the letter type)
    // and the employee separately, rather than the composed "Type ·
    // Recipient" string twice.
    // The short sentence-case name the Letters list, Home and Approvals use
    // ("Warning letter", "Pay rise"), so a letter has one name everywhere.
    const barTitle = isCustom ? displayTitle : briefTitleFor(draft) || displayTitle;
    return (
      // Room for both: one row, "Name · Employee". A narrow bar stacks the
      // employee under the name in small grey, so neither is cut short.
      <div
        className={
          phone
            ? "flex min-w-0 items-center gap-1.5"
            : stack === undefined
              ? "flex min-w-0 flex-col items-start @min-[780px]:flex-row @min-[780px]:items-center @min-[780px]:gap-1.5"
              : stack
                ? "flex min-w-0 flex-col items-start"
                : "flex min-w-0 flex-row items-center gap-1.5"
        }
      >
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
            placeholder={autoTitle}
            className={
              phone
                ? "h-8 w-full min-w-0 rounded-[8px] border border-[var(--ds-line-strong)] bg-[var(--ds-surface)] px-2 font-serif text-[18px] text-[var(--ds-ink)] outline-none placeholder:text-[var(--ds-muted)]"
                : "h-8 w-full min-w-0 max-w-[460px] rounded-[7px] border border-[var(--ds-line-strong)] bg-[var(--ds-surface)] px-2 text-[15px] font-medium text-[var(--ds-ink)] outline-none placeholder:text-[var(--ds-muted)]"
            }
          />
        ) : (
          <button
            type="button"
            onClick={() => setEditing(true)}
            className={
              phone
                ? "min-w-0 truncate rounded-[6px] text-left font-serif text-[20px] leading-[1.25] tracking-[-0.01em] text-[var(--ds-ink)] focus-visible:outline-none focus-visible:shadow-[var(--ds-focus-ring)]"
                : cn(
                    "max-w-full min-w-0 shrink truncate rounded-[6px] px-1 text-left text-[15px] font-medium leading-[20px] text-[var(--ds-ink)] transition-colors duration-[120ms] hover:bg-[var(--ds-hover)] focus-visible:outline-none focus-visible:shadow-[var(--ds-focus-ring)]",
                    stack === undefined ? "@min-[780px]:py-0.5" : !stack && "py-0.5"
                  )
            }
            title={subline ? `${displayTitle}. ${subline}. Click to rename.` : "Click to rename"}
            aria-label={`Letter title: ${displayTitle}. Click to rename.`}
          >
            {barTitle}
          </button>
        )}
        {!editing && !phone && recipientLabel && (
          <>
            {/* The employee shows when the bar has room for the whole name
             * (container query on the document bar); never cut to "· .". */}
            <span
              aria-hidden
              className={cn("shrink-0 text-[15px] text-[var(--ds-faint)]", stack === undefined ? "hidden @min-[780px]:inline" : stack ? "hidden" : "inline")}
            >
              ·
            </span>
            <span
              data-bar-employee
              className={cn(
                "max-w-full truncate whitespace-nowrap text-[var(--ds-muted)]",
                stack === undefined
                  ? "px-1 text-[12.5px] leading-[16px] @min-[780px]:min-w-[72px] @min-[780px]:shrink-[3] @min-[780px]:px-0 @min-[780px]:text-[15px] @min-[780px]:leading-normal"
                  : stack
                    ? "px-1 text-[12.5px] leading-[16px]"
                    : "min-w-[72px] shrink-[3] text-[15px] leading-normal"
              )}
            >
              {recipientLabel}
            </span>
          </>
        )}
      </div>
    );
  }

  return (
    <div className="pb-1">
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
          placeholder={autoTitle}
          className="w-full text-[28px] sm:text-[32px] font-semibold tracking-[-0.01em] text-[var(--ds-ink)] bg-transparent border-0 focus:outline-none focus:ring-0 px-0 py-1 leading-tight placeholder:text-[var(--ds-muted)]"
        />
      ) : (
        <button
          type="button"
          onClick={() => setEditing(true)}
          className="w-full text-left text-[28px] sm:text-[32px] font-semibold tracking-[-0.01em] text-[var(--ds-ink)] hover:text-[var(--ds-body)] truncate transition py-1 leading-tight group"
          title={isCustom ? `Click to rename · ${letterTypeLabelFor(draft)}` : "Click to rename"}
          aria-label={`Letter title: ${displayTitle}. Click to rename.`}
        >
          <span>{displayTitle}</span>
          <span className="ml-2 align-middle text-[11px] font-normal text-[var(--ds-muted)] opacity-0 group-hover:opacity-100 transition">
            Click to rename
          </span>
        </button>
      )}

      {/* Submeta line:
       *   - When the user has a custom title: show the auto-composed
       *     identity so the user still sees "what kind / for whom".
       *   - Otherwise: just the recipient + jurisdiction (the auto-title
       *     already encodes those above). */}
      {subline && (
        <p className="m-0 text-[12px] text-[var(--ds-muted)] truncate">
          {subline}
        </p>
      )}
    </div>
  );
}
