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
  ArrowRight,
  X,
} from "lucide-react";

import { useDraftStore } from "@/lib/store";
import { useProfileStore } from "@/lib/profile";
import { getLetterMeta } from "@/lib/letters/catalog";
import { exportRequiresCounselGate } from "@/lib/letters/disclaimers";
import { toDateOnly } from "@/lib/date-only";
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
import { sanitizeLetterHtmlForExport } from "@/lib/sanitize";
import { mergeAcceptedSuggestionsHtml } from "@/lib/tiptap/suggestion-merge";

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
  const updateAnswers = useDraftStore((s) => s.updateAnswers);
  const profile = useProfileStore((s) => s.profile);
  // "Drafted by Jane Doe" line in the hero. Falls back gracefully when the
  // user hasn't filled out their profile yet.
  const draftedBy =
    profile.personal.preferredName ||
    profile.personal.legalName ||
    "you";

  const [busyFormat, setBusyFormat] = useState<string | null>(null);
  const [showConfetti, setShowConfetti] = useState(false);
  // Counsel attestation: who reviewed it and when. Seeded from the Editor's
  // "Mark reviewed by counsel" record so an attestation made there carries
  // through. Never defaults to the drafter: the drafter is not counsel.
  const storedCounsel = (draft?.answers as Record<string, unknown> | undefined)?._counselReview as
    | { reviewedBy?: string; reviewedOn?: string }
    | undefined;
  const [counselName, setCounselName] = useState(storedCounsel?.reviewedBy ?? "");
  const [counselDate, setCounselDate] = useState(storedCounsel?.reviewedOn ?? toDateOnly(new Date()));
  const [counselConfirmed, setCounselConfirmed] = useState(
    Boolean(storedCounsel?.reviewedBy && storedCounsel?.reviewedOn),
  );

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
  const counselComplete = counselConfirmed && counselName.trim() !== "" && counselDate !== "";
  const counselAttested = !counselGateRequired || counselComplete;

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
    if (counselGateRequired && !counselComplete) {
      alert("Please enter who reviewed this letter as counsel, and when, before exporting it.");
      return false;
    }
    return true;
  };

  // The attestation to stamp into the export artifact + the export record.
  // Only when this letter actually required counsel review AND the user
  // confirmed it — otherwise undefined (no review claimed). reviewedOn is a
  // local-calendar date (legal records read in the user's locale).
  const exportAttestation = ():
    | { reviewedBy: string; reviewedOn: string }
    | undefined => {
    if (!counselGateRequired || !counselComplete) return undefined;
    return { reviewedBy: counselName.trim(), reviewedOn: counselDate };
  };

  const onExportPdf = async () => {
    if (!guardCounsel()) return;
    setBusyFormat("pdf");
    try {
      const { renderLetterPdfBlob, filenameFor } = await import("@/lib/export/pdf");
      const blob = await renderLetterPdfBlob(draft);
      downloadBlob(blob, filenameFor(draft));
      const att = exportAttestation();
      recordExport(draft.id, { format: "pdf", reviewedBy: att?.reviewedBy, reviewedOn: att?.reviewedOn });
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
      const att = exportAttestation();
      recordExport(draft.id, { format: "docx", reviewedBy: att?.reviewedBy, reviewedOn: att?.reviewedOn });
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
      // Route through the DOM so HTML entities are DECODED, not left as raw
      // "&amp;"/"&lt;" tokens in the .txt (bug #11). innerHTML strips tags AND
      // decodes entities in one step, matching the PDF/DOCX textContent paths.
      const htmlToPlain = (html: string): string => {
        const el = document.createElement("div");
        el.innerHTML = html ?? "";
        return (el.textContent ?? "").trim();
      };
      // Resolve inline AI suggestions the same way the PDF/DOCX/pack sinks do
      // (mergeAcceptedSuggestionsHtml → sanitizeLetterHtmlForExport) BEFORE
      // flattening to text. On raw s.html, an unresolved suggestion carries both
      // a <del>(original) and an <ins>(proposed) run, so textContent would
      // concatenate BOTH → doubled/contradictory sentences in the .txt.
      const plain = draft.sections
        .map((s) =>
          htmlToPlain(
            sanitizeLetterHtmlForExport(
              mergeAcceptedSuggestionsHtml(s.html ?? "", { forExport: true }),
            ),
          ),
        )
        .filter(Boolean)
        .join("\n\n");
      const blob = new Blob([plain], { type: "text/plain;charset=utf-8" });
      const slug = (draft.title ?? meta.title)
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-+|-+$/g, "");
      downloadBlob(blob, `${slug || "letter"}.txt`);
      const att = exportAttestation();
      recordExport(draft.id, { format: "txt", reviewedBy: att?.reviewedBy, reviewedOn: att?.reviewedOn });
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
      const attestation = exportAttestation();
      await exportLetterPack(draft, attestation);
      recordExport(draft.id, {
        format: "pack",
        reviewedBy: attestation?.reviewedBy,
        reviewedOn: attestation?.reviewedOn,
      });
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
    const att = exportAttestation();
    recordExport(draft.id, { format: "marked-sent", reviewedBy: att?.reviewedBy, reviewedOn: att?.reviewedOn });
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
          <div className="mx-auto max-w-[1000px] px-4 py-7 sm:px-6 sm:py-10 pb-24 lg:pb-10">

            {/* Counsel attestation gate — only for high-risk letters */}
            {counselGateRequired && (
              <CounselAttestation
                confirmed={counselConfirmed}
                reviewerName={counselName}
                reviewedOn={counselDate}
                onReviewerNameChange={setCounselName}
                onReviewedOnChange={setCounselDate}
                onToggle={() => {
                  const next = !counselConfirmed;
                  setCounselConfirmed(next);
                  // Persist so the attestation survives leaving Finalize and
                  // matches what the Editor and Review step show.
                  const answers = { ...draft.answers } as Record<string, unknown>;
                  if (next && counselName.trim() && counselDate) {
                    answers._counselReview = {
                      reviewedBy: counselName.trim(),
                      reviewedOn: counselDate,
                      attestedAt: Date.now(),
                    };
                  } else {
                    delete answers._counselReview;
                  }
                  updateAnswers(draft.id, answers as typeof draft.answers);
                }}
              />
            )}

            {/* Document hero + honest specialist-review CTA. No fabricated
             * stats, testimonials, or seed cards — the real marketplace
             * (/consultants) owns listing, loading, and empty states. */}
            <DocumentHero
              letterTitle={draft.title ?? meta.title}
              draftedBy={draftedBy}
              recipient={recipientNameFor(draft) ?? "HR Officer"}
              onSeeSpecialists={() => nav(`/consultants?draft=${draft.id}`)}
            />

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

            {/* MOBILE-ONLY ship surface — the desktop sidebar (checklist +
             * export + Mark-as-sent) is hidden below lg, so mirror those
             * essentials here so mobile users can actually ship. The viewport-
             * fixed Mark-as-sent button outside the main element handles
             * thumb-reach for the primary action. */}
            <div className="lg:hidden mt-8 pt-6 border-t border-[var(--ds-line)] flex flex-col gap-3">
              <SectionLabel right={`${scoreData.score} · ${BAND_LABEL[scoreData.band]}`}>
                Ready to ship
              </SectionLabel>
              <ShipChecklist
                draft={draft}
                counselAttested={counselAttested}
                onFixClick={() => nav(`/editor/${draft.id}/review`)}
              />

              <SectionLabel>Export</SectionLabel>
              <div className="grid grid-cols-2 gap-2">
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

          </div>
        </main>
      </div>

      {/* Mobile-only viewport-fixed Mark-as-sent CTA. The desktop equivalent
       * lives inside the sidebar at the bottom of the left column. Below lg
       * the sidebar is hidden, so we anchor the primary ship action to the
       * viewport bottom — always reachable without scrolling. */}
      <button
        type="button"
        onClick={onMarkAsSent}
        disabled={shipBlocked}
        className="lg:hidden fixed bottom-0 inset-x-0 z-30 bg-[var(--ds-ink)] text-white text-[14px] font-bold py-3.5 flex items-center justify-center gap-2 hover:opacity-90 disabled:bg-[var(--ds-line)] disabled:text-[var(--ds-muted)] disabled:cursor-not-allowed shadow-[0_-4px_12px_rgba(0,0,0,0.10)] transition"
      >
        <Send className="size-4" /> Mark as sent
      </button>
    </div>
  );
}

