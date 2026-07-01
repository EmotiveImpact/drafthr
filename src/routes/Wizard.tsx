import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import {
  universalStepsFor,
  letterStepsFor,
  isQuestionAnswered,
  type QuestionStep,
} from "@/lib/letters/questions";
import { LETTER_CATALOG } from "@/lib/letters/catalog";
import type { LetterTypeId, Mode } from "@/lib/letters/types";
import { useDraftStore } from "@/lib/store";
import {
  useProfileStore,
  prefillsFromProfile,
  profileUpdatesFromAnswers,
} from "@/lib/profile";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Card, CardContent } from "@/components/ui/card";
import { QuestionField } from "@/components/wizard/QuestionField";
import { EmployeePicker } from "@/components/wizard/EmployeePicker";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { ChevronLeft, ChevronRight, Sparkles, UserRound, X } from "lucide-react";
import { Badge } from "@/components/Badge";
import { Triage } from "@/components/wizard/Triage";

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
        <h1 className="text-2xl font-semibold tracking-tight">Letter type not found</h1>
        <p className="text-sm text-muted-foreground mt-2 mb-6">
          We couldn't find a letter template for this URL. It may have been
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
  const visibleQuestions = step.questions.filter((q) => !q.showIf || q.showIf(answers));
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

  if (!triageDone) {
    return (
      <Triage
        letterType={meta.id}
        jurisdiction={(profile.defaults.jurisdiction as "UK" | "US") ?? "UK"}
        onSkip={() => setTriageDone(true)}
        onContinue={() => setTriageDone(true)}
      />
    );
  }

  return (
    <div className="mx-auto max-w-3xl px-4 py-6 sm:px-6 sm:py-10">
      <div className="mb-6">
        <div className="flex items-center justify-between mb-2">
          <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">
            {mode === "employer" ? "New" : "Employee"} {meta.shortTitle}
          </p>
          <Badge
            className={
              meta.riskClass === "high"
                ? "bg-rose-50 text-rose-900 border-rose-200"
                : meta.riskClass === "medium"
                ? "bg-amber-50 text-amber-900 border-amber-200"
                : "bg-green-50 text-green-800 border-green-200"
            }
          >
            {meta.riskClass} risk
          </Badge>
        </div>
        <h1 className="text-2xl font-semibold tracking-tight">{step.title}</h1>
        {step.description && (
          <p className="text-sm text-muted-foreground mt-2 leading-relaxed">{step.description}</p>
        )}
        <Progress value={((stepIndex + 1) / steps.length) * 100} className="mt-5 h-1" />
        <p className="text-xs text-muted-foreground mt-2">
          Step {stepIndex + 1} of {steps.length}
        </p>
      </div>

      {/* Prefill banner — shown once when there's prefilled data, dismissable */}
      {showPrefillBanner && (
        <div className="mb-4 flex items-start gap-3 rounded-md border border-letter-rule bg-muted/40 p-3 text-xs">
          <UserRound className="size-4 mt-0.5 shrink-0 text-muted-foreground" />
          <div className="flex-1 leading-relaxed">
            <p className="font-medium">Filled from your profile.</p>
            <p className="text-muted-foreground">
              Edit any field freely.{" "}
              <button className="underline" onClick={() => nav("/settings")}>
                Edit profile
              </button>{" "}
              ·{" "}
              <button
                className="underline"
                onClick={() => {
                  setAutoFill(false);
                  setShowPrefillBanner(false);
                  setAnswers({});
                }}
              >
                Don't auto-fill
              </button>
            </p>
          </div>
          <button
            type="button"
            onClick={() => setShowPrefillBanner(false)}
            aria-label="Dismiss"
            className="text-muted-foreground hover:text-foreground"
          >
            <X className="size-4" />
          </button>
        </div>
      )}

      {/* If profile is empty, show a one-click setup helper */}
      {profileEmpty && stepIndex === 0 && (
        <div className="mb-4 flex items-center justify-between gap-3 rounded-md border border-dashed border-letter-rule p-3 text-xs">
          <div className="leading-relaxed">
            <p className="font-medium">Save time on future letters?</p>
            <p className="text-muted-foreground">
              Set up your profile once and we'll auto-fill your details every time.
            </p>
          </div>
          <Button size="sm" variant="outline" onClick={() => nav("/settings")}>
            Set up profile
          </Button>
        </div>
      )}

      <Card>
        <CardContent className="p-4 sm:p-6 space-y-6">
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
            <p className="text-sm text-muted-foreground">No questions for this step yet.</p>
          )}
        </CardContent>
      </Card>

      {/* Auto-fill toggle (always visible at bottom — discreet) */}
      <div className="flex items-center justify-between mt-4 rounded-md border border-letter-rule px-3 py-2 text-xs text-muted-foreground">
        <div className="flex items-center gap-2">
          <Switch
            id="autofill-toggle"
            checked={profile.autoFill}
            onCheckedChange={setAutoFill}
          />
          <Label htmlFor="autofill-toggle" className="font-normal text-xs cursor-pointer">
            Auto-fill from my profile
          </Label>
        </div>
        {profile.autoFill && !profileEmpty && (
          <button className="underline" onClick={fillFromProfile}>
            Re-fill this form
          </button>
        )}
      </div>

      <div className="flex items-center justify-between mt-6">
        <Button variant="ghost" onClick={onBack}>
          <ChevronLeft className="size-4 mr-1" />
          {stepIndex === 0 ? "Cancel" : "Back"}
        </Button>
        <Button onClick={onNext} disabled={!requiredAnswered}>
          {isLast ? (
            <>
              <Sparkles className="size-4 mr-1.5" />
              Generate draft
            </>
          ) : (
            <>
              Next
              <ChevronRight className="size-4 ml-1" />
            </>
          )}
        </Button>
      </div>
    </div>
  );
}
