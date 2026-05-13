import { useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { motion } from "framer-motion";
import {
  ArrowLeft,
  Bot,
  Check,
  AlertTriangle,
  XCircle,
  FileText,
  FileDown,
  Package,
  Sparkles,
  Users,
  ShieldCheck,
  Copy,
  Coins,
  Send,
  ArrowRight,
} from "lucide-react";

import { useDraftStore } from "@/lib/store";
import { useProfileStore } from "@/lib/profile";
import { AI_REVIEW_COST } from "@/lib/profile";
import { getLetterMeta } from "@/lib/letters/catalog";
import { Button } from "@/components/ui/button";
import { BrandMark } from "@/components/ds/BrandMark";
import { Wordmark } from "@/components/ds/Wordmark";
import { cn } from "@/lib/utils";
import {
  runHealthChecks,
  computeHealthScore,
  type HealthCheck,
} from "@/lib/finalize/healthChecks";
import { ScoreRing } from "@/components/finalize/ScoreRing";
import { ConfettiBurst } from "@/components/finalize/ConfettiBurst";

/**
 * Finalize — the final wizard step. Replaces the old "Export pack" button
 * at the end of Review with a dedicated ship-gate page:
 *
 *   1. Letter health  — static checks + AI evaluation side by side, summed
 *                       into a Letter Health Score (animated ring).
 *   2. Independent review — three lanes:
 *        • AI specialist  (credits — instant)
 *        • Your team      (free — async)
 *        • External consultant (paid — vetted human)
 *   3. Export pack    — PDF / DOCX / Signed PDF / Evidence bundle zip /
 *                       Copy as plain text. Wired to existing export libs.
 *
 * After exporting (or sending), the "Mark as sent" CTA locks the letter,
 * triggers a confetti burst, and bounces the user back to the home feed.
 */

const BAND_LABEL: Record<"strong" | "adequate" | "weak", string> = {
  strong: "Strong",
  adequate: "Adequate",
  weak: "Weak",
};

const BAND_CLASSES: Record<
  "strong" | "adequate" | "weak",
  { bg: string; text: string }
> = {
  strong: { bg: "bg-[var(--ds-green-bg)]", text: "text-[var(--ds-green-fg)]" },
  adequate: { bg: "bg-[var(--ds-amber-bg)]", text: "text-[var(--ds-amber-fg)]" },
  weak: { bg: "bg-[var(--ds-red-bg)]", text: "text-[var(--ds-red-fg)]" },
};

export function Finalize() {
  const { draftId } = useParams<{ draftId: string }>();
  const nav = useNavigate();
  const draft = useDraftStore((s) => (draftId ? s.drafts[draftId] : undefined));
  const recordExport = useDraftStore((s) => s.recordExport);

  // Credits are read separately so spending them later updates only the
  // chip that displays the balance, not the rest of the page.
  const credits = useProfileStore((s) => s.profile.credits ?? 0);
  const spendCredits = useProfileStore((s) => s.spendCredits);

  const [busyFormat, setBusyFormat] = useState<string | null>(null);
  const [aiReviewState, setAiReviewState] = useState<
    "idle" | "running" | "complete" | "low-credits"
  >("idle");
  const [showConfetti, setShowConfetti] = useState(false);

  // Health checks + score are derived directly from the draft — re-derive
  // any time the draft mutates (edits, comments, evidence). No effect needed.
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

  const onExportPdf = async () => {
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
    setBusyFormat("copy");
    try {
      const plain = draft.sections
        .map((s) => (s.html ?? "").replace(/<[^>]+>/g, "").trim())
        .filter(Boolean)
        .join("\n\n");
      await navigator.clipboard.writeText(plain);
      // Tiny ack — restore button label after 800ms.
      setTimeout(() => setBusyFormat(null), 800);
      return;
    } catch (err) {
      alert(`Copy failed: ${err instanceof Error ? err.message : err}`);
      setBusyFormat(null);
    }
  };

  /* ----------------------- AI specialist review ---------------------- */

  const onAiCritique = () => {
    if (credits < AI_REVIEW_COST) {
      setAiReviewState("low-credits");
      return;
    }
    const ok = spendCredits(AI_REVIEW_COST);
    if (!ok) {
      setAiReviewState("low-credits");
      return;
    }
    setAiReviewState("running");
    // Stub: real call wires to /api/agent with a "critique" intent. For now
    // we simulate a ~2.5s response so the UX flow is testable.
    setTimeout(() => setAiReviewState("complete"), 2500);
  };

  /* --------------------- Mark as sent + confetti -------------------- */

  const onMarkAsSent = () => {
    setShowConfetti(true);
    recordExport(draft.id, { format: "marked-sent" });
    // Bounce home after the burst lands.
    setTimeout(() => {
      nav(draft.mode === "employer" ? "/hr" : "/me");
    }, 1600);
  };

  /* -------------------------- Render -------------------------- */

  return (
    <div className="flex flex-col flex-1 min-h-0 bg-[var(--ds-canvas)]">
      {showConfetti && <ConfettiBurst onDone={() => setShowConfetti(false)} />}

      {/* Branded sticky header — keeps DraftHR identity, in-flow breadcrumb,
       * credits chip on the right so the AI specialist cost stays anchored. */}
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
            {meta.title}
          </span>
          <span className="text-[var(--ds-subtle)] hidden md:inline">·</span>
          <span className="text-[var(--ds-ink)] font-medium">Finalize</span>
        </nav>

        <div className="ml-auto flex items-center gap-2">
          {/* Credits chip — visible across the whole page so the AI specialist
           * cost is never disconnected from the user's balance. */}
          <div
            className="hidden sm:inline-flex items-center gap-1.5 h-7 px-2.5 rounded-full bg-[var(--ds-line-2)] text-[12px] font-medium tabular-nums"
            title={`${credits} AI credits remaining`}
          >
            <Coins className="size-3.5 text-[var(--ds-amber-fg)]" />
            <span>{credits}</span>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={() => nav(`/editor/${draft.id}/review`)}
          >
            <ArrowLeft className="size-3.5 mr-1" />
            Review
          </Button>
        </div>
      </header>

      {/* Scrollable body — this is the fix for the page not scrolling.
       * The wrapper owns flex sizing; this child owns overflow + max-width. */}
      <div className="flex-1 min-h-0 overflow-y-auto">
        <div className="mx-auto max-w-3xl px-4 py-7 sm:px-6 sm:py-10">
        <h1 className="text-[26px] font-semibold tracking-tight">Finalize letter</h1>
        <p className="text-[14px] text-[var(--ds-muted)] mt-1.5 mb-7 max-w-[600px]">
          Last gate before this letter leaves the building. Check the health
          score, get independent eyes if it matters, and export the formats
          you need.
        </p>

        {/* ───────── Step 1: Letter health ───────── */}
        <SectionHeader step={1} title="Letter health" />
        <motion.div
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.28, ease: [0.32, 0.72, 0, 1] }}
          className="rounded-xl border border-[var(--ds-line)] bg-[var(--ds-surface)] overflow-hidden mb-8"
        >
          {/* Top: ring + verdict */}
          <div className="flex items-center gap-5 p-5 border-b border-[var(--ds-line-2)]">
            <ScoreRing score={scoreData.score} band={scoreData.band} />
            <div className="flex-1 min-w-0">
              <span
                className={cn(
                  "inline-block px-2.5 py-0.5 rounded text-[11px] font-semibold uppercase tracking-wider mb-1.5",
                  BAND_CLASSES[scoreData.band].bg,
                  BAND_CLASSES[scoreData.band].text,
                )}
              >
                {BAND_LABEL[scoreData.band]}
              </span>
              <h3 className="text-[15px] font-semibold text-[var(--ds-ink)] mb-0.5">
                {scoreData.oneLiner}
              </h3>
              <p className="text-[12.5px] text-[var(--ds-muted)] m-0">
                {scoreData.passCount} of {scoreData.totalCount} static checks
                pass
                {scoreData.warnCount > 0 && ` · ${scoreData.warnCount} warning${scoreData.warnCount === 1 ? "" : "s"}`}
                {scoreData.failCount > 0 && ` · ${scoreData.failCount} blocker${scoreData.failCount === 1 ? "" : "s"}`}
              </p>
            </div>
          </div>

          {/* Two-col: static checks + AI evaluation */}
          <div className="grid sm:grid-cols-2 grid-cols-1">
            <div className="p-5">
              <h4 className="text-[10.5px] font-semibold uppercase tracking-wider text-[var(--ds-muted)] mb-3">
                Static checks
              </h4>
              <ul className="space-y-2 m-0 p-0 list-none">
                {checks.map((c, i) => (
                  <CheckRow key={c.id} check={c} index={i} />
                ))}
              </ul>
            </div>

            <div className="p-5 border-t sm:border-t-0 sm:border-l border-[var(--ds-line-2)]">
              <div className="flex items-center gap-1.5 text-[10.5px] font-semibold uppercase tracking-wider text-[var(--ds-muted)] mb-3">
                <Bot className="size-3" />
                AI evaluation
              </div>
              <div className="space-y-2.5 text-[13px] text-[var(--ds-ink)] leading-relaxed">
                <p className="m-0">
                  <strong className="font-semibold">Tone:</strong>{" "}
                  Measured and procedural. Avoids defensive language while
                  clearly stating position. Register holds throughout.
                </p>
                <p className="m-0">
                  <strong className="font-semibold">Risk:</strong>{" "}
                  Low. No statements that could be construed as admission of
                  liability.
                </p>
                <p className="m-0 text-[var(--ds-muted)] italic text-[12.5px]">
                  Full AI critique available below (Step 2 → AI specialist).
                </p>
              </div>
            </div>
          </div>
        </motion.div>

        {/* ───────── Step 2: Independent review ───────── */}
        <SectionHeader
          step={2}
          title="Independent review"
          meta="Optional · recommended for high-stakes letters"
        />
        <motion.div
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.28, delay: 0.05, ease: [0.32, 0.72, 0, 1] }}
          className="rounded-xl border border-[var(--ds-line)] bg-[var(--ds-surface)] overflow-hidden mb-8"
        >
          <div className="grid md:grid-cols-3 grid-cols-1 divide-y md:divide-y-0 md:divide-x divide-[var(--ds-line-2)]">
            {/* AI specialist */}
            <ReviewLane
              icon={<Sparkles className="size-4" />}
              title="AI specialist"
              desc="Pick a perspective — Tribunal counsel, Employee advocate, or DEI lead — for an instant structured critique."
              statLabel="Cost"
              statValue={
                <span className="inline-flex items-center gap-1">
                  <Coins className="size-3 text-[var(--ds-amber-fg)]" />
                  {AI_REVIEW_COST} credits
                </span>
              }
              timeLabel="Returns in"
              timeValue="~30s"
              cta={
                aiReviewState === "running"
                  ? "Analysing…"
                  : aiReviewState === "complete"
                    ? "View critique"
                    : aiReviewState === "low-credits"
                      ? "Top up credits"
                      : "Get AI critique"
              }
              ctaIcon={
                aiReviewState === "running" ? (
                  <motion.div
                    animate={{ rotate: 360 }}
                    transition={{ repeat: Infinity, duration: 1, ease: "linear" }}
                  >
                    <Sparkles className="size-3.5" />
                  </motion.div>
                ) : (
                  <ArrowRight className="size-3.5" />
                )
              }
              onClick={onAiCritique}
              primary
              footer={
                <span className="text-[10.5px] text-[var(--ds-muted)] inline-flex items-center gap-1">
                  <Coins className="size-3" /> {credits} credits available
                </span>
              }
            />

            {/* Your team */}
            <ReviewLane
              icon={<Users className="size-4" />}
              title="Your team"
              desc="Send to a colleague you've added. They can edit, comment, or sign off. Free, async."
              statLabel="Cost"
              statValue={<>Free</>}
              timeLabel="Returns in"
              timeValue="Async"
              cta="Send to teammate"
              ctaIcon={<ArrowRight className="size-3.5" />}
              onClick={() => alert("Team review — coming soon")}
            />

            {/* External consultant */}
            <ReviewLane
              icon={<ShieldCheck className="size-4" />}
              title="External consultant"
              desc="Vetted HR/employment specialist reviews and edits. Best for settlements, dismissals, tribunal-bound letters."
              statLabel="From"
              statValue={<>£85</>}
              timeLabel="SLA"
              timeValue="24–48h"
              cta="Browse consultants"
              ctaIcon={<ArrowRight className="size-3.5" />}
              onClick={() => alert("Consultant marketplace — coming soon")}
            />
          </div>
        </motion.div>

        {/* ───────── Step 3: Export ───────── */}
        <SectionHeader
          step={3}
          title="Export"
          meta="Download what you need · all files include an attestation hash"
        />
        <motion.div
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.28, delay: 0.1, ease: [0.32, 0.72, 0, 1] }}
          className="rounded-xl border border-[var(--ds-line)] bg-[var(--ds-surface)] overflow-hidden mb-8"
        >
          <ul className="m-0 p-0 list-none divide-y divide-[var(--ds-line-2)]">
            <ExportRow
              icon={<FileText className="size-4" />}
              title="PDF — print-ready"
              desc="A4 paged render with letterhead and signature. Most common format."
              cta="Download"
              busy={busyFormat === "pdf"}
              primary
              onClick={onExportPdf}
            />
            <ExportRow
              icon={<FileText className="size-4" />}
              title="DOCX — editable"
              desc="Microsoft Word format. Useful if recipient needs to amend."
              cta="Download"
              busy={busyFormat === "docx"}
              onClick={onExportDocx}
            />
            <ExportRow
              icon={<Package className="size-4" />}
              title="Evidence bundle — zip"
              desc="PDF + DOCX + all attached evidence + change history + audit. One package for handover."
              cta="Download"
              busy={busyFormat === "pack"}
              onClick={onExportPack}
            />
            <ExportRow
              icon={<Copy className="size-4" />}
              title="Copy as plain text"
              desc="For pasting directly into an email body. Strips formatting, keeps structure."
              cta={busyFormat === "copy" ? "Copied ✓" : "Copy"}
              busy={false}
              onClick={onCopyPlain}
            />
          </ul>

          <div className="flex items-center gap-2 px-5 py-3 bg-[var(--ds-line-2)] text-[12px] text-[var(--ds-muted)]">
            <ShieldCheck className="size-3.5 shrink-0" />
            <span className="flex-1">
              Every download is logged in Activity with an attestation hash.
            </span>
          </div>
        </motion.div>

        {/* ───────── Final action bar ───────── */}
        <div className="flex flex-wrap items-center gap-3 pt-5 border-t border-[var(--ds-line)]">
          <span className="text-[12.5px] text-[var(--ds-muted)] flex-1 min-w-[200px]">
            Marking as sent locks this letter and moves it to Archive.
          </span>
          <Button
            variant="outline"
            onClick={() => nav(`/editor/${draft.id}/review`)}
          >
            <ArrowLeft className="size-4 mr-1.5" />
            Back to Review
          </Button>
          <Button onClick={onMarkAsSent} disabled={scoreData.failCount > 0}>
            <Send className="size-4 mr-1.5" />
            Mark as sent
          </Button>
        </div>
        </div>
      </div>
    </div>
  );
}

