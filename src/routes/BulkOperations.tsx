import { Avatar, Pill } from "@/components/ds";
import { ListHeader } from "@/components/letters/ListHeader";
import { PaperIcon, usePageTitle } from "@/components/letters/parts";
import { tintForLetterType, tintStyle, type Tint } from "@/components/letters/letterView";
import { useMemo, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { toast } from "sonner";
import {
  AlertTriangle,
  Archive,
  CheckCircle2,
  Layers,
  ChevronLeft,
  ChevronRight,
  CircleDot,
  Download,
  FileSpreadsheet,
  Loader2,
  Sparkles,
  Upload,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Label } from "@/components/ui/label";

import { letterCatalogByMode, getLetterMeta } from "@/lib/letters/catalog";
import { useDraftStore } from "@/lib/store";
import { draftErrorCopy } from "@/components/editor/draft-error";
import type { LetterTypeId } from "@/lib/letters/types";
import {
  findMissingMergeValues,
  humaniseField,
  missingFieldsLabel,
  parseCsv,
  rowSummary,
  rowToAnswers,
  type MissingMergeValues,
  sampleCsvFor,
  sampleHeadersFor,
  type CsvParseResult,
} from "@/components/bulk/csv";
import {
  findUnresolvedPlaceholders,
  generateMergeTemplate,
  personaliseTemplate,
  type TemplateDraft,
  type TemplateProgress,
} from "@/lib/bulk/mailmerge";

type Step = 1 | 2 | 3 | 4 | 5;
type Operation = "generate" | "mass_update" | "bulk_archive";

const STEP_LABELS = [
  "Operation",
  "Template",
  "Upload",
  "Preview",
] as const;

/**
 * Business-tier bulk operations — mail-merge implementation.
 *
 * Step 1: pick operation (only "generate from CSV" is enabled).
 * Step 2: pick an HR-side letter template.
 * Step 3: upload a CSV (with sample download).
 * Step 4: preview parsed rows + warnings.
 * Step 5: results — one AI call drafts a {{placeholder}} template; we
 *         personalise + persist N drafts client-side and show the links.
 *
 * The win: ONE AI call regardless of CSV size. Drafts are created with
 * fully-substituted section HTML and are immediately editable.
 */

type GenerateState =
  | { phase: "idle" }
  | { phase: "drafting"; sectionTitle: string; sectionIndex: number; sectionCount: number }
  | { phase: "personalising"; doneRows: number; totalRows: number }
  | { phase: "error"; message: string };

type GeneratedDraftSummary = {
  draftId: string;
  title: string;
  /** Placeholders we couldn't fill from this CSV row. */
  unresolved: string[];
};

export default function BulkOperations() {
  usePageTitle("Bulk letters");
  const reduceMotion = useReducedMotion();
  const navigate = useNavigate();
  const createDraft = useDraftStore((s) => s.createDraft);
  const updateSection = useDraftStore((s) => s.updateSection);
  const setSectionStatus = useDraftStore((s) => s.setSectionStatus);

  const [step, setStep] = useState<Step>(1);
  const [operation, setOperation] = useState<Operation>("generate");
  const [letterType, setLetterType] = useState<string>("probation_outcome");
  const [csvFileName, setCsvFileName] = useState<string | null>(null);
  const [parsed, setParsed] = useState<CsvParseResult | null>(null);
  const [generateState, setGenerateState] = useState<GenerateState>({ phase: "idle" });
  const [generated, setGenerated] = useState<GeneratedDraftSummary[]>([]);
  const abortRef = useRef<AbortController | null>(null);
  const generating =
    generateState.phase === "drafting" || generateState.phase === "personalising";

  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const dropRef = useRef<HTMLDivElement | null>(null);

  // HR-side templates only. (For now: every employer template is
  // considered bulk-eligible. We'll add a flag to the catalog later.)
  const hrTemplates = useMemo(() => letterCatalogByMode("employer"), []);
  const sampleHeaders = useMemo(() => sampleHeadersFor(letterType), [letterType]);

  function readFile(file: File) {
    setCsvFileName(file.name);
    const reader = new FileReader();
    reader.onload = (evt) => {
      const text = String(evt.target?.result ?? "");
      try {
        setParsed(parseCsv(text));
      } catch (err) {
        setParsed({
          headers: [],
          rows: [],
          warnings: [],
          error:
            err instanceof Error
              ? err.message
              : "We couldn't parse this CSV. Check it has a header row and is comma-separated.",
        });
      }
    };
    reader.onerror = () => {
      setParsed({
        headers: [],
        rows: [],
        warnings: [],
        error: "We couldn't read this file. Try saving it as plain CSV.",
      });
    };
    reader.readAsText(file);
  }

  function onDrop(e: React.DragEvent<HTMLDivElement>) {
    e.preventDefault();
    const file = e.dataTransfer.files?.[0];
    if (file) readFile(file);
  }

  function downloadSample() {
    const csv = sampleCsvFor(letterType);
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${letterType}-sample.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  async function handleGenerate() {
    if (!parsed || parsed.rows.length === 0) return;
    abortRef.current?.abort();
    abortRef.current = new AbortController();
    setGenerated([]);
    setStep(5);

    let template: TemplateDraft;
    try {
      // Phase 1: ONE AI call. Generate a {{placeholder}} template using
      // row 1 as the seed for wizard answers. We do not persist this —
      // the substituted output below becomes the per-row drafts.
      const seedAnswers = rowToAnswers(parsed.rows[0], letterType);
      template = await generateMergeTemplate({
        letterType: letterType as LetterTypeId,
        mode: "employer",
        seedAnswers,
        csvHeaders: parsed.headers,
        signal: abortRef.current.signal,
        onProgress: (p: TemplateProgress) => {
          if (p.phase === "drafting") {
            setGenerateState({
              phase: "drafting",
              sectionTitle: p.sectionTitle,
              sectionIndex: p.sectionIndex,
              sectionCount: p.sectionCount,
            });
          }
          // retry events are surfaced via the existing toast / state but
          // don't change the high-level "drafting" phase.
        },
      });
    } catch (err) {
      if (abortRef.current?.signal.aborted) {
        setGenerateState({ phase: "idle" });
        return;
      }
      // Plain words on screen (the same ones the letter workspace uses); the
      // technical detail ("ANTHROPIC_API_KEY is not configured...") goes to
      // the console for whoever sets DraftHR up (LISTS-X28).
      console.error("Bulk letters: drafting the template letter failed", err);
      const message = draftErrorCopy(err);
      setGenerateState({ phase: "error", message });
      toast.error("The letters were not drafted", { description: message });
      return;
    }

    // Check every row against the placeholders the template actually uses
    // BEFORE creating drafts, and say which rows and fields will read
    // "[field not set]". The per-row result cards repeat this afterwards.
    const usedPlaceholders = Array.from(
      new Set(template.sections.flatMap((section) => findUnresolvedPlaceholders(section.html))),
    );
    const missingForTemplate = findMissingMergeValues(parsed.rows, usedPlaceholders, parsed.rowNumbers);
    if (missingForTemplate.length > 0) {
      toast.warning(
        `${missingForTemplate.length} row${missingForTemplate.length === 1 ? " is" : "s are"} missing values the letter uses`,
        {
          description: describeMissing(missingForTemplate),
          duration: 10000,
        },
      );
    }

    // Phase 2: client-side fan-out. For each row, personalise then
    // persist a new draft. No AI calls beyond this point.
    setGenerateState({
      phase: "personalising",
      doneRows: 0,
      totalRows: parsed.rows.length,
    });
    // Missing values per spreadsheet row. Substitution writes "[field not
    // set]" for these, so they never survive as {{placeholders}} and the
    // results list has to be told which rows are incomplete.
    const missingByRow = new Map(missingForTemplate.map((m) => [m.rowNumber, m.fields]));
    const summaries: GeneratedDraftSummary[] = [];
    for (let i = 0; i < parsed.rows.length; i++) {
      // Stop creating drafts the moment the user clicks Cancel — Phase 1 (the
      // AI call) honors the abort signal, but this fan-out loop did not, so
      // Cancel let it run to completion and even show a success screen.
      if (abortRef.current?.signal.aborted) break;
      const row = parsed.rows[i];
      const answers = rowToAnswers(row, letterType);
      const draftId = createDraft(
        letterType as Parameters<typeof createDraft>[0],
        answers,
        "employer"
      );

      // Find the freshly created draft to map wizard sectionId → runtime
      // section id (the store assigns a UUID on creation; mailmerge
      // template keys on the stable sectionId).
      const fresh = useDraftStore.getState().drafts[draftId];
      const sectionByWizardId = new Map(
        fresh?.sections.map((s) => [s.sectionId, s.id]) ?? []
      );

      const personalised = personaliseTemplate(template, row);
      const unresolvedForRow = new Set<string>(
        missingByRow.get(parsed.rowNumbers?.[i] ?? i + 2) ?? [],
      );
      for (const section of personalised) {
        const runtimeId = sectionByWizardId.get(section.sectionId);
        if (!runtimeId) continue;
        updateSection(draftId, runtimeId, section.html);
        // updateSection flips status to "edited"; for an AI-produced
        // section the user can see as "ready", normalise that.
        setSectionStatus(draftId, runtimeId, "ready");
        for (const ph of findUnresolvedPlaceholders(section.html)) {
          unresolvedForRow.add(ph);
        }
      }

      // No title override: like every other letter, the list shows the bare
      // type and the person comes from the draft's employee (employee_name),
      // so the sidebar reads "Pay rise · P. Shah" and Letters has the
      // recipient column. The results list names the row the same way.
      const meta = getLetterMeta(letterType as LetterTypeId);
      const recipientName = String(row.employee_name ?? "").trim();

      summaries.push({
        draftId,
        title: recipientName
          ? `${meta.shortTitle} · ${recipientName}`
          : `${meta.shortTitle} · row ${i + 1}`,
        unresolved: Array.from(unresolvedForRow),
      });
      // Yield to React so the progress UI can paint mid-loop.
      if ((i & 7) === 7) {
        await new Promise<void>((r) => setTimeout(r, 0));
      }
      setGenerateState({
        phase: "personalising",
        doneRows: i + 1,
        totalRows: parsed.rows.length,
      });
    }

    // If the run was cancelled mid-loop, don't surface the success screen/toast
    // for a partial batch. (Drafts already created stay in the store — same
    // partial-work semantics as reset(), which doesn't delete in-progress drafts.)
    if (abortRef.current?.signal.aborted) {
      setGenerateState({ phase: "idle" });
      return;
    }

    setGenerated(summaries);
    setGenerateState({ phase: "idle" });
    toast.success(
      `Created ${summaries.length} draft${summaries.length === 1 ? "" : "s"}.`,
      { duration: 4000 }
    );
  }

  function reset() {
    abortRef.current?.abort();
    setStep(1);
    setCsvFileName(null);
    setParsed(null);
    setGenerated([]);
    setGenerateState({ phase: "idle" });
  }

  const canContinue =
    (step === 1 && operation === "generate") ||
    (step === 2 && Boolean(letterType)) ||
    (step === 3 && parsed !== null && !parsed.error && parsed.rows.length > 0);

  return (
    <div className="min-w-0">
      <ListHeader
        crumbs={[{ label: "Letters", href: "/letters" }, { label: "Bulk letters" }]}
        title="Bulk letters"
        lede="Upload a CSV of employees and we'll create one personalised draft per row. Review and finalise each draft individually before sending."
      />

      <div className="grid min-w-0 gap-6 px-4 pb-12 pt-6 md:px-12 md:pt-[30px] lg:grid-cols-[minmax(0,1fr)_280px] lg:gap-9">
      <div className="min-w-0 lg:order-1 order-2">
      <AnimatePresence mode="wait">
        <motion.div
          key={step}
          initial={{ opacity: 0, x: reduceMotion ? 0 : 12 }}
          animate={{ opacity: 1, x: 0 }}
          exit={{ opacity: 0, x: reduceMotion ? 0 : -12 }}
          transition={{ duration: 0.18, ease: "easeOut" }}
        >
          {step === 1 && (
            <StepOperation operation={operation} setOperation={setOperation} />
          )}
          {step === 2 && (
            <StepTemplate
              letterType={letterType}
              setLetterType={setLetterType}
              hrTemplates={hrTemplates}
            />
          )}
          {step === 3 && (
            <StepUpload
              dropRef={dropRef}
              fileInputRef={fileInputRef}
              csvFileName={csvFileName}
              parsed={parsed}
              sampleHeaders={sampleHeaders}
              onPickFile={() => fileInputRef.current?.click()}
              onDrop={onDrop}
              onFileChange={(f) => f && readFile(f)}
              onDownloadSample={downloadSample}
            />
          )}
          {step === 4 && parsed && (
            <StepPreview parsed={parsed} generating={generating} />
          )}
          {step === 5 && (
            <StepResults
              state={generateState}
              generated={generated}
              rowCount={parsed?.rows.length ?? 0}
              tint={tintForLetterType(letterType as LetterTypeId)}
              onCancel={() => abortRef.current?.abort()}
              onReset={reset}
              onOpenFirst={() => {
                const first = generated[0];
                if (first) navigate(`/editor/${first.draftId}`);
              }}
              onOpenDrafts={() => navigate("/letters")}
              onRetry={() => void handleGenerate()}
            />
          )}
        </motion.div>
      </AnimatePresence>

      {step < 5 && (
        <div className="mt-8 flex items-center justify-between border-t border-[var(--ds-line)] pt-5">
          <Button
            variant="ghost"
            onClick={() => setStep((s) => (s > 1 ? ((s - 1) as Step) : s))}
            disabled={step === 1}
          >
            <ChevronLeft className="h-4 w-4" />
            Back
          </Button>

          {step < 4 ? (
            <div className="flex min-w-0 items-center gap-3">
              {step === 3 && !canContinue && (
                <span id="bulk-continue-why" className="text-right text-[12.5px] text-[var(--ds-muted)]">
                  {parsed?.error ? "Fix the file to continue." : "Choose a CSV file to continue."}
                </span>
              )}
              <Button
                onClick={() => setStep((s) => ((s + 1) as Step))}
                disabled={!canContinue}
                aria-describedby={step === 3 && !canContinue ? "bulk-continue-why" : undefined}
              >
                Continue
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
          ) : (
            <Button
              onClick={handleGenerate}
              disabled={
                generating || !parsed || parsed.rows.length === 0
              }
            >
              {generating ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Generating…
                </>
              ) : (
                <>
                  Generate {parsed?.rows.length ?? 0} draft
                  {(parsed?.rows.length ?? 0) === 1 ? "" : "s"}
                </>
              )}
            </Button>
          )}
        </div>
      )}

      <p className="mt-10 text-[12.5px] text-[var(--ds-muted)]">
        <Link to="/letters" className="inline-flex items-center gap-1 rounded-[4px] underline-offset-2 outline-none hover:text-[var(--ds-ink)] hover:underline focus-visible:shadow-[var(--ds-focus-ring)]">
          <ChevronLeft className="size-3.5" aria-hidden />
          Back to letters
        </Link>
      </p>
      </div>

      <aside className="order-1 min-w-0 lg:order-2">
        <StepsCard step={step} />
      </aside>
      </div>
    </div>
  );
}

/* ---------- 4B step card ---------- */

const ALL_STEPS = [...STEP_LABELS, "Results"] as const;

function StepsCard({ step }: { step: Step }) {
  const pct = Math.round(((step - 1) / (ALL_STEPS.length - 1)) * 100);
  return (
    <div className="rounded-[var(--ds-r-l)] border border-[var(--ds-line)] bg-[var(--ds-surface)] p-4 lg:sticky lg:top-6">
      <div className="flex items-center justify-between gap-2">
        <h2 className="m-0 text-[14px] font-semibold text-[var(--ds-ink)]">Steps</h2>
        <span className="ds-mono text-[12px] text-[var(--ds-muted)]">
          {Math.min(step, ALL_STEPS.length)} / {ALL_STEPS.length}
        </span>
      </div>
      <div className="mt-3 h-1 overflow-hidden rounded-full bg-[var(--ds-surface-3)]" aria-hidden>
        <div className="h-full rounded-full bg-[var(--ds-ink)] transition-[width] duration-300" style={{ width: `${pct}%` }} />
      </div>
      <ol className="m-0 mt-3 flex list-none flex-wrap gap-1 p-0 lg:flex-col lg:flex-nowrap">
        {ALL_STEPS.map((label, idx) => {
          const stepNum = (idx + 1) as Step;
          const active = stepNum === step;
          const done = stepNum < step;
          return (
            <li
              key={label}
              aria-current={active ? "step" : undefined}
              className={[
                "flex shrink-0 items-center gap-2.5 rounded-[var(--ds-r-s)] px-2 py-1.5 text-[13px]",
                active ? "bg-[var(--ds-surface-2)] font-medium text-[var(--ds-ink)]" : done ? "text-[var(--ds-body)]" : "text-[var(--ds-muted)]",
              ].join(" ")}
            >
              {done ? (
                <CheckCircle2 className="size-4 shrink-0 text-[var(--ds-green-fg)]" aria-hidden />
              ) : active ? (
                <CircleDot className="size-4 shrink-0 text-[var(--ds-ink)]" aria-hidden />
              ) : (
                <span className="grid size-4 shrink-0 place-items-center rounded-full border border-[var(--ds-line-strong)] text-[9px]" aria-hidden />
              )}
              <span className="whitespace-nowrap">
                {idx + 1}. {label}
              </span>
            </li>
          );
        })}
      </ol>
    </div>
  );
}

/* ---------- Step components ---------- */

function StepOperation({
  operation,
  setOperation,
}: {
  operation: Operation;
  setOperation: (op: Operation) => void;
}) {
  return (
    <section>
      <h2 className="m-0 text-[17px] font-semibold text-[var(--ds-ink)]">Choose operation</h2>
      <p className="m-0 mt-1 text-[13px] text-[var(--ds-muted)]">
        What would you like to do in bulk?
      </p>

      <RadioGroup
        aria-label="Bulk operation"
        value={operation}
        onValueChange={(v) => setOperation(v as Operation)}
        className="mt-5 grid gap-3 sm:grid-cols-3"
      >
        <OperationOption
          value="generate"
          icon={FileSpreadsheet}
          tint="var(--ds-tint-mint)"
          ink="var(--ds-tint-mint-ink)"
          title="Generate letters from CSV"
          description="Upload a CSV of employees and create one draft per row."
        />
        <OperationOption
          value="mass_update"
          icon={Layers}
          tint="var(--ds-tint-sky)"
          ink="var(--ds-tint-sky-ink)"
          title="Mass-update an existing batch"
          description="Apply the same edit across drafts in a batch."
          disabled
          badge="Coming soon"
        />
        <OperationOption
          value="bulk_archive"
          icon={Archive}
          tint="var(--ds-tint-butter)"
          ink="var(--ds-tint-butter-ink)"
          title="Bulk-archive closed matters"
          description="Sweep up matters you've finished and tidy your workspace."
          disabled
          badge="Coming soon"
        />
      </RadioGroup>
    </section>
  );
}

function OperationOption({
  value,
  title,
  description,
  disabled,
  badge,
  icon: Icon,
  tint,
  ink,
}: {
  value: string;
  title: string;
  description: string;
  disabled?: boolean;
  badge?: string;
  icon: typeof Upload;
  tint: string;
  ink: string;
}) {
  return (
    <Label
      htmlFor={`op-${value}`}
      className={[
        "flex min-w-0 flex-col items-stretch gap-0 overflow-hidden rounded-[var(--ds-r-l)] border bg-[var(--ds-surface)] text-left leading-normal transition has-[[data-state=checked]]:border-[var(--ds-ink)] has-[[data-state=checked]]:shadow-[0_0_0_1px_var(--ds-ink)]",
        disabled
          ? "cursor-not-allowed border-[var(--ds-line)] opacity-55"
          : "cursor-pointer border-[var(--ds-line)] hover:border-[var(--ds-line-strong)] hover:shadow-[var(--ds-shadow-m)]",
      ].join(" ")}
    >
      <div
        className="relative mx-1.5 mt-1.5 grid h-[84px] place-items-center rounded-[calc(var(--ds-r-l)-5px)]"
        style={{ background: tint, color: ink }}
      >
        <Icon className="size-8" strokeWidth={1.4} aria-hidden />
        <RadioGroupItem
          value={value}
          id={`op-${value}`}
          aria-label={badge ? `${title} (${badge.toLowerCase()})` : title}
          aria-describedby={`op-${value}-desc`}
          disabled={disabled}
          className="absolute left-2.5 top-2.5 bg-[var(--ds-surface)]"
        />
        {badge && (
          <span className="absolute right-2 top-2 whitespace-nowrap rounded-full bg-[var(--ds-surface)] px-2 py-0.5 text-[11px] font-medium text-[var(--ds-muted)]">
            {badge}
          </span>
        )}
      </div>
      <div className="px-3.5 pb-3.5 pt-3">
        <span className="block text-[13.5px] font-semibold text-[var(--ds-ink)]">{title}</span>
        <p id={`op-${value}-desc`} className="m-0 mt-1 text-[12px] font-normal leading-snug text-[var(--ds-muted)]">{description}</p>
      </div>
    </Label>
  );
}

function StepTemplate({
  letterType,
  setLetterType,
  hrTemplates,
}: {
  letterType: string;
  setLetterType: (id: string) => void;
  hrTemplates: { id: string; title: string; shortTitle: string; description: string }[];
}) {
  const selected = hrTemplates.find((t) => t.id === letterType);
  return (
    <section>
      <h2 className="m-0 text-[17px] font-semibold text-[var(--ds-ink)]">Pick a template</h2>
      <p className="m-0 mt-1 text-[13px] text-[var(--ds-muted)]">
        Every row in your CSV will use this letter type. You can run bulk
        operations again for other templates.
      </p>

      <div
        role="radiogroup"
        aria-label="HR letter template"
        className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-3"
      >
        {hrTemplates.map((t) => {
          const on = t.id === letterType;
          // Same pastel as the letter type everywhere else (Letters, Home).
          const tint = tintForLetterType(t.id as LetterTypeId);
          return (
            <button
              key={t.id}
              type="button"
              role="radio"
              aria-checked={on}
              onClick={() => setLetterType(t.id)}
              className={[
                "flex min-w-0 flex-col overflow-hidden rounded-[var(--ds-r-l)] border bg-[var(--ds-surface)] text-left transition",
                on
                  ? "border-[var(--ds-ink)] shadow-[0_0_0_1px_var(--ds-ink)]"
                  : "border-[var(--ds-line)] hover:border-[var(--ds-line-strong)] hover:shadow-[var(--ds-shadow-m)]",
              ].join(" ")}
            >
              <span
                className="relative mx-1.5 mt-1.5 block h-[64px] overflow-hidden rounded-[calc(var(--ds-r-l)-5px)]"
                style={{ ...tintStyle(tint), background: "var(--tint)" }}
              >
                <span className="absolute -bottom-3 left-1/2 flex h-[58px] w-[54px] -translate-x-1/2 -rotate-[2.5deg] flex-col gap-1 rounded-[3px] bg-[var(--ds-surface)] px-2 pt-2 shadow-[var(--ds-shadow-m)]">
                  <span className="mb-0.5 size-1.5 rounded-[1.5px] bg-[var(--tint-ink)]" />
                  <span className="h-[3px] w-3/5 rounded bg-[var(--ds-line-strong)]" />
                  <span className="h-[3px] w-full rounded bg-[var(--ds-line)]" />
                  <span className="h-[3px] w-full rounded bg-[var(--ds-line)]" />
                </span>
                {on && (
                  <CheckCircle2 className="absolute right-2 top-2 size-4 text-[var(--ds-ink)]" aria-hidden />
                )}
              </span>
              <span className="px-3.5 pb-3 pt-2.5">
                <span className="block truncate text-[13.5px] font-semibold text-[var(--ds-ink)]">{t.shortTitle}</span>
              </span>
            </button>
          );
        })}
      </div>

      {selected && (
        <p className="m-0 mt-4 text-[12.5px] leading-relaxed text-[var(--ds-muted)]">
          <span className="font-medium text-[var(--ds-body)]">{selected.shortTitle}:</span> {selected.description}
        </p>
      )}
    </section>
  );
}

function StepUpload({
  dropRef,
  fileInputRef,
  csvFileName,
  parsed,
  sampleHeaders,
  onPickFile,
  onDrop,
  onFileChange,
  onDownloadSample,
}: {
  dropRef: React.RefObject<HTMLDivElement | null>;
  fileInputRef: React.RefObject<HTMLInputElement | null>;
  csvFileName: string | null;
  parsed: CsvParseResult | null;
  sampleHeaders: string[];
  onPickFile: () => void;
  onDrop: (e: React.DragEvent<HTMLDivElement>) => void;
  onFileChange: (file: File | null) => void;
  onDownloadSample: () => void;
}) {
  return (
    <section>
      <h2 className="m-0 text-[17px] font-semibold text-[var(--ds-ink)]">Upload CSV</h2>
      <p className="m-0 mt-1 text-[13px] text-[var(--ds-muted)]">
        Header row required. Every row must have a value for
        <code className="ds-mono mx-1 rounded bg-[var(--ds-chip)] px-1 py-0.5 text-[11.5px]">
          employee_name
        </code>
        . Other fields are optional.
      </p>

      <div
        ref={dropRef}
        onDragOver={(e) => e.preventDefault()}
        onDrop={onDrop}
        className="mt-5 flex flex-col items-center justify-center rounded-[var(--ds-r-l)] border border-dashed border-[var(--ds-line-strong)] bg-[var(--ds-surface-2)] px-6 py-10 text-center transition-colors hover:border-[var(--ds-ink)]"
      >
        <Upload className="size-6 text-[var(--ds-muted)]" />
        <p className="m-0 mt-3 text-[14px] font-medium text-[var(--ds-ink)]">Drag CSV here</p>
        <p className="m-0 text-[12.5px] text-[var(--ds-muted)]">or</p>
        <Button variant="outline" className="mt-3" onClick={onPickFile}>
          Choose file
        </Button>
        <input
          ref={fileInputRef}
          type="file"
          accept=".csv,text/csv"
          className="hidden"
          onChange={(e) => {
            onFileChange(e.target.files?.[0] ?? null);
            // Clear it so choosing the same file again (after fixing it) reads it again.
            e.target.value = "";
          }}
        />
        {csvFileName && (
          <p className="m-0 mt-4 text-[12.5px] text-[var(--ds-muted)]">
            <FileSpreadsheet className="mr-1 inline size-3.5" />
            {csvFileName}
            {parsed && !parsed.error && (
              <>, {parsed.rows.length} row{parsed.rows.length === 1 ? "" : "s"}</>
            )}
          </p>
        )}
        {parsed?.error && (
          <p role="alert" className="m-0 mt-3 max-w-sm text-[12.5px] text-[var(--ds-red-fg)]">
            {parsed.error}
          </p>
        )}
      </div>

      <div className="mt-4 rounded-[var(--ds-r-l)] border border-[var(--ds-line)] bg-[var(--ds-surface)] p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="min-w-0">
            <p className="m-0 text-[13px] font-medium text-[var(--ds-ink)]">Sample CSV header for this template</p>
            <p className="m-0 mt-1 text-[12.5px] text-[var(--ds-muted)]">
              Use these column names so we can map every field automatically.
            </p>
          </div>
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={onDownloadSample}
          >
            <Download className="h-3.5 w-3.5" />
            Download sample
          </Button>
        </div>
        <div className="mt-3 overflow-x-auto rounded-[var(--ds-r-s)] bg-[var(--ds-surface-2)] p-2.5">
          <code className="ds-mono block whitespace-nowrap text-[11.5px] text-[var(--ds-body)]">
            {sampleHeaders.join(", ")}
          </code>
        </div>
      </div>
    </section>
  );
}

/** "Row 3 (Jane Patel): no salary, no review date; Row 5: ..." for at most `limit` rows. */
function describeMissing(missing: MissingMergeValues[], limit = 5): string {
  const shown = missing.slice(0, limit).map(
    (m) => `Row ${m.rowNumber}${m.employeeName ? ` (${m.employeeName})` : ""}: ${missingFieldsLabel(m.fields)}`,
  );
  const more = missing.length - shown.length;
  return shown.join("; ") + (more > 0 ? `; and ${more} more` : "");
}

function StepPreview({
  parsed,
  generating,
}: {
  parsed: CsvParseResult;
  generating: boolean;
}) {
  // Every CSV column is offered to the generator as a {{placeholder}}, so an
  // empty cell means that row's letter will read "[field not set]".
  const missing = useMemo(
    () => findMissingMergeValues(parsed.rows, parsed.headers, parsed.rowNumbers),
    [parsed],
  );
  // A row with missing values is not ready: it counts as a warning, like a
  // row the parser skipped.
  const readyCount = parsed.rows.length - missing.length;
  const warningCount = parsed.warnings.length + missing.length;
  const visibleRows = parsed.rows.slice(0, 25);
  const overflow = parsed.rows.length - visibleRows.length;

  if (parsed.rows.length === 0 && parsed.warnings.length === 0) {
    return (
      <section>
        <h2 className="m-0 text-[17px] font-semibold text-[var(--ds-ink)]">Preview</h2>
        <p className="m-0 mt-1 text-[13px] text-[var(--ds-muted)]">
          Upload a CSV to see preview.
        </p>
      </section>
    );
  }

  return (
    <section aria-busy={generating}>
      <h2 className="m-0 text-[17px] font-semibold text-[var(--ds-ink)]">Preview</h2>
      <p className="m-0 mt-1 text-[13px] text-[var(--ds-muted)]">
        {readyCount} row{readyCount === 1 ? "" : "s"} ready,
        {" "}
        {warningCount} warning{warningCount === 1 ? "" : "s"}.
      </p>

      {missing.length > 0 && (
        <div
          role="alert"
          className="mt-4 rounded-[var(--ds-r-l)] bg-[var(--ds-amber-bg)] px-4 py-3 text-[13px] text-[var(--ds-amber-fg)]"
        >
          <p className="flex items-center gap-2 font-medium">
            <AlertTriangle className="h-4 w-4 flex-shrink-0" aria-hidden />
            {missing.length} row{missing.length === 1 ? " has" : "s have"} missing values
          </p>
          <p className="mt-1 text-xs">
            These letters will show "[field not set]" where the value is missing. Fill in the
            CSV and upload it again, or carry on and complete them in the editor.
          </p>
          <ul className="mt-2 space-y-0.5 text-xs">
            {missing.slice(0, 20).map((m) => (
              <li key={m.rowNumber}>
                <span className="font-medium">
                  Row {m.rowNumber}
                  {m.employeeName ? ` (${m.employeeName})` : ""}:
                </span>{" "}
                {missingFieldsLabel(m.fields)}
              </li>
            ))}
            {missing.length > 20 && <li>and {missing.length - 20} more rows</li>}
          </ul>
        </div>
      )}

      <ul className="m-0 mt-5 list-none p-0">
        {visibleRows.map((row, i) => {
          const rowMissing = missing.find((m) => m.rowNumber === (parsed.rowNumbers?.[i] ?? i + 2));
          const summary = rowSummary(row, parsed.headers, rowMissing?.fields);
          return (
            <li
              key={i}
              className={[
                "relative flex items-center gap-3 rounded-[var(--ds-r-m)] px-3 py-2.5 hover:bg-[var(--ds-surface-2)]",
                i > 0 ? "before:absolute before:inset-x-3 before:top-0 before:border-t before:border-[var(--ds-line)]" : "",
              ].join(" ")}
            >
              <Avatar seed={row.employee_name} name={row.employee_name} size="xl" />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[14px] font-semibold text-[var(--ds-ink)]">{row.employee_name}</span>
                <span className="block truncate text-[12.5px] text-[var(--ds-muted)]" title={summary || undefined}>
                  {summary || "Only a name in this row"}
                </span>
              </span>
              {rowMissing ? (
                <Pill tone="amber">{rowMissing.fields.length} missing</Pill>
              ) : (
                <Pill tone="green">Ready</Pill>
              )}
            </li>
          );
        })}
        {parsed.warnings.map((w) => (
          <li
            key={`w-${w.rowIndex}`}
            className="flex items-center gap-3 rounded-[var(--ds-r-m)] bg-[var(--ds-amber-bg)] px-3 py-2.5 text-[var(--ds-amber-fg)]"
          >
            <AlertTriangle className="size-4 shrink-0" aria-hidden />
            <span className="text-[12.5px]">{w.message}</span>
          </li>
        ))}
        {overflow > 0 && (
          <li className="px-3 py-2.5 text-[12.5px] text-[var(--ds-muted)]">
            {overflow} more rows
          </li>
        )}
      </ul>
    </section>
  );
}

function StepResults({
  state,
  generated,
  rowCount,
  tint,
  onCancel,
  onReset,
  onOpenFirst,
  onOpenDrafts,
  onRetry,
}: {
  state: GenerateState;
  generated: GeneratedDraftSummary[];
  rowCount: number;
  tint: Tint;
  onCancel: () => void;
  onReset: () => void;
  onOpenFirst: () => void;
  onOpenDrafts: () => void;
  onRetry: () => void;
}) {
  // PHASE: drafting template (one AI call)
  if (state.phase === "drafting") {
    const pct = Math.round(((state.sectionIndex + 1) / state.sectionCount) * 100);
    return (
      <section aria-busy>
        <div className="rounded-[var(--ds-r-l)] bg-[var(--ds-surface-2)] p-8 text-center">
          <Sparkles className="mx-auto size-9 text-[var(--ds-muted)]" />
          <h2 className="m-0 mt-4 text-[17px] font-semibold text-[var(--ds-ink)]">Drafting template letter…</h2>
          <p className="m-0 mt-2 text-[13px] text-[var(--ds-muted)]">
            DraftHR drafts the letter once. Then it fills in a copy for each of
            the {rowCount} {rowCount === 1 ? "person" : "people"} in your file.
          </p>
          <p className="m-0 mt-4 text-[12.5px] text-[var(--ds-muted)]">
            Section {state.sectionIndex + 1} of {state.sectionCount}:{" "}
            <span className="font-medium text-[var(--ds-ink)]">{state.sectionTitle}</span>
          </p>
          <div className="mx-auto mt-3 h-1.5 max-w-xs overflow-hidden rounded-full bg-[var(--ds-surface-3)]">
            <div
              className="h-full rounded-full bg-[var(--ds-ink)] transition-[width] duration-300"
              style={{ width: `${pct}%` }}
            />
          </div>
          <div className="mt-6 flex justify-center">
            <Button variant="outline" size="sm" onClick={onCancel}>
              Cancel
            </Button>
          </div>
        </div>
      </section>
    );
  }

  // PHASE: client-side personalisation (no AI)
  if (state.phase === "personalising") {
    const pct =
      state.totalRows === 0
        ? 0
        : Math.round((state.doneRows / state.totalRows) * 100);
    return (
      <section aria-busy>
        <div className="rounded-[var(--ds-r-l)] bg-[var(--ds-surface-2)] p-8 text-center">
          <Loader2 className="mx-auto size-9 animate-spin text-[var(--ds-muted)]" />
          <h2 className="m-0 mt-4 text-[17px] font-semibold text-[var(--ds-ink)]">
            Personalising {state.totalRows} letter{state.totalRows === 1 ? "" : "s"}…
          </h2>
          <p className="m-0 mt-2 text-[13px] text-[var(--ds-muted)]">
            Filling in each person's details from your file. This takes a
            moment and happens on your device.
          </p>
          <p className="m-0 mt-4 text-[12.5px] text-[var(--ds-muted)]">
            {state.doneRows} of {state.totalRows} done
          </p>
          <div className="mx-auto mt-3 h-1.5 max-w-xs overflow-hidden rounded-full bg-[var(--ds-surface-3)]">
            <div
              className="h-full rounded-full bg-[var(--ds-ink)] transition-[width] duration-300"
              style={{ width: `${pct}%` }}
            />
          </div>
        </div>
      </section>
    );
  }

  // PHASE: error
  if (state.phase === "error") {
    return (
      <section>
        <div className="rounded-[var(--ds-r-l)] bg-[var(--ds-red-bg)] p-8 text-center">
          <AlertTriangle className="mx-auto size-9 text-[var(--ds-red-fg)]" />
          <h2 className="m-0 mt-4 text-[17px] font-semibold text-[var(--ds-ink)]">The letters were not drafted</h2>
          <p className="m-0 mt-2 max-w-md mx-auto text-[13px] text-[var(--ds-body)]">
            {state.message}
          </p>
          <div className="mt-6 flex flex-wrap justify-center gap-2">
            <Button onClick={onRetry}>Try again</Button>
            <Button variant="outline" onClick={onReset}>
              Start over
            </Button>
          </div>
        </div>
      </section>
    );
  }

  // PHASE: idle / done — show results if we have any, otherwise empty.
  if (generated.length === 0) {
    return (
      <section>
        <div className="rounded-[var(--ds-r-l)] bg-[var(--ds-surface-2)] p-8 text-center">
          <p className="m-0 text-[13px] text-[var(--ds-muted)]">
            Generation cancelled. Any letters created before you stopped are
            saved in Letters. Check there before running the batch again so
            you don't create duplicates.
          </p>
          <div className="mt-4">
            <Button variant="outline" onClick={onReset}>
              Start over
            </Button>
          </div>
        </div>
      </section>
    );
  }

  const incompleteCount = generated.filter((g) => g.unresolved.length > 0).length;
  const visible = generated.slice(0, 25);
  const overflow = generated.length - visible.length;

  return (
    <section>
      <div>
        <div className="flex items-start gap-3 rounded-[var(--ds-r-l)] bg-[var(--ds-green-bg)] p-5">
          <CheckCircle2 className="size-6 flex-shrink-0 text-[var(--ds-green-fg)]" />
          <div>
            <h2 className="m-0 text-[17px] font-semibold text-[var(--ds-ink)]">
              Created {generated.length} draft{generated.length === 1 ? "" : "s"}
            </h2>
            <p className="m-0 mt-1 text-[13px] text-[var(--ds-body)]">
              DraftHR drafted the letter once and filled in a copy for each
              person. Each draft is ready to review and finalise.
              {incompleteCount > 0 && (
                <>
                  {" "}
                  <span className="font-medium text-[var(--ds-amber-fg)]">
                    {incompleteCount} letter{incompleteCount === 1 ? " has" : "s have"}{" "}
                    gaps to fill in, flagged below.
                  </span>
                </>
              )}
            </p>
          </div>
        </div>

        <ul className="m-0 mt-5 list-none p-0">
          {visible.map((g, i) => (
            <li
              key={g.draftId}
              className={[
                "relative flex items-center justify-between gap-3 rounded-[var(--ds-r-m)] px-3 py-2.5",
                g.unresolved.length > 0 ? "bg-[var(--ds-amber-bg)]" : "hover:bg-[var(--ds-surface-2)]",
                i > 0 && g.unresolved.length === 0 ? "before:absolute before:inset-x-3 before:top-0 before:border-t before:border-[var(--ds-line)]" : "",
              ].join(" ")}
            >
              <div className="flex min-w-0 items-center gap-3">
                <PaperIcon tint={tint} />
                {g.unresolved.length > 0 ? (
                  <span
                    aria-label="Has gaps to fill in"
                    title={`Missing: ${g.unresolved.map(humaniseField).join(", ")}`}
                    className="size-2 flex-shrink-0 rounded-full bg-[var(--ds-amber-dot)]"
                  />
                ) : (
                  <span
                    aria-label="Ready"
                    className="size-2 flex-shrink-0 rounded-full bg-[var(--ds-green-fg)]"
                  />
                )}
                <span className="truncate text-[14px] font-semibold text-[var(--ds-ink)]">{g.title}</span>
                {g.unresolved.length > 0 && (
                  <Pill tone="amber" title={`Missing: ${g.unresolved.map(humaniseField).join(", ")}`}>
                    Missing {g.unresolved.length} field
                    {g.unresolved.length === 1 ? "" : "s"}
                  </Pill>
                )}
              </div>
              <Link
                to={`/editor/${g.draftId}`}
                className="shrink-0 text-[12.5px] font-medium text-[var(--ds-body)] hover:text-[var(--ds-ink)] hover:underline"
              >
                Open
              </Link>
            </li>
          ))}
          {overflow > 0 && (
            <li className="px-3 py-2.5 text-[12.5px] text-[var(--ds-muted)]">
              {overflow} more draft{overflow === 1 ? "" : "s"}
            </li>
          )}
        </ul>

        <div className="mt-6 flex flex-wrap gap-2">
          <Button onClick={onOpenFirst}>Open first draft</Button>
          <Button variant="outline" onClick={onOpenDrafts}>
            View all in drafts
          </Button>
          <Button variant="ghost" onClick={onReset}>
            Run another bulk operation
          </Button>
        </div>
      </div>
    </section>
  );
}
