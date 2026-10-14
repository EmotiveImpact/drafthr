import { describe, expect, it } from "vitest";
import type { ReviewRequest } from "@/lib/journey/reviews";
import { editsShowsReview } from "./LetterSidePanel";

/**
 * REVIEW-70 / LETTER-X53: back to you, the Edits tab is the Review step
 * itself (f5) for the person who asked; at any other time, or for anyone
 * else, it is the plain list of edits.
 */
const review = (status: ReviewRequest["status"]) => ({ status }) as ReviewRequest;

describe("editsShowsReview", () => {
  it("shows the Review step on Edits when it is back to the person who asked", () => {
    expect(editsShowsReview({ stage: "review", review: review("back") }, { viewerIsAsker: true })).toBe(true);
    // Asker not known (an older request): treated as theirs.
    expect(editsShowsReview({ stage: "review", review: review("back") }, {})).toBe(true);
  });

  it("keeps the plain list for anyone else and for the named reviewer", () => {
    expect(editsShowsReview({ stage: "review", review: review("back") }, { viewerIsAsker: false })).toBe(false);
    expect(editsShowsReview({ stage: "review", review: review("back") }, { viewerIsReviewer: true })).toBe(false);
  });

  it("keeps the plain list while out, after finishing, and in other stages", () => {
    expect(editsShowsReview({ stage: "review", review: review("out") }, { viewerIsAsker: true })).toBe(false);
    expect(editsShowsReview({ stage: "approve", review: review("finished") }, { viewerIsAsker: true })).toBe(false);
    expect(editsShowsReview({ stage: "draft", review: null }, {})).toBe(false);
  });
});
