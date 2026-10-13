import { evaluate, isKnown, lensText, type EvalContext } from "./conditions";
import { daysBetween } from "./dates";
import { runRule } from "./rules";
import type {
  CaseFile,
  Deadline,
  FactValue,
  FiredCheck,
  IsoDate,
  MissingFact,
  Playbook,
  RouteEntry,
  RuleInput,
  RunResult,
} from "./types";

/**
 * Runs a playbook over a case file. Pure: the same file, playbook and day
 * always give the same result. See README.md for the contract.
 */
export function runPlaybook(file: CaseFile, playbook: Playbook, today: IsoDate): RunResult {
  const { lens } = file;
  const drafted = new Set(file.letters.filter((l) => l.drafted || l.sentOn).map((l) => l.stepId));
  const ctx: EvalContext = { file, today, deadlines: {}, drafted };

  // Deadlines first, in playbook order, so checks and the route can use them.
  // A rule use's own `when` sees only the deadlines worked out before it.
  const deadlines: Deadline[] = [];
  for (const use of playbook.rules) {
    if (use.lens && !use.lens.includes(lens)) continue;
    if (use.when && !evaluate(use.when, ctx)) continue;

    const input: RuleInput = {};
    const disputed: string[] = [];
    for (const [name, spec] of Object.entries(use.inputs)) {
      if ("value" in spec) {
        input[name] = spec.value;
      } else if ("deadline" in spec) {
        input[name] = earliestDeadline(spec.deadline, ctx.deadlines);
      } else {
        input[name] = isKnown(file, spec.fact) ? file.facts[spec.fact].value : undefined;
        if (file.facts[spec.fact]?.conflict) disputed.push(spec.fact);
      }
    }
    const result = runRule(use.rule, input, { jurisdiction: file.jurisdiction, today });
    if (result.notApplicable) continue;

    const toVerify = [...(result.toVerify ?? [])];
    for (const key of disputed) {
      toVerify.push(`Uses "${factLabel(playbook, key)}", which two sources give differently. Confirm it first.`);
    }
    ctx.deadlines[use.id] = result.date;
    deadlines.push({
      ruleUseId: use.id,
      rule: use.rule,
      label: lensText(use.label, lens),
      date: result.date,
      daysLeft: result.date ? daysBetween(today, result.date) : null,
      basis: result.basis,
      sources: result.sources,
      missing: result.missing ?? [],
      toVerify,
      detail: result.detail,
    });
  }

  const missing = missingFacts(file, playbook, ctx);

  const checks: FiredCheck[] = playbook.checks
    .filter((check) => evaluate(check.when, ctx))
    .map((check) => ({
      id: check.id,
      level: check.level,
      message: lensText(check.message, lens),
      sources: check.sources ?? [],
      toVerify: Boolean(check.toVerify),
      proposal: Boolean(check.proposal),
    }));

  const route = routeFor(file, playbook, ctx);

  return {
    caseId: file.caseId,
    playbook: { id: playbook.id, version: playbook.version },
    lens,
    jurisdiction: file.jurisdiction,
    today,
    missing,
    nextQuestion: missing[0] ?? null,
    checks,
    deadlines,
    route,
    nextLetter: route.find((r) => r.status === "next") ?? null,
    handOffs: playbook.handOffs
      .filter((h) => evaluate(h.when, ctx))
      .map((h) => ({ id: h.id, to: h.to, message: lensText(h.message, lens) })),
    conflicts: Object.values(file.facts)
      .filter((f) => f.conflict)
      .map((f) => f.key),
  };
}

function factLabel(playbook: Playbook, key: string): string {
  return playbook.facts.find((f) => f.key === key)?.label ?? key;
}

function missingFacts(file: CaseFile, playbook: Playbook, ctx: EvalContext): MissingFact[] {
  const must: MissingFact[] = [];
  const should: MissingFact[] = [];
  for (const spec of playbook.facts) {
    const priority = spec.priority[file.lens];
    if (priority !== "must" && priority !== "should") continue;
    if (file.forgotten.includes(spec.key)) continue;
    if (spec.askIf && !evaluate(spec.askIf, ctx)) continue;
    const conflicted = Boolean(file.facts[spec.key]?.conflict);
    if (isKnown(file, spec.key) && !conflicted) continue;
    const entry: MissingFact = {
      key: spec.key,
      label: spec.label,
      priority,
      question: lensText(spec.question, file.lens),
      why: spec.why,
      ...(conflicted ? { conflicted: true } : {}),
    };
    (priority === "must" ? must : should).push(entry);
  }
  return [...must, ...should];
}

function routeFor(file: CaseFile, playbook: Playbook, ctx: EvalContext): RouteEntry[] {
  const entries: RouteEntry[] = [];
  const notApplicable = new Set<string>();
  let nextTaken = false;

  for (const step of playbook.route) {
    if (!step.lens.includes(file.lens)) {
      notApplicable.add(step.id);
      continue;
    }
    const base = { stepId: step.id, title: lensText(step.title, file.lens), letter: step.letter };
    const letter = file.letters.find((l) => l.stepId === step.id);

    if (letter?.sentOn) {
      entries.push({ ...base, status: "sent" });
      continue;
    }
    if (letter?.drafted) {
      entries.push({ ...base, status: "drafted" });
      continue;
    }
    if (step.when && !evaluate(step.when, ctx)) {
      notApplicable.add(step.id);
      entries.push({ ...base, status: "not_applicable" });
      continue;
    }
    const block = step.blockedIf?.find((b) => evaluate(b.when, ctx));
    if (block) {
      entries.push({ ...base, status: "blocked", reason: lensText(block.reason, file.lens) });
      continue;
    }
    const waitingOn = (step.after ?? []).filter((id) => !ctx.drafted.has(id) && !notApplicable.has(id));
    if (waitingOn.length > 0) {
      entries.push({ ...base, status: "waiting" });
      continue;
    }
    const needs = (step.needs ?? []).filter((key) => !isKnown(file, key));
    if (needs.length > 0) {
      entries.push({ ...base, status: "needs_facts", missing: needs });
      continue;
    }
    entries.push({ ...base, status: nextTaken ? "waiting" : "next" });
    nextTaken = true;
  }
  return entries;
}

/** Facts as plain values, for logs and reports. */
export function factValues(file: CaseFile): Record<string, FactValue> {
  return Object.fromEntries(Object.values(file.facts).map((f) => [f.key, f.value]));
}

/** The earliest known date among earlier rule uses, or undefined if none is known yet. */
function earliestDeadline(ids: string | string[], deadlines: Record<string, IsoDate | null>): IsoDate | undefined {
  const dates = (Array.isArray(ids) ? ids : [ids]).map((id) => deadlines[id]).filter((d): d is IsoDate => Boolean(d));
  return dates.length ? dates.sort()[0] : undefined;
}
