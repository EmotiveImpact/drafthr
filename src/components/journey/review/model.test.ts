import { beforeEach, describe, expect, it } from "vitest";
import type { Draft } from "@/lib/letters/types";
import { REVIEW_VERDICT_LABELS, useReviewStore, type ReviewRequest } from "@/lib/journey/reviews";
import {
  askItems,
  backLine,
  backTiming,
  collectReviewerWork,
  defaultDueAt,
  evidenceSharedWith,
  isHearingNote,
  openPoints,
  parseDelivery,
  reviewPoints,
  shareableEvidence,
  summariseRound,
  turnaroundWords,
} from "./model";
import { changeKind, suggestionTitle } from "./reviewer";
import { sharedEvidence } from "./actions";
import { importAssigned } from "./sync";
import type { AssignedReview } from "./trusted-api";

const T0 = Date.UTC(2026, 9, 14, 9, 0);

function draft(partial: Partial<Draft> = {}): Draft {
  return {
    id: "d1",
    letterType: "final_written_warning",
    mode: "employer",
    sections: [
      {
        id: "s1",
        title: "Paragraph 1",
        html: '<p>You were late <del data-suggestion-id="m1" data-status="pending">often</del><ins data-suggestion-id="m2" data-status="pending">eleven times</ins>.</p>',
        pendingChange: {
          id: "pc1",
          createdAt: T0 + 1000,
          proposedHtml: "<p>You were late eleven times.</p>",
          instruction: "Say how many times",
          source: "review",
          authorId: "claire@example.com",
          authorName: "Claire Donnelly",
          diffViewMode: "inline",
        },
      },
      { id: "s2", title: "Appeal", html: "<p>You may appeal.</p>" },
    ],
    comments: [
      { id: "c1", sectionId: "s2", authorId: "claire@example.com", authorName: "Claire Donnelly", authorEmail: "claire@example.com", body: "Name who hears it", createdAt: T0 + 2000 },
      { id: "c2", sectionId: "s2", parentId: "c1", authorId: "me", authorName: "Alex Morgan", body: "Will do", createdAt: T0 + 3000 },
      { id: "c0", sectionId: "s2", authorId: "claire@example.com", authorName: "Claire Donnelly", body: "Old", createdAt: T0 - 5000 },
    ],
    evidence: [],
    ...partial,
  } as unknown as Draft;
}

function review(partial: Partial<ReviewRequest> = {}): ReviewRequest {
  return {
    id: "r1",
    draftId: "d1",
    kind: "expert",
    reviewer: { name: "Claire Donnelly", email: "claire@example.com" },
    share: { letter: true, evidence: true, hearingNotes: false },
    status: "back",
    rounds: [{ n: 1, sentAt: T0, backAt: T0 + 5000, suggestionIds: ["m1", "m2"], commentIds: ["c1"] }],
    createdAt: T0,
    updatedAt: T0,
    ...partial,
  };
}

