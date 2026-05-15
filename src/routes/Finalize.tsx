import { useMemo, useState } from "react";
import { useNavigate, useParams, Link } from "react-router-dom";
import { motion } from "framer-motion";
import {
  ArrowLeft,
  Check,
  AlertTriangle,
  FileText,
  FileDown,
  Package,
  FileType2,
  Send,
  ShieldCheck,
} from "lucide-react";

import { useDraftStore } from "@/lib/store";
import { getLetterMeta } from "@/lib/letters/catalog";
import { exportRequiresCounselGate } from "@/lib/letters/disclaimers";
import type { Draft } from "@/lib/letters/types";
import { Button } from "@/components/ui/button";
import { BrandMark } from "@/components/ds/BrandMark";
import { Wordmark } from "@/components/ds/Wordmark";
import { cn } from "@/lib/utils";
import {
  runHealthChecks,
  computeHealthScore,
  type HealthCheck,
} from "@/lib/finalize/healthChecks";
import { ConfettiBurst } from "@/components/finalize/ConfettiBurst";
import { ConsultTab } from "@/components/editor/review/ConsultTab";
import { WizardChrome } from "@/components/editor/WizardChrome";
import { ReviewRail } from "@/components/editor/ReviewRail";

/**
 * Finalise — the ship gate.
 *
 * Last step in the Edit · Review · Finalise wizard. Review answered "is
 * the letter good?" with the score rings, fix-this-first, and the lane
 * picker. Finalise answers a single, more focused question: "ship it?"
 *
 * The page is spare on purpose:
 *
 *   1. Sticky branded header (back to Review).
 *   2. Compact verdict recap — one-line band + score pulled from Review's
 *      health-check engine. No rings; if you want detail, go back.
 *   3. Counsel-review attestation — single checkbox, inline. Only renders
 *      for high-risk letters (tribunal-bound / legal-review-required).
 *   4. Four export tiles — PDF, DOCX, TXT, ZIP. Each is one click to
 *      download. All exports are logged via `recordExport`.
 *   5. Mark-as-sent — single dark CTA. Locks the draft, plays confetti,
 *      navigates to Activity so the user sees their just-sent letter at
 *      the top of the feed.
 */

const BAND_LABEL: Record<"strong" | "adequate" | "weak", string> = {
  strong: "Strong",
  adequate: "Adequate",
  weak: "Weak",
};

/** One-line verdict that pairs with the score in the recap strip.
 * Pulls signal from the letter meta (tribunal-bound? legal review?) so
 * the verdict reads as letter-aware rather than generic. */
function verdictLabel(
  band: "strong" | "adequate" | "weak",
  meta: ReturnType<typeof getLetterMeta>,
): string {
  if (band === "strong") {
    if (meta.tribunalBound) return "Tribunal-ready";
    if (meta.legalReviewRequired) return "Counsel-ready";
    return "Ready to ship";
  }
  if (band === "adequate") return "Almost there";
  return "Needs work";
}

