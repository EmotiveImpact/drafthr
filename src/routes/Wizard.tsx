import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { toast } from "sonner";
import { ArrowLeft, FileCheck, MoreHorizontal, Pencil, RotateCcw, Sparkles, UserX } from "lucide-react";
import {
  universalStepsFor,
  letterStepsFor,
  isQuestionAnswered,
  isQuestionVisible,
  type Question,
  type QuestionStep,
} from "@/lib/letters/questions";
import { LETTER_CATALOG, type LetterTypeMeta } from "@/lib/letters/catalog";
import type { Employee, Jurisdiction, LetterTypeId, Mode, UsState } from "@/lib/letters/types";
import { useDraftStore } from "@/lib/store";
import { useProfileStore, prefillsFromProfile, profileUpdatesFromAnswers } from "@/lib/profile";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Pill } from "@/components/ds";
import { Band } from "@/components/wizard/Band";
import { QuestionField, displayValue, isShortQuestion } from "@/components/wizard/QuestionField";
import { EmployeePicker } from "@/components/wizard/EmployeePicker";
import { Triage, type TriageResult } from "@/components/wizard/Triage";
import { StepRail, type RailStep } from "@/components/wizard/StepRail";
import { LawCardView } from "@/components/wizard/LawCardView";
import { lawCardFor } from "@/components/wizard/lawCard";
import { clearSavedWizard, loadSavedWizard, saveWizard } from "@/components/wizard/savedAnswers";
import { plainLabel, timeAgoWords } from "@/components/wizard/kit";
import { cn } from "@/lib/utils";

/**
 * New letter questions (design/hifi/out/new-letter.png). Mist band with the
 * letter type as the title and who it is for; then three columns: the step
 * list, the questions for the current step in hairline sections, and the
 * "What UK law requires" card from the real compliance rules. High-risk
 * employee letters open on a quick check first.
 */
export function Wizard({ mode }: { mode: Mode }) {
  const { letterType } = useParams<{ letterType: LetterTypeId }>();
  const nav = useNavigate();
  // `letterType` comes straight from the URL, so it may not match any known
  // letter. Look up defensively and show a calm not-found page instead.
  const meta = useMemo(() => LETTER_CATALOG.find((l) => l.id === (letterType as LetterTypeId)), [letterType]);
  const prefix = mode === "employer" ? "/hr" : "/me";

  if (!meta) {
    return (
      <div className="mx-auto flex max-w-xl flex-col items-center px-4 py-20 text-center">
        <h1 className="ds-title m-0 text-[34px] leading-tight">Letter type not found</h1>
        <p className="m-0 mb-6 mt-2.5 text-[14.5px] leading-relaxed text-[var(--ds-muted)]">
          We couldn't find a letter template for this address. It may have been renamed or removed.
        </p>
        <Button onClick={() => nav(`${prefix}/new`)}>Back to templates</Button>
      </div>
    );
  }
  return <WizardFlow key={meta.id} meta={meta} mode={mode} />;
}

const RISK = {
  high: { tone: "red", label: "High risk" },
  medium: { tone: "amber", label: "Medium risk" },
  low: { tone: "green", label: "Low risk" },
} as const;

function filled(v: unknown): boolean {
  if (v === undefined || v === null) return false;
  if (typeof v === "string") return v.trim() !== "";
  if (Array.isArray(v)) return v.length > 0;
  return true;
}

function str(v: unknown): string {
  return typeof v === "string" ? v.trim() : "";
}

/** True when a list item has something in it. */
function itemHasValue(item: Record<string, unknown>): boolean {
  return Object.values(item).some(filled);
}

/** A list question (repeater) with an item that was started but has a
 * required field still empty. */
function hasHalfFilledItem(q: Question, value: unknown): boolean {
  if (q.type !== "repeater" || !Array.isArray(value)) return false;
  const required = (q.repeater?.fields ?? []).filter((f) => f.required);
  return (value as Record<string, unknown>[]).some(
    (item) => itemHasValue(item) && !required.every((f) => isQuestionAnswered(f, item[f.id]))
  );
}

/** The answers without untouched blank list items (an optional "Concern 2"
 * nobody filled in), so the draft never gets an empty numbered finding. */