describe("the reviewer's points", () => {
  it("collects their suggestion and their own top-level comments since the round began", () => {
    const work = collectReviewerWork(draft(), { name: "Claire Donnelly", email: "claire@example.com" }, T0);
    expect(work.suggestionIds).toEqual(["m1", "m2"]);
    expect(work.commentIds).toEqual(["c1"]);
    expect(work.points.map((p) => [p.id, p.kind])).toEqual([
      ["pc1", "suggestion"],
      ["c1", "comment"],
    ]);
  });

  it("numbers suggestions, keeps comments, and drops decided ones from the open list", () => {
    const pts = reviewPoints(draft(), review());
    expect(pts.map((p) => [p.kind, p.n, p.state])).toEqual([
      ["suggestion", 1, "open"],
      ["comment", undefined, "open"],
    ]);
    expect(pts[0].title).toBe("Say how many times");
    // Accepted: the pending change is gone but the round's snapshot keeps the row.
    const accepted = draft();
    accepted.sections[0] = { ...accepted.sections[0], html: "<p>You were late eleven times.</p>", pendingChange: undefined };
    const r = review({
      rounds: [
        {
          ...review().rounds[0],
          points: [{ id: "pc1", kind: "suggestion", sectionId: "s1", title: "Say how many times", where: "Paragraph 1" }],
          decisions: { pc1: { decision: "accepted", at: T0 + 9000 } },
        },
      ],
    });
    const after = reviewPoints(accepted, r);
    expect(after.find((p) => p.id === "pc1")?.state).toBe("accepted");
    expect(openPoints(after).map((p) => p.id)).toEqual(["c1"]);
    expect(summariseRound(accepted, r, r.rounds[0])).toBeTruthy();
  });

  it("counts a suggestion decided from the Edits tab when the round has no snapshot of it", () => {
    const accepted = draft();
    accepted.sections[0] = { ...accepted.sections[0], html: "<p>You were late eleven times.</p>", pendingChange: undefined };
    const r = review({ rounds: [{ ...review().rounds[0], decisions: { pc1: { decision: "accepted", at: T0 + 9000 } } }] });
    const pts = reviewPoints(accepted, r);
    expect(pts.filter((p) => p.kind === "suggestion").map((p) => [p.id, p.state])).toEqual([["pc1", "accepted"]]);
    // While it is still in the text, the mark ids never add extra rows.
    expect(reviewPoints(draft(), review()).filter((p) => p.kind === "suggestion")).toHaveLength(1);
  });
});

describe("what goes to the reviewer", () => {
  const evidence = [
    { id: "e1", kind: "document", filename: "Absence log.pdf", content: "12 absences" },
    { id: "e2", kind: "note", filename: "Hearing notes 3 Aug", content: "Hearing held" },
    { id: "e3", kind: "note", filename: "", content: "Minutes of the disciplinary hearing on 9 October" },
  ];

  it("tells hearing notes from other evidence", () => {
    expect(isHearingNote(evidence[0])).toBe(false);
    expect(isHearingNote(evidence[1])).toBe(true);
    expect(isHearingNote(evidence[2])).toBe(true);
    const split = shareableEvidence(evidence);
    expect(split.files.map((e) => e.id)).toEqual(["e1"]);
    expect(split.hearingNotes.map((e) => e.id)).toEqual(["e2", "e3"]);
  });

  it("shares only what was ticked, and says which tick shared it", () => {
    const d = draft({ evidence: evidence as unknown as Draft["evidence"] });
    expect(sharedEvidence(d, { evidence: true, hearingNotes: false }).map((e) => [e.id, e.group])).toEqual([["e1", "file"]]);
    expect(sharedEvidence(d, { evidence: false, hearingNotes: true }).map((e) => e.id)).toEqual(["e2", "e3"]);
    expect(sharedEvidence(d, { evidence: false, hearingNotes: false })).toEqual([]);
  });

  it("shows a teammate only the evidence they were given, in the letter's order", () => {
    expect(evidenceSharedWith(evidence, { evidence: true, hearingNotes: false }).map((e) => e.id)).toEqual(["e1"]);
    expect(evidenceSharedWith(evidence, { evidence: true, hearingNotes: true }).map((e) => e.id)).toEqual(["e1", "e2", "e3"]);
    expect(evidenceSharedWith(evidence, undefined)).toEqual([]);
  });

  it("splits a numbered ask into questions", () => {
    expect(askItems("1. Is 12 months right?\n2. Is the appeal fair?")).toEqual(["Is 12 months right?", "Is the appeal fair?"]);
    expect(askItems("Just the tone, please")).toEqual(["Just the tone, please"]);
    expect(askItems("")).toEqual([]);
  });
});

