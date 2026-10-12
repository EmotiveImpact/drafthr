import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useNavigate, useParams } from "react-router-dom";
import {
  universalStepsFor,
  letterStepsFor,
  isQuestionAnswered,
  isQuestionVisible,
  type QuestionStep,
} from "@/lib/letters/questions";
import { LETTER_CATALOG, type LetterTypeMeta } from "@/lib/letters/catalog";
import type { LetterTypeId, Mode } from "@/lib/letters/types";
import { useDraftStore } from "@/lib/store";
import {
  useProfileStore,
  prefillsFromProfile,
  profileUpdatesFromAnswers,
} from "@/lib/profile";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/ds";
import { QuestionField } from "@/components/wizard/QuestionField";
import { EmployeePicker } from "@/components/wizard/EmployeePicker";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { ChevronLeft, ChevronRight, Sparkles, UserRound, X } from "lucide-react";
import { Triage } from "@/components/wizard/Triage";
import { PlanCard, PlanStep, PlanSteps, Pill } from "@/components/finalize/Plan";

/**
 * New letter wizard (design section 3): a 2A serif title with the letter
 * type, one white question card at a time on the stone ground, and a
 * 4B-style plan card on the right listing the steps with a progress bar.
 * Triage for high-risk employee letters comes first as a tinted card.
 */
