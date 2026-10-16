import { describe, expect, it } from "vitest";
import { useDraftStore } from "@/lib/store";
import { letterCatalogByMode } from "@/lib/letters/catalog";
import { approvalWord, journeyStepsFor, markOwnLetterReady } from "./stage";
import { activityEvents } from "@/components/editor/letter-facts";

describe("markOwnLetterReady", () => {
  it("signs off an employee's own letter so it opens the Send step", () => {
    const type = letterCatalogByMode("employee")[0].id;
    const id = useDraftStore.getState().createDraft(type, { employeeLegalName: "Jordan Hale", jurisdiction: "UK" }, "employee");
    expect(markOwnLetterReady(id)).toBe(true);
    const d = useDraftStore.getState().drafts[id];
    expect(d.reviewStatus).toBe("approved");
    expect(d.approvals?.at(-1)).toMatchObject({ decision: "approved", reviewerName: "Jordan Hale" });
  });

  it("logs it as a sign-off, not an approval (FOUNDATION-X5)", () => {
    const type = letterCatalogByMode("employee")[0].id;
    const id = useDraftStore.getState().createDraft(type, { employeeLegalName: "Jordan Hale", jurisdiction: "UK" }, "employee");
    markOwnLetterReady(id);
    const d = useDraftStore.getState().drafts[id];
    const event = d.timeline?.find((t) => t.kind === "review_approved");
    expect(event?.title).toBe("Signed off by Jordan Hale");
    expect(event?.meta?.signedOff).toBe(true);
    const titles = activityEvents(d, null, "Jordan Hale").map((e) => e.title);
    expect(titles).toContain("Signed off");
    expect(titles).not.toContain("Approved");
    expect(approvalWord(d)).toBe("Signed off");
    expect(journeyStepsFor(d).map((s) => s.label)).toEqual(["Draft", "Review", "Sign off", "Send"]);
  });

  it("keeps Approve for an HR letter's steps", () => {
    expect(journeyStepsFor({ mode: "employer" }).map((s) => s.label)).toEqual(["Draft", "Review", "Approve", "Send"]);
    expect(approvalWord({ mode: "employer" })).toBe("Approved");
  });

  it("leaves an HR letter alone (it needs an approver)", () => {
    const type = letterCatalogByMode("employer")[0].id;
    const id = useDraftStore.getState().createDraft(type, { employeeLegalName: "Priya Shah", jurisdiction: "UK" }, "employer");
    expect(markOwnLetterReady(id)).toBe(false);
    expect(useDraftStore.getState().drafts[id].reviewStatus ?? "draft").toBe("draft");
  });
});
