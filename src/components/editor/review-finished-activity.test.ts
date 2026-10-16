import { beforeEach, describe, expect, it } from "vitest";
import { useDraftStore } from "@/lib/store";
import { letterCatalogByMode } from "@/lib/letters/catalog";
import { getLatestReview, useReviewStore } from "@/lib/journey/reviews";
import { activityEvents } from "./letter-facts";

/**
 * LETTER-X51: the Activity card's "Review finished" line names whoever
 * finished the review (the person who asked), never the reviewer, and
 * reads "You" for the person who finished it.
 */
function backFromDana() {
  const type = letterCatalogByMode("employer")[0].id;
  const draftId = useDraftStore.getState().createDraft(type, { employeeLegalName: "Sam Patel", jurisdiction: "UK" }, "employer");
  const s = useReviewStore.getState();
  const id = s.createReview({
    draftId,
    kind: "team",
    reviewer: { name: "Dana Whitfield", email: "dana@harbour.test" },
    asker: { name: "Alex Morgan", email: "alex@harbour.test" },
  });
  s.markBack(id, { verdict: "ready-with-changes", note: "Two small changes" });
  return { draftId, id };
}

function finishedLine(draftId: string, me: string) {
  const draft = useDraftStore.getState().drafts[draftId];
  const review = getLatestReview(draftId);
  return activityEvents(draft, review, me).find((e) => e.title.startsWith("Review finished"));
}

describe("Review finished in the Activity card", () => {
  beforeEach(() => useReviewStore.setState({ requests: {} }));

  it("records who finished it", () => {
    const { draftId, id } = backFromDana();
    useReviewStore.getState().finish(id, { name: " Alex Morgan ", email: "alex@harbour.test" });
    expect(getLatestReview(draftId)?.finishedBy).toEqual({ name: "Alex Morgan", email: "alex@harbour.test" });
  });

  it("says You to the person who finished it, not the reviewer's name", () => {
    const { draftId, id } = backFromDana();
    useReviewStore.getState().finish(id, { name: "Alex Morgan" });
    const line = finishedLine(draftId, "Alex Morgan");
    expect(line?.title).toBe("Review finished, 1 round");
    expect(line?.meta).toMatch(/^You · /);
    expect(line?.meta).not.toContain("Dana");
  });

  it("names the person who finished it to anyone else", () => {
    const { draftId, id } = backFromDana();
    useReviewStore.getState().finish(id, { name: "Alex Morgan" });
    expect(finishedLine(draftId, "Ruth Adeyemi")?.meta).toMatch(/^Alex Morgan · /);
  });

  it("falls back to the person who asked for a review finished before it was recorded", () => {
    const { draftId, id } = backFromDana();
    useReviewStore.getState().finish(id);
    expect(getLatestReview(draftId)?.finishedBy).toBeUndefined();
    expect(finishedLine(draftId, "Alex Morgan")?.meta).toMatch(/^You · /);
    expect(finishedLine(draftId, "Ruth Adeyemi")?.meta).toMatch(/^Alex Morgan · /);
  });
});
