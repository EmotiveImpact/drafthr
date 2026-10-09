/**
 * Internal error text (SDK messages, env var names) must not reach the
 * browser: log it, return a generic message.
 */
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("../../_utils/rate-limit.js", () => ({ rateLimitDurable: async () => null }));
vi.mock("../../_utils/workos.js", () => ({
  getWorkos: () => {
    throw new Error("WorkOS env vars missing: WORKOS_API_KEY and WORKOS_CLIENT_ID required");
  },
  buildStateCookie: async () => "s=1",
}));

afterEach(() => {
  delete process.env.WORKOS_REDIRECT_URI;
  vi.restoreAllMocks();
});

describe("GET /api/auth/url error handling", () => {
  it("does not echo the SDK error", async () => {
    process.env.WORKOS_REDIRECT_URI = "https://app.drafthr.io/auth/callback";
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    const { GET } = await import("./url.js");
    const res = await GET(new Request("https://app.drafthr.io/api/auth/url"));
    expect(res.status).toBe(500);
    const body = (await res.json()) as { error: string };
    expect(body.error).not.toMatch(/WORKOS|env/i);
    expect(spy).toHaveBeenCalled();
  });

  it("does not name the missing env var", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const { GET } = await import("./url.js");
    const res = await GET(new Request("https://app.drafthr.io/api/auth/url"));
    const body = (await res.json()) as { error: string };
    expect(body.error).not.toMatch(/WORKOS_REDIRECT_URI/);
  });
});
