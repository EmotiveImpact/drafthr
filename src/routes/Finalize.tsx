import { useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { motion } from "framer-motion";
import {
  ArrowLeft,
  ChevronDown,
  Download,
  FileText,
  Package,
  FileType2,
  Scale,
  Send,
  ShieldCheck,
  ArrowRight,
} from "lucide-react";

import { useDraftStore } from "@/lib/store";
import { useProfileStore } from "@/lib/profile";
import { getLetterMeta } from "@/lib/letters/catalog";
import { exportRequiresCounselGate } from "@/lib/letters/disclaimers";
import { toDateOnly } from "@/lib/date-only";
import type { Draft } from "@/lib/letters/types";
import { recipientNameFor } from "@/lib/letters/display";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import {
  runHealthChecks,
  computeHealthScore,
  type HealthCheck,
} from "@/lib/finalize/healthChecks";
import { ConfettiBurst } from "@/components/finalize/ConfettiBurst";
import { ScoreRing } from "@/components/finalize/ScoreRing";
import { DocBar, DOC_BTN, DOC_BTN_PRIMARY } from "@/components/finalize/DocBar";
import { OutputChip, PaperThumb, PlanCard, PlanStep, PlanSteps, Pill } from "@/components/finalize/Plan";
import { tintForLetter, tintStyle } from "@/components/templates/tints";
import { sanitizeLetterHtmlForExport } from "@/lib/sanitize";
import { mergeAcceptedSuggestionsHtml } from "@/lib/tiptap/suggestion-merge";

/**
 * Finalise: the last step of the letter, laid out like the 14B workspace.
 *
 * Document bar (11A): file name, Edit / Review / Finalise, Export menu with
 * PDF, Word, Plain text and Evidence pack.
 * Centre: the letter as it will be exported.
 * Side panel: what you're sending (6B), the "Ready to send" 4B step list
 * with the health ring and output chips, the counsel sign-off when the
 * letter type needs it, a 6B Experts card, then the near-black Mark as sent.
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
      const att = exportAttestation();
      const blob = await renderLetterPdfBlob(draft, att);
      downloadBlob(blob, filenameFor(draft));
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
      // TipTap's HTML has no whitespace between blocks, so textContent alone
      // ran paragraphs together ("Dear Jane,We write..."). Break lines at
      // <br> and paragraph-level blocks first.
      const htmlToPlain = (html: string): string => {
        const el = document.createElement("div");
        el.innerHTML = html ?? "";
        el.querySelectorAll("br").forEach((br) => br.replaceWith("\n"));
        el.querySelectorAll("li").forEach((li) => li.prepend("- "));
        el.querySelectorAll("p, li, h1, h2, h3, h4, h5, h6, blockquote, div, tr").forEach((b) =>
          b.append("\n\n"),
        );
        return (el.textContent ?? "").replace(/[ \t]+\n/g, "\n").replace(/\n{3,}/g, "\n\n").trim();
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

  const exportedFormats = new Set((draft.exports ?? []).map((e) => e.format));
  const letterTitle = draft.title ?? meta.title;
  const recipient = recipientNameFor(draft) ?? "HR Officer";
  const exportBlockedTitle = counselAttested
    ? undefined
    : "Add the counsel sign-off before exporting";

  const exportActions: ExportAction[] = [
    { id: "pdf", label: "PDF", ext: ".pdf", hint: "Print-ready", icon: FileText, iconCls: "text-[var(--ds-red-fg)]", onClick: onExportPdf },
    { id: "docx", label: "Word", ext: ".docx", hint: "Editable", icon: FileText, iconCls: "text-[var(--ds-blue-fg)]", onClick: onExportDocx },
    { id: "txt", label: "Plain text", ext: ".txt", hint: "No formatting", icon: FileType2, iconCls: "text-[var(--ds-muted)]", onClick: onExportTxt },
    { id: "pack", busyId: "zip", label: "Evidence pack", ext: ".zip", hint: "Letter, evidence, summary and audit file", icon: Package, iconCls: "text-[var(--ds-violet-fg)]", onClick: onExportZip },
  ];

  const blockedReason = !shipBlocked
    ? null
    : !counselAttested
      ? "Add the counsel sign-off to mark this as sent."
      : "Resolve the blocking checks in Review to mark this as sent.";

  const markAsSentButton = (extra?: string) => (
    <button
      type="button"
      onClick={onMarkAsSent}
      disabled={shipBlocked}
      className={cn(
        "flex items-center justify-center gap-2 bg-[var(--ds-accent)] font-medium text-[var(--ds-on-accent)] transition hover:bg-[var(--ds-accent-hover)]",
        "disabled:cursor-not-allowed disabled:bg-[var(--ds-chip)] disabled:text-[var(--ds-subtle)]",
        extra,
      )}
    >
      <Send className="size-3.5" /> Mark as sent
    </button>
  );

  return (
    <div className="flex flex-col flex-1 min-h-0 bg-[var(--ds-canvas)]">
      {showConfetti && <ConfettiBurst onDone={() => setShowConfetti(false)} />}

      <DocBar
        draft={draft}
        current="finalize"
        title={letterTitle}
        label="Finalise"
        actions={
          <>
            <button
              type="button"
              className={DOC_BTN}
              onClick={() => nav(`/editor/${draft.id}/review`)}
              aria-label="Back to review"
            >
              <ArrowLeft className="size-3.5" />
              <span className="hidden sm:inline">Review</span>
            </button>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button type="button" className={DOC_BTN_PRIMARY} aria-label="Export">
                  <Download className="size-3.5" />
                  <span className="hidden sm:inline">Export</span>
                  <ChevronDown className="size-3.5 opacity-70" />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-[260px]">
                <DropdownMenuLabel className="text-[12px] font-normal text-[var(--ds-muted)]">
                  {counselAttested ? "Download this letter as" : "Add the counsel sign-off to export"}
                </DropdownMenuLabel>
                {exportActions.map((a) => (
                  <DropdownMenuItem
                    key={a.id}
                    disabled={!counselAttested || busyFormat !== null}
                    onSelect={() => void a.onClick()}
                    className="gap-2.5 py-2"
                  >
                    <a.icon className={cn("size-4", a.iconCls)} />
                    <span className="flex min-w-0 flex-col">
                      <span className="text-[13px] text-[var(--ds-ink)]">{a.label}</span>
                      <span className="truncate text-[11.5px] text-[var(--ds-muted)]">{a.hint}</span>
                    </span>
                    <span className="ds-mono ml-auto text-[11px] text-[var(--ds-faint)]">{a.ext}</span>
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
          </>
        }
      />

      {/* Letter in the centre, the Finalise step in the side panel (14B).
       * Below lg the page scrolls as one column: the step first, then the
       * letter, with Mark as sent pinned to the viewport foot. */}
      <div className="grid min-h-0 flex-1 grid-cols-1 content-start overflow-y-auto lg:content-stretch lg:grid-cols-[minmax(0,1fr)_400px] lg:overflow-hidden">
        <main className="order-2 border-t lg:min-h-0 border-[var(--ds-line)] lg:order-none lg:overflow-y-auto lg:border-t-0">
          <div className="mx-auto max-w-[760px] px-3 pb-28 pt-6 sm:px-6 sm:pt-8 lg:pb-12">
            <LetterPage draft={draft} />
          </div>
        </main>

        <aside
          aria-label="Finalise"
          className="order-1 flex flex-col bg-[var(--ds-surface)] lg:order-none lg:min-h-0 lg:border-l lg:border-[var(--ds-line)]"
        >
          <div className="flex-1 space-y-3.5 p-3 sm:p-4 lg:overflow-y-auto">
            <SendingCard
              draft={draft}
              letterTitle={letterTitle}
              draftedBy={draftedBy}
              recipient={recipient}
            />

            <PlanCard
              title="Ready to send"
              sub={`Letter health ${BAND_LABEL[scoreData.band].toLowerCase()}, ${scoreData.score} of 100`}
              headerAside={<ScoreRing score={scoreData.score} band={scoreData.band} size={40} />}
            >
              <ShipChecklist
                draft={draft}
                counselAttested={counselAttested}
                counselRequired={counselGateRequired}
                onFixClick={() => nav(`/editor/${draft.id}/review`)}
              />

              <div className="mt-1 border-t border-[var(--ds-line)] pt-3">
                <div className="mb-2 text-[12px] text-[var(--ds-muted)]">Outputs</div>
                <div className="flex flex-wrap gap-1.5">
                  {exportActions.map((a) => (
                    <OutputChip
                      key={a.id}
                      icon={<a.icon className={cn("size-3.5", a.iconCls)} />}
                      name={a.label}
                      busy={busyFormat === (a.busyId ?? a.id)}
                      disabled={!counselAttested || (busyFormat !== null && busyFormat !== (a.busyId ?? a.id))}
                      done={exportedFormats.has(a.id as never)}
                      title={exportBlockedTitle ?? `Download ${a.label}${a.id === "pack" ? "" : ` (${a.ext})`}`}
                      onClick={() => void a.onClick()}
                    />
                  ))}
                </div>
              </div>
            </PlanCard>

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

            {/* Honest specialist-review offer. No fabricated stats,
             * testimonials or seed cards: the real marketplace
             * (/consultants) owns listing, loading and empty states. */}
            <ExpertsCard onSeeSpecialists={() => nav(`/consultants?draft=${draft.id}`)} />

            <p className="m-0 px-1 pb-1 text-center text-[12px] text-[var(--ds-muted)]">
              Or skip,{" "}
              <button
                type="button"
                onClick={onMarkAsSent}
                disabled={!readyToShip}
                className="font-medium text-[var(--ds-ink)] underline underline-offset-2 disabled:cursor-not-allowed disabled:text-[var(--ds-subtle)] disabled:no-underline"
              >
                mark as sent
              </button>{" "}
              without a second opinion
            </p>
          </div>

          {/* Desktop: Mark as sent sits at the foot of the side panel. */}
          <div className="hidden shrink-0 border-t border-[var(--ds-line)] p-3 sm:p-4 lg:block">
            {blockedReason && (
              <p className="m-0 mb-2 text-center text-[12px] text-[var(--ds-muted)]">{blockedReason}</p>
            )}
            {markAsSentButton("h-10 w-full rounded-[var(--ds-r-s)] text-[13.5px]")}
          </div>
        </aside>
      </div>

      {/* Phones: Mark as sent pinned to the viewport foot, always within
       * thumb reach without scrolling. */}
      <div className="fixed inset-x-0 bottom-0 z-30 border-t border-[var(--ds-line)] bg-[var(--ds-surface)] p-3 shadow-[var(--ds-shadow-m)] lg:hidden">
        {markAsSentButton("h-11 w-full rounded-[var(--ds-r-m)] text-[14px]")}
      </div>
    </div>
  );
}

