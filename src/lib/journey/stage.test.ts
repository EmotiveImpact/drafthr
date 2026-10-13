import { describe, it, expect } from "vitest";
import type { Draft, PendingChange, Section } from "@/lib/letters/types";
import type { HealthCheck } from "@/lib/finalize/healthChecks";
import { getJourney, pendingSuggestionGroups, pendingSuggestionIds, stageIndex, JOURNEY_STEPS } from "./stage";
import type { ReviewRequest } from "./reviews";

function section(id: string, html: string, extra: Partial<Section> = {}): Section {
  return { id, sectionId: "body", title: id, required: true, status: "ready", versions: [], html, ...extra } as Section;
}

function change(extra: Partial<PendingChange> = {}): PendingChange {
  return { id: "pc1", createdAt: 1, proposedHtml: "<p>x</p>", instruction: "Tighten", source: "tighten", ...extra };
}

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
      effectiveDate: "2026-01-01",
      issueDate: "2026-01-02",
      deliveryMethod: "email",
      tone: "formal",
      confidentiality: "public",
      counselReviewRequired: false,
      riskFlags: { protectedStatus: false, grievanceLast90Days: false, collectiveConsultation: false },
    },
    employer: {
      legalName: "Harbour Foods Ltd",
      address: "",
      hasLetterhead: true,
      signatoryName: "Alex Morgan",
      signatoryTitle: "HR Manager",
    },
    employee: { legalName: "Jordan Hale", jobTitle: "Shift lead", address: "", startDate: "2022-01-01", serviceMonths: 40 },
    answers: {},
    sections: [section("s1", "<p>Dear Jordan,</p>"), section("s2", "<p>You may appeal.</p>")],
    createdAt: 0,
    updatedAt: 0,
    ...overrides,
  } as Draft;
}

const check = (id: string, severity: HealthCheck["severity"]): HealthCheck => ({
  id,
  label: id,
  severity,
  dimension: "compliance",
});
const PASSING = [check("a", "pass"), check("b", "pass"), check("c", "pass")];
const FAILING = [check("a", "fail"), check("b", "pass"), check("c", "warn")];

function review(overrides: Partial<ReviewRequest> = {}): ReviewRequest {
  return {
    id: "r1",
    draftId: "d1",
    kind: "expert",
    reviewer: { name: "Claire Booth", role: "Chartered MCIPD" },
    share: { letter: true, evidence: true, hearingNotes: false },
    status: "out",
    rounds: [{ n: 1, sentAt: 1, suggestionIds: [], commentIds: [] }],
    createdAt: 1,
    updatedAt: 1,
    ...overrides,
  };
}

