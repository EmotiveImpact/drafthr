import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { clearSavedWizard, loadSavedWizard, saveWizard, savedWizardKey } from "./savedAnswers";

describe("save draft on the new letter page", () => {
  beforeEach(() => localStorage.clear());
  afterEach(() => vi.restoreAllMocks());

  it("keeps the answers and step per mode and letter type", () => {
    expect(saveWizard("employer", "warning", { answers: { reason: "Lateness" }, stepIndex: 2 }, 1000)).toBe(true);
    const saved = loadSavedWizard("employer", "warning");
    expect(saved).toEqual({ answers: { reason: "Lateness" }, stepIndex: 2, savedAt: 1000, triage: null });
    expect(loadSavedWizard("employer", "offer")).toBeNull();
    expect(loadSavedWizard("employee", "warning")).toBeNull();
  });

  it("does not copy large images into the saved answers", () => {
    saveWizard("employer", "offer", {
      answers: { letterhead: "data:image/png;base64,AAAA", name: "Priya", skipped: undefined },
      stepIndex: 0,
    });
    expect(loadSavedWizard("employer", "offer")?.answers).toEqual({ name: "Priya" });
  });

  it("keeps the quick check result", () => {
    saveWizard("employee", "grievance", {
      answers: {},
      stepIndex: 1,
      triage: { score: "strong", summary: "Clear timeline" },
    });
    expect(loadSavedWizard("employee", "grievance")?.triage).toEqual({ score: "strong", summary: "Clear timeline" });
  });

  it("start again clears only that letter type", () => {
    saveWizard("employer", "warning", { answers: { a: "1" }, stepIndex: 1 });
    saveWizard("employer", "offer", { answers: { b: "2" }, stepIndex: 1 });
    clearSavedWizard("employer", "warning");
    expect(loadSavedWizard("employer", "warning")).toBeNull();
    expect(loadSavedWizard("employer", "offer")).not.toBeNull();
  });

  it("ignores broken or tampered entries", () => {
    localStorage.setItem(savedWizardKey("employer", "warning"), "{not json");
    expect(loadSavedWizard("employer", "warning")).toBeNull();
    localStorage.setItem(savedWizardKey("employer", "warning"), JSON.stringify({ answers: {}, stepIndex: -4 }));
    expect(loadSavedWizard("employer", "warning")?.stepIndex).toBe(0);
  });

  it("reports failure instead of throwing when storage is full", () => {
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("QuotaExceededError");
    });
    expect(saveWizard("employer", "warning", { answers: {}, stepIndex: 0 })).toBe(false);
  });
});
