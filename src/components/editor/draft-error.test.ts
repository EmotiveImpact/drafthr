import { describe, expect, it } from "vitest";
import { draftErrorCopy } from "./draft-error";

describe("draftErrorCopy", () => {
  it("never shows the raw developer error", () => {
    expect(draftErrorCopy(new Error("/api/draft failed: 400 bad request"))).toBe(
      "Something went wrong while DraftHR was writing. Try again."
    );
    expect(draftErrorCopy(new Error("/api/draft failed: 400 x"))).not.toMatch(/api|400/);
    expect(draftErrorCopy(new Error("Server error (502): upstream"))).not.toMatch(/502/);
  });
  it("says when DraftHR is busy or unreachable", () => {
    expect(draftErrorCopy(new Error("Rate limited (429)"))).toMatch(/busy/);
    expect(draftErrorCopy(new Error("Network error"))).toMatch(/could not be reached/);
  });
  it("hides server set-up messages", () => {
    const out = draftErrorCopy(new Error("ANTHROPIC_API_KEY is not configured on the server."));
    expect(out).not.toMatch(/ANTHROPIC|API_KEY/);
    expect(out).toMatch(/cannot write letters/);
  });
  it("keeps a plain refusal written for people", () => {
    expect(draftErrorCopy(new Error("This needs a paid plan."))).toBe("This needs a paid plan.");
    expect(draftErrorCopy(new Error('/api/draft failed: 400 {"error":"This letter is too long to rewrite in one go."}'))).toBe(
      "This letter is too long to rewrite in one go."
    );
  });
});