export function Finalize() {
  const { draftId } = useParams<{ draftId: string }>();
  const nav = useNavigate();
  const draft = useDraftStore((s) => (draftId ? s.drafts[draftId] : undefined));
  const recordExport = useDraftStore((s) => s.recordExport);

  const [busyFormat, setBusyFormat] = useState<string | null>(null);
  const [showConfetti, setShowConfetti] = useState(false);
  // Counsel attestation is captured inline on this page — the user ticks
  // the checkbox confirming the letter has been reviewed. We deliberately
  // don't persist this to draft state: the attestation is point-of-send,
  // and the export's `reviewedBy/On` metadata (when present) is the
  // archival record. This local toggle is just the runtime gate.
  const [counselConfirmed, setCounselConfirmed] = useState(false);

  // Health checks + score derived directly from the draft. We don't
  // render the rings here — just the numbers for the verdict strip.
  const checks = useMemo<HealthCheck[]>(
    () => (draft ? runHealthChecks(draft) : []),
    [draft],
  );
  const scoreData = useMemo(() => computeHealthScore(checks), [checks]);

  if (!draft || !draftId) {
    return (
      <div className="mx-auto max-w-3xl px-6 py-12">
        <p className="text-sm text-[var(--ds-muted)]">Draft not found.</p>
        <Button variant="ghost" className="mt-4" onClick={() => nav("/")}>
          <ArrowLeft className="size-4 mr-1" /> Back home
        </Button>
      </div>
    );
  }

  const meta = getLetterMeta(draft.letterType);

  const counselReview: { reviewedBy: string; reviewedOn: string } | null = (() => {
    const last = (draft.exports ?? [])
      .slice()
      .sort((a, b) => b.exportedAt - a.exportedAt)
      .find((e) => e.reviewedBy);
    if (last?.reviewedBy && last.reviewedOn) {
      return { reviewedBy: last.reviewedBy, reviewedOn: last.reviewedOn };
    }
    const manual = (draft.answers as Record<string, unknown>)._counselReview as
      | { reviewedBy?: string; reviewedOn?: string }
      | undefined;
    if (manual?.reviewedBy && manual.reviewedOn) {
      return { reviewedBy: manual.reviewedBy, reviewedOn: manual.reviewedOn };
    }
    return null;
  })();

  const unresolvedCommentCount = (draft.comments ?? []).filter(
    (c) => !c.resolved
  ).length;

  const counselGateRequired = exportRequiresCounselGate(draft);
  const counselAttested = !counselGateRequired || counselConfirmed;

  const readyToShip = scoreData.failCount === 0 && scoreData.band === "strong";
  const shipBlocked = scoreData.failCount > 0 || !counselAttested;
  const verdict = verdictLabel(scoreData.band, meta);

  /* ---------------------------- Exports ---------------------------- */

  const downloadBlob = (blob: Blob, filename: string) => {
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  };

  /**
   * Counsel guard — runs before every export. Blocks if the letter
   * requires counsel review and the user hasn't ticked the attestation
   * checkbox. Returns true when the export may proceed.
   */
  const guardCounsel = (): boolean => {
    if (counselGateRequired && !counselConfirmed) {
      alert(
        "Please confirm counsel review before exporting this letter.",
      );
      return false;
    }
    return true;
  };

  const onExportPdf = async () => {
    if (!guardCounsel()) return;
    setBusyFormat("pdf");
    try {
      const { renderLetterPdfBlob, filenameFor } = await import(
        "@/lib/export/pdf"
      );
      const blob = await renderLetterPdfBlob(draft);
      downloadBlob(blob, filenameFor(draft));
      recordExport(draft.id, { format: "pdf" });
    } catch (err) {
      alert(`PDF export failed: ${err instanceof Error ? err.message : err}`);
    } finally {
      setBusyFormat(null);
    }
  };

  const onExportDocx = async () => {
    if (!guardCounsel()) return;
    setBusyFormat("docx");
    try {
      const { renderLetterDocxBlob, docxFilenameFor } = await import(
        "@/lib/export/docx"
      );
      const blob = await renderLetterDocxBlob(draft);
      downloadBlob(blob, docxFilenameFor(draft));
      recordExport(draft.id, { format: "docx" });
    } catch (err) {
      alert(`DOCX export failed: ${err instanceof Error ? err.message : err}`);
    } finally {
      setBusyFormat(null);
    }
  };

  const onExportTxt = () => {
    if (!guardCounsel()) return;
    setBusyFormat("txt");
    try {
      const plain = draft.sections
        .map((s) => (s.html ?? "").replace(/<[^>]+>/g, "").trim())
        .filter(Boolean)
        .join("\n\n");
      const blob = new Blob([plain], { type: "text/plain;charset=utf-8" });
      const slug = (draft.title ?? meta.title)
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-+|-+$/g, "");
      downloadBlob(blob, `${slug || "letter"}.txt`);
      // TXT isn't in the ExportEvent format union (pdf | docx | pack |
      // marked-sent). Rather than widen the union for a low-stakes
      // plain-text dump, we let the download stand as its own audit
      // trail. If TXT becomes a tracked export later, add it to
      // ExportEvent.format and log it here.
    } catch (err) {
      alert(`TXT export failed: ${err instanceof Error ? err.message : err}`);
    } finally {
      setBusyFormat(null);
    }
  };

  const onExportZip = async () => {
    if (!guardCounsel()) return;
    setBusyFormat("zip");
    try {
      const { exportLetterPack } = await import("@/lib/export/pack");
      await exportLetterPack(draft);
      recordExport(draft.id, { format: "pack" });
    } catch (err) {
      alert(`ZIP export failed: ${err instanceof Error ? err.message : err}`);
    } finally {
      setBusyFormat(null);
    }
  };

  /* --------------------- Mark as sent + confetti -------------------- */

  const onMarkAsSent = () => {
    if (!guardCounsel()) return;
    if (scoreData.failCount > 0) return;
    setShowConfetti(true);
    recordExport(draft.id, { format: "marked-sent" });
    // Activity is the canonical post-send destination — the just-sent
    // letter shows at the top of the feed with an attestation hash.
    setTimeout(() => nav("/activity"), 1600);
  };

  /* -------------------------- Render -------------------------- */

  return (
    <div className="flex flex-col flex-1 min-h-0 bg-[var(--ds-canvas)]">
      {showConfetti && <ConfettiBurst onDone={() => setShowConfetti(false)} />}

      {/* Branded sticky header — Logo · Finalise · <title>  …  [← Review] */}
      <header className="h-14 shrink-0 border-b border-[var(--ds-line)] bg-[var(--ds-surface)] sticky top-0 z-30 flex items-center px-4 gap-2">
        <Link
          to="/"
          aria-label="Home"
          className="shrink-0 flex items-center gap-2 rounded-md hover:bg-[var(--ds-line-2)] transition px-1.5 py-1 -mx-1.5 h-10 mr-2"
        >
          <BrandMark size={36} />
          <Wordmark size={16} className="hidden sm:inline" />
        </Link>
        <span className="text-[13px] font-medium text-[var(--ds-ink)]">Finalise</span>
        <span className="text-[12px] text-[var(--ds-muted)] hidden md:inline">
          · {draft.title ?? meta.title}
        </span>
        <div className="ml-auto flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => nav(`/editor/${draft.id}/review`)}
          >
            <ArrowLeft className="size-3.5 mr-1.5" />
            Review
          </Button>
        </div>
      </header>

      {/* 2-column layout: 300px sidebar (stepper + health) + scrollable body */}
      <div className="grid min-h-0 flex-1 grid-cols-1 lg:grid-cols-[300px_minmax(0,1fr)]">
        <aside className="hidden min-h-0 border-r border-[var(--ds-line)] bg-[var(--ds-surface)] lg:flex lg:flex-col">
          <WizardChrome draftId={draft.id} mode={draft.mode} current="finalize" />
          <ReviewRail
            draft={draft}
            counselReviewedBy={counselReview}
            unresolvedComments={unresolvedCommentCount}
            onJumpToSection={(sectionId) =>
              nav(`/editor/${draft.id}?section=${sectionId}`)
            }
            onJumpToEvidence={() => nav(`/editor/${draft.id}/evidence`)}
            onContinueToFinalize={() => { /* already on finalise */ }}
          />
        </aside>

        <main className="min-h-0 overflow-y-auto">
          <div className="mx-auto max-w-[680px] px-4 py-7 sm:px-6 sm:py-10">
          {/* Counsel-review attestation gate — only renders when the
           * letter type requires it. Inline checkbox; ticking it
           * unblocks the export tiles and Mark-as-sent. */}
          {counselGateRequired && (
            <CounselAttestation
              confirmed={counselConfirmed}
              onToggle={() => setCounselConfirmed((v) => !v)}
            />
          )}

          {/* ───────── One last check — counsel review ─────────
           * The marketplace upsell, deliberately positioned as the final
           * pause before export. Sits between the recap and the export
           * tiles so it reads as "before you ship, want a second pair of
           * eyes?" rather than a side-tab. For letters that already
           * require counsel review (tribunal-bound / legal-review-
           * required), the section reframes itself as a booking surface
           * rather than an upsell. */}
          <ConsultSection
            required={counselGateRequired}
            draft={draft}
          />

          {/* ───────── Export formats ───────── */}
          <h2 className="text-[10.5px] font-semibold uppercase tracking-wider text-[var(--ds-muted)] mt-7 mb-3">
            Export
          </h2>
          <motion.div
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.28, ease: [0.32, 0.72, 0, 1] }}
            className="rounded-xl border border-[var(--ds-line)] bg-[var(--ds-surface)] overflow-hidden"
          >
            <div className="grid grid-cols-2 md:grid-cols-4 divide-x divide-y md:divide-y-0 divide-[var(--ds-line-2)] [&>*:nth-child(-n+2)]:border-t-0 md:[&>*]:border-t-0">
              <FormatTile
                icon={<FileText className="size-4" />}
                title="PDF"
                desc="Print-ready"
                busy={busyFormat === "pdf"}
                onClick={onExportPdf}
                disabled={!counselAttested}
                primary
              />
              <FormatTile
                icon={<FileText className="size-4" />}
                title="DOCX"
                desc="Editable Word"
                busy={busyFormat === "docx"}
                onClick={onExportDocx}
                disabled={!counselAttested}
              />
              <FormatTile
                icon={<FileType2 className="size-4" />}
                title="TXT"
                desc="Plain text"
                busy={busyFormat === "txt"}
                onClick={onExportTxt}
                disabled={!counselAttested}
              />
              <FormatTile
                icon={<Package className="size-4" />}
                title="ZIP"
                desc="Evidence pack"
                busy={busyFormat === "zip"}
                onClick={onExportZip}
                disabled={!counselAttested}
              />
            </div>

            <div className="flex items-center gap-2 px-4 py-2.5 bg-[var(--ds-line-2)] text-[11.5px] text-[var(--ds-muted)] border-t border-[var(--ds-line-2)]">
              <ShieldCheck className="size-3.5 shrink-0" />
              <span className="flex-1">
                Every download is logged in Activity with an attestation hash.
              </span>
            </div>
          </motion.div>

          {/* Mark-as-sent ship CTA — single dark button, intentionally
           * the only primary action on the page. */}
          <motion.div
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.28, delay: 0.08, ease: [0.32, 0.72, 0, 1] }}
            className="rounded-xl border border-[var(--ds-line)] bg-[var(--ds-surface)] p-5 mt-6 flex flex-wrap items-center gap-4"
          >
            <div className="flex items-start gap-3 flex-1 min-w-[240px]">
              <span className="inline-flex items-center justify-center size-9 rounded-lg bg-[var(--ds-line-2)] text-[var(--ds-ink)] shrink-0">
                <Send className="size-4" />
              </span>
              <div className="min-w-0">
                <h3 className="text-[14px] font-semibold m-0 mb-0.5">
                  Ready to send?
                </h3>
                <p className="text-[12.5px] text-[var(--ds-muted)] m-0 leading-snug">
                  Locks the letter, archives it to Activity, and clears it
                  from drafts.
                </p>
              </div>
            </div>
            <Button
              onClick={onMarkAsSent}
              disabled={shipBlocked}
              title={
                shipBlocked
                  ? scoreData.failCount > 0
                    ? "Resolve blockers in Review before sending"
                    : "Confirm counsel review before sending"
                  : undefined
              }
            >
              Mark as sent
              <Send className="size-4 ml-1.5" />
            </Button>
          </motion.div>
          </div>
        </main>
      </div>
    </div>
  );
}

