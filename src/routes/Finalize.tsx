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
  Sparkles,
  Star,
  ArrowRight,
  X,
} from "lucide-react";

import { useDraftStore } from "@/lib/store";
import { getLetterMeta } from "@/lib/letters/catalog";
import { exportRequiresCounselGate } from "@/lib/letters/disclaimers";
import type { Draft } from "@/lib/letters/types";
import { recipientNameFor } from "@/lib/letters/display";
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
import { WizardChrome } from "@/components/editor/WizardChrome";
import { CONSULTANTS, type Consultant } from "@/components/editor/review/ConsultTab";

/**
 * Finalise — Option H layout.
 *
 * Sidebar: WizardChrome + thumbnail + ship checklist + export 2×2 + sticky Mark-as-sent CTA.
 * Canvas: CounselAttestation (if required) + 3-card consultant marketplace + trust line + skip row.
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
  const [counselConfirmed, setCounselConfirmed] = useState(false);

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
    if (counselGateRequired && !counselConfirmed) {
      alert("Please confirm counsel review before exporting this letter.");
      return false;
    }
    return true;
  };

  const onExportPdf = async () => {
    if (!guardCounsel()) return;
    setBusyFormat("pdf");
    try {
      const { renderLetterPdfBlob, filenameFor } = await import("@/lib/export/pdf");
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
      const { renderLetterDocxBlob, docxFilenameFor } = await import("@/lib/export/docx");
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
    setTimeout(() => nav("/activity"), 1600);
  };

  /* -------------------------- Render -------------------------- */

  return (
    <div className="flex flex-col flex-1 min-h-0 bg-[var(--ds-canvas)]">
      {showConfetti && <ConfettiBurst onDone={() => setShowConfetti(false)} />}

      {/* Branded sticky header */}
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

      {/* 2-column layout: 300px sidebar + scrollable body */}
      <div className="grid min-h-0 flex-1 grid-cols-1 lg:grid-cols-[300px_minmax(0,1fr)]">

        {/* ── Sidebar ── */}
        <aside className="hidden min-h-0 border-r border-[var(--ds-line)] bg-[var(--ds-surface)] lg:flex lg:flex-col">
          <WizardChrome draftId={draft.id} mode={draft.mode} current="finalize" />

          <div className="flex-1 overflow-y-auto px-3 py-3 flex flex-col gap-3 min-h-0">
            {/* What you're sending */}
            <SectionLabel>What you're sending</SectionLabel>
            <ThumbnailBlock draft={draft} />

            {/* Ready to ship checklist */}
            <SectionLabel right={`${scoreData.score} · ${BAND_LABEL[scoreData.band]}`}>
              Ready to ship
            </SectionLabel>
            <ShipChecklist
              draft={draft}
              scoreData={scoreData}
              counselAttested={counselAttested}
              onFixClick={() => nav(`/editor/${draft.id}/review`)}
            />

            {/* Export 2×2 grid */}
            <SectionLabel>Export</SectionLabel>
            <div className="grid grid-cols-2 gap-1.5">
              <FormatTile
                compact
                title="PDF"
                desc="Print-ready"
                primary
                busy={busyFormat === "pdf"}
                onClick={onExportPdf}
                disabled={!counselAttested}
                icon={<FileText className="size-3.5" />}
              />
              <FormatTile
                compact
                title="DOCX"
                desc="Editable"
                busy={busyFormat === "docx"}
                onClick={onExportDocx}
                disabled={!counselAttested}
                icon={<FileText className="size-3.5" />}
              />
              <FormatTile
                compact
                title="TXT"
                desc="Plain"
                busy={busyFormat === "txt"}
                onClick={onExportTxt}
                disabled={!counselAttested}
                icon={<FileType2 className="size-3.5" />}
              />
              <FormatTile
                compact
                title="ZIP"
                desc="Pack"
                busy={busyFormat === "zip"}
                onClick={onExportZip}
                disabled={!counselAttested}
                icon={<Package className="size-3.5" />}
              />
            </div>
          </div>

          {/* Sticky Mark-as-sent CTA */}
          <button
            type="button"
            onClick={onMarkAsSent}
            disabled={shipBlocked}
            className="shrink-0 bg-[var(--ds-ink)] text-white text-[13px] font-bold py-3 flex items-center justify-center gap-2 hover:opacity-90 disabled:bg-[var(--ds-line)] disabled:text-[var(--ds-muted)] disabled:cursor-not-allowed transition"
          >
            <Send className="size-3.5" /> Mark as sent
          </button>
        </aside>

        {/* ── Canvas / Body ── */}
        <main className="min-h-0 overflow-y-auto">
          <div className="mx-auto max-w-[1000px] px-4 py-7 sm:px-6 sm:py-10">

            {/* Counsel attestation gate — only for high-risk letters */}
            {counselGateRequired && (
              <CounselAttestation
                confirmed={counselConfirmed}
                onToggle={() => setCounselConfirmed((v) => !v)}
              />
            )}

            {/* Header */}
            <div className="flex items-center gap-3 mt-2">
              <span className="size-9 rounded-lg bg-[var(--ds-violet-bg,#f5f3ff)] text-[var(--ds-violet-fg,#7c3aed)] grid place-items-center shrink-0">
                <Sparkles className="size-4" />
              </span>
              <div className="flex-1 min-w-0">
                <h2 className="text-[16px] font-semibold tracking-tight m-0">
                  One last check — counsel review
                </h2>
                <p className="text-[12px] text-[var(--ds-muted)] mt-0.5 m-0">
                  Optional second opinion before this leaves the building · most reviews back within 24h
                </p>
              </div>
              <span className="text-[10px] text-[var(--ds-violet-fg,#7c3aed)] bg-[var(--ds-violet-bg,#f5f3ff)] px-2 py-1 rounded-full font-semibold shrink-0 hidden sm:inline">
                AI MATCHED · 3 of 14 verified
              </span>
            </div>

            {/* 3-card consultant grid */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mt-4">
              {CONSULTANTS.map((c) => (
                <ConsultantCard
                  key={c.initials}
                  consultant={c}
                  onBook={() => alert(`Book ${c.name} — coming soon`)}
                />
              ))}
            </div>

            {/* Trust line */}
            <div className="mt-4 flex items-center gap-3 px-4 py-2.5 bg-[var(--ds-line-2)] rounded-lg text-[11.5px] text-[var(--ds-muted)]">
              <span>All UK-qualified · £1M PI insurance · ICO registered · 4.86 avg rating</span>
              <span className="ml-auto font-semibold text-[var(--ds-ink)] cursor-pointer whitespace-nowrap">
                See all 14 →
              </span>
            </div>

            {/* Skip row */}
            <div className="mt-3 text-center text-[11.5px] text-[var(--ds-muted)] p-3 border border-dashed border-[var(--ds-line)] rounded-lg">
              Or skip —{" "}
              <button
                type="button"
                onClick={onMarkAsSent}
                disabled={!readyToShip}
                className="text-[var(--ds-ink)] font-semibold underline disabled:no-underline disabled:text-[var(--ds-muted)] disabled:cursor-not-allowed"
              >
                mark as sent
              </button>{" "}
              without a second opinion
            </div>

          </div>
        </main>
      </div>
    </div>
  );
}

