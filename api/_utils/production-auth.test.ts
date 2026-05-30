import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

async function importFresh() {
  vi.resetModules();
  return await import("./production-auth.js");
}

describe("enforceProductionSession", () => {
  beforeEach(() => {
    vi.unstubAllEnvs();
  });
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("bypasses auth ONLY with the explicit DRAFTHR_DEV_NO_AUTH=1 dev flag", async () => {
    vi.stubEnv("DRAFTHR_DEV_NO_AUTH", "1");
    const { enforceProductionSession } = await importFresh();
    const req = new Request("https://example.com/api/draft", { method: "POST" });
    const res = await enforceProductionSession(req);
    expect(res).toBeNull();
  });

  it("FAILS CLOSED outside production when the dev flag is not set", async () => {
    // The old behaviour returned null (allow) whenever NODE_ENV !== production
    // — which left /api/draft, /api/agent, /api/upload/image unauthenticated
    // on every public Vercel *preview* deployment. It must now enforce.
    vi.stubEnv("NODE_ENV", "development");
    // DRAFTHR_DEV_NO_AUTH intentionally unset.
    const { enforceProductionSession } = await importFresh();
    const req = new Request("https://example.com/api/draft", { method: "POST" });
    const res = await enforceProductionSession(req);
    // No session cookie → must return a rejection response, NOT null.
    expect(res).not.toBeNull();
  });

  it("enforces auth in production (no session → response)", async () => {
    vi.stubEnv("NODE_ENV", "production");
    const req = new Request("https://example.com/api/draft", { method: "POST" });
    const res = await enforceProductionSession(req);
    expect(res).not.toBeNull();
  });
});
