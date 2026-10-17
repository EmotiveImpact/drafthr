import { conditionRefs, lensText } from "./conditions.js";
import type {
  CaseFile,
  FactValue,
  FiredCheck,
  IsoDate,
  Jurisdiction,
  Lens,
  MissingFact,
  Playbook,
  RunResult,
  SituationId,
  Source,
} from "./types.js";

/** The AI steps that receive a brief. */
export type BriefStep = "reader" | "interviewer" | "drafter" | "checker";

export type Brief = {
  step: BriefStep;
  caseId: string;
  situation: SituationId;
  lens: Lens;
  jurisdiction: Jurisdiction;
  today: IsoDate;
  /** Facts this step may see, each with where it came from. */
  facts: { key: string; label: string; value: FactValue; sources: Source[]; disputed: boolean }[];
  /** Special category facts held back from this step. Only keys, never values. */
  withheld: string[];
  /** What to ask next (interviewer) or what the Reader should look for (reader). */
  lookFor: MissingFact[];
  deadlines: { label: string; date: IsoDate | null; basis: string; toVerify: string[] }[];
  checks: FiredCheck[];
  /** The letter to draft (drafter only). */
  letter: { stepId: string; title: string; letter: string } | null;
  tone: string[];
  privacy: string[];
  /** Fixed lines every brief for this step carries. */
  instructions: string[];
};

const STANDING: Record<BriefStep, string[]> = {
  reader: [
    "Pull out facts only. Give the exact words each fact came from.",
    "Never work out a date or a deadline. Record dates exactly as given.",
    "If two parts of the story disagree, record both.",
  ],
  interviewer: [
    "Ask one question at a time, in plain language.",
    "Never give a deadline yourself. Only repeat the deadlines in this brief.",
    "Do not ask for anything listed as withheld unless the user raises it.",
  ],
  drafter: [
    "Use only the facts in this brief. If something the letter needs is missing, say so instead of guessing.",
    "Quote deadlines exactly as given in this brief.",
  ],
  checker: [
    "Compare the draft with the facts and deadlines in this brief and list every mismatch.",
  ],
};

/**
 * Builds a fresh brief for one AI step from the case file and the latest
 * run. Each step sees only what it needs:
 * - The Reader gets no facts, only what to look for, so it reads the story
 *   without being led.
 * - Special category facts (health, pregnancy, religion and the like) go
 *   only to the checker, and to the drafter when the letter needs them or a
 *   fired check depends on them. Elsewhere they are listed by key as withheld.
 */
export function buildBrief(
  file: CaseFile,
  playbook: Playbook,
  run: RunResult,
  step: BriefStep,
  letterStepId?: string
): Brief {
  const routeStep = letterStepId ? playbook.route.find((s) => s.id === letterStepId) : undefined;
  if (step === "drafter" && !routeStep) {
    throw new Error("A drafter brief needs the route step of the letter to draft");
  }

  const neededByChecks = new Set(
    run.checks.flatMap((fired) => {
      const spec = playbook.checks.find((c) => c.id === fired.id);
      return spec ? conditionRefs(spec.when).facts : [];
    })
  );
  const special = new Set(playbook.facts.filter((f) => f.specialCategory).map((f) => f.key));
  const mayShowSpecial = (key: string): boolean => {
    if (step === "checker") return true;
    if (step === "drafter") return Boolean(routeStep?.needs?.includes(key)) || neededByChecks.has(key);
    return false;
  };

  const facts: Brief["facts"] = [];
  const withheld: string[] = [];
  if (step !== "reader") {
    for (const entry of Object.values(file.facts)) {
      if (special.has(entry.key) && !mayShowSpecial(entry.key)) {
        withheld.push(entry.key);
        continue;
      }
      facts.push({
        key: entry.key,
        label: playbook.facts.find((f) => f.key === entry.key)?.label ?? entry.key,
        value: entry.value,
        sources: entry.sources,
        disputed: Boolean(entry.conflict),
      });
    }
  }

  const lookFor =
    step === "reader" ? run.missing : step === "interviewer" ? run.missing.slice(0, 3) : [];

  return {
    step,
    caseId: file.caseId,
    situation: playbook.id,
    lens: file.lens,
    jurisdiction: file.jurisdiction,
    today: run.today,
    facts,
    withheld,
    lookFor,
    deadlines: run.deadlines.map((d) => ({
      label: d.label,
      date: d.date,
      basis: d.basis,
      toVerify: d.toVerify,
    })),
    checks: run.checks.filter((c) => c.level !== "for_information" || step === "checker"),
    letter: routeStep
      ? { stepId: routeStep.id, title: lensText(routeStep.title, file.lens), letter: routeStep.letter }
      : null,
    tone: playbook.tone.lens[file.lens] ?? [],
    privacy: playbook.tone.privacy,
    instructions: STANDING[step],
  };
}
