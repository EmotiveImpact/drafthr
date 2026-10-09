import { describe, expect, it } from "vitest";
import {
  commentsForWrite,
  timelineForWrite,
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

describe("commentsForWrite (per-comment merge, author-only delete)", () => {
  // userRow.id is the internal users.id; externalId is the session user id
  // the browser compares comment authors against.
  const authAs = (role: string, id = "u-me", email = "me@x.com") => ({
    activeMember: { role },
    userRow: { id: `db-${id}`, externalId: id, email, legalName: "Me Person" },
  });
  const theirs = {
    id: "c1",
    sectionId: "s1",
    authorId: "me",
    authorUserId: "u-them",
    authorName: "Them",
    body: "Their note",
    createdAt: 100,
    updatedAt: 100,
  };

  it("keeps a stored comment the incoming list doesn't have (no erase by a stale device)", () => {
    const out = commentsForWrite(authAs("drafter"), [theirs], []);
    expect(out.map((c) => c.id)).toEqual(["c1"]);
  });

  it("stamps a new comment with the caller's user id and display name", () => {
    const out = commentsForWrite(authAs("drafter"), [], [
      { id: "c2", authorId: "me", authorName: "Spoofed", body: "hi", createdAt: 5 },
    ]);
    expect(out[0]).toMatchObject({ authorUserId: "u-me", authorName: "Me Person", authorEmail: "me@x.com" });
  });

  it("stamps the id the author's browser knows them by, so their other devices still treat it as theirs", async () => {
    const { canDeleteComment: clientCanDelete, isOthersComment } = await import("../../../src/lib/comments/identity");
    const [stamped] = commentsForWrite(authAs("drafter", "user_01SESSION"), [], [
      { id: "c3", authorId: "me", authorName: "Me", body: "mine", createdAt: 5 },
    ]);
    // The SPA's viewer id is the session user id (users.external_id).
    const viewer = { userId: "user_01SESSION", role: "drafter" };
    expect(isOthersComment(stamped as never, viewer)).toBe(false);
    expect(clientCanDelete(stamped as never, viewer)).toBe(true);
  });

  it("ignores a delete of someone else's comment by a drafter", () => {
    const out = commentsForWrite(authAs("drafter"), [theirs], [{ id: "c1", deleted: true, updatedAt: 200 }]);
    expect(out[0].deleted).toBeFalsy();
    expect(out[0].body).toBe("Their note");
  });

  it("accepts a delete from the author and scrubs the body", () => {
    const out = commentsForWrite(authAs("drafter", "u-them"), [theirs], [{ id: "c1", deleted: true, updatedAt: 200 }]);
    expect(out[0]).toMatchObject({ id: "c1", deleted: true });
    expect(out[0].body).toBeUndefined();
  });

  it.each(["owner", "admin"])("lets an %s delete anyone's comment", (role) => {
    const out = commentsForWrite(authAs(role), [theirs], [{ id: "c1", deleted: true, updatedAt: 200 }]);
    expect(out[0].deleted).toBe(true);
  });

  it("falls back to the email for legacy comments without an author id", () => {
    const legacy = { ...theirs, authorUserId: undefined, authorEmail: "ME@x.com" };
    const out = commentsForWrite(authAs("drafter"), [legacy], [{ id: "c1", deleted: true, updatedAt: 200 }]);
    expect(out[0].deleted).toBe(true);
  });

  it("a tombstone is final: a stale device can't bring the comment back", () => {
    const tomb = { id: "c1", deleted: true, updatedAt: 200 };
    const out = commentsForWrite(authAs("owner"), [tomb], [{ ...theirs, updatedAt: 300 }]);
    expect(out[0].deleted).toBe(true);
  });

  it("lets any writer resolve, but only a newer change applies and authorship can't change", () => {
    const resolved = commentsForWrite(authAs("drafter"), [theirs], [
      { ...theirs, resolved: true, updatedAt: 150, authorName: "Hijack", body: "edited" },
    ]);
    expect(resolved[0]).toMatchObject({ resolved: true, authorName: "Them", body: "Their note", updatedAt: 150 });
    const stale = commentsForWrite(authAs("drafter"), [{ ...theirs, resolved: true, updatedAt: 150 }], [
      { ...theirs, resolved: false, updatedAt: 120 },
    ]);
    expect(stale[0].resolved).toBe(true);
  });
});

describe("timelineForWrite", () => {
  it("is append-only by id", () => {
    const out = timelineForWrite(
      [{ id: "e1", createdAt: 1, title: "stored" }],
      [{ id: "e1", createdAt: 1, title: "changed" }, { id: "e2", createdAt: 2 }],
    );
    expect(out).toEqual([{ id: "e1", createdAt: 1, title: "stored" }, { id: "e2", createdAt: 2 }]);
  });
});