describe("getJourney: draft", () => {
  it("is a draft that needs you when a required check fails, and Send for review is disabled", () => {
    const j = getJourney(makeDraft(), null, { checks: FAILING });
    expect(j.stage).toBe("draft");
    expect(j.tone).toBe("yours");
    expect(j.statusLabel).toBe("Draft");
    expect(j.whereLabel).toBe("Draft · 1 check to fix");
    expect(j.primaryAction).toMatchObject({ id: "send-for-review", disabled: true });
    expect(j.primaryAction?.reason).toBe("1 required check to fix.");
    expect(j.needsYou).toBe(true);
    expect(j.listTone).toBe("needs-you");
    expect(j.stepIndex).toBe(0);
    expect(j.locked).toBe(false);
  });

  it("stays in draft while a DraftHR suggestion is pending, counting the marks once", () => {
    const html =
      '<p>We <del data-suggestion-id="sg1" data-status="pending">may</del><ins data-suggestion-id="sg1" data-status="pending">will</ins> meet.</p>';
    const d = makeDraft({
      sections: [section("s1", html, { pendingChange: change() }), section("s2", "<p>Hi</p>")],
    });
    expect(pendingSuggestionIds(d)).toEqual(["sg1"]);
    const j = getJourney(d, null, { checks: PASSING });
    expect(j.stage).toBe("draft");
    expect(j.counts.pendingSuggestions).toBe(1);
    expect(j.whereLabel).toBe("Draft · 1 edit to decide");
    expect(j.primaryAction).toMatchObject({ id: "send-for-review" });
    expect(j.primaryAction?.disabled).toBe(false);
    expect(j.needsYou).toBe(true);
  });

  it("counts the marks of one proposal as one suggested edit", () => {
    const html =
      '<p><del data-suggestion-id="a" data-author="DraftHR" data-created-at="7" data-status="pending">old</del>' +
      '<ins data-suggestion-id="b" data-author="DraftHR" data-created-at="7" data-status="pending">new</ins> and ' +
      '<ins data-suggestion-id="c" data-author="DraftHR" data-created-at="7" data-status="accepted">kept</ins></p>';
    const d = makeDraft({ sections: [section("s1", html, { pendingChange: change() })] });
    expect(pendingSuggestionIds(d)).toEqual(["a", "b"]);
    expect(pendingSuggestionGroups(d)).toEqual([{ key: "DraftHR|7", author: "DraftHR", ids: ["a", "b"] }]);
    const j = getJourney(d, null, { checks: PASSING });
    expect(j.counts.pendingSuggestions).toBe(1);
    expect(j.whereLabel).toBe("Draft · 1 edit to decide");
  });

  it("counts a pending change shown as a card", () => {
    const d = makeDraft({
      sections: [section("s1", "<p>Hi</p>", { pendingChange: change({ diffViewMode: "card" }) })],
    });
    expect(getJourney(d, null, { checks: PASSING }).counts.pendingSuggestions).toBe(1);
  });

  it("is blocked while nothing is drafted or a required section is empty", () => {
    const empty = getJourney(makeDraft({ sections: [section("s1", "")] }), null, { checks: PASSING });
    expect(empty.stage).toBe("draft");
    expect(empty.primaryAction?.disabled).toBe(true);
    expect(empty.primaryAction?.reason).toBe("Nothing drafted yet.");

    const partial = getJourney(makeDraft({ sections: [section("s1", "<p>Hi</p>"), section("s2", "")] }), null, {
      checks: PASSING,
    });
    expect(partial.whereLabel).toBe("Draft · 1 section to write");
  });

  it("shows drafting while DraftHR is still writing", () => {
    const d = makeDraft({ sections: [section("s1", "<p>Hi</p>", { status: "streaming" })] });
    const j = getJourney(d, null, { checks: PASSING });
    expect(j.whereLabel).toBe("Draft · drafting");
    expect(j.primaryAction?.reason).toBe("DraftHR is still drafting.");
  });

  it("counts only finished sections as drafted, never one still streaming or an empty paragraph", () => {
    const d = makeDraft({
      sections: [
        section("s1", "<p>Dear Jordan,</p>"),
        section("s2", "<p>Partial te", { status: "streaming" }),
        section("s3", "<p></p>", { status: "empty" }),
      ],
    });
    const j = getJourney(d, null, { checks: PASSING });
    expect(j.counts.sectionsDrafted).toBe(1);
    expect(j.counts.sections).toBe(3);
  });

  it("goes back to draft when the approver asks for changes", () => {
    const d = makeDraft({
      reviewStatus: "changes_requested",
      approvals: [
        { id: "a1", reviewerName: "Priya Shah", decision: "submitted", createdAt: 1 },
        { id: "a2", reviewerName: "Priya Shah", decision: "changes_requested", body: "Fix the date", createdAt: 2 },
      ],
    });
    const j = getJourney(d, null, { checks: PASSING });
    expect(j.stage).toBe("draft");
    expect(j.tone).toBe("needs-you");
    expect(j.statusLabel).toBe("Changes requested");
    expect(j.primaryAction).toMatchObject({ id: "send-for-approval", disabled: false });
    expect(j.whatNow.detail).toContain("Priya asked for changes");
  });

  it("treats a template source as a template with no action", () => {
    const j = getJourney(makeDraft({ isTemplateSource: true }), null, { checks: PASSING });
    expect(j.stage).toBe("draft");
    expect(j.statusLabel).toBe("Template");
    expect(j.primaryAction).toBeNull();
    expect(j.needsYou).toBe(false);
  });
});

