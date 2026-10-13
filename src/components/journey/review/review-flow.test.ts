import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Draft } from "@/lib/letters/types";
import { useDraftStore } from "@/lib/store";
import { currentRound, useReviewStore } from "@/lib/journey/reviews";
import { acceptPoint, recallReview } from "./actions";
import { collectReviewerWork, reviewPoints, slaHours, summariseRound, turnaroundWords } from "./model";
import { linkExpiryAt, linkExpiryDays } from "./trusted-api";

vi.mock("sonner", () => ({ toast: Object.assign(vi.fn(), { error: vi.fn(), success: vi.fn() }) }));

const DAY = 24 * 3600000;
const T0 = Date.UTC(2026, 9, 14, 9, 0);

function letter(): Draft {
  return {
    id: "d1",
    letterType: "final_written_warning",
    mode: "employer",
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
