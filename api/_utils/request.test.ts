import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

async function importFresh() {
  vi.resetModules();
  return await import("./request.js");
}

describe("enforceSameOrigin", () => {
  beforeEach(() => {
    vi.unstubAllEnvs();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("allows exact configured origins in production", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("ALLOWED_ORIGINS", "https://app.drafthr.io, https://admin.drafthr.io");
    const { enforceSameOrigin } = await importFresh();

    const req = new Request("https://api.drafthr.io/api/draft", {
      headers: { origin: "https://admin.drafthr.io" },
    });

    expect(enforceSameOrigin(req)).toBeNull();
  });

  it("rejects same-host origins when the scheme is not explicitly allowed", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("ALLOWED_ORIGINS", "https://app.drafthr.io");
    const { enforceSameOrigin } = await importFresh();

    const req = new Request("https://app.drafthr.io/api/draft", {
      headers: {
        origin: "http://app.drafthr.io",
        host: "app.drafthr.io",
      },
    });

    expect(enforceSameOrigin(req)?.status).toBe(403);
  });

  it("allows strict Vercel preview origins over HTTPS", async () => {
    vi.stubEnv("NODE_ENV", "production");
    const { enforceSameOrigin } = await importFresh();

    const req = new Request("https://api.drafthr.io/api/draft", {
      headers: {
        origin: "https://drafthr-feature-123-emotiveimpact-gmailcoms-projects.vercel.app",
      },
    });

    expect(enforceSameOrigin(req)).toBeNull();
  });

  it("allows a missing Origin ONLY behind the explicit DRAFTHR_DEV_NO_AUTH flag", async () => {
    vi.stubEnv("DRAFTHR_DEV_NO_AUTH", "1");
    const { enforceSameOrigin } = await importFresh();
    const req = new Request("http://localhost:5273/api/draft");
    expect(enforceSameOrigin(req)).toBeNull();
  });

  it("FAILS CLOSED on a missing Origin when the dev flag is unset, even outside production", async () => {
    // The OLD behaviour keyed on NODE_ENV !== "production", which silently
    // disabled this CSRF layer on every public Vercel *preview* URL (preview
    // doesn't set NODE_ENV=production). It must now require the explicit flag.
    vi.stubEnv("NODE_ENV", "development");
    // DRAFTHR_DEV_NO_AUTH intentionally unset.
    const { enforceSameOrigin } = await importFresh();
    const req = new Request("https://drafthr-preview.vercel.app/api/draft");
    expect(enforceSameOrigin(req)?.status).toBe(403);
  });
});