/* ============================================================================
 * Subcomponents
 * ==========================================================================*/

type ExportAction = {
  id: "pdf" | "docx" | "txt" | "pack";
  /** busyFormat key when it differs from the export record's format. */
  busyId?: string;
  label: string;
  ext: string;
  hint: string;
  icon: typeof FileText;
  iconCls: string;
  onClick: () => void | Promise<void>;
};

/** The letter itself, as it will be exported, on a white A4-ish page. */
function LetterPage({ draft }: { draft: Draft }) {
  const html = useMemo(
    () =>
      draft.sections
        .map((s) =>
          sanitizeLetterHtmlForExport(mergeAcceptedSuggestionsHtml(s.html ?? "", { forExport: true })),
        )
        .filter((h) => h.replace(/<[^>]+>/g, "").trim().length > 0)
        .join(""),
    [draft.sections],
  );
  return (
    <article
      aria-label="Letter preview"
      className="rounded-[3px] bg-[var(--ds-surface)] px-6 py-8 shadow-[var(--ds-shadow-m)] ring-1 ring-[var(--ds-line)] sm:px-[68px] sm:py-16"
    >
      {html ? (
        <div className="final-letter" dangerouslySetInnerHTML={{ __html: html }} />
      ) : (
        <p className="m-0 text-[13px] text-[var(--ds-muted)]">
          This letter has no content yet. Go back to Edit to write it.
        </p>
      )}
      <style>{finalLetterStyles}</style>
    </article>
  );
}

