import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Draft } from "@/lib/letters/types";
import { useDraftStore } from "@/lib/store";
import { currentRound, useReviewStore } from "@/lib/journey/reviews";
import { acceptPoint, finishReview, recallReview, rejectPoint } from "./actions";
import { applyRemotePoints, placeHeldSuggestions } from "./sync";
import { decideEdit, suggestedEdits } from "@/components/editor/suggestion-groups";
import { askPlaceholder, collectReviewerWork, openPoints, reviewPoints, slaHours, summariseRound, turnaroundWords } from "./model";
import { linkExpiryAt, linkExpiryDays } from "./trusted-api";

vi.mock("sonner", () => ({ toast: Object.assign(vi.fn(), { error: vi.fn(), success: vi.fn() }) }));

const DAY = 24 * 3600000;
const T0 = Date.UTC(2026, 9, 14, 9, 0);

function letter(): Draft {
  return {
    id: "d1",
    letterType: "final_written_warning",
    mode: "employer",
    answers: {},
    sections: [
      { id: "s1", title: "Opening", html: "<p>You were late for persistent lateness.</p>", versions: [] },
      { id: "s2", title: "Appeal", html: "<p>You may appeal.</p>", versions: [] },
    ],
    comments: [],
    evidence: [],
    timeline: [],
    createdAt: T0,
    updatedAt: T0,
  } as unknown as Draft;
}

const dana = { name: "Dana Whitfield", email: "dana@example.com" };

/** Alex asks Dana; Dana suggests on s1 and comments on s2 (round 1). */
function danaWorks(): string {
  useDraftStore.setState({ drafts: { d1: letter() } } as never);
  const id = useReviewStore.getState().createReview({
    draftId: "d1",
    kind: "team",
    reviewer: dana,
    asker: { name: "Alex Morgan", email: "alex@example.com" },
    share: { evidence: true, hearingNotes: false },
  } as never);
  const sentAt = currentRound(useReviewStore.getState().requests[id])!.sentAt;
  const ds = useDraftStore.getState();
  ds.proposeSectionChange("d1", "s1", {
    id: "sug_dana",
    createdAt: sentAt + 1000,
    proposedHtml: "<p>You were late for persistent lateness, in breach of our Attendance Policy.</p>",
    instruction: "Name the Attendance Policy",
    source: "review",
    authorId: dana.email,
    authorName: dana.name,
    diffViewMode: "inline",
  });
  ds.addComment("d1", { sectionId: "s2", authorId: dana.email, authorName: dana.name, authorEmail: dana.email, body: "Name who hears it" } as never);
  return id;
}