/* ============================================================================
 * Subcomponents
 * ==========================================================================*/

/**
 * One-line verdict + score strip — kept as a dead subcomponent in case
 * it's needed elsewhere in future; no longer rendered in the Finalize body
 * (the sidebar's ReviewRail now surfaces the same data).
 */
function VerdictStrip({
  ready,
  verdict,
  score,
  band,
  passCount,
  totalCount,
  warnCount,
  failCount,
  onBack,
}: {
  ready: boolean;
  verdict: string;
  score: number;
  band: "strong" | "adequate" | "weak";
  passCount: number;
  totalCount: number;
  warnCount: number;
  failCount: number;
  onBack: () => void;
}) {
  const hasUnresolved = warnCount > 0 || failCount > 0;
  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.24, ease: [0.32, 0.72, 0, 1] }}
      className={cn(
        "rounded-xl border px-4 py-3 flex items-center gap-3",
        ready
          ? "border-[var(--ds-green-bg)] bg-[var(--ds-green-bg)]/40"
          : "border-[var(--ds-amber-bg)] bg-[var(--ds-amber-bg)]/40",
      )}
    >
      <span
        className={cn(
          "inline-flex items-center justify-center size-7 rounded-full shrink-0",
          ready
            ? "bg-[var(--ds-green-bg)] text-[var(--ds-green-fg)]"
            : "bg-[var(--ds-amber-bg)] text-[var(--ds-amber-fg)]",
        )}
      >
        {ready ? (
          <Check className="size-4" strokeWidth={2.5} />
        ) : (
          <AlertTriangle className="size-4" strokeWidth={2.5} />
        )}
      </span>
      <div className="flex-1 min-w-0">
        <div className="text-[13.5px] font-semibold text-[var(--ds-ink)] leading-tight tabular-nums">
          {verdict} · {score}/100
        </div>
        <div className="text-[12px] text-[var(--ds-muted)] mt-0.5 tabular-nums">
          {BAND_LABEL[band]} · {passCount} of {totalCount} checks passing
          {failCount > 0 &&
            ` · ${failCount} blocker${failCount === 1 ? "" : "s"}`}
          {warnCount > 0 &&
            ` · ${warnCount} warning${warnCount === 1 ? "" : "s"}`}
        </div>
      </div>
      {hasUnresolved && (
        <Button variant="outline" size="sm" onClick={onBack}>
          <ArrowLeft className="size-3.5 mr-1" />
          Back to Review
        </Button>
      )}
    </motion.div>
  );
}