function withoutBlankItems(steps: QuestionStep[], answers: Record<string, unknown>): Record<string, unknown> {
  const out = { ...answers };
  for (const q of steps.flatMap((st) => st.questions)) {
    const v = out[q.id];
    if (q.type === "repeater" && Array.isArray(v)) {
      out[q.id] = (v as Record<string, unknown>[]).filter(itemHasValue);
    }
  }
  return out;
}

/** Short summary of a finished step for the step list. */
function stepSummary(step: QuestionStep, answers: Record<string, unknown>): string {
  const visible = step.questions.filter((q) => isQuestionVisible(q, answers));
  if (step.id === "jurisdiction") {
    const country = visible.find((q) => q.id === "jurisdiction");
    const region = visible.find((q) => q.id === "ukRegion" || q.id === "usState");
    return [country && displayValue(country, answers[country.id]), region && displayValue(region, answers[region.id])]
      .filter(Boolean)
      .join(", ");
  }
  if (visible.length > 0 && visible.every((q) => q.type === "boolean")) {
    const flags = visible.filter((q) => answers[q.id] === true).length;
    return flags === 0 ? "No flags raised" : `${flags} ${flags === 1 ? "flag" : "flags"} raised`;
  }
  const first = visible.find((q) => filled(answers[q.id]));
  return first ? displayValue(first, answers[first.id]) : "";
}

/** Rough time to answer what is left: short fields are quick, free text and
 * lists take longer. */
function minutesLeft(steps: QuestionStep[], from: number, answers: Record<string, unknown>): number {
  let seconds = 0;
  steps.slice(Math.max(0, from)).forEach((s) =>
    s.questions
      .filter((q) => isQuestionVisible(q, answers) && !isQuestionAnswered(q, answers[q.id]))
      .forEach((q) => {
        seconds += q.type === "textarea" || q.type === "repeater" ? 45 : 12;
      })
  );
  return Math.round(seconds / 60);
}

/** Pairs short questions two to a row (mock `.row2`); the rest take a row each. */
function layoutRows(questions: Question[]): Question[][] {
  const rows: Question[][] = [];
  for (let i = 0; i < questions.length; i++) {
    const q = questions[i];
    const next = questions[i + 1];
    if (next && isShortQuestion(q) && isShortQuestion(next)) {
      rows.push([q, next]);
      i++;
    } else rows.push([q]);
  }
  return rows;
}