const finalLetterStyles = `
.final-letter { font-family: var(--font-serif); font-size: 15.5px; line-height: 1.62; color: var(--ds-ink); overflow-wrap: anywhere; }
.final-letter p { margin: 0 0 0.9em; }
.final-letter h1, .final-letter h2, .final-letter h3 { font-weight: 600; line-height: 1.3; margin: 1.3em 0 0.5em; }
.final-letter h1 { font-size: 1.25rem; } .final-letter h2 { font-size: 1.12rem; } .final-letter h3 { font-size: 1rem; }
.final-letter ul, .final-letter ol { margin: 0 0 0.9em 1.3em; padding: 0; }
.final-letter li { margin: 0 0 0.3em; }
.final-letter table { width: 100%; border-collapse: collapse; margin: 0.75em 0; font-size: 0.95em; }
.final-letter th, .final-letter td { border: 1px solid var(--ds-line); padding: 6px 10px; text-align: left; }
.final-letter img { max-width: 100%; height: auto; }
.final-letter a { color: inherit; }
`;

/** 6B "What you're sending" card: tinted page thumbnail plus the facts. */
function SendingCard({
  draft,
  letterTitle,
  draftedBy,
  recipient,
}: {
  draft: Draft;
  letterTitle: string;
  draftedBy: string;
  recipient: string;
}) {
  const evidenceCount = draft.evidence?.length ?? 0;
  const jurisdiction = draft.context?.jurisdiction ?? "UK";
  return (
    <section
      aria-label="What you're sending"
      className="group/card flex items-stretch gap-3 rounded-[var(--ds-r-l)] border border-[var(--ds-line)] bg-[var(--ds-surface)] p-1.5"
    >
      <PaperThumb tint={tintForLetter(draft.letterType)} height={92} scale={0.62} className="w-[92px] shrink-0" />
      <div className="flex min-w-0 flex-1 flex-col justify-center py-1 pr-2">
        <div className="text-[11.5px] text-[var(--ds-muted)]">What you're sending</div>
        <div className="truncate text-[14px] font-medium text-[var(--ds-ink)]">{letterTitle}</div>
        <div className="mt-0.5 truncate text-[12.5px] text-[var(--ds-muted)]">
          {jurisdiction}, drafted by {draftedBy}, for {recipient}
        </div>
        <div className="mt-1.5 flex flex-wrap gap-1">
          <Pill>2 pages, A4</Pill>
          <Pill>
            {evidenceCount > 0 ? `${evidenceCount} evidence file${evidenceCount === 1 ? "" : "s"}` : "No evidence"}
          </Pill>
        </div>
      </div>
    </section>
  );
}