/**
 * Counsel-review attestation gate. Only renders for high-risk letter
 * types (tribunal-bound / legal-review-required per
 * exportRequiresCounselGate). Inline checkbox the user ticks to
 * confirm; ticking it unblocks export and mark-as-sent.
 */
function CounselAttestation({
  confirmed,
  onToggle,
}: {
  confirmed: boolean;
  onToggle: () => void;
}) {
  return (
    <motion.label
      htmlFor="counsel-attestation"
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.26, delay: 0.04, ease: [0.32, 0.72, 0, 1] }}
      className={cn(
        "rounded-xl border px-4 py-3 mt-3 flex items-center gap-3 cursor-pointer select-none transition",
        confirmed
          ? "border-[var(--ds-green-bg)] bg-[var(--ds-green-bg)]/40"
          : "border-[var(--ds-amber-bg)] bg-[var(--ds-amber-bg)]/40",
      )}
    >
      <input
        id="counsel-attestation"
        type="checkbox"
        checked={confirmed}
        onChange={onToggle}
        className="size-4 rounded border-[var(--ds-line)] accent-[var(--ds-ink)] shrink-0"
      />
      <span
        className={cn(
          "inline-flex items-center justify-center size-7 rounded-full shrink-0",
          confirmed
            ? "bg-[var(--ds-green-bg)] text-[var(--ds-green-fg)]"
            : "bg-[var(--ds-amber-bg)] text-[var(--ds-amber-fg)]",
        )}
      >
        <ShieldCheck className="size-4" strokeWidth={2.5} />
      </span>
      <div className="flex-1 min-w-0">
        <div className="text-[13.5px] font-semibold text-[var(--ds-ink)] leading-tight">
          I confirm this has been reviewed by counsel
        </div>
        <div className="text-[12px] text-[var(--ds-muted)] mt-0.5">
          Required for this letter type before export or send.
        </div>
      </div>
    </motion.label>
  );
}