describe("times and words", () => {
  it("says whether it came back on time", () => {
    const due = new Date(T0 + 3 * 3600000).toISOString();
    expect(backTiming(T0, due)).toBe("ahead of time");
    expect(backTiming(T0 + 3 * 3600000, due)).toBe("on time");
    expect(backTiming(T0 + 5 * 3600000, due)).toBe("2 hours late");
    expect(backLine(T0, due, T0)).toMatch(/^Back at \d\d:\d\d, ahead of time$/);
  });

  it("defaults the back-by to a weekday at 12:00 or 17:00, at least the turnaround away", () => {
    const iso = defaultDueAt(48, T0);
    const d = new Date(iso);
    expect(d.getTime()).toBeGreaterThanOrEqual(T0 + 48 * 3600000);
    expect([12, 17]).toContain(d.getHours());
    expect([0, 6]).not.toContain(d.getDay());
    expect(turnaroundWords("24h")).toBe("24 hours");
    expect(turnaroundWords("72h")).toBe("3 days");
  });

  it("reads the verdict back out of a delivery note", () => {
    expect(parseDelivery(`${REVIEW_VERDICT_LABELS["ready-with-changes"]}\n\nThree small changes.`, REVIEW_VERDICT_LABELS)).toEqual({
      verdict: "ready-with-changes",
      note: "Three small changes.",
    });
    expect(parseDelivery("Looks fine", REVIEW_VERDICT_LABELS)).toEqual({ note: "Looks fine" });
  });

  it("describes a suggestion in words", () => {
    expect(changeKind("<p>You may appeal.</p>", "<p>You may appeal to someone not involved.</p>")).toBe("added words");
    expect(changeKind("<p>You may appeal to someone.</p>", "<p>You may appeal.</p>")).toBe("removed words");
    expect(changeKind("<p>The shift change is a sanction.</p>", "<p>We agreed this together at the hearing.</p>")).toBe("replaced sentence");
    expect(changeKind("<p>One. The shift change is a sanction. Two.</p>", "<p>One. We agreed it. Then we met. Two.</p>")).toBe("replaced wording");
    expect(suggestionTitle("<p>a</p>", "<p>a b</p>", "Name the policy")).toBe("Name the policy");
    expect(suggestionTitle("<p>You may appeal.</p>", "<p>You may appeal in writing.</p>")).toBe('Add "in writing."');
  });
});

describe("a teammate's copy of a review made on another device", () => {
  beforeEach(() => useReviewStore.setState({ requests: {} }));

  const assigned: AssignedReview = {
    linkId: "link-1",
    reviewId: "rvw_remote",
    draftId: "server-uuid",
    asker: { name: "Alex Morgan", userId: "u-alex" },
    reviewer: { name: "Priya Shah", userId: "u-priya" },
    ask: "Is the appeal fair?",
    dueAt: null,
    approveInSameStep: true,
    share: { evidence: true, hearingNotes: false },
    createdAt: T0,
    state: {
      status: "out",
      approvedAt: null,
      openedAt: null,
      expiresAt: null,
      revokedAt: null,
      rounds: [{ n: 1, sentAt: T0 }],
      messages: [{ id: "m1", from: "asker", name: "Alex Morgan", body: "Thanks", at: T0 + 10 }],
      points: [],
    },
  };

  it("keeps it under the local letter id, and never overwrites the asker's own copy", () => {
    importAssigned("d-local", assigned);
    const r = useReviewStore.getState().requests.rvw_remote;
    expect(r.draftId).toBe("d-local");
    expect(r.kind).toBe("team");
    expect(r.importedAt).toBeTruthy();
    expect(r.messages?.[0].body).toBe("Thanks");

    // The asker's own request (made in this browser) is left alone.
    useReviewStore.setState({ requests: {} });
    const id = useReviewStore.getState().createReview({ id: "rvw_remote", draftId: "d-local", kind: "team", reviewer: { name: "Priya Shah" } });
    expect(id).toBe("rvw_remote");
    importAssigned("d-local", { ...assigned, state: { ...assigned.state, status: "finished" } });
    expect(useReviewStore.getState().requests.rvw_remote.status).toBe("out");
  });

  it("adds a message once even when it arrives twice", () => {
    const s = useReviewStore.getState();
    const id = s.createReview({ draftId: "d1", kind: "trusted", reviewer: { name: "Mark Ellison" } });
    s.addMessage(id, { id: "x1", from: "reviewer", name: "Mark", body: "Hello", at: T0 });
    s.addMessage(id, { id: "x1", from: "reviewer", name: "Mark", body: "Hello", at: T0 });
    expect(useReviewStore.getState().requests[id].messages).toHaveLength(1);
  });
});
