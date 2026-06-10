import { describe, expect, it } from "vitest";
import { clampMaxTokens, clampTemperature } from "./draft";

/**
 * Security board SE-01 (2026-06-10): api/draft.ts let the client pick
 * maxOutputTokens with no ceiling, so an authed user could request 64k-token
 * generations (~40/min under the ai rate limit) and run up unbounded Anthropic
 * spend. These tests lock the server-side clamp.
 */
describe("draft output clamps (SE-01 cost/DoS)", () => {
  it("caps an oversized maxTokens at the server ceiling", () => {
    expect(clampMaxTokens(64_000)).toBe(2_000);
    expect(clampMaxTokens(1_000_000)).toBe(2_000);
  });

  it("passes through a sane request unchanged", () => {
    expect(clampMaxTokens(800)).toBe(800);
    expect(clampMaxTokens(2_000)).toBe(2_000);
  });

  it("defaults when missing and floors non-finite / non-numeric input", () => {
    expect(clampMaxTokens(undefined)).toBe(1_200);
    expect(clampMaxTokens(NaN)).toBe(1_200);
    // Non-finite (Infinity can't even survive JSON, which encodes it as null)
    // falls back to the default — still safely under the cap.
    expect(clampMaxTokens(Infinity)).toBe(1_200);
    // A finite-but-huge value is the real attack vector — it must be capped.
    expect(clampMaxTokens(1e9)).toBe(2_000);
    expect(clampMaxTokens(0)).toBe(1); // floored to the minimum, never 0/negative
    expect(clampMaxTokens(-5)).toBe(1);
  });

  it("clamps temperature into [0,1]", () => {
    expect(clampTemperature(5)).toBe(1);
    expect(clampTemperature(-2)).toBe(0);
    expect(clampTemperature(0.7)).toBe(0.7);
    expect(clampTemperature(undefined)).toBe(0.4);
    expect(clampTemperature(NaN)).toBe(0.4);
  });
});
