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

describe("approvalsForWrite", () => {
  const reviewer = { activeMember: { role: "reviewer" } };
  const drafter = { activeMember: { role: "drafter" } };
  const stored = [{ id: "a1", decision: "submitted" }];

  it("drops a non-approver's own approved or changes-requested entries", async () => {
    const { approvalsForWrite } = await import("../../../api/_utils/workspace-role.js");
    const out = approvalsForWrite(drafter, stored, [
      ...stored,
      { id: "fake", decision: "approved" },
      { id: "fake2", decision: "changes_requested" },
      { id: "s2", decision: "submitted" },
    ]);
    expect(out.map((a) => a.id)).toEqual(["a1", "s2"]);
  });

  it("lets an approver add a decision", async () => {
    const { approvalsForWrite } = await import("../../../api/_utils/workspace-role.js");
    const out = approvalsForWrite(reviewer, stored, [{ id: "ok", decision: "approved" }]);
    expect(out.map((a) => a.id)).toEqual(["a1", "ok"]);
  });

  it("never lets a sync erase entries the server already holds", async () => {
    const { approvalsForWrite } = await import("../../../api/_utils/workspace-role.js");
    expect(approvalsForWrite(reviewer, stored, []).map((a) => a.id)).toEqual(["a1"]);
    expect(approvalsForWrite(reviewer, stored, undefined).map((a) => a.id)).toEqual(["a1"]);
  });
});

describe("rejectEditOfApprovedDraft", () => {
  const stored = [{ sectionId: "s1", title: "Intro", html: "<p>Agreed text</p>" }];

  it("refuses new content on an approved draft that stays approved", async () => {
    const { rejectEditOfApprovedDraft } = await import("../../../api/_utils/workspace-role.js");
    const res = rejectEditOfApprovedDraft("approved", "approved", stored, [
      { sectionId: "s1", title: "Intro", html: "<p>Rewritten</p>" },
    ]);
    expect(res?.status).toBe(409);
    expect(
      rejectEditOfApprovedDraft("approved", undefined, stored, [...stored, { sectionId: "s2", html: "x" }])?.status,
    ).toBe(409);
  });

  it("allows an unchanged re-sync and edits that re-open review", async () => {
    const { rejectEditOfApprovedDraft } = await import("../../../api/_utils/workspace-role.js");
    expect(rejectEditOfApprovedDraft("approved", "approved", stored, [...stored])).toBeNull();
    expect(
      rejectEditOfApprovedDraft("approved", "in_review", stored, [{ sectionId: "s1", html: "new" }]),
    ).toBeNull();
    expect(rejectEditOfApprovedDraft("draft", "draft", stored, [{ sectionId: "s1", html: "new" }])).toBeNull();
  });
});
