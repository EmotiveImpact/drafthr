import { afterEach, describe, expect, it, vi } from "vitest";
import { getFlag } from "./flags";

afterEach(() => {
  window.localStorage.clear();
  vi.unstubAllEnvs();
});

describe("feature flags", () => {
  it("ship priority reviews off", () => {
    vi.stubEnv("VITE_FEATURE_PRIORITY_REVIEWS", "");
    expect(getFlag("priorityReviews")).toBe(false);
  });

  it("turn priority reviews on from the environment, or per browser", () => {
    vi.stubEnv("VITE_FEATURE_PRIORITY_REVIEWS", "1");
    expect(getFlag("priorityReviews")).toBe(true);
    window.localStorage.setItem("drafthr.flag.priority-reviews", "0");
    expect(getFlag("priorityReviews")).toBe(false);
  });

  it("keep the review links and email switches on", () => {
    expect(getFlag("trustedReviewLinks")).toBe(true);
    expect(getFlag("emailLetters")).toBe(true);
  });
});
