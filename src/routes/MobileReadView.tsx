import { useMemo } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { useDraftStore } from "@/lib/store";
import { letterBodyHtml } from "@/lib/export/pdf";
import { getLetterMeta } from "@/lib/letters/catalog";
import { useJourney } from "@/lib/journey/stage";
import { StatusPill } from "@/components/journey/ui";

/**
 * Mobile read-only view, `/m/:draftId`.
 *
 * Persona D ("HR Director reads on the bus"): open a draft on a phone,
 * read it cleanly, no chrome. This route is the mobile counterpart to
 * `/editor/:draftId`: it renders the same letter body as the PDF export
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
 *  - Light theme only (Section B of SUNDAY.md locks dark mode off).
 *  - The status pill is the journey's own label and colour, as in the
 *    workspace's document bar.
 */
export function MobileReadView() {
  const { draftId } = useParams<{ draftId: string }>();
  const navigate = useNavigate();
  const draft = useDraftStore((s) => (draftId ? s.drafts[draftId] : undefined));

  const bodyHtml = useMemo(() => (draft ? letterBodyHtml(draft) : ""), [draft]);
  const meta = draft ? getLetterMeta(draft.letterType) : null;
  const title = draft?.title || meta?.title || "Untitled letter";
  const journey = useJourney(draft?.id);

  if (!draft) {
    return (
      <div
        data-testid="mobile-read-view"
        className="fixed inset-0 z-50 bg-[var(--ds-surface)] overflow-y-auto"
      >
        <div className="mx-auto max-w-md px-6 py-16 text-center">
          <h1 className="ds-title m-0 text-[28px] leading-tight">
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
      className="fixed inset-0 z-50 bg-[var(--ds-surface)] overflow-y-auto"
    >
      {/* Top strip: the approval pill and Done, nothing else. */}
      <div
        className="sticky top-0 z-10 flex items-center gap-2 bg-[var(--ds-surface)]/95 px-4 py-3 backdrop-blur"
        data-testid="mobile-read-header"
      >
        {journey && <StatusPill tone={journey.statusTone}>{journey.statusLabel}</StatusPill>}
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
          className="ml-auto inline-flex h-9 items-center gap-1 rounded-[10px] bg-[var(--ds-accent)] px-3.5 text-[14px] font-medium text-[var(--ds-on-accent)] transition-colors duration-[120ms] hover:bg-[var(--ds-accent-hover)] active:bg-[var(--ds-accent-press)] focus-visible:outline-none focus-visible:shadow-[var(--ds-focus-ring)]"
        >
          <span>Done</span>
        </button>
      </div>

      {/* Letter body — centered column with comfortable mobile reading
       * width. Base font sized for a phone (not 11pt like A4). The HTML
       * is rendered as-is; per-element styling is handled by the
       * .mobile-letter scoped block below so we don't drag the A4-export
       * sizing into the screen surface. */}
      <main className="mx-auto max-w-[680px] px-5 pb-24 pt-4 sm:px-8 sm:pt-8">
        <h1 className="ds-title m-0 mb-7 text-[30px] leading-[1.12] [overflow-wrap:anywhere] sm:text-[36px]">
          {title}
        </h1>
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

const mobileLetterStyles = `
.mobile-letter {
  font-family: var(--font-serif);
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
.mobile-letter table { display: block; max-width: 100%; overflow-x: auto; }
.mobile-letter { overflow-wrap: anywhere; }
.mobile-letter .attachments-block h3 { font-size: 1.05rem; }
.mobile-letter [contenteditable] { -webkit-user-modify: read-only; user-select: text; }
/* The branded export footer carries inline print colours and a system font
 * stack for PDF and Word. On screen it takes the workspace tokens and Inter,
 * so its grey reads at AA. */
.mobile-letter .drafthr-export-footer {
  color: var(--ds-muted) !important;
  font-family: var(--font-sans) !important;
  font-size: 12px !important;
  border-top-color: var(--ds-line) !important;
}
.mobile-letter .drafthr-export-footer strong {
  color: var(--ds-body) !important;
}
`;

export default MobileReadView;
