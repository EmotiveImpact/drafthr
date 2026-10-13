import { daysBetween, isIsoDate } from "./dates";
import type { CaseFile, Condition, DateOperand, FactValue, IsoDate, Lens, LensText } from "./types";

export type EvalContext = {
  file: CaseFile;
  today: IsoDate;
  /** Dates of the rule uses worked out so far, by rule use id. */
  deadlines: Record<string, IsoDate | null>;
  /** Route steps whose letter is drafted or sent. */
  drafted: ReadonlySet<string>;
};

/** A fact is known when it has a value other than null or "", and is not forgotten. */
export function isKnown(file: CaseFile, key: string): boolean {
  const entry = file.facts[key];
  return entry !== undefined && entry.value !== null && entry.value !== "";
}

function factValue(file: CaseFile, key: string): FactValue | undefined {
  return isKnown(file, key) ? file.facts[key].value : undefined;
}

function resolveDate(operand: DateOperand, ctx: EvalContext): IsoDate | undefined {
  if (typeof operand === "string") return operand;
  if ("today" in operand) return ctx.today;
  const value = factValue(ctx.file, operand.fact);
  return isIsoDate(value) ? value : undefined;
}

function oneOf<T>(wanted: T | T[], actual: T): boolean {
  return Array.isArray(wanted) ? wanted.includes(actual) : wanted === actual;
}

/**
 * Evaluates a playbook condition. Any comparison on an unknown fact is false;
 * `not` flips it. See README.md for the full contract.
 */
export function evaluate(condition: Condition, ctx: EvalContext): boolean {
  const { file } = ctx;
  if ("all" in condition) return condition.all.every((c) => evaluate(c, ctx));
  if ("any" in condition) return condition.any.some((c) => evaluate(c, ctx));
  if ("not" in condition) return !evaluate(condition.not, ctx);
  if ("known" in condition) return isKnown(file, condition.known);
  if ("lens" in condition) return oneOf<Lens>(condition.lens, file.lens);
  if ("nation" in condition) {
    return file.jurisdiction.country === "uk" && oneOf(condition.nation, file.jurisdiction.nation);
  }
  if ("country" in condition) return file.jurisdiction.country === condition.country;
  if ("state" in condition) {
    return file.jurisdiction.country === "us" && oneOf(condition.state, file.jurisdiction.state);
  }
  if ("deadline" in condition) {
    const date = ctx.deadlines[condition.deadline];
    return typeof date === "string" && daysBetween(ctx.today, date) <= condition.withinDays;
  }
  if ("drafted" in condition) return ctx.drafted.has(condition.drafted);

  const value = factValue(file, condition.fact);
  if (value === undefined) return false;

  if ("is" in condition) {
    return Array.isArray(value)
      ? typeof condition.is === "string" && value.includes(condition.is)
      : value === condition.is;
  }
  if ("in" in condition) {
    return Array.isArray(value)
      ? value.some((v) => condition.in.includes(v))
      : condition.in.includes(value);
  }
  if ("atLeast" in condition) return typeof value === "number" && value >= condition.atLeast;
  if ("below" in condition) return typeof value === "number" && value < condition.below;

  if (!isIsoDate(value)) return false;
  if ("before" in condition) {
    const other = resolveDate(condition.before, ctx);
    return other !== undefined && value < other;
  }
  if ("onOrAfter" in condition) {
    const other = resolveDate(condition.onOrAfter, ctx);
    return other !== undefined && value >= other;
  }
  const from = resolveDate(condition.from ?? { today: true }, ctx);
  if (from === undefined) return false;
  const days = daysBetween(from, value);
  return days >= 0 && days <= condition.withinDays;
}

/** Every fact key, rule use id and route step id a condition refers to. */
export function conditionRefs(condition: Condition): {
  facts: string[];
  deadlines: string[];
  steps: string[];
} {
  const refs = { facts: [] as string[], deadlines: [] as string[], steps: [] as string[] };
  const walk = (c: Condition): void => {
    if ("all" in c) c.all.forEach(walk);
    else if ("any" in c) c.any.forEach(walk);
    else if ("not" in c) walk(c.not);
    else if ("known" in c) refs.facts.push(c.known);
    else if ("deadline" in c) refs.deadlines.push(c.deadline);
    else if ("drafted" in c) refs.steps.push(c.drafted);
    else if ("fact" in c) {
      refs.facts.push(c.fact);
      const operands: (DateOperand | undefined)[] = [
        "before" in c ? c.before : undefined,
        "onOrAfter" in c ? c.onOrAfter : undefined,
        "withinDays" in c ? c.from : undefined,
      ];
      for (const op of operands) {
        if (op && typeof op === "object" && "fact" in op) refs.facts.push(op.fact);
      }
    }
  };
  walk(condition);
  return refs;
}

/** Reads lens-specific text; a missing lens falls back to the first entry. */
export function lensText(text: LensText, lens: Lens): string {
  if (typeof text === "string") return text;
  return text[lens] ?? Object.values(text)[0] ?? "";
}
