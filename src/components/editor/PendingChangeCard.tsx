import type { Section } from "@/lib/letters/types";
import { sanitizeLetterHtml } from "@/lib/sanitize";
import { Check, X } from "lucide-react";
import { Avatar } from "@/components/ds";

/**
 * "Side by side" view of a proposed change (5A styling). Renders above a
 * section when section.pendingChange is set in card mode: who proposed it,
 * why, the current text against the proposed text, and Reject / Accept.
 *
 * Word-level diff would be nicer but pulls in diff-match-patch (60 KB).
 * For v1 we render before / after side-by-side (stacked on narrow
 * viewports): same info, simpler implementation.
 */
export function PendingChangeCard({
  section,
  onAccept,
  onReject,
  canResolve = true,
}: {
  section: Section;
  onAccept: () => void;
  onReject: () => void;
  /** Whether the viewer may Accept/Reject. False for a reviewer in read-only
   *  review-lock (they can suggest, but only the author resolves). */
  canResolve?: boolean;
}) {
  const pending = section.pendingChange;
  if (!pending) return null;

  // A collaborator's suggestion (authorName present) shows their avatar and
  // name; DraftHR's own proposals show the black D tile.
  const human = Boolean(pending.authorName);
  const seed = pending.authorId ?? pending.authorName ?? "";

  return (
    <div className="my-2 overflow-hidden rounded-[var(--ds-r-m)] bg-[var(--ds-surface-2)] font-sans">
      <header className="flex flex-wrap items-center justify-between gap-2 px-3.5 pb-2 pt-3">
        <div className="flex min-w-0 items-center gap-[7px] text-[13px] text-[var(--ds-muted)]">
          {human ? (
            <Avatar seed={seed} name={pending.authorName} size="sm" />
          ) : (
            <span
              aria-hidden
              className="grid size-4 shrink-0 place-items-center rounded-[4px] bg-[var(--ds-accent)] text-[10px] font-bold leading-none text-[var(--ds-on-accent)]"
            >
              D
            </span>
          )}
          <span className="truncate">
            <b className="font-medium text-[var(--ds-ink)]">{human ? pending.authorName : "DraftHR"}</b>{" "}
            {human ? "suggests a change" : "proposed a change"}
          </span>
        </div>
        {canResolve ? (
          <div className="flex shrink-0 items-center gap-1.5">
            <button
              type="button"
              onClick={onReject}
              className="inline-flex h-7 items-center gap-1 rounded-[var(--ds-r-s)] bg-[var(--ds-surface)] px-2.5 text-[12.5px] font-medium text-[var(--ds-ink)] hover:bg-[var(--ds-surface-3)]"
              title="Reject the proposal and keep the current text"
            >
              <X className="size-3.5 opacity-60" />
              Reject
            </button>
            <button
              type="button"
              onClick={onAccept}
              className="inline-flex h-7 items-center gap-1 rounded-[var(--ds-r-s)] bg-[var(--ds-accent)] px-2.5 text-[12.5px] font-medium text-[var(--ds-on-accent)] hover:bg-[var(--ds-accent-hover)]"
              title="Accept the proposal and replace the current text"
            >
              <Check className="size-3.5 opacity-70" />
              Accept
            </button>
          </div>
        ) : (
          <span className="shrink-0 text-[12px] text-[var(--ds-muted)]">Awaiting the author</span>
        )}
      </header>
      {pending.instruction && (
        <p className="m-0 px-3.5 pb-2 text-[12.5px] leading-[1.5] text-[var(--ds-body)]">
          <span className="text-[var(--ds-muted)]">Justification:</span> {pending.instruction}
        </p>
      )}

      <div className="grid grid-cols-1 gap-px border-t border-[var(--ds-line)] bg-[var(--ds-line)] md:grid-cols-2">
        <DiffPane label="Before" tone="rem" html={section.html} />
        <DiffPane label="After" tone="add" html={pending.proposedHtml} />
      </div>
    </div>
  );
}

function DiffPane({
  label,
  tone,
  html,
}: {
  label: string;
  tone: "rem" | "add";
  html: string;
}) {
  return (
    <div className="bg-[var(--ds-surface)] p-3.5">
      <p className="m-0 mb-1.5 text-[11.5px] font-medium text-[var(--ds-muted)]">{label}</p>
      <div
        className={
          "prose prose-sm max-w-none font-serif font-normal tracking-normal text-[13.5px] leading-relaxed [&_p]:my-2 [&_strong]:font-semibold [&_img]:h-auto [&_img]:max-w-[120px] " +
          (tone === "rem"
            ? "text-[var(--ds-faint)] [&_*]:text-[var(--ds-faint)]"
            : "text-[var(--ds-blue-fg)] [&_*]:text-[var(--ds-blue-fg)]")
        }
        dangerouslySetInnerHTML={{ __html: sanitizeLetterHtml(html) }}
      />
    </div>
  );
}
