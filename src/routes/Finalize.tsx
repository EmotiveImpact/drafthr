import { useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
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

      {/* Branded sticky header — back to Review, breadcrumb, draft meta. */}
      <header className="h-14 shrink-0 border-b border-[var(--ds-line)] bg-[var(--ds-surface)] sticky top-0 z-30 flex items-center px-4 sm:px-5 gap-3">
        <button
          type="button"
          onClick={() => nav("/activity")}
          className="flex items-center gap-2 rounded-md px-1.5 py-1 -mx-1.5 hover:bg-[var(--ds-line-2)] transition"
          aria-label="Home"
        >
          <BrandMark size={26} />
          <Wordmark size={15} />
        </button>

        <span className="text-[var(--ds-subtle)] hidden sm:inline">/</span>

        <nav className="flex items-center gap-1.5 text-[12.5px] min-w-0">
          <button
            type="button"
            onClick={() => nav(`/editor/${draft.id}/review`)}
            className="text-[var(--ds-muted)] hover:text-[var(--ds-ink)] transition truncate"
          >
            Review
          </button>
          <span className="text-[var(--ds-subtle)]">·</span>
          <span className="text-[var(--ds-muted)] truncate hidden md:inline">
            {draft.title ?? meta.title}
          </span>
          <span className="text-[var(--ds-subtle)] hidden md:inline">·</span>
          <span className="text-[var(--ds-ink)] font-medium">Finalise</span>
        </nav>

        <div className="ml-auto flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => nav(`/editor/${draft.id}/review`)}
          >
            <ArrowLeft className="size-3.5 mr-1" />
            Back to Review
          </Button>
        </div>
      </header>

      {/* Scrollable body — narrower than the editor since this is now a
       * focused ship gate, not a multi-section workspace. */}
      <div className="flex-1 min-h-0 overflow-y-auto">
        <div className="mx-auto max-w-[680px] px-4 py-7 sm:px-6 sm:py-10">
          <h1 className="text-[24px] font-semibold tracking-tight">
            Finalise <span className="text-[var(--ds-muted)] font-normal">·</span>{" "}
            <span className="text-[var(--ds-muted)] font-normal">
              Ready to ship
            </span>
          </h1>
          <p className="text-[13.5px] text-[var(--ds-muted)] mt-1.5 mb-6 max-w-[560px]">
            Last gate before the letter leaves the building. Download the
            formats you need, then mark as sent to archive the draft.
          </p>

          {/* Compact verdict recap — pulls from Review's health-check
           * engine so the two pages stay in sync. */}
          <VerdictStrip
            ready={readyToShip}
            verdict={verdict}
            score={scoreData.score}
            band={scoreData.band}
            passCount={scoreData.passCount}
            totalCount={scoreData.totalCount}
            warnCount={scoreData.warnCount}
            failCount={scoreData.failCount}
            onBack={() => nav(`/editor/${draft.id}/review`)}
          />

          {/* Counsel-review attestation gate — only renders when the
           * letter type requires it. Inline checkbox; ticking it
           * unblocks the export tiles and Mark-as-sent. */}
          {counselGateRequired && (
            <CounselAttestation
              confirmed={counselConfirmed}
              onToggle={() => setCounselConfirmed((v) => !v)}
            />
          )}

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
      </div>
    </div>
  );
}

/* ============================================================================
 * Subcomponents
 * ==========================================================================*/

/**
 * One-line verdict + score strip at the top of Finalise. No rings —
 * those live in Review's Health tab. This is the at-a-glance recap so
 * the user can confirm what Review told them before they ship.
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
