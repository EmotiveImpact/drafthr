import { describe, expect, it } from "vitest";
import { universalStepsFor } from "@/lib/letters/questions";
import { answersOutsideJurisdiction, questionForJurisdiction } from "./jurisdictionOptions";

const workerClass = universalStepsFor("employer").flatMap((s) => s.questions).find((q) => q.id === "workerClass")!;

describe("questionForJurisdiction", () => {
  it("drops the UK-only worker statuses in the United States", () => {
    const us = questionForJurisdiction(workerClass, "US");
    expect(us.options?.map((o) => o.label)).toEqual(["Employee", "Contractor / 1099"]);
  });

  it("keeps every UK status and names the UK contractor term", () => {
    const uk = questionForJurisdiction(workerClass, "UK");
    expect(uk.options?.map((o) => o.label)).toEqual([
      "Employee",
      "Worker (UK)",
      "Contractor / self-employed",
      "Casual / zero-hours",
    ]);
  });

  it("leaves other questions alone", () => {
    const q = { id: "tone", type: "select" as const, label: "Tone", options: [{ value: "a", label: "A" }] };
    expect(questionForJurisdiction(q, "US")).toBe(q);
  });
});

describe("answersOutsideJurisdiction", () => {
  it("names a UK-only answer once the letter is for the United States", () => {
    expect(answersOutsideJurisdiction({ workerClass: "casual" }, "US")).toEqual(["workerClass"]);
    expect(answersOutsideJurisdiction({ workerClass: "employee" }, "US")).toEqual([]);
    expect(answersOutsideJurisdiction({ workerClass: "casual" }, "UK")).toEqual([]);
  });
});