describe("getJourney: review", () => {
  it("is ready for review once the draft is complete", () => {
    const j = getJourney(makeDraft(), null, { checks: PASSING });
    expect(j.stage).toBe("review");
    expect(j.tone).toBe("yours");
    expect(j.statusLabel).toBe("Ready for review");
    expect(j.statusTone).toBe("blue");
    expect(j.whatNow.detail).toContain("All 3 checks pass.");
    expect(j.primaryAction).toMatchObject({ id: "send-for-review" });
    expect(j.primaryAction?.disabled).toBeUndefined();
    expect(j.secondaryAction).toMatchObject({ id: "skip-review" });
    expect(j.stepIndex).toBe(1);
  });

  it("warnings do not block review", () => {
    const j = getJourney(makeDraft(), null, { checks: [check("a", "pass"), check("b", "warn")] });
    expect(j.stage).toBe("review");
    expect(j.whatNow.detail).toContain("No required check is failing.");
  });

  it("is away with the reviewer while the request is out, and locked", () => {
    const j = getJourney(makeDraft(), review(), { checks: PASSING });
    expect(j.stage).toBe("review");
    expect(j.tone).toBe("away");
    expect(j.statusLabel).toBe("With Claire");
    expect(j.statusTone).toBe("lilac");
    expect(j.whereLabel).toBe("Review · with Claire Booth");
    expect(j.primaryAction).toMatchObject({ id: "recall" });
    expect(j.locked).toBe(true);
    expect(j.needsYou).toBe(false);
    expect(j.review?.id).toBe("r1");
  });

  it("is back to you when the reviewer sends it back, counting their open points", () => {
    // One reviewer proposal diffed into two marks (same author and time), one
    // older proposal, and one open comment: three points.
    const html =
      '<p>We <del data-suggestion-id="x" data-author="Claire Booth" data-created-at="5" data-status="pending">may</del>' +
      '<ins data-suggestion-id="y" data-author="Claire Booth" data-created-at="5" data-status="pending">will</ins> meet ' +
      '<ins data-suggestion-id="z" data-author="Claire Booth" data-created-at="9" data-status="pending">soon</ins>.</p>';
    const d = makeDraft({
      sections: [section("s1", html), section("s2", "<p>Hi</p>")],
      comments: [
        { id: "c", sectionId: "s1", authorId: "cb", authorName: "Claire Booth", body: "Check the date", createdAt: 3 },
        { id: "c2", sectionId: "s1", authorId: "cb", authorName: "Claire Booth", body: "Done", createdAt: 4, resolved: true },
      ],
    });
    const r = review({
      status: "back",
      rounds: [{ n: 1, sentAt: 1, backAt: 2, verdict: "ready-with-changes", suggestionIds: ["x", "y", "z"], commentIds: ["c", "c2"] }],
    });
    const j = getJourney(d, r, { checks: FAILING });
    expect(j.stage).toBe("review");
    expect(j.tone).toBe("needs-you");
    expect(j.statusLabel).toBe("Back to you");
    expect(j.whereLabel).toBe("Review · back to you");
    expect(j.whatNow.detail).toBe("Decide on Claire's 3 points, then finish the review or send it back to Claire.");
    expect(j.counts.pendingSuggestions).toBe(2);
    expect(j.primaryAction).toMatchObject({ id: "finish-review" });
    expect(j.needsYou).toBe(true);
    expect(j.locked).toBe(false);
  });

  it("asks you to read the note once every point is decided", () => {
    const r = review({ status: "back", rounds: [{ n: 1, sentAt: 1, backAt: 2, suggestionIds: ["gone"], commentIds: [] }] });
    expect(getJourney(makeDraft(), r, { checks: PASSING }).whatNow.detail).toBe(
      "Read Claire's note, then finish the review or send it back to Claire."
    );
  });

  it("ignores a recalled request and a request for another draft", () => {
    expect(getJourney(makeDraft(), review({ status: "recalled" }), { checks: PASSING }).statusLabel).toBe(
      "Ready for review"
    );
    expect(getJourney(makeDraft(), review({ draftId: "other" }), { checks: PASSING }).statusLabel).toBe(
      "Ready for review"
    );
  });
});

