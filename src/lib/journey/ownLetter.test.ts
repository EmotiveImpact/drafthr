import { describe, expect, it } from "vitest";
import { useDraftStore } from "@/lib/store";
import { letterCatalogByMode } from "@/lib/letters/catalog";
import { markOwnLetterReady } from "./stage";

describe("markOwnLetterReady", () => {
  it("signs off an employee's own letter so it opens the Send step", () => {
    const type = letterCatalogByMode("employee")[0].id;
    const id = useDraftStore.getState().createDraft(type, { employeeLegalName: "Jordan Hale", jurisdiction: "UK" }, "employee");
    expect(markOwnLetterReady(id)).toBe(true);
    const d = useDraftStore.getState().drafts[id];
    expect(d.reviewStatus).toBe("approved");
    expect(d.approvals?.at(-1)).toMatchObject({ decision: "approved", reviewerName: "Jordan Hale" });
  });

  it("leaves an HR letter alone (it needs an approver)", () => {
    const type = letterCatalogByMode("employer")[0].id;
    const id = useDraftStore.getState().createDraft(type, { employeeLegalName: "Priya Shah", jurisdiction: "UK" }, "employer");
    expect(markOwnLetterReady(id)).toBe(false);
    expect(useDraftStore.getState().drafts[id].reviewStatus ?? "draft").toBe("draft");
  });
});
