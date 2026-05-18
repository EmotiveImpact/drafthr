import { useMemo } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { X } from "lucide-react";
import { useDraftStore } from "@/lib/store";
import { letterBodyHtml } from "@/lib/export/pdf";
import { getLetterMeta } from "@/lib/letters/catalog";
import type { Draft } from "@/lib/letters/types";

/**
 * Mobile read-only view — `/m/:draftId`.
 *
 * Persona D ("HR Director reads on the bus"): open a draft on a phone,
 * read it cleanly, no chrome. This route is the mobile counterpart to
 * `/editor/:draftId` — it renders the same letter body as the PDF export
 * pipeline (`letterBodyHtml`) inside a full-bleed scroll container.
 *
 * Constraints:
 *  - Auth required (mounted under <Protected> in App.tsx).
 *  - Tenant scoping comes for free: useDraftStore is per-browser local
 *    storage, so a draft from a different tenant is simply not in the
 *    store and renders as "Draft not found".
 *  - No editing affordances. The HTML is sanitised by letterBodyHtml
 *    (per-section sanitizeLetterHtmlForExport + sanitizeLetterHtml on the
 *    disclaimer). contentEditable is never set.
 *  - Light theme only — Section B of SUNDAY.md locks dark mode off.
 */
export function MobileReadView() {
  const { draftId } = useParams<{ draftId: string }>();
  const navigate = useNavigate();
  const draft = useDraftStore((s) => (draftId ? s.drafts[draftId] : undefined));

  const bodyHtml = useMemo(() => (draft ? letterBodyHtml(draft) : ""), [draft]);
  const meta = draft ? getLetterMeta(draft.letterType) : null;
  const title = draft?.title || meta?.title || "Untitled letter";
  const statusLabel = draft ? statusLabelFor(draft) : "";

  if (!draft) {
    return (
      <div
        data-testid="mobile-read-view"
        className="fixed inset-0 z-50 bg-[var(--ds-canvas)] overflow-y-auto"
      >
        <div className="mx-auto max-w-md px-6 py-16 text-center">
          <h1 className="text-base font-medium text-[var(--ds-ink)]">
            Draft not found
          </h1>
          <p className="mt-2 text-sm text-[var(--ds-muted)]">
            This letter isn&rsquo;t available on this device, or it belongs to a
            different workspace.
          </p>
          <p className="mt-6 text-sm">
            <Link
              to="/sign-in"
              className="text-[var(--ds-ink)] underline underline-offset-4"
            >
              Sign in to view
            </Link>
          </p>
        </div>
      </div>
    );
  }

  return (
    <div
      data-testid="mobile-read-view"
      className="fixed inset-0 z-50 bg-[var(--ds-canvas)] overflow-y-auto"
    >
      {/* Top status pill — read-only meta strip. Title + draft status. */}
      <div
        className="sticky top-0 z-10 flex items-center gap-2 px-4 py-3 border-b border-[var(--ds-line)] bg-[var(--ds-surface)]/95 backdrop-blur"
        data-testid="mobile-read-header"
      >
        <span
          className={
            "inline-flex items-center text-[10px] font-medium uppercase tracking-wide px-1.5 py-0.5 rounded-full " +
            statusPillClasses(statusLabel)
          }
        >
          {statusLabel}
        </span>
        <span className="truncate text-[13px] font-medium text-[var(--ds-ink)]">
          {title}
        </span>
        <button
          type="button"
          onClick={() => {
            // Prefer history-back when there's somewhere to go back to;
            // otherwise drop the user at the root.
            if (window.history.length > 1) navigate(-1);
            else navigate("/");
          }}
          aria-label="Close mobile reader"
          data-testid="mobile-read-done"
          className="ml-auto inline-flex items-center gap-1 text-[12px] font-medium px-2.5 py-1 rounded-full border border-[var(--ds-line)] bg-[var(--ds-surface)] text-[var(--ds-ink)] hover:bg-[var(--ds-line-2)] transition"
        >
          <X className="size-3.5" />
          <span>Done</span>
        </button>
      </div>

      {/* Letter body — centered column with comfortable mobile reading
       * width. Base font sized for a phone (not 11pt like A4). The HTML
       * is rendered as-is; per-element styling is handled by the
       * .mobile-letter scoped block below so we don't drag the A4-export
       * sizing into the screen surface. */}
      <main className="mx-auto max-w-[720px] px-5 sm:px-8 py-8 pb-24">
        <article
          className="mobile-letter text-[var(--ds-ink)]"
          dangerouslySetInnerHTML={{ __html: bodyHtml }}
          aria-label="Letter content"
        />
      </main>

      {/* Scoped typography for the read-only HTML body. Mirrors the
       * export styles in pdf.ts but tuned for screen — larger base font,
       * looser line-height, no fixed point sizing. */}
      <style>{mobileLetterStyles}</style>
    </div>
  );
}