/* ============================================================================
 * Subcomponents
 * ==========================================================================*/

/**
 * Document hero + social-proof upsell.
 *
 * Three vertically stacked sections inside one bordered card:
 *   1. Letter title (Playfair display serif) + "drafted by X · ready for Y"
 *      subtitle, with a Fluent Emoji 3D page icon on the left.
 *   2. Violet-tinted social-proof block: avatar stack (4 recent bookers) +
 *      "412 people had a specialist review..." sentence + "See specialists ↓"
 *      CTA that smooth-scrolls to the consultant grid below.
 *   3. Italic testimonial quote with the customer's name + resolution date.
 *
 * The 412 number and testimonial are placeholder copy — wire to a real
 * bookings API + permissioned customer testimonials before promoting this
 * to production marketing channels.
 *
 * Icons use Microsoft Fluent Emoji 3D (open source, CDN-hosted) so the
 * page/paperclip/etc render identically across macOS, Windows, Linux,
 * iOS, and Android — instead of falling back to the platform emoji font.
 */
function DocumentHero({
  letterTitle,
  draftedBy,
  recipient,
  onSeeSpecialists,
}: {
  letterTitle: string;
  draftedBy: string;
  recipient: string;
  onSeeSpecialists: () => void;
}) {
  return (
    <motion.section
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.32, ease: [0.32, 0.72, 0, 1] }}
      className="mt-2 rounded-xl border border-[var(--ds-line)] bg-[var(--ds-surface)] p-5 sm:p-6 flex flex-col gap-3"
      aria-labelledby="finalise-hero-title"
    >
      {/* Title row.
       *
       * The page icon is the raw Unicode `📄` (Page Facing Up) character. On
       * macOS/iOS it renders as Apple Color Emoji — the warm white document
       * with horizontal lines that the design mockup used. Windows users
       * see Segoe UI Emoji; Android users see Noto Color Emoji. We accept
       * the platform drift in exchange for the warmth Apple's emoji has
       * (Microsoft Fluent Emoji 3D was tried and rejected — it renders as
       * a purple Microsoft-house-style document that doesn't match the
       * mockup's softness). */}
      <div className="flex items-start gap-3">
        <div
          aria-hidden
          className="text-[36px] leading-none shrink-0 select-none"
          style={{ fontFamily: 'apple color emoji, "segoe ui emoji", "noto color emoji", emoji, system-ui, sans-serif' }}
        >
          📄
        </div>
        <div className="flex-1 min-w-0">
          <h2
            id="finalise-hero-title"
            className="m-0 font-display text-[22px] sm:text-[24px] font-semibold tracking-[-.005em] leading-[1.15] text-[var(--ds-ink)]"
            style={{ fontFamily: "var(--font-display)" }}
          >
            {letterTitle}
          </h2>
          <p className="text-[12.5px] text-[var(--ds-muted)] mt-1 m-0">
            UK · drafted by {draftedBy} · ready for {recipient}
          </p>
        </div>
      </div>

      {/* Optional specialist review — an honest CTA into the real marketplace.
       * No fabricated stats or testimonials; pricing/availability live on the
       * specialists' actual profiles. */}
      <div className="mt-1 rounded-xl border border-[var(--ds-violet-bd,#ddd6fe)] bg-gradient-to-br from-[var(--ds-violet-bg,#f5f3ff)] to-white p-3 sm:p-4 flex flex-col sm:flex-row items-start sm:items-center gap-3 sm:gap-4">
        <div className="flex-1 min-w-0 text-[12.5px] leading-snug text-[var(--ds-body)]">
          <strong className="text-[var(--ds-ink)] font-semibold">
            Want a second opinion before you send?
          </strong>{" "}
          Book a qualified employment-law specialist to review this letter — most
          reviews come back within 24 hours.
        </div>

        <button
          type="button"
          onClick={onSeeSpecialists}
          className="shrink-0 inline-flex items-center gap-1.5 h-9 px-4 rounded-lg bg-[var(--ds-ink)] text-white text-[12px] font-semibold hover:opacity-90 transition whitespace-nowrap"
        >
          See specialists
          <ArrowRight className="size-3.5" />
        </button>
      </div>
    </motion.section>
  );
}

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
  counselAttested,
  onFixClick,
}: {
  draft: Draft;
  counselAttested: boolean;
  onFixClick: () => void;
}) {
  const evidenceCount = draft.evidence?.length ?? 0;
  const recipient = recipientNameFor(draft);

  const allSectionsReady = draft.sections.every(
    (s) => (s.html ?? "").replace(/<[^>]+>/g, "").trim().length > 0,
  );

  type CheckState = "ok" | "fail" | "warn" | "pending";
  const answers = draft.answers as Record<string, unknown>;
  const hasLetterhead = Boolean(
    answers.hasLetterhead || draft.employer?.letterheadDataUrl || answers.letterheadDataUrl,
  );

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
    draft.mode === "employee"
      ? { state: "ok" as CheckState, title: "Letterhead", sub: "Not needed for an employee letter" }
      : hasLetterhead
        ? { state: "ok" as CheckState, title: "Letterhead attached" }
        : { state: "warn" as CheckState, title: "Letterhead", sub: "No company letterhead added" },
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
  reviewerName,
  reviewedOn,
  onReviewerNameChange,
  onReviewedOnChange,
  onToggle,
}: {
  confirmed: boolean;
  reviewerName: string;
  reviewedOn: string;
  onReviewerNameChange: (value: string) => void;
  onReviewedOnChange: (value: string) => void;
  onToggle: () => void;
}) {
  const canConfirm = reviewerName.trim() !== "" && reviewedOn !== "";
  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.26, delay: 0.04, ease: [0.32, 0.72, 0, 1] }}
      className={cn(
        "rounded-xl border px-4 py-3 mb-5 transition",
        confirmed
          ? "border-[var(--ds-green-bg)] bg-[var(--ds-green-bg)]/40"
          : "border-[var(--ds-amber-bg)] bg-[var(--ds-amber-bg)]/40",
      )}
    >
      <div className="grid gap-3 sm:grid-cols-[1fr_auto] mb-3">
        <label className="text-[12px] font-medium text-[var(--ds-ink)]">
          Reviewed by (counsel)
          <input
            type="text"
            value={reviewerName}
            onChange={(e) => onReviewerNameChange(e.target.value)}
            disabled={confirmed}
            placeholder="e.g. Priya Shah, Employment Solicitor"
            className="mt-1 block w-full rounded-md border border-[var(--ds-line)] bg-white px-2.5 py-1.5 text-[13px] font-normal disabled:opacity-70"
          />
        </label>
        <label className="text-[12px] font-medium text-[var(--ds-ink)]">
          Review date
          <input
            type="date"
            value={reviewedOn}
            onChange={(e) => onReviewedOnChange(e.target.value)}
            disabled={confirmed}
            className="mt-1 block w-full rounded-md border border-[var(--ds-line)] bg-white px-2.5 py-1.5 text-[13px] font-normal disabled:opacity-70"
          />
        </label>
      </div>
      <label
        htmlFor="counsel-attestation"
        className={cn("flex items-center gap-3 select-none", canConfirm || confirmed ? "cursor-pointer" : "cursor-not-allowed opacity-70")}
      >
      <input
        id="counsel-attestation"
        type="checkbox"
        checked={confirmed}
        disabled={!canConfirm && !confirmed}
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
      </label>
    </motion.div>
  );
}

