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
  Copy,
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
 * Finalize — the ship gate.
 *
 * Previously this page carried score rings, fix-this-first, three review
 * lanes (AI / Team / Consultant), and the export grid. Assess + improve
 * work has moved to ReviewStep — Finalize is now just:
 *
 *   1. A compact "ready to ship" health summary (one line, no rings).
 *   2. The counsel-review attestation gate for high-risk letter types.
 *   3. The export grid (PDF / DOCX / Evidence pack / Copy plain text).
 *   4. Mark-as-sent CTA (locks the letter, archives, clears from drafts).
 *
 * The mental model: Review = "Is this letter good?" Finalize = "Ship it".
 */

const BAND_LABEL: Record<"strong" | "adequate" | "weak", string> = {
  strong: "Strong",
  adequate: "Adequate",
  weak: "Weak",
};

export function Finalize() {
  const { draftId } = useParams<{ draftId: string }>();
  const nav = useNavigate();
  const draft = useDraftStore((s) => (draftId ? s.drafts[draftId] : undefined));
  const recordExport = useDraftStore((s) => s.recordExport);

  const [busyFormat, setBusyFormat] = useState<string | null>(null);
  const [showConfetti, setShowConfetti] = useState(false);

  // Health checks + score are derived directly from the draft. We don't
  // render the rings here — we just need the counts for the summary strip.
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
  // High-risk letters require a counsel attestation before they can ship.
  // The attestation itself is captured in the editor (Editor.tsx writes
  // _counselReview into draft.answers). Finalize only checks for its
  // presence and blocks export until it's there.
  const counselReview =
    (draft.answers as Record<string, unknown>)._counselReview as
      | { reviewedBy: string; reviewedOn: string; attestedAt: number }
      | undefined;
  const counselAttested = !counselGateRequired || Boolean(counselReview);

  const readyToShip = scoreData.failCount === 0 && scoreData.band === "strong";
  const shipBlocked = scoreData.failCount > 0 || !counselAttested;

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

  const guardCounsel = (): boolean => {
    if (counselGateRequired && !counselReview) {
      alert(
        "This letter type requires counsel review before export. Open the editor and attach a counsel-review attestation.",
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

  const onExportPack = async () => {
    if (!guardCounsel()) return;
    setBusyFormat("pack");
    try {
      const { exportLetterPack } = await import("@/lib/export/pack");
      await exportLetterPack(draft);
      recordExport(draft.id, { format: "pack" });
    } catch (err) {
      alert(`Pack export failed: ${err instanceof Error ? err.message : err}`);
    } finally {
      setBusyFormat(null);
    }
  };

  const onCopyPlain = async () => {
    if (!guardCounsel()) return;
    setBusyFormat("copy");
    try {
      const plain = draft.sections
        .map((s) => (s.html ?? "").replace(/<[^>]+>/g, "").trim())
        .filter(Boolean)
        .join("\n\n");
      await navigator.clipboard.writeText(plain);
      setTimeout(() => setBusyFormat(null), 800);
      return;
    } catch (err) {
      alert(`Copy failed: ${err instanceof Error ? err.message : err}`);
      setBusyFormat(null);
    }
  };

  /* --------------------- Mark as sent + confetti -------------------- */

  const onMarkAsSent = () => {
    if (!guardCounsel()) return;
    setShowConfetti(true);
    recordExport(draft.id, { format: "marked-sent" });
    setTimeout(() => {
      nav(draft.mode === "employer" ? "/hr" : "/me");
    }, 1600);
  };

  /* -------------------------- Render -------------------------- */

  return (
    <div className="flex flex-col flex-1 min-h-0 bg-[var(--ds-canvas)]">
      {showConfetti && <ConfettiBurst onDone={() => setShowConfetti(false)} />}

      {/* Branded sticky header — back to Review, breadcrumb, draft meta. */}
      <header className="h-14 shrink-0 border-b border-[var(--ds-line)] bg-[var(--ds-surface)] sticky top-0 z-30 flex items-center px-4 sm:px-5 gap-3">
        <button
          type="button"
          onClick={() => nav(draft.mode === "employer" ? "/hr" : "/me")}
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
          <span className="text-[var(--ds-ink)] font-medium">Finalize</span>
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

      {/* Scrollable body — narrower than before since this is now a focused
       * ship gate, not a multi-section workspace. */}
      <div className="flex-1 min-h-0 overflow-y-auto">
        <div className="mx-auto max-w-[720px] px-4 py-7 sm:px-6 sm:py-10">
          <h1 className="text-[24px] font-semibold tracking-tight">
            Ship this letter
          </h1>
          <p className="text-[13.5px] text-[var(--ds-muted)] mt-1.5 mb-6 max-w-[560px]">
            Last gate before the letter leaves the building. Export the
            formats you need, then mark as sent to archive the draft.
          </p>

          {/* ───────── Compact health summary strip ───────── */}
          <ReadyStrip
            ready={readyToShip}
            score={scoreData.score}
            band={scoreData.band}
            passCount={scoreData.passCount}
            totalCount={scoreData.totalCount}
            warnCount={scoreData.warnCount}
            failCount={scoreData.failCount}
            onBack={() => nav(`/editor/${draft.id}/review`)}
          />

          {/* ───────── Counsel-review attestation gate ───────── */}
          {counselGateRequired && (
            <CounselGate
              attested={Boolean(counselReview)}
              review={counselReview}
              onAttach={() => nav(`/editor/${draft.id}`)}
            />
          )}

          {/* ───────── Export formats ───────── */}
          <h2 className="text-[10.5px] font-semibold uppercase tracking-wider text-[var(--ds-muted)] mt-7 mb-3">
            Export formats
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
                cta="Download"
                busy={busyFormat === "pdf"}
                onClick={onExportPdf}
                disabled={!counselAttested}
                primary
              />
              <FormatTile
                icon={<FileText className="size-4" />}
                title="DOCX"
                desc="Editable Word"
                cta="Download"
                busy={busyFormat === "docx"}
                onClick={onExportDocx}
                disabled={!counselAttested}
              />
              <FormatTile
                icon={<Package className="size-4" />}
                title="Evidence pack"
                desc="ZIP with audit"
                cta="Download"
                busy={busyFormat === "pack"}
                onClick={onExportPack}
                disabled={!counselAttested}
              />
              <FormatTile
                icon={<Copy className="size-4" />}
                title="Plain text"
                desc="Paste into email"
                cta={busyFormat === "copy" ? "Copied" : "Copy"}
                busy={false}
                onClick={onCopyPlain}
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

          {/* ───────── Mark-as-sent ship CTA ───────── */}
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
                  Locks the letter, archives it to the case file, and clears
                  it from drafts.
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
                    : "Counsel review required before sending"
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
 * One-line health summary at the top of Finalize. No rings — those live
 * in ReviewStep. This just answers the question "can I ship this?" with
 * a single icon, a verdict, and the numerics.
 */
function ReadyStrip({
  ready,
  score,
  band,
  passCount,
  totalCount,
  warnCount,
  failCount,
  onBack,
}: {
  ready: boolean;
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
        <div className="text-[13.5px] font-semibold text-[var(--ds-ink)] leading-tight">
          {ready
            ? "Ready to ship"
            : failCount > 0
              ? "Resolve blockers before sending"
              : "Review remaining warnings before sending"}
        </div>
        <div className="text-[12px] text-[var(--ds-muted)] mt-0.5 tabular-nums">
          Letter health: {score}/100 · {BAND_LABEL[band]} · {passCount} of{" "}
          {totalCount} checks passing
          {failCount > 0 && ` · ${failCount} blocker${failCount === 1 ? "" : "s"}`}
          {warnCount > 0 && ` · ${warnCount} warning${warnCount === 1 ? "" : "s"}`}
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
 * types (tribunal-bound / legal-review-required per exportRequiresCounselGate).
 * Blocks export until a counsel attestation has been attached in the editor.
 */
function CounselGate({
  attested,
  review,
  onAttach,
}: {
  attested: boolean;
  review:
    | { reviewedBy: string; reviewedOn: string; attestedAt: number }
    | undefined;
  onAttach: () => void;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.26, delay: 0.04, ease: [0.32, 0.72, 0, 1] }}
      className={cn(
        "rounded-xl border px-4 py-3 mt-3 flex items-center gap-3",
        attested
          ? "border-[var(--ds-green-bg)] bg-[var(--ds-green-bg)]/40"
          : "border-[var(--ds-amber-bg)] bg-[var(--ds-amber-bg)]/40",
      )}
    >
      <span
        className={cn(
          "inline-flex items-center justify-center size-7 rounded-full shrink-0",
          attested
            ? "bg-[var(--ds-green-bg)] text-[var(--ds-green-fg)]"
            : "bg-[var(--ds-amber-bg)] text-[var(--ds-amber-fg)]",
        )}
      >
        <ShieldCheck className="size-4" strokeWidth={2.5} />
      </span>
      <div className="flex-1 min-w-0">
        <div className="text-[13.5px] font-semibold text-[var(--ds-ink)] leading-tight">
          {attested
            ? "Counsel review attached"
            : "Counsel review required"}
        </div>
        <div className="text-[12px] text-[var(--ds-muted)] mt-0.5">
          {attested && review
            ? `Reviewed by ${review.reviewedBy} on ${review.reviewedOn}.`
            : "This letter type must be reviewed by qualified employment counsel before export."}
        </div>
      </div>
      {!attested && (
        <Button variant="outline" size="sm" onClick={onAttach}>
          Attach review
        </Button>
      )}
    </motion.div>
  );
}

function FormatTile({
  icon,
  title,
  desc,
  cta,
  busy,
  primary,
  disabled,
  onClick,
}: {
  icon: React.ReactNode;
  title: string;
  desc: string;
  cta: string;
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
        {busy ? "…" : cta}
      </motion.button>
    </div>
  );
}
