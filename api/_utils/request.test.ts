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

  it("preserves the dev-only missing Origin fallback", async () => {
    vi.stubEnv("NODE_ENV", "development");
    const { enforceSameOrigin } = await importFresh();

    const req = new Request("http://localhost:5273/api/draft");

    expect(enforceSameOrigin(req)).toBeNull();
  });
});