export function Wizard({ mode }: { mode: Mode }) {
  const { letterType } = useParams<{ letterType: LetterTypeId }>();
  const nav = useNavigate();
  // `letterType` comes straight from the URL, so it may not match any known
  // letter. Look up defensively (getLetterMeta throws on a miss) and render a
  // graceful not-found below instead of crashing the whole app.
  const meta = useMemo(
    () => LETTER_CATALOG.find((l) => l.id === (letterType as LetterTypeId)),
    [letterType]
  );
  const createDraft = useDraftStore((s) => s.createDraft);

  const profile = useProfileStore((s) => s.profile);
  const setAutoFill = useProfileStore((s) => s.setAutoFill);
  const patchPersonal = useProfileStore((s) => s.patchPersonal);
  const patchEmployer = useProfileStore((s) => s.patchEmployer);
  const patchDefaults = useProfileStore((s) => s.patchDefaults);

  const steps: QuestionStep[] = useMemo(
    () => [...universalStepsFor(mode), ...(meta ? letterStepsFor(meta.id) : [])],
    [mode, meta]
  );

  // Initial answers seeded from profile (snapshot taken once on mount).
  const initialAnswersRef = useRef<Record<string, unknown>>(
    prefillsFromProfile(profile, mode)
  );
  const [stepIndex, setStepIndex] = useState(0);
  const [answers, setAnswers] = useState<Record<string, unknown>>(
    () => initialAnswersRef.current
  );
  const [showPrefillBanner, setShowPrefillBanner] = useState(
    () => Object.keys(initialAnswersRef.current).length > 0
  );

  // Triage: shown ONCE before the wizard for high-risk employee letters.
  // The user can skip; we don't block.
  const triageApplies =
    mode === "employee" &&
    !!meta &&
    (meta.riskClass === "high" || Boolean(meta.tribunalBound));
  const [triageDone, setTriageDone] = useState(!triageApplies);

  // If the user toggles auto-fill mid-wizard, re-seed (or clear) answers.
  useEffect(() => {
    if (profile.autoFill) {
      initialAnswersRef.current = prefillsFromProfile(profile, mode);
      setAnswers((current) => ({ ...initialAnswersRef.current, ...current }));
      setShowPrefillBanner(Object.keys(initialAnswersRef.current).length > 0);
    }
    // We deliberately don't depend on `answers` — only on the profile changing.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profile.autoFill]);

  if (!meta) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-16 sm:px-6 text-center">
        <h1 className="ds-title m-0 text-[32px] leading-tight">Letter type not found</h1>
        <p className="mb-6 mt-2 text-[14px] text-[var(--ds-muted)]">
          We couldn't find a letter template for this address. It may have been
          renamed or removed.
        </p>
        <Button onClick={() => nav(mode === "employer" ? "/hr" : "/me")}>
          Back to letters
        </Button>
      </div>
    );
  }

  const step = steps[stepIndex];
  const isLast = stepIndex === steps.length - 1;
  const visibleQuestions = step.questions.filter((q) => isQuestionVisible(q, answers));
  const requiredAnswered = visibleQuestions
    .filter((q) => q.required)
    .every((q) => isQuestionAnswered(q, answers[q.id]));

  const onNext = () => {
    if (isLast) {
      if (profile.autoFill) {
        const updates = profileUpdatesFromAnswers(answers, mode);
        if (Object.keys(updates.personal).length) patchPersonal(updates.personal);
        if (Object.keys(updates.employer).length) patchEmployer(updates.employer);
        if (Object.keys(updates.defaults).length) patchDefaults(updates.defaults);
      }
      const id = createDraft(meta.id, answers, mode);
      nav(`/editor/${id}`);
      return;
    }
    setStepIndex((i) => i + 1);
  };

  const onBack = () => {
    if (stepIndex === 0) {
      nav(mode === "employer" ? "/hr" : "/me");
    } else {
      setStepIndex((i) => i - 1);
    }
  };

  const fillFromProfile = () => {
    const fills = prefillsFromProfile({ ...profile, autoFill: true }, mode);
    setAnswers((a) => ({ ...a, ...fills }));
    setShowPrefillBanner(true);
  };

  const profileEmpty = Object.keys(initialAnswersRef.current).length === 0;
  const prefix = mode === "employer" ? "/hr" : "/me";

  if (!triageDone) {
    return (
      <WizardShell
        meta={meta}
        prefix={prefix}
        plan={
          <WizardPlan
            meta={meta}
            steps={steps}
            stepIndex={-1}
            triage="now"
            onJump={() => {}}
          />
        }
      >
        <Triage
          letterType={meta.id}
          jurisdiction={(profile.defaults.jurisdiction as "UK" | "US") ?? "UK"}
          onSkip={() => setTriageDone(true)}
          onContinue={() => setTriageDone(true)}
        />
      </WizardShell>
    );
  }

  return (
    <WizardShell
      meta={meta}
      prefix={prefix}
      note={
        showPrefillBanner ? (
          // Prefill note: a quiet line under the title, dismissable.
          <div className="flex items-start gap-2.5 rounded-[var(--ds-r-m)] bg-[var(--ds-surface-2)] px-3.5 py-2.5 text-[12.5px] leading-relaxed text-[var(--ds-muted)]">
            <UserRound className="mt-0.5 size-3.5 shrink-0" />
            <p className="m-0 min-w-0 flex-1">
              <span className="font-medium text-[var(--ds-ink)]">Filled from your profile.</span>{" "}
              Edit any field freely.{" "}
              <button
                type="button"
                className="text-[var(--ds-ink)] underline underline-offset-2"
                onClick={() => nav("/settings")}
              >
                Edit profile
              </button>{" "}
              <span aria-hidden className="text-[var(--ds-faint)]">·</span>{" "}
              <button
                type="button"
                className="text-[var(--ds-ink)] underline underline-offset-2"
                onClick={() => {
                  setAutoFill(false);
                  setShowPrefillBanner(false);
                  setAnswers({});
                }}
              >
                Don't auto-fill
              </button>
            </p>
            <button
              type="button"
              onClick={() => setShowPrefillBanner(false)}
              aria-label="Dismiss"
              className="-m-1 rounded-[var(--ds-r-s)] p-1 text-[var(--ds-muted)] hover:bg-[var(--ds-surface-3)] hover:text-[var(--ds-ink)]"
            >
              <X className="size-3.5" />
            </button>
          </div>
        ) : null
      }
      plan={
        <>
          <WizardPlan
            meta={meta}
            steps={steps}
            stepIndex={stepIndex}
            triage={triageApplies ? "done" : undefined}
            onJump={setStepIndex}
          />
          {/* If the profile is empty, a one-click setup helper. */}
          {profileEmpty && stepIndex === 0 && (
            <section className="rounded-[var(--ds-r-l)] border border-dashed border-[var(--ds-line-strong)] p-4">
              <h3 className="m-0 text-[13.5px] font-medium text-[var(--ds-ink)]">
                Save time on future letters?
              </h3>
              <p className="m-0 mt-1 text-[12.5px] leading-relaxed text-[var(--ds-muted)]">
                Set up your profile once and we'll auto-fill your details every time.
              </p>
              <Button size="sm" variant="outline" className="mt-3" onClick={() => nav("/settings")}>
                Set up profile
              </Button>
            </section>
          )}
        </>
      }
    >
      <section
        aria-labelledby="wizard-step-title"
        className="rounded-[var(--ds-r-l)] border border-[var(--ds-line)] bg-[var(--ds-surface)] shadow-[var(--ds-shadow-s)]"
      >
        <div className="px-5 pb-1 pt-5 sm:px-7 sm:pt-6">
          <div className="flex items-center gap-3">
            <span className="ds-mono text-[12px] text-[var(--ds-muted)]">
              Step {stepIndex + 1} of {steps.length}
            </span>
            {/* Phones: the plan card sits below, so keep a bar up here. */}
            <span className="h-[3px] flex-1 overflow-hidden rounded-full bg-[var(--ds-line)] lg:hidden" aria-hidden>
              <span
                className="block h-full rounded-full bg-[var(--ds-ink)] transition-[width] duration-500"
                style={{ width: `${((stepIndex + 1) / steps.length) * 100}%` }}
              />
            </span>
          </div>
          <h2
            id="wizard-step-title"
            className="m-0 mt-2 text-[19px] font-medium leading-snug tracking-[-0.01em] text-[var(--ds-ink)]"
          >
            {step.title}
          </h2>
          {step.description && (
            <p className="m-0 mt-1.5 max-w-[62ch] text-[13.5px] leading-relaxed text-[var(--ds-muted)]">
              {step.description}
            </p>
          )}
        </div>

        <div className="space-y-6 px-5 py-6 sm:px-7">
          {/* Employee directory picker — only on the step that captures
           * the employee fields, only in HR mode, only when the workspace
           * has anyone to pick from. */}
          {mode === "employer" &&
            visibleQuestions.some((q) => q.id === "employeeLegalName") && (
              <EmployeePicker
                answers={answers}
                onPick={(patch) => setAnswers((a) => ({ ...a, ...patch }))}
                onClear={() =>
                  setAnswers((a) => {
                    const next = { ...a };
                    delete next.linkedEmployeeId;
                    return next;
                  })
                }
              />
            )}
          {visibleQuestions.map((q) => (
            <QuestionField
              key={q.id}
              q={q}
              value={answers[q.id]}
              onChange={(v) => setAnswers((a) => ({ ...a, [q.id]: v }))}
            />
          ))}
          {visibleQuestions.length === 0 && (
            <p className="m-0 text-[13px] text-[var(--ds-muted)]">No questions for this step yet.</p>
          )}
        </div>

        <div className="flex items-center justify-between gap-3 border-t border-[var(--ds-line-2)] px-4 py-3 sm:px-6">
          <Button variant="ghost" onClick={onBack}>
            <ChevronLeft className="size-4" />
            {stepIndex === 0 ? "Cancel" : "Back"}
          </Button>
          <Button onClick={onNext} disabled={!requiredAnswered}>
            {isLast ? (
              <>
                <Sparkles className="size-4" />
                Generate draft
              </>
            ) : (
              <>
                Next
                <ChevronRight className="size-4" />
              </>
            )}
          </Button>
        </div>
      </section>

      {/* Auto-fill toggle (always visible under the card, discreet) */}
      <div className="mt-3 flex flex-wrap items-center justify-between gap-2 px-1 text-[12.5px] text-[var(--ds-muted)]">
        <div className="flex items-center gap-2">
          <Switch
            id="autofill-toggle"
            checked={profile.autoFill}
            onCheckedChange={setAutoFill}
          />
          <Label htmlFor="autofill-toggle" className="cursor-pointer text-[12.5px] font-normal">
            Auto-fill from my profile
          </Label>
        </div>
        {profile.autoFill && !profileEmpty && (
          <button
            type="button"
            className="text-[var(--ds-ink)] underline underline-offset-2"
            onClick={fillFromProfile}
          >
            Re-fill this form
          </button>
        )}
      </div>
    </WizardShell>
  );
}

