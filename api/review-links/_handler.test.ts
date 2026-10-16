/**
 * The endpoint fails softly: without the review_links table (or without a
 * database at all) it answers 503 with code "not-ready" and words the
 * screens can show, never a crash or a blank 500.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

describe("review-links endpoint without a database", () => {
  const saved = process.env.DATABASE_URL;
  beforeEach(() => {
    delete process.env.DATABASE_URL;
    vi.resetModules();
  });
  afterEach(() => {
    if (saved !== undefined) process.env.DATABASE_URL = saved;
  });

  it("opening a link gives the soft not-ready error", async () => {
    const { GET } = await import("./_handlers/review-links.js");
    const res = await GET(new Request(`https://app.drafthr.io/api/store/review-links?op=open&token=rvl_${"A".repeat(43)}`));
    expect(res.status).toBe(503);
    const body = (await res.json()) as { code: string; error: string };
    expect(body.code).toBe("not-ready");
    expect(body.error).toMatch(/Secure links aren't available right now/);
  });

  it("acting on a link gives the soft not-ready error", async () => {
    const { POST } = await import("./_handlers/review-links.js");
    const res = await POST(
      new Request(`https://app.drafthr.io/api/store/review-links?op=act&token=rvl_${"A".repeat(43)}`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Origin: "https://app.drafthr.io" },
        body: JSON.stringify({ action: "comment", sectionId: "s1", note: "Hi" }),
      }),
    );
    expect(res.status).toBe(503);
    expect(((await res.json()) as { code: string }).code).toBe("not-ready");
  });

  it("a made-up token is refused before any database work", async () => {
    const { GET } = await import("./_handlers/review-links.js");
    const res = await GET(new Request("https://app.drafthr.io/api/store/review-links?op=open&token=nope"));
    expect(res.status).toBe(404);
    expect(((await res.json()) as { code: string }).code).toBe("invalid");
  });
});