/** Derive the human-readable status pill text. Mirrors the editor's
 * implicit lifecycle: marked-sent export → "Sent", reviewStatus →
 * Approved / In review / Changes requested, otherwise "Draft" or
 * "Ready" when at least one section is in a non-empty state. */
function statusLabelFor(draft: Draft): string {
  const wasSent = (draft.exports ?? []).some((e) => e.format === "marked-sent");
  if (wasSent) return "Sent";
  switch (draft.reviewStatus) {
    case "approved":
      return "Approved";
    case "in_review":
      return "In review";
    case "changes_requested":
      return "Changes requested";
    default:
      break;
  }
  const hasContent = draft.sections.some((s) => s.status === "ready" || s.status === "edited");
  return hasContent ? "Ready" : "Draft";
}

function statusPillClasses(label: string): string {
  switch (label) {
    case "Sent":
    case "Approved":
      return "bg-[var(--ds-green-bg)] text-[var(--ds-green-fg)]";
    case "In review":
      return "bg-[var(--ds-amber-bg)] text-[var(--ds-amber-fg)]";
    case "Changes requested":
      return "bg-[var(--ds-red-bg)] text-[var(--ds-red-fg)]";
    case "Ready":
      return "bg-[var(--ds-line-2)] text-[var(--ds-ink)]";
    default:
      return "bg-[var(--ds-line-2)] text-[var(--ds-body)]";
  }
}

const mobileLetterStyles = `
.mobile-letter {
  font-family: "Iowan Old Style", Georgia, "Times New Roman", serif;
  font-size: 16px;
  line-height: 1.6;
  color: var(--ds-ink);
}
.mobile-letter h1, .mobile-letter h2, .mobile-letter h3 {
  font-family: inherit;
  font-weight: 600;
  line-height: 1.25;
  margin: 1.4em 0 0.5em;
  color: var(--ds-ink);
}
.mobile-letter h1 { font-size: 1.35rem; }
.mobile-letter h2 { font-size: 1.2rem; }
.mobile-letter h3 { font-size: 1.05rem; }
.mobile-letter p { margin: 0 0 0.85em; }
.mobile-letter ul, .mobile-letter ol { margin: 0 0 0.85em 1.2em; padding: 0; }
.mobile-letter li { margin: 0 0 0.35em; }
.mobile-letter table { width: 100%; border-collapse: collapse; margin: 0.75em 0; }
.mobile-letter th, .mobile-letter td {
  border: 1px solid var(--ds-line);
  padding: 6px 10px;
  text-align: left;
  font-size: 0.95em;
}
.mobile-letter hr {
  border: 0;
  border-top: 1px solid var(--ds-line);
  margin: 1.4em 0;
}
.mobile-letter a { color: inherit; text-decoration: underline; }
.mobile-letter img { max-width: 100%; height: auto; display: block; }
.mobile-letter .attachments-block h3 { font-size: 1.05rem; }
.mobile-letter [contenteditable] { -webkit-user-modify: read-only; user-select: text; }
`;

export default MobileReadView;