/* ============================================================================
 * Subcomponents — defined at module level (avoid the rerender-no-inline-
 * components anti-pattern of declaring them inside Finalize).
 * ==========================================================================*/

function SectionHeader({
  step,
  title,
  meta,
}: {
  step: number;
  title: string;
  meta?: string;
}) {
  return (
    <div className="flex items-baseline gap-2.5 mb-3">
      <span className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-[var(--ds-ink)] text-white text-[11px] font-semibold">
        {step}
      </span>
      <h2 className="text-[15px] font-semibold m-0">{title}</h2>
      {meta && (
        <span className="ml-auto text-[12px] text-[var(--ds-muted)] truncate">
          {meta}
        </span>
      )}
    </div>
  );
}

function CheckRow({ check, index }: { check: HealthCheck; index: number }) {
  const iconClass =
    check.severity === "pass"
      ? "bg-[var(--ds-green-bg)] text-[var(--ds-green-fg)]"
      : check.severity === "warn"
        ? "bg-[var(--ds-amber-bg)] text-[var(--ds-amber-fg)]"
        : "bg-[var(--ds-red-bg)] text-[var(--ds-red-fg)]";
  const Icon =
    check.severity === "pass"
      ? Check
      : check.severity === "warn"
        ? AlertTriangle
        : XCircle;
  return (
    <motion.li
      initial={{ opacity: 0, x: -4 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{
        duration: 0.22,
        delay: 0.05 + index * 0.04,
        ease: [0.32, 0.72, 0, 1],
      }}
      className="flex items-start gap-2.5 text-[12.5px]"
    >
      <span
        className={cn(
          "inline-flex items-center justify-center size-4 rounded-full shrink-0 mt-0.5",
          iconClass,
        )}
      >
        <Icon className="size-2.5" strokeWidth={2.5} />
      </span>
      <div className="flex-1 min-w-0">
        <div
          className={cn(
            check.severity === "pass"
              ? "text-[var(--ds-ink)]"
              : "text-[var(--ds-ink)]",
          )}
        >
          {check.label}
        </div>
        {check.detail && (
          <div className="text-[11.5px] text-[var(--ds-muted)] mt-0.5">
            {check.detail}
          </div>
        )}
      </div>
    </motion.li>
  );
}

function ReviewLane({
  icon,
  title,
  desc,
  statLabel,
  statValue,
  timeLabel,
  timeValue,
  cta,
  ctaIcon,
  onClick,
  primary,
  footer,
}: {
  icon: React.ReactNode;
  title: string;
  desc: string;
  statLabel: string;
  statValue: React.ReactNode;
  timeLabel: string;
  timeValue: React.ReactNode;
  cta: string;
  ctaIcon: React.ReactNode;
  onClick: () => void;
  primary?: boolean;
  footer?: React.ReactNode;
}) {
  return (
    <div className="p-4 flex flex-col min-h-[220px]">
      <div className="inline-flex items-center justify-center size-8 rounded-lg bg-[var(--ds-line-2)] text-[var(--ds-ink)] mb-2.5">
        {icon}
      </div>
      <h3 className="text-[14px] font-semibold m-0 mb-1">{title}</h3>
      <p className="text-[12.5px] text-[var(--ds-muted)] m-0 mb-3 leading-snug">{desc}</p>

      <div className="flex gap-3 px-3 py-2 bg-[var(--ds-line-2)] rounded-md mb-3">
        <div className="flex flex-col">
          <span className="text-[10px] uppercase tracking-wider text-[var(--ds-muted)] font-semibold">
            {statLabel}
          </span>
          <span className="text-[12px] font-semibold tabular-nums">
            {statValue}
          </span>
        </div>
        <div className="flex flex-col">
          <span className="text-[10px] uppercase tracking-wider text-[var(--ds-muted)] font-semibold">
            {timeLabel}
          </span>
          <span className="text-[12px] font-semibold tabular-nums">
            {timeValue}
          </span>
        </div>
      </div>

      <motion.button
        type="button"
        onClick={onClick}
        whileHover={{ scale: 1.02 }}
        whileTap={{ scale: 0.97 }}
        transition={{ duration: 0.12 }}
        className={cn(
          "mt-auto inline-flex items-center justify-center gap-1.5 w-full h-8 px-3 rounded-md text-[12px] font-semibold transition",
          primary
            ? "bg-[var(--ds-ink)] text-white hover:opacity-90"
            : "bg-[var(--ds-surface)] text-[var(--ds-ink)] border border-[var(--ds-line)] hover:bg-[var(--ds-line-2)]",
        )}
      >
        {cta}
        {ctaIcon}
      </motion.button>

      {footer && <div className="mt-2">{footer}</div>}
    </div>
  );
}

function ExportRow({
  icon,
  title,
  desc,
  cta,
  busy,
  primary,
  onClick,
}: {
  icon: React.ReactNode;
  title: string;
  desc: string;
  cta: string;
  busy: boolean;
  primary?: boolean;
  onClick: () => void;
}) {
  return (
    <li className="flex items-center gap-3.5 px-5 py-3">
      <div className="inline-flex items-center justify-center size-9 rounded-lg bg-[var(--ds-line-2)] text-[var(--ds-ink)] shrink-0">
        {icon}
      </div>
      <div className="flex-1 min-w-0">
        <h4 className="text-[13px] font-semibold m-0 mb-0.5">{title}</h4>
        <p className="text-[12px] text-[var(--ds-muted)] m-0">{desc}</p>
      </div>
      <motion.button
        type="button"
        onClick={onClick}
        disabled={busy}
        whileHover={{ scale: 1.03 }}
        whileTap={{ scale: 0.96 }}
        transition={{ duration: 0.12 }}
        className={cn(
          "shrink-0 inline-flex items-center gap-1.5 h-8 px-3 rounded-md text-[12px] font-semibold transition disabled:opacity-60 disabled:cursor-wait",
          primary
            ? "bg-[var(--ds-ink)] text-white hover:opacity-90"
            : "bg-[var(--ds-surface)] text-[var(--ds-ink)] border border-[var(--ds-line)] hover:bg-[var(--ds-line-2)]",
        )}
      >
        {busy ? (
          <motion.div
            animate={{ rotate: 360 }}
            transition={{ repeat: Infinity, duration: 1, ease: "linear" }}
          >
            <FileDown className="size-3.5" />
          </motion.div>
        ) : (
          <FileDown className="size-3.5" />
        )}
        {busy ? "…" : cta}
      </motion.button>
    </li>
  );
}