/* ============================================================================
 * Subcomponents
 * ==========================================================================*/

/** Tiny uppercase section label with optional right-aligned secondary text. */
function SectionLabel({
  children,
  right,
}: {
  children: React.ReactNode;
  right?: string;
}) {
  return (
    <div className="text-[10px] font-bold uppercase tracking-[.08em] text-[var(--ds-muted)] mt-1 select-none">
      {children}
      {right && (
        <span className="float-right text-[var(--ds-subtle,var(--ds-muted))] font-medium normal-case tracking-normal">
          {right}
        </span>
      )}
    </div>
  );
}

/** Mini letter thumbnail + meta rows (pages, recipient, evidence). */
function ThumbnailBlock({ draft }: { draft: Draft }) {
  const recipient = recipientNameFor(draft) ?? "HR Officer";
  const evidenceCount = draft.evidence?.length ?? 0;

  // Pull first section text for the mini paper preview
  const firstSectionText = (draft.sections[0]?.html ?? "")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 260);

  return (
    <div className="bg-[var(--ds-surface)] border border-[var(--ds-line)] rounded-lg p-2.5 flex items-start gap-2.5">
      {/* Mini paper */}
      <div
        className="shrink-0 w-14 h-20 bg-white border border-[var(--ds-line)] rounded-sm shadow-sm overflow-hidden p-1.5"
        style={{ fontFamily: '"Source Serif 4", Georgia, serif' }}
        aria-hidden="true"
      >
        <p
          className="text-[var(--ds-muted)] leading-tight"
          style={{ fontSize: "3.5px", lineHeight: 1.3 }}
        >
          {firstSectionText || "Dear HR,\n\nI formally request…"}
        </p>
      </div>

      {/* Meta rows */}
      <div className="flex-1 min-w-0">
        <div className="text-[11.5px] font-semibold text-[var(--ds-ink)] mb-1 truncate">
          {draft.title ?? "Letter"}
        </div>
        <MetaRow label="Pages" value="2 · A4" />
        <MetaRow label="To" value={recipient} />
        <MetaRow
          label="Evidence"
          value={evidenceCount > 0 ? `${evidenceCount} file${evidenceCount === 1 ? "" : "s"}` : "None"}
        />
      </div>
    </div>
  );
}

function MetaRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center gap-1.5 mt-0.5">
      <span
        className="text-[var(--ds-muted)] font-semibold uppercase tracking-[.04em] shrink-0"
        style={{ fontSize: "9px", minWidth: "44px" }}
      >
        {label}
      </span>
      <span className="text-[10px] text-[var(--ds-muted)] truncate">{value}</span>
    </div>
  );
}

/** 5-item ship checklist with ✓ / ✗ / ○ visual states. */
function ShipChecklist({
  draft,
  scoreData,
  counselAttested,
  onFixClick,
}: {
  draft: Draft;
  scoreData: ReturnType<typeof computeHealthScore>;
  counselAttested: boolean;
  onFixClick: () => void;
}) {
  const evidenceCount = draft.evidence?.length ?? 0;
  const recipient = recipientNameFor(draft);

  const allSectionsReady = draft.sections.every(
    (s) => (s.html ?? "").replace(/<[^>]+>/g, "").trim().length > 0,
  );

  type CheckState = "ok" | "fail" | "warn" | "pending";

  const items: Array<{
    state: CheckState;
    title: string;
    sub?: string;
    fixable?: boolean;
  }> = [
    {
      state: allSectionsReady ? "ok" : "warn",
      title: "All sections written",
      sub: allSectionsReady
        ? `${draft.sections.length} of ${draft.sections.length} ready`
        : "Some sections still empty",
      fixable: !allSectionsReady,
    },
    {
      state: evidenceCount > 0 ? "ok" : "warn",
      title: "Evidence linked",
      sub:
        evidenceCount > 0
          ? `${evidenceCount} file${evidenceCount === 1 ? "" : "s"}`
          : "No evidence attached",
    },
    {
      state: "ok",
      title: "Letterhead attached",
    },
    {
      state: recipient ? "ok" : "fail",
      title: "Recipient details",
      sub: recipient ? undefined : "Missing — required",
      fixable: !recipient,
    },
    {
      state: counselAttested ? "ok" : "pending",
      title: "Counsel review",
      sub: counselAttested ? undefined : "Optional · see canvas",
    },
  ];

  const stateClasses: Record<CheckState, string> = {
    ok: "bg-[var(--ds-green-bg)] text-[var(--ds-green-fg)]",
    warn: "bg-[var(--ds-amber-bg)] text-[var(--ds-amber-fg)]",
    fail: "bg-[var(--red-lt,#fef2f2)] text-[var(--red,#dc2626)]",
    pending: "bg-[var(--ds-line-2)] text-[var(--ds-muted)]",
  };

  const stateIcon: Record<CheckState, React.ReactNode> = {
    ok: <Check className="size-2.5" strokeWidth={3} />,
    warn: <AlertTriangle className="size-2.5" strokeWidth={2.5} />,
    fail: <X className="size-2.5" strokeWidth={3} />,
    pending: <span className="text-[8px] font-bold leading-none">○</span>,
  };

  return (
    <div className="bg-[var(--ds-surface)] border border-[var(--ds-line)] rounded-lg overflow-hidden">
      {items.map((item, i) => (
        <div
          key={item.title}
          className={cn(
            "flex items-start gap-2.5 px-2.5 py-2 text-[11.5px] text-[var(--ds-body,var(--ds-ink))]",
            i < items.length - 1 && "border-b border-[var(--ds-line-2)]",
            item.fixable && "cursor-pointer hover:bg-[var(--ds-canvas)]",
          )}
          onClick={item.fixable ? onFixClick : undefined}
          role={item.fixable ? "button" : undefined}
        >
          <span
            className={cn(
              "size-[17px] rounded-full shrink-0 grid place-items-center mt-0.5",
              stateClasses[item.state],
            )}
          >
            {stateIcon[item.state]}
          </span>
          <div className="flex-1 min-w-0">
            <div
              className={cn(
                "font-semibold leading-tight",
                item.state === "pending" && "text-[var(--ds-muted)] font-medium",
              )}
            >
              {item.title}
            </div>
            {item.sub && (
              <div className="text-[10.5px] text-[var(--ds-muted)] mt-0.5">
                {item.sub}
              </div>
            )}
          </div>
          {item.fixable && (
            <span className="text-[10px] font-semibold text-[var(--ds-ink)] bg-[var(--ds-line-2)] px-1.5 py-0.5 rounded self-center shrink-0">
              Fix →
            </span>
          )}
        </div>
      ))}
    </div>
  );
}

