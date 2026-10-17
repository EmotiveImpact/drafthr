import type { FactValue, IsoDate, RuleInput, RuleResult } from "../types.js";
import { isIsoDate } from "./calendar.js";

/**
 * Reads a rule's inputs and remembers which are missing or unusable, so each
 * rule can stop with a `missing` result instead of guessing.
 */
export type InputReader = {
  date(name: string): IsoDate | undefined;
  optionalDate(name: string): IsoDate | undefined;
  number(name: string): number | undefined;
  /** A number of zero or more, or a numeric string; absent is fine. */
  optionalNumber(name: string): number | undefined;
  /**
   * A headcount: a number, a numeric string, or a band such as "15 to 19" or
   * "50 or more", read as its lower bound. The playbook bands start at the
   * legal thresholds, so the lower bound decides every threshold test.
   */
  count(name: string): number | undefined;
  /** As `count`, but absent is fine. */
  optionalCount(name: string): number | undefined;
  choice<T extends string>(name: string, allowed: readonly T[]): T | undefined;
  optionalChoice<T extends string>(name: string, allowed: readonly T[]): T | undefined;
  optionalText(name: string): string | undefined;
  /** A string or a list of strings, trimmed and lower-cased; absent is fine. */
  optionalList(name: string): string[] | undefined;
  /** A list of dates (one date on its own is accepted); absent is fine. */
  optionalDateList(name: string): IsoDate[] | undefined;
  optionalFlag(name: string): boolean | undefined;
  /** Marks an input unusable for a reason the type check cannot see. */
  reject(name: string, reason: string): void;
  /** True when every input read so far was present and usable. */
  ok(): boolean;
  /** The result to return when `ok()` is false. */
  needs(): RuleResult;
};

const absent = (value: FactValue | undefined) => value === undefined || value === null;

export function readInputs(input: RuleInput): InputReader {
  const missing: string[] = [];
  const problems: Problem[] = [];
  const flag = (name: string, reason: string) => {
    if (!missing.includes(name)) missing.push(name);
    problems.push({ name, reason });
  };

  function readDate(name: string, required: boolean): IsoDate | undefined {
    const value = input[name];
    if (absent(value)) {
      if (required) missing.push(name);
      return undefined;
    }
    const day = toDate(value);
    if (day) return day;
    flag(name, "is not a valid date (YYYY-MM-DD)");
    return undefined;
  }

  function readNumber(name: string, required: boolean, bands: boolean): number | undefined {
    const value = input[name];
    if (absent(value)) {
      if (required) missing.push(name);
      return undefined;
    }
    let n = typeof value === "number" ? value : typeof value === "string" && value.trim() !== "" ? Number(value) : NaN;
    if (bands && Number.isNaN(n) && typeof value === "string") {
      const band = /^\s*(\d+)\s*(?:to\b|-|or more\b|\+)/i.exec(value);
      if (band) n = Number(band[1]);
    }
    if (Number.isFinite(n) && n >= 0) return n;
    flag(name, "is not a number of zero or more");
    return undefined;
  }

  function readChoice<T extends string>(name: string, allowed: readonly T[], required: boolean): T | undefined {
    const value = input[name];
    if (absent(value)) {
      if (required) missing.push(name);
      return undefined;
    }
    const match = allowed.find((option) => option === value);
    if (match) return match;
    flag(name, `must be one of ${allowed.join(", ")}`);
    return undefined;
  }

  return {
    date: (name) => readDate(name, true),
    optionalDate: (name) => readDate(name, false),
    number: (name) => readNumber(name, true, false),
    optionalNumber: (name) => readNumber(name, false, false),
    count: (name) => readNumber(name, true, true),
    optionalCount: (name) => readNumber(name, false, true),
    choice: (name, allowed) => readChoice(name, allowed, true),
    optionalChoice: (name, allowed) => readChoice(name, allowed, false),
    optionalText(name) {
      const value = input[name];
      return typeof value === "string" && value.trim() !== "" ? value.trim() : undefined;
    },
    optionalList(name) {
      const value = input[name];
      if (absent(value)) return undefined;
      const items = Array.isArray(value) ? value : [value];
      if (items.every((item) => typeof item === "string")) {
        return items.map((item) => item.trim().toLowerCase()).filter((item) => item !== "");
      }
      flag(name, "must be text or a list of text");
      return undefined;
    },
    optionalDateList(name) {
      const value = input[name];
      if (absent(value)) return undefined;
      const days = (Array.isArray(value) ? value : [value]).map(toDate);
      if (days.every((day): day is IsoDate => day !== undefined)) return days;
      flag(name, "must be a list of valid dates (YYYY-MM-DD)");
      return undefined;
    },
    optionalFlag(name) {
      const value = input[name];
      if (absent(value)) return undefined;
      if (typeof value === "boolean") return value;
      flag(name, "must be true or false");
      return undefined;
    },
    reject: flag,
    ok: () => missing.length === 0,
    needs: () => needsResult(missing, problems),
  };
}

type Problem = { name: string; reason: string };

/** A date with any time after it (for example "2026-10-01T09:30:00Z") ignored. */
function toDate(value: FactValue | undefined): IsoDate | undefined {
  if (typeof value === "string" && (value.length === 10 || value[10] === "T")) {
    const day = value.slice(0, 10);
    if (isIsoDate(day)) return day;
  }
  return undefined;
}

/** The result for a rule that cannot run yet: `missing` lists absent and unusable inputs. */
export function needsResult(missing: string[], problems: Problem[] = []): RuleResult {
  const absentNames = missing.filter((name) => !problems.some((p) => p.name === name));
  const parts: string[] = [];
  if (absentNames.length) parts.push(`Needs ${absentNames.join(", ")} before this can be worked out.`);
  for (const { name, reason } of problems) parts.push(`${name} ${reason}.`);
  return { date: null, basis: parts.join(" "), sources: [], missing: [...missing] };
}

/** The result for a rule that does not fit the case's jurisdiction. */
export function notApplicable(reason: string, toVerify: string[] = []): RuleResult {
  const out: RuleResult = { date: null, basis: reason, sources: [], notApplicable: reason };
  if (toVerify.length) out.toVerify = toVerify;
  return out;
}

/** Builds a result, leaving out an empty `toVerify`. */
export function result(r: {
  date: IsoDate | null;
  basis: string;
  sources: string[];
  toVerify?: string[];
  detail?: Record<string, FactValue>;
}): RuleResult {
  const out: RuleResult = { date: r.date, basis: r.basis, sources: r.sources };
  if (r.toVerify && r.toVerify.length) out.toVerify = r.toVerify;
  if (r.detail) out.detail = r.detail;
  return out;
}
