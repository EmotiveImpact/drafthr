import { describe, it, expect, beforeEach } from "vitest";
import { useReviewStore, getActiveReview, getLatestReview, getReviewsForDraft } from "./reviews";

describe("review store", () => {
  beforeEach(() => useReviewStore.setState({ requests: {} }));

  it("walks a request through out, back, a second round and finished", () => {
    const s = useReviewStore.getState();
    const id = s.createReview({ draftId: "d1", kind: "team", reviewer: { name: "Sam Patel" }, ask: " Tone " });
    let r = getActiveReview("d1")!;
    expect(r.id).toBe(id);
    expect(r.status).toBe("out");
    expect(r.ask).toBe("Tone");
    expect(r.share).toEqual({ letter: true, evidence: true, hearingNotes: false });

    s.markBack(id, { verdict: "ready-with-changes", note: "Two small points", suggestionIds: ["a"] });
    r = getActiveReview("d1")!;
    expect(r.status).toBe("back");
    expect(r.rounds[0]).toMatchObject({ verdict: "ready-with-changes", note: "Two small points", suggestionIds: ["a"] });

    s.sendBack(id, "Is the date right?");
    r = getActiveReview("d1")!;
    expect(r.status).toBe("out");
    expect(r.rounds).toHaveLength(2);
    expect(r.rounds[1]).toMatchObject({ n: 2, question: "Is the date right?" });

    s.markBack(id);
    s.finish(id);
    expect(getActiveReview("d1")).toBeNull();
    expect(getLatestReview("d1")?.status).toBe("finished");
  });

  it("keeps one open request per draft and ignores recalled ones", () => {
    const s = useReviewStore.getState();
    const first = s.createReview({ draftId: "d1", kind: "team", reviewer: { name: "A" } });
    const second = s.createReview({ draftId: "d1", kind: "expert", reviewer: { name: "B" } });
    expect(useReviewStore.getState().requests[first].status).toBe("recalled");
    expect(getActiveReview("d1")?.id).toBe(second);

    s.recall(second);
    expect(getActiveReview("d1")).toBeNull();
    expect(getLatestReview("d1")).toBeNull();
    expect(getReviewsForDraft("d1")).toHaveLength(2);

    s.clearDraft("d1");
    expect(getReviewsForDraft("d1")).toHaveLength(0);
  });
});
