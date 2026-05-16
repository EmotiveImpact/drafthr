import { useMemo, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { AnimatePresence, motion } from "framer-motion";
import { toast } from "sonner";
import {
  AlertTriangle,
  CheckCircle2,
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Label } from "@/components/ui/label";

import { letterCatalogByMode, getLetterMeta } from "@/lib/letters/catalog";
import { useDraftStore } from "@/lib/store";
import type { LetterTypeId } from "@/lib/letters/types";
import {
  parseCsv,
  rowToAnswers,
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
  const navigate = useNavigate();
  const createDraft = useDraftStore((s) => s.createDraft);
  const updateSection = useDraftStore((s) => s.updateSection);
  const setSectionStatus = useDraftStore((s) => s.setSectionStatus);
  const setDraftTitle = useDraftStore((s) => s.setDraftTitle);

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
      const message =
        err instanceof Error ? err.message : "We couldn't draft the template letter.";
      setGenerateState({ phase: "error", message });
      toast.error("Generation failed", { description: message });
      return;
    }

    // Phase 2: client-side fan-out. For each row, personalise then
    // persist a new draft. No AI calls beyond this point.
    setGenerateState({
      phase: "personalising",
      doneRows: 0,
      totalRows: parsed.rows.length,
    });
    const summaries: GeneratedDraftSummary[] = [];
    for (let i = 0; i < parsed.rows.length; i++) {
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
      const unresolvedForRow = new Set<string>();
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

      // Personalised title — preserves the per-row identity in lists.
      const meta = getLetterMeta(letterType as LetterTypeId);
      const recipientName = String(row.employee_name ?? "").trim();
      if (recipientName) {
        setDraftTitle(draftId, `${meta.shortTitle} – ${recipientName}`);
      }

      summaries.push({
        draftId,
        title: recipientName
          ? `${meta.shortTitle} – ${recipientName}`
          : `${meta.shortTitle} – row ${i + 1}`,
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
    <div className="mx-auto max-w-3xl px-6 py-10">
      <header className="mb-8">
        <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          Business · Bulk operations
        </p>
        <h1 className="mt-1 text-3xl font-semibold tracking-tight">
          Generate letters in bulk
        </h1>
        <p className="mt-2 max-w-prose text-sm text-muted-foreground">
          Upload a CSV of employees and we'll create one personalised draft
          per row. Review and finalise each draft individually before sending.
        </p>
      </header>

      {/* Progress chips */}
      {step < 5 && (
        <ol className="mb-8 flex flex-wrap items-center gap-2 text-xs">
          {STEP_LABELS.map((label, idx) => {
            const stepNum = (idx + 1) as Step;
            const active = stepNum === step;
            const done = stepNum < step;
            return (
              <li key={label} className="flex items-center gap-2">
                <span
                  className={[
                    "inline-flex items-center gap-1.5 rounded-full border px-3 py-1 transition-colors",
                    active
                      ? "border-foreground bg-foreground text-background"
                      : done
                        ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
                        : "border-border text-muted-foreground",
                  ].join(" ")}
                >
                  {done ? (
                    <CheckCircle2 className="h-3 w-3" />
                  ) : (
                    <CircleDot className="h-3 w-3" />
                  )}
                  <span className="font-medium">
                    {idx + 1} · {label}
                  </span>
                </span>
                {idx < STEP_LABELS.length - 1 && (
                  <ChevronRight className="h-3 w-3 text-muted-foreground/50" />
                )}
              </li>
            );
          })}
        </ol>
      )}

      <AnimatePresence mode="wait">
        <motion.div
          key={step}
          initial={{ opacity: 0, x: 24 }}
          animate={{ opacity: 1, x: 0 }}
          exit={{ opacity: 0, x: -24 }}
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
              onCancel={() => abortRef.current?.abort()}
              onReset={reset}
              onOpenFirst={() => {
                const first = generated[0];
                if (first) navigate(`/editor/${first.draftId}`);
              }}
              onOpenDrafts={() => navigate("/")}
              onRetry={() => void handleGenerate()}
            />
          )}
        </motion.div>
      </AnimatePresence>

      {step < 5 && (
        <div className="mt-10 flex items-center justify-between">
          <Button
            variant="ghost"
            onClick={() => setStep((s) => (s > 1 ? ((s - 1) as Step) : s))}
            disabled={step === 1}
          >
            <ChevronLeft className="h-4 w-4" />
            Back
          </Button>

          {step < 4 ? (
            <Button
              onClick={() => setStep((s) => ((s + 1) as Step))}
              disabled={!canContinue}
            >
              Continue
              <ChevronRight className="h-4 w-4" />
            </Button>
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

      <p className="mt-12 text-xs text-muted-foreground">
        <Link to="/" className="underline-offset-2 hover:underline">
          ← Back to drafts
        </Link>
      </p>
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
      <h2 className="text-lg font-semibold">Choose operation</h2>
      <p className="mt-1 text-sm text-muted-foreground">
        What would you like to do in bulk?
      </p>

      <RadioGroup
        value={operation}
        onValueChange={(v) => setOperation(v as Operation)}
        className="mt-6 space-y-3"
      >
        <OperationOption
          value="generate"
          title="Generate letters from CSV"
          description="Upload a CSV of employees and create one draft per row."
        />
        <OperationOption
          value="mass_update"
          title="Mass-update an existing batch"
          description="Apply the same edit across drafts in a batch."
          disabled
          badge="Coming soon"
        />
        <OperationOption
          value="bulk_archive"
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
}: {
  value: string;
  title: string;
  description: string;
  disabled?: boolean;
  badge?: string;
}) {
  return (
    <Label
      htmlFor={`op-${value}`}
      className={[
        "flex cursor-pointer items-start gap-3 rounded-xl border p-4 transition-colors",
        disabled
          ? "cursor-not-allowed border-border/60 bg-muted/30 opacity-60"
          : "border-border hover:border-foreground/40 hover:bg-muted/40",
      ].join(" ")}
    >
      <RadioGroupItem
        value={value}
        id={`op-${value}`}
        disabled={disabled}
        className="mt-0.5"
      />
      <div className="flex-1">
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium">{title}</span>
          {badge && (
            <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
              {badge}
            </span>
          )}
        </div>
        <p className="mt-1 text-xs text-muted-foreground">{description}</p>
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
      <h2 className="text-lg font-semibold">Pick a template</h2>
      <p className="mt-1 text-sm text-muted-foreground">
        Every row in your CSV will use this letter type. You can run bulk
        operations again for other templates.
      </p>

      <div className="mt-6">
        <Label className="text-xs font-medium text-muted-foreground">
          HR letter template
        </Label>
        <div className="mt-1.5">
          <Select value={letterType} onValueChange={setLetterType}>
            <SelectTrigger className="w-full">
              <SelectValue placeholder="Pick a template" />
            </SelectTrigger>
            <SelectContent>
              {hrTemplates.map((t) => (
                <SelectItem key={t.id} value={t.id}>
                  {t.shortTitle}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {selected && (
          <p className="mt-3 text-xs text-muted-foreground">
            {selected.description}
          </p>
        )}
      </div>
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
      <h2 className="text-lg font-semibold">Upload CSV</h2>
      <p className="mt-1 text-sm text-muted-foreground">
        Header row required. Every row must have a value for
        <code className="mx-1 rounded bg-muted px-1 py-0.5 text-[11px]">
          employee_name
        </code>
        — other fields are optional.
      </p>

      <div
        ref={dropRef}
        onDragOver={(e) => e.preventDefault()}
        onDrop={onDrop}
        className="mt-6 flex flex-col items-center justify-center rounded-xl border-2 border-dashed border-border bg-muted/20 px-6 py-10 text-center transition-colors hover:border-foreground/40"
      >
        <Upload className="h-6 w-6 text-muted-foreground" />
        <p className="mt-3 text-sm font-medium">Drag CSV here</p>
        <p className="text-xs text-muted-foreground">or</p>
        <Button variant="outline" className="mt-3" onClick={onPickFile}>
          Choose file
        </Button>
        <input
          ref={fileInputRef}
          type="file"
          accept=".csv,text/csv"
          className="hidden"
          onChange={(e) => onFileChange(e.target.files?.[0] ?? null)}
        />
        {csvFileName && (
          <p className="mt-4 text-xs text-muted-foreground">
            <FileSpreadsheet className="mr-1 inline h-3 w-3" />
            {csvFileName}
            {parsed && !parsed.error && (
              <> · {parsed.rows.length} row{parsed.rows.length === 1 ? "" : "s"}</>
            )}
          </p>
        )}
        {parsed?.error && (
          <p className="mt-3 max-w-sm text-xs text-red-600 dark:text-red-400">
            {parsed.error}
          </p>
        )}
      </div>

      <div className="mt-6 rounded-xl border border-border bg-muted/20 p-4">
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="text-xs font-medium">Sample CSV header for this template</p>
            <p className="mt-1 text-xs text-muted-foreground">
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
        <div className="mt-3 overflow-x-auto rounded-md border border-border bg-background p-2">
          <code className="block whitespace-nowrap text-[11px] text-muted-foreground">
            {sampleHeaders.join(", ")}
          </code>
        </div>
      </div>
    </section>
  );
}

function StepPreview({
  parsed,
  generating,
}: {
  parsed: CsvParseResult;
  generating: boolean;
}) {
  const visibleRows = parsed.rows.slice(0, 25);
  const overflow = parsed.rows.length - visibleRows.length;

  if (parsed.rows.length === 0 && parsed.warnings.length === 0) {
    return (
      <section>
        <h2 className="text-lg font-semibold">Preview</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Upload a CSV to see preview.
        </p>
      </section>
    );
  }

  return (
    <section aria-busy={generating}>
      <h2 className="text-lg font-semibold">Preview</h2>
      <p className="mt-1 text-sm text-muted-foreground">
        {parsed.rows.length} row{parsed.rows.length === 1 ? "" : "s"} ready ·
        {" "}
        {parsed.warnings.length} warning{parsed.warnings.length === 1 ? "" : "s"}
        {" "}
        · estimated time: instant (stub)
      </p>

      <ul className="mt-6 divide-y divide-border overflow-hidden rounded-xl border border-border">
        {visibleRows.map((row, i) => (
          <li key={i} className="flex items-center gap-3 px-4 py-2.5 text-sm">
            <CheckCircle2 className="h-4 w-4 flex-shrink-0 text-emerald-500" />
            <span className="font-medium">{row.employee_name}</span>
            <span className="text-xs text-muted-foreground">
              {[
                row.employee_job_title,
                row.probation_outcome ?? row.probationOutcome,
              ]
                .filter(Boolean)
                .join(" · ")}
            </span>
          </li>
        ))}
        {parsed.warnings.map((w) => (
          <li
            key={`w-${w.rowIndex}`}
            className="flex items-center gap-3 px-4 py-2.5 text-sm text-amber-700 dark:text-amber-400"
          >
            <span aria-hidden className="text-base leading-none">
              ⚠
            </span>
            <span className="text-xs">{w.message}</span>
          </li>
        ))}
        {overflow > 0 && (
          <li className="px-4 py-2.5 text-xs text-muted-foreground">
            +{overflow} more rows…
          </li>
        )}
      </ul>
    </section>
  );
}

function StepResults({
  state,
  generated,
  onCancel,
  onReset,
  onOpenFirst,
  onOpenDrafts,
  onRetry,
}: {
  state: GenerateState;
  generated: GeneratedDraftSummary[];
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
        <div className="rounded-2xl border border-border bg-muted/20 p-8 text-center">
          <Sparkles className="mx-auto h-10 w-10 text-foreground/70" />
          <h2 className="mt-4 text-xl font-semibold">Drafting template letter…</h2>
          <p className="mt-2 text-sm text-muted-foreground">
            One AI call drafts the master template. We'll personalise N copies
            from it in a moment — no extra API cost.
          </p>
          <p className="mt-4 text-xs text-muted-foreground">
            Section {state.sectionIndex + 1} of {state.sectionCount} ·{" "}
            <span className="font-medium text-foreground">{state.sectionTitle}</span>
          </p>
          <div className="mx-auto mt-3 h-1.5 max-w-xs overflow-hidden rounded-full bg-muted">
            <div
              className="h-full rounded-full bg-foreground/80 transition-[width] duration-300"
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
        <div className="rounded-2xl border border-border bg-muted/20 p-8 text-center">
          <Loader2 className="mx-auto h-10 w-10 animate-spin text-foreground/70" />
          <h2 className="mt-4 text-xl font-semibold">
            Personalising {state.totalRows} letter{state.totalRows === 1 ? "" : "s"}…
          </h2>
          <p className="mt-2 text-sm text-muted-foreground">
            Substituting placeholders with each row's values. This is instant
            and runs entirely on your device.
          </p>
          <p className="mt-4 text-xs text-muted-foreground">
            {state.doneRows} of {state.totalRows} done
          </p>
          <div className="mx-auto mt-3 h-1.5 max-w-xs overflow-hidden rounded-full bg-muted">
            <div
              className="h-full rounded-full bg-foreground/80 transition-[width] duration-300"
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
        <div className="rounded-2xl border border-red-500/30 bg-red-500/5 p-8 text-center">
          <AlertTriangle className="mx-auto h-10 w-10 text-red-500" />
          <h2 className="mt-4 text-xl font-semibold">Generation failed</h2>
          <p className="mt-2 max-w-md mx-auto text-sm text-muted-foreground">
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
        <div className="rounded-2xl border border-border bg-muted/20 p-8 text-center">
          <p className="text-sm text-muted-foreground">
            Cancelled. No drafts were created.
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
      <div className="rounded-2xl border border-emerald-500/30 bg-emerald-500/5 p-6">
        <div className="flex items-start gap-3">
          <CheckCircle2 className="h-6 w-6 flex-shrink-0 text-emerald-500" />
          <div>
            <h2 className="text-xl font-semibold">
              Created {generated.length} draft{generated.length === 1 ? "" : "s"}
            </h2>
            <p className="mt-1 text-sm text-muted-foreground">
              One AI call drafted the template; the rest is instant client-side
              substitution. Each draft is ready to review and finalise.
              {incompleteCount > 0 && (
                <>
                  {" "}
                  <span className="font-medium text-amber-700 dark:text-amber-400">
                    {incompleteCount} row{incompleteCount === 1 ? " has" : "s have"}{" "}
                    unfilled placeholders — flagged below.
                  </span>
                </>
              )}
            </p>
          </div>
        </div>

        <ul className="mt-6 divide-y divide-emerald-500/15 overflow-hidden rounded-xl border border-emerald-500/20 bg-background">
          {visible.map((g) => (
            <li
              key={g.draftId}
              className="flex items-center justify-between gap-3 px-4 py-2.5 text-sm"
            >
              <div className="flex min-w-0 items-center gap-2">
                {g.unresolved.length > 0 ? (
                  <span
                    aria-label="Has unfilled placeholders"
                    title={`Missing: ${g.unresolved.join(", ")}`}
                    className="h-2 w-2 flex-shrink-0 rounded-full bg-amber-500"
                  />
                ) : (
                  <span
                    aria-label="Ready"
                    className="h-2 w-2 flex-shrink-0 rounded-full bg-emerald-500"
                  />
                )}
                <span className="truncate font-medium">{g.title}</span>
                {g.unresolved.length > 0 && (
                  <span className="text-xs text-amber-700 dark:text-amber-400">
                    · missing {g.unresolved.length} field
                    {g.unresolved.length === 1 ? "" : "s"}
                  </span>
                )}
              </div>
              <Link
                to={`/editor/${g.draftId}`}
                className="text-xs font-medium text-foreground/70 hover:underline"
              >
                Open
              </Link>
            </li>
          ))}
          {overflow > 0 && (
            <li className="px-4 py-2.5 text-xs text-muted-foreground">
              +{overflow} more draft{overflow === 1 ? "" : "s"}…
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