/** 6B Experts card: a second opinion before sending. */
function ExpertsCard({ onSeeSpecialists }: { onSeeSpecialists: () => void }) {
  return (
    <section
      aria-labelledby="finalise-experts-title"
      style={tintStyle("lavender")}
      className="overflow-hidden rounded-[var(--ds-r-l)] border border-[var(--ds-line)] bg-[var(--ds-surface)]"
    >
      <div className="mx-1.5 mt-1.5 flex h-[68px] items-center gap-3 rounded-[calc(var(--ds-r-l)-5px)] bg-[var(--tint)] px-4 text-[var(--tint-ink)]">
        <span className="grid size-9 place-items-center rounded-full bg-[var(--ds-surface)] shadow-[var(--ds-shadow-s)]">
          <Scale className="size-4" strokeWidth={1.75} />
        </span>
        <span className="text-[12.5px] font-medium">Employment law specialists</span>
      </div>
      <div className="px-4 pb-4 pt-3">
        <h3 id="finalise-experts-title" className="m-0 text-[14px] font-medium text-[var(--ds-ink)]">
          Want a second opinion before you send?
        </h3>
        <p className="m-0 mt-1 text-[12.5px] leading-relaxed text-[var(--ds-muted)]">
          Book a qualified employment law specialist to review this letter. Most reviews come back
          within 24 hours.
        </p>
        <button type="button" onClick={onSeeSpecialists} className={cn(DOC_BTN, "mt-3")}>
          See specialists
          <ArrowRight className="size-3.5" />
        </button>
      </div>
    </section>
  );
}

