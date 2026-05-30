import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { enforceProductionSession } from "./production-auth.js";

const requireSessionAndTenantMock = vi.hoisted(() => vi.fn());

vi.mock("./session-with-tenant.js", () => ({
  requireSessionAndTenant: requireSessionAndTenantMock,
}));

describe("enforceProductionSession", () => {
  beforeEach(() => {
    vi.unstubAllEnvs();
    requireSessionAndTenantMock.mockReset();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("bypasses auth ONLY with the explicit DRAFTHR_DEV_NO_AUTH=1 dev flag", async () => {
    vi.stubEnv("DRAFTHR_DEV_NO_AUTH", "1");
    await expect(
      enforceProductionSession(new Request("http://localhost/api/draft")),
    ).resolves.toBeNull();
    // The bypass short-circuits before touching the session guard.
    expect(requireSessionAndTenantMock).not.toHaveBeenCalled();
  });

  it("FAILS CLOSED outside production when the dev flag is not set", async () => {
    // The OLD behaviour returned null (allow) whenever NODE_ENV !== production
    // — which left /api/draft, /api/agent, /api/upload/image unauthenticated on
    // every public Vercel *preview* deployment. It must now enforce the session.
    vi.stubEnv("NODE_ENV", "development");
    // DRAFTHR_DEV_NO_AUTH intentionally unset.
    requireSessionAndTenantMock.mockResolvedValue({
      ok: false,
      response: new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401 }),
    });

    const res = await enforceProductionSession(new Request("http://localhost/api/draft"));
    expect(res?.status).toBe(401);
    expect(requireSessionAndTenantMock).toHaveBeenCalled();
  });

  it("allows production requests with an active workspace", async () => {
    vi.stubEnv("NODE_ENV", "production");
    requireSessionAndTenantMock.mockResolvedValue({
      ok: true,
      activeTenant: { id: "tenant_1" },
    });

    await expect(
      enforceProductionSession(new Request("https://app.drafthr.io/api/draft")),
    ).resolves.toBeNull();
  });

  it("rejects production requests without a valid session or workspace", async () => {
    vi.stubEnv("NODE_ENV", "production");
    requireSessionAndTenantMock.mockResolvedValueOnce({
      ok: false,
      response: new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401 }),
    });
    const unauthenticated = await enforceProductionSession(
      new Request("https://app.drafthr.io/api/draft"),
    );
    expect(unauthenticated?.status).toBe(401);

    requireSessionAndTenantMock.mockResolvedValueOnce({ ok: true, activeTenant: null });
    const noWorkspace = await enforceProductionSession(
      new Request("https://app.drafthr.io/api/draft"),
    );
    expect(noWorkspace?.status).toBe(400);
  });
});