describe("the review loop, end to end in the stores", () => {
  beforeEach(() => useReviewStore.setState({ requests: {} }));

  it("counts the change you accepted in the rounds history (REVIEW-83)", () => {
    const id = danaWorks();
    const r = useReviewStore.getState().requests[id];
    const w = collectReviewerWork(useDraftStore.getState().drafts.d1, r.reviewer, currentRound(r)!.sentAt);
    useReviewStore.getState().markBack(id, { verdict: "ready-with-changes", ...w });
    const back = useReviewStore.getState().requests[id];
    const point = reviewPoints(useDraftStore.getState().drafts.d1, back).find((p) => p.kind === "suggestion")!;
    acceptPoint(back, point, { animate: false });
    const after = useReviewStore.getState().requests[id];
    const summary = summariseRound(useDraftStore.getState().drafts.d1, after, currentRound(after)!);
    expect(summary.changes).toBe(1);
    expect(summary.comments).toBe(1);
    expect(summary.accepted).toBe(1);
    expect(useDraftStore.getState().drafts.d1.sections[0].pendingChange).toBeUndefined();
  });

  it("keeps the change's name once accepted, even without a snapshot, and records it once", () => {
    const id = danaWorks();
    const r = useReviewStore.getState().requests[id];
    const w = collectReviewerWork(useDraftStore.getState().drafts.d1, r.reviewer, currentRound(r)!.sentAt);
    useReviewStore.getState().markBack(id, { verdict: "ready-with-changes", suggestionIds: w.suggestionIds, commentIds: w.commentIds });
    const back = useReviewStore.getState().requests[id];
    const point = reviewPoints(useDraftStore.getState().drafts.d1, back).find((p) => p.kind === "suggestion")!;
    acceptPoint(back, point, { animate: false });
    const after = useReviewStore.getState().requests[id];
    const rows = reviewPoints(useDraftStore.getState().drafts.d1, after).filter((p) => p.kind === "suggestion");
    expect(rows.map((p) => [p.title, p.state])).toEqual([["Name the Attendance Policy", "accepted"]]);
  });

  it("keeps the change's name when it is accepted from its margin card (LETTER-X38)", () => {
    const id = danaWorks();
    const r = useReviewStore.getState().requests[id];
    const w = collectReviewerWork(useDraftStore.getState().drafts.d1, r.reviewer, currentRound(r)!.sentAt);
    // As the seed does: the marks and comments, no snapshot of the points.
    useReviewStore.getState().markBack(id, { verdict: "ready-with-changes", suggestionIds: w.suggestionIds, commentIds: w.commentIds });
    // The margin card decides through the Edits path, not the review's own.
    const edit = suggestedEdits(useDraftStore.getState().drafts.d1).find((e) => !e.ai)!;
    decideEdit("d1", edit, true);
    const after = useReviewStore.getState().requests[id];
    const rows = reviewPoints(useDraftStore.getState().drafts.d1, after).filter((p) => p.kind === "suggestion");
    expect(rows.map((p) => [p.title, p.where, p.state])).toEqual([["Name the Attendance Policy", "Opening", "accepted"]]);
  });

  it("finishing with points left leaves the change out and resolves the comment, so nothing undecided goes on (LETTER-X37)", async () => {
    const id = danaWorks();
    const r = useReviewStore.getState().requests[id];
    const w = collectReviewerWork(useDraftStore.getState().drafts.d1, r.reviewer, currentRound(r)!.sentAt);
    useReviewStore.getState().markBack(id, { verdict: "ready-with-changes", ...w });
    await finishReview(useReviewStore.getState().requests[id]);
    const d = useDraftStore.getState().drafts.d1;
    const after = useReviewStore.getState().requests[id];
    expect(after.status).toBe("finished");
    expect(d.sections[0].pendingChange).toBeUndefined();
    expect(d.sections[0].html).toBe("<p>You were late for persistent lateness.</p>");
    expect(d.comments?.[0].resolved).toBe(true);
    const pts = reviewPoints(d, after);
    expect(openPoints(pts)).toHaveLength(0);
    expect(pts.map((p) => [p.title, p.state])).toEqual([
      ["Name the Attendance Policy", "rejected"],
      ["Name who hears it", "resolved"],
    ]);
  });

  it("withdraws the teammate's suggestion when the review is recalled, and keeps comments (REVIEW-X2)", async () => {
    const id = danaWorks();
    await recallReview(useReviewStore.getState().requests[id]);
    const d = useDraftStore.getState().drafts.d1;
    expect(useReviewStore.getState().requests[id].status).toBe("recalled");
    expect(d.sections[0].pendingChange).toBeUndefined();
    expect(d.sections[0].html).toBe("<p>You were late for persistent lateness.</p>");
    expect(d.comments).toHaveLength(1);
  });
});

describe("the secure link's expiry, as the server sets it (REVIEW-20)", () => {
  it("lasts 7 days, or until 2 days after the back-by date, up to 30 days", () => {
    expect(linkExpiryDays(T0, T0 + 2 * DAY)).toBe(7);
    expect(linkExpiryDays(T0, T0 + 10 * DAY)).toBe(12);
    expect(linkExpiryDays(T0, T0 + 60 * DAY)).toBe(30);
    expect(linkExpiryAt(T0, T0 + 10 * DAY)).toBe(T0 + 12 * DAY);
  });
});

describe("an expert's turnaround, in the same words as the marketplace (MARKET-X3)", () => {
  it("reads a range by its upper end", () => {
    expect(slaHours("24-48h")).toBe(48);
    expect(turnaroundWords("24-48h")).toBe("48 hours");
    expect(turnaroundWords("24h")).toBe("24 hours");
  });
});