describe("getJourney: who is looking at a review", () => {
  const team = (o: Partial<ReviewRequest> = {}) =>
    review({ kind: "team", reviewer: { name: "Dana Whitfield" }, asker: { name: "Alex Morgan" }, ...o });

  it("gives the named reviewer a calm read-only view once they sent it back", () => {
    const r = team({ status: "back", rounds: [{ n: 1, sentAt: 1, backAt: 2, suggestionIds: [], commentIds: [] }] });
    const j = getJourney(makeDraft(), r, { checks: PASSING, viewerIsReviewer: true });
    expect(j.statusLabel).toBe("Sent back to Alex");
    expect(j.primaryAction).toBeNull();
    expect(j.locked).toBe(true);
    expect(j.needsYou).toBe(false);
    expect(j.whatNow.detail).toBe("Alex decides what to accept. You'll be told if it comes back to you.");
  });

  it("tells the named reviewer it was recalled, with nothing to act on", () => {
    const j = getJourney(makeDraft(), team({ status: "recalled" }), { checks: PASSING, viewerIsReviewer: true });
    expect(j.statusLabel).toBe("Recalled");
    expect(j.whatNow.lead).toBe("Recalled.");
    expect(j.primaryAction).toBeNull();
    expect(j.locked).toBe(true);
  });

  it("shows someone else's review read only: Recall and Finish review are not theirs", () => {
    const out = getJourney(makeDraft(), team(), { checks: PASSING, viewerIsAsker: false });
    expect(out.statusLabel).toBe("With Dana");
    expect(out.primaryAction).toMatchObject({ id: "recall", disabled: true, reason: "Only Alex can recall it." });
    expect(out.locked).toBe(true);
    const back = getJourney(makeDraft(), team({ status: "back" }), { checks: PASSING, viewerIsAsker: false });
    expect(back.primaryAction).toMatchObject({ id: "finish-review", disabled: true });
    expect(back.needsYou).toBe(false);
    // The person who asked keeps their own controls.
    expect(getJourney(makeDraft(), team(), { checks: PASSING, viewerIsAsker: true }).primaryAction?.disabled).toBeFalsy();
  });
});

describe("getJourney: approve", () => {
  const submitted = makeDraft({
    reviewStatus: "in_review",
    approvals: [{ id: "a1", reviewerName: "Priya Shah", decision: "submitted", createdAt: 1 }],
  });

  it("is ready to send for approval once the review is finished", () => {
    const j = getJourney(makeDraft(), review({ status: "finished" }), { checks: PASSING });
    expect(j.stage).toBe("approve");
    expect(j.tone).toBe("yours");
    expect(j.primaryAction).toMatchObject({ id: "send-for-approval", disabled: false });
    expect(j.stepIndex).toBe(2);
  });

  it("is waiting for the approver, with a Remind action", () => {
    const j = getJourney(submitted, null, { checks: PASSING });
    expect(j.stage).toBe("approve");
    expect(j.tone).toBe("away");
    expect(j.statusLabel).toBe("Waiting for Priya");
    expect(j.whereLabel).toBe("Approve · with Priya");
    expect(j.primaryAction).toMatchObject({ id: "remind", label: "Remind Priya" });
    expect(j.approverName).toBe("Priya Shah");
    expect(j.locked).toBe(true);
  });

  it("uses a generic label for the placeholder approver", () => {
    const d = makeDraft({
      reviewStatus: "in_review",
      approvals: [{ id: "a1", reviewerName: "Workspace reviewer", decision: "submitted", createdAt: 1 }],
    });
    const j = getJourney(d, null, { checks: PASSING });
    expect(j.statusLabel).toBe("Waiting for approval");
    expect(j.primaryAction?.label).toBe("Remind the approver");
  });

  it("needs the approver's decision when they are the one looking", () => {
    const j = getJourney(submitted, null, { checks: PASSING, viewerIsApprover: true });
    expect(j.stage).toBe("approve");
    expect(j.tone).toBe("needs-you");
    expect(j.primaryAction).toMatchObject({ id: "approve" });
    expect(j.needsYou).toBe(true);
  });
});

