import { beforeEach, describe, expect, it } from "vitest";
import { useDraftStore } from "./store";
import { getUnverifiedDeadlineReminder, isValidReminderDate, needsFilingDeadlineWarning } from "./deadline-reminders";

beforeEach(() => useDraftStore.setState({ drafts: {}, matters: {}, employees: {} }));

describe("deadline safety", () => {
  it.each(["UK", "US"])("never calculates a legal deadline from a %s incident date", (jurisdiction) => {
    // Dates before/after the UK transition, leap/month ends, and malformed input
    // must not fall back to another unconditional formula.
    for (const actDate of ["2024-02-29", "2026-09-30", "2026-10-01", "2026-10-31", "2026-11-09", "2026-02-30", "2026-10-01T00:00:00Z", ""]) {
      const id = useDraftStore.getState().createDraft("acas_ec_notification", { jurisdiction, actDate }, "employee");
      const draft = useDraftStore.getState().drafts[id];
      expect(draft.context.protectedDeadline, `${jurisdiction}: ${actDate}`).toBeUndefined();
      expect(draft.answers.actDate).toBe(actDate);
      expect(needsFilingDeadlineWarning(draft)).toBe(true);
    }
  });

  it("retains historical dates and basis without exposing the obsolete basis to consumers", () => {
    const id = useDraftStore.getState().createDraft("acas_ec_notification", { jurisdiction: "UK", actDate: "2026-09-30" }, "employee");
    const draft = useDraftStore.getState().drafts[id];
    const legacy = { iso: "2026-12-29", basis: "Old automatic statutory calculation" };
    useDraftStore.setState({ drafts: { [id]: { ...draft, context: { ...draft.context, protectedDeadline: legacy } } } });
    useDraftStore.getState().updateAnswers(id, { jurisdiction: "US", actDate: "2026-10-01" });
    const updated = useDraftStore.getState().drafts[id];
    expect(updated.context.protectedDeadline).toEqual(legacy);
    expect(getUnverifiedDeadlineReminder(updated)).toEqual({ iso: legacy.iso });
    expect(updated.answers.actDate).toBe("2026-10-01");
  });

  it.each(["2026-02-30", "2025-02-29", "2026-10-01T00:00:00Z", "2026-10-01garbage", "2026-1-01", "", null, 20261001])("rejects invalid reminder date %s", (value) => {
    expect(isValidReminderDate(value)).toBe(false);
  });

  it.each(["2024-02-29", "2026-09-30", "2026-10-01"])("accepts a complete real recorded date %s", (value) => {
    expect(isValidReminderDate(value)).toBe(true);
  });

  it("does not add a filing warning to routine employee letters without claim dates", () => {
    const id = useDraftStore.getState().createDraft("holiday_request", { jurisdiction: "UK" }, "employee");
    const draft = useDraftStore.getState().drafts[id];
    expect(needsFilingDeadlineWarning(draft)).toBe(false);
    expect(needsFilingDeadlineWarning({ ...draft, answers: { ...draft.answers, actDate: "2026-10-01" } })).toBe(true);
    expect(needsFilingDeadlineWarning({ ...draft, context: { ...draft.context, protectedDeadline: { iso: "invalid", basis: "old" } } })).toBe(true);
  });

  it("does not hide an old legal-date assertion in an employer draft", () => {
    const id = useDraftStore.getState().createDraft("offer", { jurisdiction: "UK" }, "employer");
    const draft = useDraftStore.getState().drafts[id];
    expect(needsFilingDeadlineWarning(draft)).toBe(false);
    expect(needsFilingDeadlineWarning({ ...draft, context: { ...draft.context, protectedDeadline: { iso: "2026-12-29", basis: "old formula" } } })).toBe(true);
  });
});