/**
 * Compact export tile for the 2-col sidebar grid.
 * Supports compact=true (sidebar) and the default large mode (kept for future use).
 */
function FormatTile({
  icon,
  title,
  desc,
  busy,
  primary,
  disabled,
  onClick,
  compact,
}: {
  icon: React.ReactNode;
  title: string;
  desc: string;
  busy: boolean;
  primary?: boolean;
  disabled?: boolean;
  onClick: () => void;
  compact?: boolean;
}) {
  if (compact) {
    return (
      <motion.button
        type="button"
        onClick={onClick}
        disabled={busy || disabled}
        whileHover={{ scale: disabled ? 1 : 1.02 }}
        whileTap={{ scale: disabled ? 1 : 0.97 }}
        transition={{ duration: 0.12 }}
        className={cn(
          "flex flex-col gap-0.5 p-2 rounded-md text-left transition disabled:opacity-50 disabled:cursor-not-allowed",
          primary
            ? "bg-[var(--ds-ink)] text-white"
            : "bg-[var(--ds-surface)] border border-[var(--ds-line)] text-[var(--ds-ink)] hover:bg-[var(--ds-line-2)]",
        )}
      >
        <div className="flex items-center gap-1">
          {busy ? (
            <motion.span
              animate={{ rotate: 360 }}
              transition={{ repeat: Infinity, duration: 1, ease: "linear" }}
              className="inline-flex"
            >
              <FileDown className="size-3" />
            </motion.span>
          ) : (
            <span className={primary ? "text-white/80" : "text-[var(--ds-muted)]"}>
              {icon}
            </span>
          )}
          <span className="text-[11px] font-semibold leading-tight">
            {busy ? "…" : title}
          </span>
        </div>
        <span
          className={cn(
            "text-[9px] leading-tight",
            primary ? "text-white/70" : "text-[var(--ds-muted)]",
          )}
        >
          {desc}
        </span>
      </motion.button>
    );
  }

  // Full-size tile (kept for potential future use)
  return (
    <div className="flex flex-col items-start gap-2 p-4">
      <div className="inline-flex items-center justify-center size-8 rounded-lg bg-[var(--ds-line-2)] text-[var(--ds-ink)]">
        {icon}
      </div>
      <div className="flex-1">
        <h4 className="text-[13px] font-semibold m-0 leading-tight">{title}</h4>
        <p className="text-[11.5px] text-[var(--ds-muted)] m-0 mt-0.5 leading-snug">{desc}</p>
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
 * Counsel-review attestation gate. Only renders for high-risk letter types.
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
        "rounded-xl border px-4 py-3 mb-5 flex items-center gap-3 cursor-pointer select-none transition",
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

/** Prominent consultant card for the marketplace canvas (Option H). */
function ConsultantCard({
  consultant: c,
  onBook,
}: {
  consultant: Consultant;
  onBook: () => void;
}) {
  return (
    <div
      className={cn(
        "relative bg-[var(--ds-surface)] rounded-xl flex flex-col gap-2 p-3.5",
        c.top
          ? "border-2 border-[var(--ds-ink)]"
          : "border border-[var(--ds-line)]",
      )}
    >
      {/* TOP MATCH ribbon */}
      {c.top && (
        <span className="absolute -top-2.5 left-3.5 bg-[var(--ds-ink)] text-white text-[9.5px] font-bold uppercase tracking-[.06em] px-2 py-0.5 rounded">
          ★ Top match
        </span>
      )}

      {/* Photo */}
      <img
        src={c.photoUrl}
        alt={c.name}
        className={cn(
          "size-16 rounded-full object-cover self-center border-[3px] border-white shadow",
          c.top ? "mt-1" : "mt-3.5",
        )}
      />

      {/* Name + role + rating */}
      <div className="text-center">
        <div className="text-[13.5px] font-bold text-[var(--ds-ink)]">{c.name}</div>
        <div className="text-[10.5px] text-[var(--ds-muted)] mt-0.5">{c.role}</div>
        <div className="text-[10.5px] text-[var(--ds-amber-fg,#d97706)] mt-0.5 font-semibold">
          <Star className="size-2.5 inline -mt-0.5 mr-0.5" fill="currentColor" strokeWidth={0} />
          {c.rating.toFixed(1)}{" "}
          <span className="text-[var(--ds-muted)] font-normal">({c.reviews})</span>
        </div>
      </div>

      {/* Specialty quote */}
      <div
        className={cn(
          "text-[10.5px] text-[var(--ds-body,var(--ds-ink))] px-2 py-2 bg-[var(--ds-canvas)] rounded-md leading-snug flex-1",
          c.top && "border-l-2 border-[var(--ds-violet-fg,#7c3aed)]",
        )}
      >
        "{c.specialty}"
      </div>

      {/* Price + SLA + online status */}
      <div className="flex items-center justify-between pt-1.5 border-t border-[var(--ds-line-2)]">
        <div>
          <div className="text-[14px] font-bold text-[var(--ds-ink)]">£{c.price}</div>
          <div className="text-[10px] text-[var(--ds-muted)]">{c.sla} SLA</div>
        </div>
        <div
          className={cn(
            "text-[10px] font-semibold",
            c.top || c.initials === "RS"
              ? "text-[var(--ds-green-fg)]"
              : "text-[var(--ds-muted)]",
          )}
        >
          {c.top || c.initials === "RS" ? "● Online now" : "● Last seen 2h ago"}
        </div>
      </div>

      {/* Book CTA */}
      <button
        type="button"
        onClick={onBook}
        className={cn(
          "w-full py-2 rounded-md text-[12px] font-bold transition flex items-center justify-center gap-1.5",
          c.top
            ? "bg-[var(--ds-ink)] text-white hover:opacity-90"
            : "bg-[var(--ds-surface)] text-[var(--ds-ink)] border border-[var(--ds-line)] hover:bg-[var(--ds-line-2)]",
        )}
      >
        Book {c.name.split(" ")[0]}
        <ArrowRight className="size-3.5" />
      </button>
    </div>
  );
}