describe("getJourney: send and sent", () => {
  it("is ready to send once approved, with the Export menu", () => {
    const j = getJourney(makeDraft({ reviewStatus: "approved" }), null, { checks: PASSING });
    expect(j.stage).toBe("send");
    expect(j.statusLabel).toBe("Approved");
    expect(j.primaryAction).toMatchObject({ id: "export", menu: true });
    expect(j.stepIndex).toBe(3);
    expect(j.locked).toBe(true);
  });

  it("is sent once marked as sent, whatever else is true", () => {
    const at = Date.UTC(2026, 9, 14, 10);
    const d = makeDraft({
      reviewStatus: "approved",
      exports: [
        { id: "e1", format: "pdf", exportedAt: at - 1000 },
        { id: "e2", format: "marked-sent", exportedAt: at },
      ] as Draft["exports"],
    });
    const j = getJourney(d, review({ status: "finished" }), { checks: FAILING });
    expect(j.stage).toBe("sent");
    expect(j.tone).toBe("done");
    expect(j.statusLabel).toBe("Sent");
    expect(j.whereLabel).toBe("Sent · 14 Oct");
    expect(j.sentAt).toBe(at);
    expect(j.primaryAction).toMatchObject({ id: "download" });
    expect(j.stepIndex).toBe(4);
  });

  it("tints Send · ready amber in lists, as it needs you", () => {
    const j = getJourney(makeDraft({ reviewStatus: "approved" }), null, { checks: PASSING });
    expect(j.whereLabel).toBe("Send · ready");
    expect(j.needsYou).toBe(true);
    expect(j.listTone).toBe("needs-you");
  });

  it("says what's next for the matter only when the letter is in one", () => {
    const exports = [{ id: "e2", format: "marked-sent", exportedAt: 5 }] as Draft["exports"];
    expect(getJourney(makeDraft({ exports }), null, { checks: PASSING }).whatNow.detail).toBe("What's next:");
    expect(getJourney(makeDraft({ exports, matterId: "m1" }), null, { checks: PASSING }).whatNow.detail).toBe(
      "What's next for this matter:"
    );
  });

  it("does not count a plain export as sent", () => {
    const d = makeDraft({ reviewStatus: "approved", exports: [{ id: "e1", format: "pdf", exportedAt: 1 }] as Draft["exports"] });
    expect(getJourney(d, null, { checks: PASSING }).stage).toBe("send");
  });
});

describe("journey steps", () => {
  it("has four steps with Review optional, and sent past the end", () => {
    expect(JOURNEY_STEPS.map((s) => s.label)).toEqual(["Draft", "Review", "Approve", "Send"]);
    expect(JOURNEY_STEPS[1].optional).toBe(true);
    expect(["draft", "review", "approve", "send", "sent"].map((s) => stageIndex(s as never))).toEqual([0, 1, 2, 3, 4]);
  });

  it("runs the health checks itself when none are passed", () => {
    const j = getJourney(makeDraft());
    expect(j.counts.checksTotal).toBeGreaterThan(0);
  });
});

describe("getJourney: an employee's own letter", () => {
  const own = (o: Partial<Draft> = {}) => makeDraft({ mode: "employee", ...o });

  it("never mentions an approver while drafting or ready", () => {
    const drafting = getJourney(own(), null, { checks: FAILING });
    expect(drafting.whatNow.detail).toContain("skip straight to sending it");
    expect(drafting.whatNow.detail).not.toMatch(/approv/i);
    const ready = getJourney(own(), null, { checks: PASSING });
    expect(ready.stage).toBe("review");
    expect(ready.whatNow.detail).not.toMatch(/approv/i);
    expect(ready.secondaryAction).toMatchObject({ id: "skip-review", label: "Skip review and get it ready to send" });
  });

  it("after a finished review, offers to get it ready to send rather than send for approval", () => {
    const j = getJourney(own(), review({ status: "finished" }), { checks: PASSING });
    expect(j.primaryAction).toMatchObject({ id: "skip-review", label: "Get it ready to send", disabled: false });
    expect(j.whatNow.detail).toContain("needs no approver");
  });

  it("reads Ready to send once signed off", () => {
    const j = getJourney(own({ reviewStatus: "approved" }), null, { checks: PASSING });
    expect(j.stage).toBe("send");
    expect(j.statusLabel).toBe("Ready to send");
  });
});