/** Ready-to-send checklist as a 4B step list with ticks. */
function ShipChecklist({
  draft,
  counselAttested,
  counselRequired,
  onFixClick,
}: {
  draft: Draft;
  counselAttested: boolean;
  counselRequired: boolean;
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
      sub: recipient ? undefined : "Missing, required",
      fixable: !recipient,
    },
    {
      state: counselAttested ? "ok" : "pending",
      title: "Counsel review",
      sub: counselAttested
        ? counselRequired
          ? "Signed off"
          : "Not required for this letter"
        : "Sign off below before export",
    },
  ];

  const okCount = items.filter((i) => i.state === "ok").length;
  const stepState = { ok: "ok", warn: "warn", fail: "fail", pending: "todo" } as const;

  return (
    <>
      <div className="mt-3 flex items-center gap-2">
        <div className="h-[3px] flex-1 overflow-hidden rounded-full bg-[var(--ds-line)]">
          <span
            className="block h-full rounded-full bg-[var(--ds-ink)] transition-[width] duration-500"
            style={{ width: `${(okCount / items.length) * 100}%` }}
          />
        </div>
        <span className="ds-mono shrink-0 text-[11.5px] text-[var(--ds-muted)]">
          {okCount} of {items.length}
        </span>
      </div>
      <PlanSteps>
        {items.map((item) => (
          <PlanStep
            key={item.title}
            state={stepState[item.state]}
            sub={item.sub}
            onClick={item.fixable ? onFixClick : undefined}
            aside={
              item.fixable ? (
                <span className="inline-flex h-6 items-center gap-1 rounded-[var(--ds-r-s)] border border-[var(--ds-line)] bg-[var(--ds-surface)] px-2 text-[12px] font-medium text-[var(--ds-ink)]">
                  Fix
                  <ArrowRight className="size-3" />
                </span>
              ) : undefined
            }
          >
            {item.title}
          </PlanStep>
        ))}
      </PlanSteps>
    </>
  );
}

/**
 * Counsel-review attestation gate. Only renders for high-risk letter types.
 * Blocks every export and Mark as sent until filled in and confirmed.
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
  const field =
    "mt-1 block w-full rounded-[var(--ds-r-s)] border border-[var(--ds-line)] bg-[var(--ds-surface)] px-2.5 py-1.5 text-[13px] font-normal text-[var(--ds-ink)] outline-none transition focus:border-[var(--ds-line-strong)] disabled:bg-[var(--ds-surface-2)] disabled:text-[var(--ds-muted)]";
  return (
    <motion.section
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.26, delay: 0.04, ease: [0.32, 0.72, 0, 1] }}
      aria-labelledby="counsel-signoff-title"
      className="rounded-[var(--ds-r-l)] border border-[var(--ds-line)] bg-[var(--ds-surface-2)] p-4"
    >
      <div className="mb-3 flex items-start gap-2.5">
        <span
          className={cn(
            "grid size-7 shrink-0 place-items-center rounded-full",
            confirmed
              ? "bg-[var(--ds-green-bg)] text-[var(--ds-green-fg)]"
              : "bg-[var(--ds-amber-bg)] text-[var(--ds-amber-fg)]",
          )}
        >
          <ShieldCheck className="size-4" strokeWidth={2} />
        </span>
        <div className="min-w-0 flex-1">
          <h3 id="counsel-signoff-title" className="m-0 text-[14px] font-medium text-[var(--ds-ink)]">
            Counsel sign-off
          </h3>
          <p className="m-0 mt-0.5 text-[12.5px] text-[var(--ds-muted)]">
            Required for this letter type before export or send.
          </p>
        </div>
        <Pill tone={confirmed ? "green" : "amber"} round>
          {confirmed ? "Signed off" : "Needed"}
        </Pill>
      </div>
      <div className="mb-3 grid gap-2.5 sm:grid-cols-[1fr_150px]">
        <label className="text-[12px] font-medium text-[var(--ds-body)]">
          Reviewed by (counsel)
          <input
            type="text"
            value={reviewerName}
            onChange={(e) => onReviewerNameChange(e.target.value)}
            disabled={confirmed}
            placeholder="e.g. Priya Shah, Employment Solicitor"
            className={field}
          />
        </label>
        <label className="text-[12px] font-medium text-[var(--ds-body)]">
          Review date
          <input
            type="date"
            value={reviewedOn}
            onChange={(e) => onReviewedOnChange(e.target.value)}
            disabled={confirmed}
            className={field}
          />
        </label>
      </div>
      <label
        htmlFor="counsel-attestation"
        className={cn(
          "flex items-center gap-2.5 rounded-[var(--ds-r-s)] bg-[var(--ds-surface)] px-3 py-2.5 ring-1 ring-[var(--ds-line)] select-none",
          canConfirm || confirmed ? "cursor-pointer" : "cursor-not-allowed opacity-70",
        )}
      >
        <input
          id="counsel-attestation"
          type="checkbox"
          checked={confirmed}
          disabled={!canConfirm && !confirmed}
          onChange={onToggle}
          className="size-4 shrink-0 rounded border-[var(--ds-line)] accent-[var(--ds-accent)]"
        />
        <span className="text-[13px] font-medium leading-snug text-[var(--ds-ink)]">
          I confirm this has been reviewed by counsel
        </span>
      </label>
    </motion.section>
  );
}
