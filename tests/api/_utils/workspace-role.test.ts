import { describe, expect, it } from "vitest";
import {
  rejectReadOnlyMember,
  rejectUnauthorisedReviewDecision,
} from "../../../api/_utils/workspace-role";

const as = (role: string | null) => ({ activeMember: role ? { role } : null });

describe("rejectReadOnlyMember", () => {
  it("blocks viewers", () => {
    expect(rejectReadOnlyMember(as("viewer"))?.status).toBe(403);
  });
  it.each(["owner", "admin", "drafter", "reviewer"])("allows %s", (role) => {
    expect(rejectReadOnlyMember(as(role))).toBeNull();
  });
});

describe("rejectUnauthorisedReviewDecision", () => {
  it("blocks a drafter approving their own draft", () => {
    expect(rejectUnauthorisedReviewDecision(as("drafter"), "in_review", "approved")?.status).toBe(403);
  });
  it("blocks a drafter creating a draft already marked approved", () => {
    expect(rejectUnauthorisedReviewDecision(as("drafter"), null, "approved")?.status).toBe(403);
  });
  it("blocks a drafter requesting changes", () => {
    expect(rejectUnauthorisedReviewDecision(as("drafter"), "in_review", "changes_requested")?.status).toBe(403);
  });
  it.each(["owner", "admin", "reviewer"])("allows %s to decide", (role) => {
    expect(rejectUnauthorisedReviewDecision(as(role), "in_review", "approved")).toBeNull();
  });
  it("allows re-syncing an unchanged decision", () => {
    expect(rejectUnauthorisedReviewDecision(as("drafter"), "approved", "approved")).toBeNull();
  });
  it("allows non-decision transitions", () => {
    expect(rejectUnauthorisedReviewDecision(as("drafter"), "draft", "in_review")).toBeNull();
    expect(rejectUnauthorisedReviewDecision(as("drafter"), "approved", "draft")).toBeNull();
    expect(rejectUnauthorisedReviewDecision(as("drafter"), "draft", undefined)).toBeNull();
  });
});

describe("rejectNonBillingManager", () => {
  it("lets owners and admins manage the workspace plan", async () => {
    const { rejectNonBillingManager } = await import("../../../api/_utils/workspace-role.js");
    expect(rejectNonBillingManager({ activeMember: { role: "owner" } })).toBeNull();
    expect(rejectNonBillingManager({ activeMember: { role: "admin" } })).toBeNull();
  });
  it("refuses everyone else", async () => {
    const { rejectNonBillingManager } = await import("../../../api/_utils/workspace-role.js");
    for (const role of ["reviewer", "drafter", "viewer"]) {
      expect(rejectNonBillingManager({ activeMember: { role } })?.status).toBe(403);
    }
    expect(rejectNonBillingManager({ activeMember: null })?.status).toBe(403);
  });
});
