import { describe, expect, it } from "vitest";
import { conditionRefs, evaluate, lensText, type EvalContext } from "./conditions.js";
import { historyBuilder, rebuildCaseFile } from "./history.js";
import type { Condition, FactValue } from "./types.js";

function ctxWith(facts: Record<string, FactValue>, extra: Partial<EvalContext> = {}): EvalContext {
  const h = historyBuilder("2026-10-13T09:00:00Z").open("grievance", "employee", {
    country: "uk",
    nation: "scotland",
  });
  for (const [key, value] of Object.entries(facts)) h.answer(key, value);
  return {
    file: rebuildCaseFile("c1", h.events),
    today: "2026-10-13",
    deadlines: {},
    drafted: new Set(),
    ...extra,
  };
}

describe("evaluate", () => {
  it("treats comparisons on unknown facts as false, and not as true", () => {
    const ctx = ctxWith({});
    expect(evaluate({ fact: "x", is: true }, ctx)).toBe(false);
    expect(evaluate({ not: { fact: "x", is: true } }, ctx)).toBe(true);
    expect(evaluate({ known: "x" }, ctx)).toBe(false);
  });

  it("treats an empty string as unknown", () => {
    expect(evaluate({ known: "name" }, ctxWith({ name: "" }))).toBe(false);
  });

  it("reads lists as contains", () => {
    const ctx = ctxWith({ reasons: ["pregnancy", "race"] });
    expect(evaluate({ fact: "reasons", is: "race" }, ctx)).toBe(true);
    expect(evaluate({ fact: "reasons", in: ["age", "pregnancy"] }, ctx)).toBe(true);
    expect(evaluate({ fact: "reasons", in: ["age"] }, ctx)).toBe(false);
  });

  it("compares numbers and dates", () => {
    const ctx = ctxWith({ count: 25, actDate: "2026-09-22", hearingDate: "2026-10-15" });
    expect(evaluate({ fact: "count", atLeast: 20 }, ctx)).toBe(true);
    expect(evaluate({ fact: "count", below: 20 }, ctx)).toBe(false);
    expect(evaluate({ fact: "actDate", before: "2026-10-01" }, ctx)).toBe(true);
    expect(evaluate({ fact: "actDate", onOrAfter: { fact: "hearingDate" } }, ctx)).toBe(false);
    expect(evaluate({ fact: "hearingDate", withinDays: 2 }, ctx)).toBe(true);
    expect(evaluate({ fact: "hearingDate", withinDays: 1 }, ctx)).toBe(false);
    expect(evaluate({ fact: "actDate", withinDays: 100 }, ctx)).toBe(false);
  });

  it("tests the case's lens and place", () => {
    const ctx = ctxWith({});
    expect(evaluate({ lens: ["employee", "consultant"] }, ctx)).toBe(true);
    expect(evaluate({ nation: "scotland" }, ctx)).toBe(true);
    expect(evaluate({ country: "us" }, ctx)).toBe(false);
    expect(evaluate({ state: "CA" }, ctx)).toBe(false);
  });

  it("reads deadlines and drafted letters", () => {
    const ctx = ctxWith({}, { deadlines: { limit: "2026-10-20", none: null }, drafted: new Set(["invite"]) });
    expect(evaluate({ deadline: "limit", withinDays: 28 }, ctx)).toBe(true);
    expect(evaluate({ deadline: "limit", withinDays: 3 }, ctx)).toBe(false);
    expect(evaluate({ deadline: "none", withinDays: 28 }, ctx)).toBe(false);
    expect(evaluate({ drafted: "invite" }, ctx)).toBe(true);
  });

  it("combines with all and any", () => {
    const ctx = ctxWith({ a: true });
    const c: Condition = { all: [{ fact: "a", is: true }, { any: [{ known: "b" }, { lens: "employee" }] }] };
    expect(evaluate(c, ctx)).toBe(true);
  });
});

describe("conditionRefs", () => {
  it("collects facts, deadlines and steps, including date operands", () => {
    const refs = conditionRefs({
      all: [
        { fact: "a", before: { fact: "b" } },
        { deadline: "limit", withinDays: 3 },
        { not: { drafted: "invite" } },
        { fact: "c", withinDays: 5, from: { fact: "d" } },
      ],
    });
    expect(refs).toEqual({ facts: ["a", "b", "c", "d"], deadlines: ["limit"], steps: ["invite"] });
  });
});

describe("lensText", () => {
  it("falls back to the first entry", () => {
    expect(lensText("Same for all", "hr")).toBe("Same for all");
    expect(lensText({ employee: "You", hr: "They" }, "consultant")).toBe("You");
  });
});