function FormatTile({
  icon,
  title,
  desc,
  busy,
  primary,
  disabled,
  onClick,
}: {
  icon: React.ReactNode;
  title: string;
  desc: string;
  busy: boolean;
  primary?: boolean;
  disabled?: boolean;
  onClick: () => void;
}) {
  return (
    <div className="flex flex-col items-start gap-2 p-4">
      <div className="inline-flex items-center justify-center size-8 rounded-lg bg-[var(--ds-line-2)] text-[var(--ds-ink)]">
        {icon}
      </div>
      <div className="flex-1">
        <h4 className="text-[13px] font-semibold m-0 leading-tight">{title}</h4>
        <p className="text-[11.5px] text-[var(--ds-muted)] m-0 mt-0.5 leading-snug">
          {desc}
        </p>
      </div>
      <motion.button
        type="button"
        onClick={onClick}
        disabled={busy || disabled}
        whileHover={{ scale: disabled ? 1 : 1.02 }}
        whileTap={{ scale: disabled ? 1 : 0.97 }}
        transition={{ duration: 0.12 }}
        className={cn(
          "mt-1 inline-flex items-center justify-center gap-1.5 w-full h-8 px-3 rounded-md text-[12px] font-semibold transition disabled:opacity-50 disabled:cursor-not-allowed",
          primary
            ? "bg-[var(--ds-ink)] text-white hover:opacity-90"
            : "bg-[var(--ds-surface)] text-[var(--ds-ink)] border border-[var(--ds-line)] hover:bg-[var(--ds-line-2)]",
        )}
      >
        {busy ? (
          <motion.span
            animate={{ rotate: 360 }}
            transition={{ repeat: Infinity, duration: 1, ease: "linear" }}
            className="inline-flex"
          >
            <FileDown className="size-3.5" />
          </motion.span>
        ) : (
          <FileDown className="size-3.5" />
        )}
        {busy ? "…" : "Download"}
      </motion.button>
    </div>
  );
}

