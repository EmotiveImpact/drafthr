import { describe, expect, it } from "vitest";
import type { Draft } from "@/lib/letters/types";
import { letterTitle } from "./letters";
import { APPEAL_PURPOSE, bookingMessage, isSentLetter } from "./booking";

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

describe("letterTitle (MARKET-X11)", () => {
  it("names a warning by its level, as the mk-* designs do", () => {
    expect(letterTitle(makeDraft({ answers: { warningLevel: "final_written" } }))).toBe("Final written warning · Jordan Hale");
    expect(letterTitle(makeDraft({ answers: { warningLevel: "written" } }))).toBe("First written warning · Jordan Hale");
    expect(letterTitle(makeDraft({ answers: { warningLevel: "verbal" } }))).toBe("Verbal warning · Jordan Hale");
  });
  it("keeps two warnings for the same person apart", () => {
    const final = letterTitle(makeDraft({ answers: { warningLevel: "final_written" } }));
    const noLevel = letterTitle(makeDraft());
    expect(final).not.toBe(noLevel);
  });
  it("falls back to the short letter name before a level is chosen, and keeps a name the person gave", () => {
    expect(letterTitle(makeDraft())).toMatch(/ · Jordan Hale$/);
    expect(letterTitle(makeDraft())).not.toMatch(/final/i);
    expect(letterTitle(makeDraft({ title: "Jordan, final warning (Oct)", answers: { warningLevel: "final_written" } }))).toBe(
      "Jordan, final warning (Oct)",
    );
  });
});

describe("booking an expert for a sent letter (SEND-X35)", () => {
  const sent = makeDraft({ exports: [{ id: "e1", format: "marked-sent", exportedAt: Date.now() }] as Draft["exports"] });
  it("knows a sent letter from one that is not", () => {
    expect(isSentLetter(sent)).toBe(true);
    expect(isSentLetter(makeDraft())).toBe(false);
    expect(isSentLetter(null)).toBe(false);
  });
  it("tells the expert the booking is appeal help, before the checks and the note", () => {
    expect(bookingMessage(["The hearing"], "Jordan may say the warning was too harsh.", APPEAL_PURPOSE)).toBe(
      `${APPEAL_PURPOSE}\n\nWhat I need: The hearing.\n\nJordan may say the warning was too harsh.`,
    );
    expect(bookingMessage([], "", APPEAL_PURPOSE)).toBe(APPEAL_PURPOSE);
    expect(bookingMessage([], "")).toBeUndefined();
  });
});
