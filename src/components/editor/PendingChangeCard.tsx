import type { Section } from "@/lib/letters/types";
import { sanitizeLetterHtml } from "@/lib/sanitize";
import { Check, X, Sparkles } from "lucide-react";

/**
 * Cursor-style "AI proposed a change" card. Renders above a section
 * when section.pendingChange is set. Shows the proposed new text + the
 * old text the user can compare against, plus Accept / Reject controls.
 *
 * Word-level diff would be nicer but pulls in diff-match-patch (60 KB).
 * For v1 we render before / after side-by-side (or stacked on narrow
 * viewports) — same info, simpler implementation.
 */
export function PendingChangeCard({
  section,
  onAccept,
  onReject,
}: {
  section: Section;
  onAccept: () => void;
  onReject: () => void;
}) {
  const pending = section.pendingChange;
  if (!pending) return null;

  return (
    <div className="border-2 border-[var(--ds-amber-fg)]/40 bg-[var(--ds-amber-bg)]/40 rounded-lg overflow-hidden my-3">
      <header className="flex items-center justify-between gap-2 px-3 py-2 border-b border-[var(--ds-amber-fg)]/30 bg-[var(--ds-amber-bg)]">
        <div className="flex items-center gap-2 min-w-0">
          <Sparkles className="size-3.5 text-[var(--ds-amber-fg)] shrink-0" />
          <span className="text-[11.5px] font-semibold text-[var(--ds-amber-fg)] uppercase tracking-[0.06em]">
            AI proposed a change
          </span>
          <span className="text-[11px] text-[var(--ds-muted)] truncate">
            · {pending.instruction}
          </span>
        </div>
        <div className="flex items-center gap-1 shrink-0">
          <button
            type="button"
            onClick={onReject}
            className="inline-flex items-center gap-1 text-[11.5px] px-2 h-7 rounded-md border border-[var(--ds-line)] bg-white text-[var(--ds-body)] hover:bg-[var(--ds-line-2)]"
            title="Reject the proposal — keep the current text"
          >
            <X className="size-3" />
            Reject
          </button>
          <button
            type="button"
            onClick={onAccept}
            className="inline-flex items-center gap-1 text-[11.5px] px-2 h-7 rounded-md bg-[var(--ds-green-fg)] text-white hover:brightness-110"
            title="Accept the proposal — replace the current text"
          >
            <Check className="size-3" />
            Accept
          </button>
        </div>
      </header>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-0 divide-x divide-[var(--ds-amber-fg)]/20">
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
    <div
      className={
        "p-3 " +
        (tone === "rem" ? "bg-[var(--ds-red-bg)]/30" : "bg-[var(--ds-green-bg)]/30")
      }
    >
      <p
        className={
          "text-[10px] font-semibold uppercase tracking-[0.08em] mb-1.5 " +
          (tone === "rem" ? "text-[var(--ds-red-fg)]" : "text-[var(--ds-green-fg)]")
        }
      >
        {label}
      </p>
      <div
        className="prose prose-sm max-w-none [&_p]:my-2 [&_strong]:font-semibold text-[13px] leading-relaxed [&_img]:max-w-[120px] [&_img]:h-auto"
        dangerouslySetInnerHTML={{ __html: sanitizeLetterHtml(html) }}
      />
    </div>
  );
}