/**
 * Counsel-review marketplace section. Sits between the verdict recap and
 * the export tiles — the deliberate "before you ship, want a second pair
 * of eyes?" moment.
 *
 * Two variants:
 *   - required = false → soft upsell. Header reads "One last check"; copy
 *     frames the booking as an optional second opinion before the letter
 *     leaves the building.
 *   - required = true  → directive booking surface. The letter type already
 *     requires counsel review (see exportRequiresCounselGate) so the page
 *     also shows the attestation checkbox above. Header reads "Book counsel
 *     review" and copy reflects the obligation rather than the upsell.
 *
 * Both variants render the same ConsultTab marketplace UI underneath — the
 * consultant cards, AI-matched chip, and CTAs are unchanged. Only the
 * framing header above the marketplace shifts.
 */
function ConsultSection({
  required,
  draft,
}: {
  required: boolean;
  draft: Draft;
}) {
  return (
    <motion.section
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.28, delay: 0.06, ease: [0.32, 0.72, 0, 1] }}
      className="mt-7"
      aria-labelledby="consult-section-heading"
    >
      <h2
        id="consult-section-heading"
        className="text-[10.5px] font-semibold uppercase tracking-wider text-[var(--ds-muted)] mb-3"
      >
        {required ? "Counsel review · required" : "One last check"}
      </h2>
      <div className="rounded-xl border border-[var(--ds-line)] bg-[var(--ds-surface)] p-4 sm:p-5">
        <div className="flex items-start gap-3 mb-4">
          <span
            className={cn(
              "inline-flex items-center justify-center size-9 rounded-lg shrink-0",
              required
                ? "bg-[var(--ds-amber-bg)] text-[var(--ds-amber-fg)]"
                : "bg-[var(--ds-line-2)] text-[var(--ds-ink)]",
            )}
          >
            <ShieldCheck className="size-4" />
          </span>
          <div className="min-w-0">
            <h3 className="text-[14px] font-semibold m-0 mb-0.5">
              {required
                ? "This letter requires counsel review"
                : "Want counsel review before this leaves the building?"}
            </h3>
            <p className="text-[12.5px] text-[var(--ds-muted)] m-0 leading-snug">
              {required
                ? "Tribunal-bound or legal-review-required — book a UK-qualified solicitor below. Once they sign off, tick the attestation above and you're clear to export."
                : "Optional second opinion from a UK-qualified solicitor or HR specialist. Most reviews back within 24h — cheaper than a tribunal."}
            </p>
          </div>
        </div>
        <ConsultTab draft={draft} />
      </div>
    </motion.section>
  );
}