function WizardFlow({ meta, mode }: { meta: LetterTypeMeta; mode: Mode }) {
  const nav = useNavigate();
  const reduceMotion = useReducedMotion();
  const createDraft = useDraftStore((s) => s.createDraft);
  const profile = useProfileStore((s) => s.profile);
  const setAutoFill = useProfileStore((s) => s.setAutoFill);
  const patchPersonal = useProfileStore((s) => s.patchPersonal);
  const patchEmployer = useProfileStore((s) => s.patchEmployer);
  const patchDefaults = useProfileStore((s) => s.patchDefaults);
  const prefix = mode === "employer" ? "/hr" : "/me";

  const steps: QuestionStep[] = useMemo(() => [...universalStepsFor(mode), ...letterStepsFor(meta.id)], [mode, meta.id]);
  const questionIds = useMemo(() => new Set(steps.flatMap((s) => s.questions.map((q) => q.id))), [steps]);

  // Answers seeded from the profile (snapshot taken once on mount), then any
  // answers saved on this device with Save draft.
  const [saved] = useState(() => loadSavedWizard(mode, meta.id));
  const initialPrefill = useRef<Record<string, unknown>>(prefillsFromProfile(profile, mode));
  const [answers, setAnswers] = useState<Record<string, unknown>>(() =>
    saved ? { ...initialPrefill.current, ...saved.answers } : initialPrefill.current
  );
  const [stepIndex, setStepIndex] = useState(() => (saved ? Math.min(saved.stepIndex, steps.length - 1) : 0));
  const [restoredAt, setRestoredAt] = useState<number | null>(saved?.savedAt ?? null);
  const [lineVisible, setLineVisible] = useState(true);
  const [pick, setPick] = useState<{ count: number; first: string } | null>(null);

  const prefillCount = useMemo(
    () =>
      Object.entries(initialPrefill.current).filter(([k, v]) => questionIds.has(k) && filled(v)).length,
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [questionIds, profile.autoFill, restoredAt]
  );

  // Quick check: shown once before the questions for high-risk employee
  // letters. Skipping never blocks.
  const triageApplies = mode === "employee" && (meta.riskClass === "high" || Boolean(meta.tribunalBound));
  const [triageState, setTriageState] = useState<"now" | "done">(() =>
    triageApplies && !saved ? "now" : "done"
  );
  const [triageResult, setTriageResult] = useState<TriageResult | null>(saved?.triage ?? null);

  // If auto-fill is switched on mid-way, fill the gaps from the profile.
  useEffect(() => {
    if (profile.autoFill) {
      initialPrefill.current = prefillsFromProfile(profile, mode);
      setAnswers((current) => ({ ...initialPrefill.current, ...current }));
      setLineVisible(true);
    }
    // Only when the setting changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profile.autoFill]);

  // Each step opens at the top of the page, with the band and the step
  // title in view (not at the scroll position of the step before).
  const formTop = useRef<HTMLDivElement>(null);
  const firstRender = useRef(true);
  useEffect(() => {
    if (firstRender.current) {
      firstRender.current = false;
      return;
    }
    const el = formTop.current;
    if (!el) return;
    let scroller: HTMLElement | null = el.parentElement;
    while (scroller && scroller !== document.body) {
      const oy = getComputedStyle(scroller).overflowY;
      if ((oy === "auto" || oy === "scroll") && scroller.scrollHeight > scroller.clientHeight) break;
      scroller = scroller.parentElement;
    }
    const behavior: ScrollBehavior = reduceMotion ? "auto" : "smooth";
    if (scroller && scroller !== document.body) {
      if (scroller.scrollTop > 0) scroller.scrollTo({ top: 0, behavior });
    } else if (window.scrollY > 0) {
      window.scrollTo({ top: 0, behavior });
    }
  }, [stepIndex, triageState, reduceMotion]);

  const step = steps[stepIndex];
  const isLast = stepIndex === steps.length - 1;
  const visibleQuestions = step.questions.filter((q) => isQuestionVisible(q, answers));
  const requiredAnswered =
    visibleQuestions.filter((q) => q.required).every((q) => isQuestionAnswered(q, answers[q.id])) &&
    // A list item that was started must be finished (or removed).
    visibleQuestions.every((q) => !hasHalfFilledItem(q, answers[q.id]));

  const jurisdiction: Jurisdiction = answers.jurisdiction === "US" ? "US" : answers.jurisdiction === "UK" ? "UK" : profile.defaults.jurisdiction;
  const law = useMemo(
    () => lawCardFor(meta.id, jurisdiction, answers, (answers.usState as UsState | undefined) || undefined),
    [meta.id, jurisdiction, answers]
  );

  const railSteps: RailStep[] = steps.map((s) => ({ id: s.id, title: plainLabel(s.title), summary: stepSummary(s, answers) }));
  const minutes = triageState === "now" ? minutesLeft(steps, 0, answers) : minutesLeft(steps, stepIndex, answers);

  const setAnswer = (id: string, v: unknown) => setAnswers((a) => ({ ...a, [id]: v }));

  const onNext = () => {
    if (isLast) {
      if (profile.autoFill) {
        const updates = profileUpdatesFromAnswers(answers, mode);
        if (Object.keys(updates.personal).length) patchPersonal(updates.personal);
        if (Object.keys(updates.employer).length) patchEmployer(updates.employer);
        if (Object.keys(updates.defaults).length) patchDefaults(updates.defaults);
      }
      const id = createDraft(meta.id, withoutBlankItems(steps, answers), mode);
      clearSavedWizard(mode, meta.id);
      nav(`/editor/${id}`);
      return;
    }
    setStepIndex((i) => i + 1);
  };

  const leave = () => {
    const idx = (window.history.state as { idx?: number } | null)?.idx ?? 0;
    if (idx > 0) nav(-1);
    else nav(`${prefix}/new`);
  };

  // Back is always there (as in the mock): a step back, or from the first
  // question back to the quick check when the letter has one, otherwise to
  // the template library (the "Letter type" step).
  const onBack = () => {
    if (stepIndex > 0) setStepIndex((i) => Math.max(0, i - 1));
    else if (triageApplies) setTriageState("now");
    else leave();
  };

  const onSaveDraft = () => {
    const ok = saveWizard(mode, meta.id, { answers, stepIndex, triage: triageResult });
    if (ok) {
      setRestoredAt(null);
      toast.success("Answers saved", {
        description: "Pick up where you left off from Templates on this device.",
      });
    } else {
      toast.error("Couldn't save on this device. Your browser storage may be full.");
    }
  };

  const startAgain = () => {
    clearSavedWizard(mode, meta.id);
    const fresh = prefillsFromProfile(profile, mode);
    initialPrefill.current = fresh;
    setAnswers(fresh);
    setStepIndex(0);
    setPick(null);
    setRestoredAt(null);
    setLineVisible(true);
    if (triageApplies) {
      setTriageResult(null);
      setTriageState("now");
    }
  };

  const fillFromProfile = () => {
    const fills = prefillsFromProfile({ ...profile, autoFill: true }, mode);
    initialPrefill.current = fills;
    setAnswers((a) => ({ ...a, ...fills }));
    setLineVisible(true);
  };

  const dontAutoFill = () => {
    setAutoFill(false);
    // Clear only the answers that still hold the profile's values.
    const fills = initialPrefill.current;
    setAnswers((a) => {
      const next = { ...a };
      for (const [k, v] of Object.entries(fills)) if (next[k] === v) delete next[k];
      return next;
    });
    initialPrefill.current = {};
    setLineVisible(false);
  };

  const onPick = (patch: Record<string, unknown>, emp: Employee) => {
    setAnswers((a) => ({ ...a, ...patch }));
    const count = Object.entries(patch).filter(([k, v]) => questionIds.has(k) && filled(v)).length;
    const first = (emp.preferredName || emp.legalName).trim().split(/\s+/)[0] ?? "";
    setPick({ count, first });
    setLineVisible(true);
  };

  /* ── Band ───────────────────────────────────────────────────────── */

  const employeeName = mode === "employer" ? str(answers.employeeLegalName) : "";
  const jobTitle = mode === "employer" ? str(answers.employeeJobTitle) : "";
  const risk = RISK[meta.riskClass];

  let fillLine: ReactNode = null;
  if (restoredAt !== null) {
    fillLine = <>Restored your saved answers from {timeAgoWords(restoredAt)}</>;
  } else if (pick && pick.count > 0) {
    const n = pick.count + (profile.autoFill ? prefillCount : 0);
    fillLine = (
      <>
        {n} {n === 1 ? "answer" : "answers"} filled from {pick.first}'s record
        {/* Short, so the line with Dismiss stays on one row (as the mock). */}
        {profile.autoFill && prefillCount > 0 ? " and yours" : ""}
      </>
    );
  } else if (profile.autoFill && prefillCount > 0) {
    fillLine = (
      <>
        {prefillCount} {prefillCount === 1 ? "answer" : "answers"} filled from your profile
      </>
    );
  }

  const lede = (
    <span className="inline">
      {employeeName ? (
        <>
          For <b>{employeeName}</b>
          {jobTitle ? `, ${jobTitle.toLowerCase()}` : ""}
        </>
      ) : fillLine && lineVisible ? (
        // Shorter intro when the fill line shares the row, so the line and
        // its Dismiss and options stay on one line (as the mock).
        "Answer a few questions and DraftHR drafts it."
      ) : (
        "Answer a few short questions and DraftHR writes the first draft for you to edit."
      )}
      <Pill tone={risk.tone} className="ml-2.5 align-[2px]">
        {risk.label}
      </Pill>
      {fillLine && lineVisible && (
        // One unit: if the row is too narrow the whole fill line moves to
        // the next line together, never leaving Dismiss or the menu behind.
        <span data-testid="prefill-line" className="inline-block whitespace-nowrap">
          <span aria-hidden className="mx-2.5 text-[var(--ds-faint)]">
            |
          </span>
          <Sparkles aria-hidden className="mr-1.5 inline size-3.5 align-[-2px] text-[var(--ds-muted)]" />
          {fillLine}
          <button
            type="button"
            onClick={() => setLineVisible(false)}
            aria-label="Dismiss"
            className="-my-2.5 ml-1 inline-flex h-9 items-center rounded-[6px] px-1.5 align-baseline text-[13.5px] text-[var(--ds-subtle)] transition-colors duration-[120ms] hover:text-[var(--ds-ink)]"
          >
            Dismiss
          </button>
          {restoredAt !== null && (
            <button
              type="button"
              onClick={startAgain}
              className="-my-2.5 ml-0.5 inline-flex h-9 items-center rounded-[6px] px-1.5 align-baseline text-[13.5px] text-[var(--ds-ink)] underline-offset-2 hover:underline"
            >
              Start again
            </button>
          )}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                type="button"
                aria-label="Auto-fill options"
                className="-my-2.5 inline-grid h-9 w-8 place-items-center rounded-[6px] align-middle text-[var(--ds-subtle)] transition-colors duration-[120ms] hover:bg-[var(--ds-surface-2)] hover:text-[var(--ds-ink)]"
              >
                <MoreHorizontal className="size-4" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="w-52">
              <DropdownMenuItem onSelect={() => nav("/settings")}>
                <Pencil />
                Edit profile
              </DropdownMenuItem>
              <DropdownMenuItem onSelect={fillFromProfile}>
                <Sparkles />
                Re-fill this form
              </DropdownMenuItem>
              <DropdownMenuItem onSelect={dontAutoFill}>
                <UserX />
                Don't auto-fill
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem onSelect={startAgain}>
                <RotateCcw />
                Start again
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </span>
      )}
    </span>
  );

  // No name or company saved yet: offer to set the profile up once.
  const profileEmpty = !profile.personal.legalName?.trim() && !profile.employer.legalName?.trim();

  /* ── Form ───────────────────────────────────────────────────────── */

  // People the "who attended" chips offer in one click: the employee the
  // letter is for and the person writing it, each with their role.
  const peopleSuggestions = [
    ...(mode === "employer" && str(answers.employeeLegalName)
      ? [{ name: str(answers.employeeLegalName), role: "Employee" }]
      : []),
    ...(profile.personal.legalName?.trim()
      ? [{ name: profile.personal.legalName.trim(), role: mode === "employer" ? "Chair" : "Employee" }]
      : []),
  ];

  const showPicker = mode === "employer" && visibleQuestions.some((q) => q.id === "employeeLegalName");
  const rows = layoutRows(visibleQuestions);

  const motionProps = reduceMotion
    ? {}
    : {
        initial: { opacity: 0, x: 12 },
        animate: { opacity: 1, x: 0 },
        transition: { duration: 0.32, ease: [0.2, 0.7, 0.2, 1] as const },
      };

  return (
    <div className="w-full min-w-0 px-4 pb-16 pt-6 sm:px-8 lg:px-12 lg:pt-[34px]">
      <Band
        className="mb-6 lg:mb-[30px]"
        crumbs={[
          { label: "Letters", href: "/letters" },
          { label: "Template library", href: `${prefix}/new` },
          { label: "New letter" },
        ]}
        title={plainLabel(meta.title)}
        lede={lede}
        actions={
          <>
            <Button variant="outline" onClick={onSaveDraft} className="flex-1 sm:flex-none">
              <FileCheck className="size-4" />
              Save draft
            </Button>
            <Button variant="outline" onClick={leave} className="flex-1 sm:flex-none">
              Cancel
            </Button>
          </>
        }
      />

      <div className="grid min-w-0 gap-6 lg:grid-cols-[182px_minmax(0,1fr)] lg:grid-rows-[auto_auto_1fr] lg:gap-x-[34px] lg:gap-y-6 xl:grid-cols-[182px_minmax(0,1fr)_276px] xl:grid-rows-[auto_1fr]">
        <div className="min-w-0 lg:sticky lg:top-6 lg:row-span-3 lg:self-start xl:row-span-2">
          <StepRail
            letterTitle={plainLabel(meta.shortTitle)}
            steps={railSteps}
            stepIndex={triageState === "now" ? -1 : stepIndex}
            triage={triageApplies ? { state: triageState, result: triageResult } : undefined}
            minutesLeft={minutes}
            onJump={setStepIndex}
          >
            {profileEmpty && stepIndex === 0 && triageState === "done" && (
              <section className="mt-2 rounded-[14px] border border-dashed border-[var(--ds-line-strong)] p-3.5">
                <h3 className="m-0 text-[13.5px] font-medium text-[var(--ds-ink)]">Save time on future letters?</h3>
                <p className="m-0 mt-1 text-[12.5px] leading-relaxed text-[var(--ds-muted)]">
                  Set up your profile once and we'll fill in your details every time.
                </p>
                <Button size="sm" variant="outline" className="mt-3" onClick={() => nav("/settings")}>
                  Set up profile
                </Button>
              </section>
            )}
          </StepRail>
        </div>

        <div ref={formTop} className="min-w-0 scroll-mt-6 lg:col-start-2 lg:row-start-1">
          {triageState === "now" ? (
            <Triage
              onBack={leave}
              letterType={meta.id}
              jurisdiction={profile.defaults.jurisdiction === "US" ? "US" : "UK"}
              onSkip={() => {
                setTriageResult(null);
                setTriageState("done");
              }}
              onContinue={(result) => {
                setTriageResult(result);
                setTriageState("done");
              }}
            />
          ) : (
            // The routes sit in an <AnimatePresence initial={false}>, whose
            // presence context would make every nested motion element skip
            // its `initial` state. A local AnimatePresence gives each new
            // step its own presence so the 12px slide and fade run.
            <AnimatePresence initial={false} mode="wait">
            <motion.section key={stepIndex} aria-labelledby="wizard-step-title" {...motionProps}>
              <header>
                <h2 id="wizard-step-title" className="ds-title m-0 text-[28px] leading-[1.1] tracking-[-0.018em]">
                  {plainLabel(step.title)}
                </h2>
                {step.description && (
                  <p className="m-0 mt-1.5 max-w-[62ch] text-[14px] leading-relaxed text-[var(--ds-muted)]">
                    {plainLabel(step.description)}
                  </p>
                )}
              </header>
              <div className="mt-2">
                {showPicker && (
                  <div className="border-b border-[var(--ds-line-2)] py-4">
                    <EmployeePicker
                      answers={answers}
                      onPick={onPick}
                      onClear={() => {
                        setAnswers((a) => {
                          const next = { ...a };
                          delete next.linkedEmployeeId;
                          return next;
                        });
                        setPick(null);
                      }}
                    />
                  </div>
                )}
                {rows.map((row) => (
                  <div
                    key={row.map((q) => q.id).join("+")}
                    className={cn(
                      "border-b border-[var(--ds-line-2)] py-4 last:border-b-0",
                      row.length === 2 && "grid gap-4 sm:grid-cols-2"
                    )}
                  >
                    {row.map((q) => (
                      <QuestionField
                        key={q.id}
                        q={q}
                        value={answers[q.id]}
                        onChange={(v) => setAnswer(q.id, v)}
                        people={peopleSuggestions}
                      />
                    ))}
                  </div>
                ))}
                {visibleQuestions.length === 0 && (
                  <p className="m-0 py-4 text-[13.5px] text-[var(--ds-muted)]">No questions for this step.</p>
                )}
              </div>
            </motion.section>
            </AnimatePresence>
          )}
        </div>

        <div className="min-w-0 lg:col-start-2 lg:row-start-2 xl:sticky xl:top-6 xl:col-start-3 xl:row-span-2 xl:row-start-1 xl:self-start">
          <LawCardView card={law} />
        </div>

        {triageState === "done" && (
          <div className="min-w-0 lg:col-start-2 lg:row-start-3 xl:row-start-2 xl:self-start">
            <div className="flex flex-wrap items-center gap-x-2.5 gap-y-3 border-t border-[var(--ds-line)] pt-4">
              <label className="flex min-h-9 w-full cursor-pointer items-center gap-2.5 text-[13px] text-[var(--ds-body)] sm:w-auto">
                <Switch checked={profile.autoFill} onCheckedChange={setAutoFill} aria-label="Save these answers to fill future letters" />
                Save these answers to fill future letters
              </label>
              <span className="hidden flex-1 sm:block" />
              <Button variant="outline" onClick={onBack} className="flex-1 sm:flex-none">
                <ArrowLeft className="size-4" />
                Back
              </Button>
              <Button onClick={onNext} disabled={!requiredAnswered} className="flex-1 sm:flex-none">
                {isLast ? (
                  <>
                    <Sparkles className="size-4" />
                    Generate draft
                  </>
                ) : (
                  "Continue"
                )}
              </Button>
            </div>
            {!requiredAnswered && (
              <p className="m-0 mt-2.5 text-right text-[12.5px] text-[var(--ds-subtle)]">
                Answer the questions marked * to continue.
              </p>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