const RISK_TONE = { high: "red", medium: "amber", low: "green" } as const;

/** Page frame: 2A header, then the step on the left and the plan on the right. */
function WizardShell({
  meta,
  prefix,
  note,
  plan,
  children,
}: {
  meta: LetterTypeMeta;
  prefix: string;
  note?: ReactNode;
  plan: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="mx-auto w-full max-w-[1120px] px-4 py-6 sm:px-8 sm:py-10">
      <PageHeader
        className="mb-6"
        crumbs={[
          { label: "Template library", href: `${prefix}/new` },
          { label: "New letter" },
        ]}
        title={meta.title}
        lede="Answer a few short questions and DraftHR writes the first draft for you to edit."
        actions={
          <Pill tone={RISK_TONE[meta.riskClass]} round>
            {meta.riskClass === "high" ? "High" : meta.riskClass === "medium" ? "Medium" : "Low"} risk
          </Pill>
        }
      />
      {note && <div className="mb-5 max-w-[760px]">{note}</div>}
      <div className="grid items-start gap-5 lg:grid-cols-[minmax(0,1fr)_300px] lg:gap-8">
        <div className="min-w-0">{children}</div>
        <aside className="flex min-w-0 flex-col gap-4 lg:sticky lg:top-6">{plan}</aside>
      </div>
    </div>
  );
}

/** 4B plan card: every wizard step, ticked off as you go. */
function WizardPlan({
  meta,
  steps,
  stepIndex,
  triage,
  onJump,
}: {
  meta: LetterTypeMeta;
  steps: QuestionStep[];
  /** -1 while triage is open. */
  stepIndex: number;
  triage?: "now" | "done";
  onJump: (index: number) => void;
}) {
  const total = steps.length + (triage ? 1 : 0) + 1;
  const done = (triage === "done" ? 1 : 0) + Math.max(0, stepIndex);
  return (
    <PlanCard
      title="Your letter"
      sub={meta.shortTitle}
      meta={stepIndex < 0 ? "Before you start" : `${stepIndex + 1} of ${steps.length}`}
      progress={(done + 1) / total}
    >
      <PlanSteps>
        {triage && (
          <PlanStep state={triage === "now" ? "now" : "done"}>Quick check before drafting</PlanStep>
        )}
        {steps.map((s, i) => {
          const state = i < stepIndex ? "done" : i === stepIndex ? "now" : "todo";
          return (
            <PlanStep
              key={s.id}
              state={state}
              onClick={state === "done" ? () => onJump(i) : undefined}
              title={state === "done" ? `Back to ${s.title}` : undefined}
            >
              {s.title}
            </PlanStep>
          );
        })}
        <PlanStep state="todo">DraftHR writes the first draft</PlanStep>
      </PlanSteps>
    </PlanCard>
  );
}
