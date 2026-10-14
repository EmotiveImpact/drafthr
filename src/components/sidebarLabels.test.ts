import { describe, expect, it } from "vitest";
import type { Draft } from "@/lib/letters/types";
import { recentLabelParts, recentLabels, shortName } from "./sidebarLabels";

function makeDraft(overrides: Partial<Draft> = {}): Draft {
  return {
    id: "d1",
    mode: "employer",
    letterType: "warning",
    context: {
      mode: "employer",
      jurisdiction: "UK",
      workerClass: "employee",
      letterType: "warning",
      effectiveDate: "2026-10-14",
      issueDate: "2026-10-14",
      deliveryMethod: "hand-delivery",
      tone: "formal",
      confidentiality: "public",
      counselReviewRequired: false,
      riskFlags: { protectedStatus: false, grievanceLast90Days: false, collectiveConsultation: false },
    },
    employer: { legalName: "Harbour Foods Ltd", address: "", hasLetterhead: true, signatoryName: "Alex Morgan", signatoryTitle: "HR Manager" },
    employee: { legalName: "Jordan Hale", jobTitle: "Shift lead", address: "", startDate: "2022-01-01", serviceMonths: 40 },
    answers: {},
    sections: [],
    reviewStatus: "approved",
    createdAt: 0,
    updatedAt: 0,
    ...overrides,
  } as Draft;
}

describe("recentLabels", () => {
  it("uses the mock's short form", () => {
    expect(recentLabels([makeDraft()])).toEqual(["Warning letter · J. Hale"]);
    expect(shortName("Priya Shah")).toBe("P. Shah");
  });

  it("names a warning's level, as the marketplace and the export pack do, so two warnings read apart (FOUNDATION-X13)", () => {
    const final = makeDraft({ id: "a", answers: { warningLevel: "final_written" } as Draft["answers"] });
    const draft = makeDraft({ id: "b" });
    expect(recentLabels([draft, final])).toEqual(["Warning letter · J. Hale", "Final written warning · J. Hale"]);
    const first = makeDraft({ id: "c", answers: { warningLevel: "written" } as Draft["answers"] });
    expect(recentLabels([first, final])).toEqual(["First written warning · J. Hale", "Final written warning · J. Hale"]);
  });

  it("keeps the mock's short form for a single warning, whatever its level", () => {
    expect(recentLabels([makeDraft({ answers: { warningLevel: "final_written" } as Draft["answers"] })])).toEqual([
      "Warning letter · J. Hale",
    ]);
  });

  it("numbers two that would still read the same, in the order they were started", () => {
    const older = makeDraft({ id: "a", createdAt: 1, updatedAt: 5 });
    const newer = makeDraft({ id: "b", createdAt: 2, updatedAt: 9 });
    const offer = makeDraft({ id: "c", letterType: "offer", employee: { ...makeDraft().employee, legalName: "Priya Shah" } });
    const labels = recentLabels([newer, older, offer]);
    expect(labels[0]).toBe("Warning letter 2 · J. Hale");
    expect(labels[1]).toBe("Warning letter 1 · J. Hale");
    expect(labels[2]).toMatch(/· P\. Shah$/);
    expect(new Set(labels).size).toBe(3);
  });

  it("gives two numbered warnings hover text that tells them apart (FOUNDATION-X12)", () => {
    const older = makeDraft({ id: "a", createdAt: Date.UTC(2026, 9, 12, 12), updatedAt: 5 });
    const newer = makeDraft({ id: "b", createdAt: Date.UTC(2026, 9, 13, 12), updatedAt: 9 });
    const where = (d: Draft) => (d.id === "a" ? "Sent · 13 Oct" : "Draft · 1 check to fix");
    const [n, o] = recentLabelParts([newer, older], where);
    expect(n.hover).not.toBe(o.hover);
    expect(o.hover).toBe("Warning letter 1 · Jordan Hale (Sent · 13 Oct, started 12 Oct)");
    expect(n.hover).toBe("Warning letter 2 · Jordan Hale (Draft · 1 check to fix, started 13 Oct)");
  });

  it("keeps the number apart from the name, so it shows even when the name is shortened (R1-SIDEBAR-SAME-LEVEL-WARNINGS)", () => {
    const final = { warningLevel: "final_written" } as Draft["answers"];
    const older = makeDraft({ id: "a", createdAt: 1, answers: final });
    const newer = makeDraft({ id: "b", createdAt: 2, answers: final });
    const [n, o] = recentLabelParts([newer, older]);
    expect(o).toMatchObject({ text: "Final written warning 1 · J. Hale", title: "Final written warning 1", stem: "Final written warning", number: 1, compact: "Final warning", who: "J. Hale" });
    expect(n).toMatchObject({ stem: "Final written warning", number: 2, compact: "Final warning" });
    expect(o.hover).not.toBe(n.hover);
  });

  it("offers 'Written warning' for a first written warning and nothing shorter for a verbal one", () => {
    const at = (warningLevel: string, id: string) => makeDraft({ id, answers: { warningLevel } as Draft["answers"] });
    const [w, f] = recentLabelParts([at("written", "a"), at("final_written", "b")]);
    expect(w).toMatchObject({ stem: "First written warning", compact: "Written warning", number: undefined });
    expect(f).toMatchObject({ stem: "Final written warning", compact: "Final warning", number: undefined });
    const [v] = recentLabelParts([at("verbal", "c"), at("verbal", "d")]);
    expect(v).toMatchObject({ stem: "Verbal warning", compact: undefined });
  });

  it("keeps the person whole and offers a shorter letter name for long types (FOUNDATION-X14)", () => {
    const [p] = recentLabelParts([
      makeDraft({ letterType: "probation_outcome", employee: { ...makeDraft().employee, legalName: "Sam Patel" } }),
    ]);
    expect(p.who).toBe("S. Patel");
    expect(p.text).toBe(`${p.title} · S. Patel`);
    expect(p.compact).toBe("Probation");
  });

  it("offers no shorter name for a short type or a name the person gave", () => {
    expect(recentLabelParts([makeDraft({ letterType: "offer" })])[0].compact).toBeUndefined();
    expect(recentLabelParts([makeDraft({ letterType: "probation_outcome", title: "Sam, probation" })])[0].compact).toBeUndefined();
  });

  it("names the employer without its legal suffix on an employee's own letters", () => {
    const own = makeDraft({ mode: "employee", letterType: "grievance" });
    expect(recentLabelParts([own])[0].who).toBe("Harbour Foods");
  });

  it("keeps a name the person gave the letter", () => {
    expect(recentLabels([makeDraft({ title: "Jordan, final warning", answers: { warningLevel: "final_written" } as Draft["answers"] })])).toEqual([
      "Jordan, final warning · J. Hale",
    ]);
  });
});