describe("a reviewer's suggestion that can't go into the letter yet (REVIEW-X24)", () => {
  beforeEach(() => useReviewStore.setState({ requests: {} }));

  function trustedWithDraftHrEdit(): string {
    useDraftStore.setState({ drafts: { d1: letter() } } as never);
    // DraftHR already has an edit waiting in s1.
    useDraftStore.getState().proposeSectionChange("d1", "s1", {
      id: "ai_1",
      createdAt: T0,
      proposedHtml: "<p>You were late on eleven shifts.</p>",
      instruction: "Be specific",
      source: "chat",
      diffViewMode: "inline",
    } as never);
    return useReviewStore.getState().createReview({
      draftId: "d1",
      kind: "trusted",
      reviewer: { name: "Claire Booth", email: "claire@example.com" },
      share: { evidence: false, hearingNotes: false },
    } as never);
  }

  const point = {
    id: "ex_1",
    kind: "suggestion" as const,
    round: 1,
    sectionId: "s1",
    title: "Name the Attendance Policy",
    note: "Name the Attendance Policy",
    proposedHtml: "<p>You were late, in breach of our Attendance Policy.</p>",
    at: T0 + 1000,
  };

  it("is held, listed as still to decide (never Accepted), and goes in once DraftHR's edit is decided", () => {
    const id = trustedWithDraftHrEdit();
    applyRemotePoints(useReviewStore.getState().requests[id], [point as never]);
    useReviewStore.getState().markBack(id, { verdict: "ready-with-changes", points: [{ id: "ex_1", kind: "suggestion", sectionId: "s1", title: point.title, where: "Opening" }] });
    let r = useReviewStore.getState().requests[id];
    expect(useDraftStore.getState().drafts.d1.sections[0].pendingChange?.id).toBe("ai_1");
    let pts = reviewPoints(useDraftStore.getState().drafts.d1, r);
    expect(pts.map((p) => [p.title, p.state, p.held])).toEqual([["Name the Attendance Policy", "open", "busy"]]);
    // Accepting a held point does nothing (it would take DraftHR's edit).
    acceptPoint(r, pts[0], { animate: false });
    expect(useDraftStore.getState().drafts.d1.sections[0].pendingChange?.id).toBe("ai_1");
    // Decide DraftHR's edit: the reviewer's goes in.
    useDraftStore.getState().rejectSectionPending("d1", "s1");
    expect(placeHeldSuggestions(id)).toEqual(["ex_1"]);
    r = useReviewStore.getState().requests[id];
    expect(useDraftStore.getState().drafts.d1.sections[0].pendingChange?.id).toBe("ex_1");
    pts = reviewPoints(useDraftStore.getState().drafts.d1, r);
    expect(pts.map((p) => [p.state, p.held])).toEqual([["open", undefined]]);
    // The next sync adds it no second time.
    expect(applyRemotePoints(r, [point as never])).toEqual([]);
  });

  it("goes in on DraftHR's edit you accepted first, never undoing it (REVIEW-X29)", () => {
    const id = trustedWithDraftHrEdit();
    // The reviewer worked on the letter as it was: "You were late for persistent lateness."
    const theirs = { ...point, proposedHtml: "<p>You were late for persistent lateness, in breach of our Attendance Policy.</p>" };
    applyRemotePoints(useReviewStore.getState().requests[id], [theirs as never]);
    useReviewStore.getState().markBack(id, { verdict: "ready-with-changes", points: [{ id: "ex_1", kind: "suggestion", sectionId: "s1", title: point.title, where: "Opening" }] });
    // Accept DraftHR's "You were late on eleven shifts." first.
    useDraftStore.getState().acceptSectionPending("d1", "s1");
    expect(placeHeldSuggestions(id)).toEqual(["ex_1"]);
    const sec = useDraftStore.getState().drafts.d1.sections[0];
    expect(sec.pendingChange?.id).toBe("ex_1");
    // Only the reviewer's words are marked; DraftHR's accepted words stay.
    const div = document.createElement("div");
    div.innerHTML = sec.html;
    expect([...div.querySelectorAll("del")].map((d) => d.textContent)).toEqual([]);
    expect([...div.querySelectorAll("ins")].map((d) => d.textContent?.trim())).toEqual([", in breach of our Attendance Policy"]);
    useDraftStore.getState().acceptSectionPending("d1", "s1");
    expect(useDraftStore.getState().drafts.d1.sections[0].html).toBe("<p>You were late on eleven shifts, in breach of our Attendance Policy.</p>");
    expect(useReviewStore.getState().requests[id].rewritesNewer).toBeUndefined();
  });

  it("says so in Progress when the reviewer's change rewrites the edit you accepted (REVIEW-X29)", () => {
    const id = trustedWithDraftHrEdit();
    const theirs = { ...point, proposedHtml: "<p>You were late for repeated lateness.</p>" };
    applyRemotePoints(useReviewStore.getState().requests[id], [theirs as never]);
    useReviewStore.getState().markBack(id, { verdict: "ready-with-changes", points: [{ id: "ex_1", kind: "suggestion", sectionId: "s1", title: point.title, where: "Opening" }] });
    useDraftStore.getState().acceptSectionPending("d1", "s1");
    placeHeldSuggestions(id);
    const r = useReviewStore.getState().requests[id];
    expect(r.rewritesNewer).toEqual(["ex_1"]);
    const [p] = reviewPoints(useDraftStore.getState().drafts.d1, r);
    expect([p.state, p.held, p.rewritesNewer]).toEqual(["open", undefined, true]);
  });

  it("on a part no longer in the letter, can only be left out, and never comes back", () => {
    const id = trustedWithDraftHrEdit();
    const gone = { ...point, sectionId: "s_gone" };
    applyRemotePoints(useReviewStore.getState().requests[id], [gone as never]);
    useReviewStore.getState().markBack(id, { verdict: "ready", points: [{ id: "ex_1", kind: "suggestion", sectionId: "s_gone", title: point.title }] });
    let r = useReviewStore.getState().requests[id];
    const [p] = reviewPoints(useDraftStore.getState().drafts.d1, r);
    expect([p.state, p.held]).toEqual(["open", "missing"]);
    rejectPoint(r, p);
    r = useReviewStore.getState().requests[id];
    // DraftHR's own edit in s1 is untouched.
    expect(useDraftStore.getState().drafts.d1.sections[0].pendingChange?.id).toBe("ai_1");
    expect(reviewPoints(useDraftStore.getState().drafts.d1, r).map((x) => x.state)).toEqual(["rejected"]);
    expect(r.heldSuggestions?.ex_1).toBeUndefined();
    expect(applyRemotePoints(r, [gone as never])).toEqual(["ex_1"]);
    expect(useDraftStore.getState().drafts.d1.sections.some((s) => s.pendingChange?.id === "ex_1")).toBe(false);
  });

  it("an older copy without the hold still isn't shown as Accepted", () => {
    const id = trustedWithDraftHrEdit();
    useReviewStore.getState().updateReview(id, { remoteApplied: [] });
    useReviewStore.getState().markBack(id, { points: [{ id: "ex_9", kind: "suggestion", sectionId: "s1", title: "Something" }] });
    const r = useReviewStore.getState().requests[id];
    expect(reviewPoints(useDraftStore.getState().drafts.d1, r).map((x) => [x.state, x.held])).toEqual([["open", "busy"]]);
  });
});

describe("the example in What should they look at? (FOUNDATION-X9)", () => {
  it("talks about a sanction only for letters that impose one", () => {
    expect(askPlaceholder({ mode: "employer", letterType: "warning" } as Draft)).toMatch(/sanction/);
    expect(askPlaceholder({ mode: "employee", letterType: "grievance" } as Draft)).not.toMatch(/sanction/);
    expect(askPlaceholder({ mode: "employee", letterType: "grievance" } as Draft)).toMatch(/before I send it/);
    expect(askPlaceholder({ mode: "employer", letterType: "offer" } as Draft)).not.toMatch(/sanction/);
    expect(askPlaceholder({ mode: "employee", letterType: "flexible_working_request" } as Draft)).toMatch(/request/);
  });
});
