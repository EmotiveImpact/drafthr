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

  it("does not require auth outside production", async () => {
    vi.stubEnv("NODE_ENV", "development");

    await expect(enforceProductionSession(new Request("http://localhost/api/draft"))).resolves.toBeNull();
    expect(requireSessionAndTenantMock).not.toHaveBeenCalled();
  });

  it("allows production requests with an active workspace", async () => {
    vi.stubEnv("NODE_ENV", "production");
    requireSessionAndTenantMock.mockResolvedValue({
      ok: true,
      activeTenant: { id: "tenant_1" },
    });

    await expect(enforceProductionSession(new Request("https://app.drafthr.io/api/draft"))).resolves.toBeNull();
  });

  it("rejects production requests without a valid session or workspace", async () => {
    vi.stubEnv("NODE_ENV", "production");
    requireSessionAndTenantMock.mockResolvedValueOnce({
      ok: false,
      response: new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401 }),
    });

    const unauthenticated = await enforceProductionSession(new Request("https://app.drafthr.io/api/draft"));
    expect(unauthenticated?.status).toBe(401);

    requireSessionAndTenantMock.mockResolvedValueOnce({
      ok: true,
      activeTenant: null,
    });

    const noWorkspace = await enforceProductionSession(new Request("https://app.drafthr.io/api/draft"));
    expect(noWorkspace?.status).toBe(400);
  });
});
