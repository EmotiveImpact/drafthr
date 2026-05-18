/**
 * /api/workos/audit-logs-test — happy path + auth/config guards.
 * Mocks the session helper, the audit-append writer, and the sink env gate
 * so the handler runs deterministically without a real Postgres or WorkOS.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const session = {
  user: {
    id: "wos_user_1",
    email: "alice@example.com",
    firstName: "Alice",
    lastName: null,
    profilePictureUrl: null,
  },
  workosSession: "",
  iat: Date.now(),
};

const userRow = { id: "user_db_1", email: "alice@example.com" };

function makeRequest(): Request {
  return new Request("http://localhost/api/workos/audit-logs-test", {
    method: "POST",
    headers: { "Content-Type": "application/json", origin: "https://app.drafthr.io" },
  });
}

beforeEach(() => {
  process.env.NODE_ENV = "development";
  process.env.WORKOS_AUDIT_LOGS_ENABLED = "true";
});

afterEach(() => {
  vi.resetModules();
  vi.clearAllMocks();
  delete process.env.WORKOS_AUDIT_LOGS_ENABLED;
});

function mockSessionAs(role: string, workosOrgId: string | null = "org_test_123"): void {
  vi.doMock("../../_utils/session-with-tenant", () => ({
    requireSessionAndTenant: vi.fn().mockResolvedValue({
      ok: true,
      session,
      userRow,
      activeTenant: { id: "tenant_aaa", name: "Acme", workosOrgId },
      activeMember: { role },
      userType: "customer",
      canCreateTenant: true,
    }),
  }));
}

describe("POST /api/workos/audit-logs-test", () => {
  it("returns 200 + writes a chain row + reports the audit_event id (admin)", async () => {
    mockSessionAs("admin");
    const append = vi.fn().mockResolvedValue({
      id: "audit_evt_abc",
      rowHash: "h",
      prevHash: "0",
      createdAt: new Date("2026-05-18T12:00:00Z"),
    });
    vi.doMock("../../../src/db/audit", () => ({
      appendAuditEvent: append,
      GENESIS_PREV_HASH: "0".repeat(64),
    }));

    const { POST } = await import("./audit-logs-test");
    const res = await POST(makeRequest());

    expect(res.status).toBe(200);
    const body = (await res.json()) as { ok: boolean; auditEventId: string };
    expect(body.ok).toBe(true);
    expect(body.auditEventId).toBe("audit_evt_abc");

    expect(append).toHaveBeenCalledTimes(1);
    const call = append.mock.calls[0][0];
    expect(call.tenantId).toBe("tenant_aaa");
    expect(call.kind).toBe("audit.test_event");
    expect(call.subjectType).toBe("audit");
    expect(call.actorUserId).toBe("user_db_1");
    expect(call.payload.source).toBe("settings_ui");
  });

  it("403s for non-admin members", async () => {
    mockSessionAs("drafter");
    vi.doMock("../../../src/db/audit", () => ({
      appendAuditEvent: vi.fn(),
      GENESIS_PREV_HASH: "0".repeat(64),
    }));

    const { POST } = await import("./audit-logs-test");
    const res = await POST(makeRequest());
    expect(res.status).toBe(403);
  });

  it("409s when the tenant has no workos_org_id", async () => {
    mockSessionAs("admin", null);
    vi.doMock("../../../src/db/audit", () => ({
      appendAuditEvent: vi.fn(),
      GENESIS_PREV_HASH: "0".repeat(64),
    }));

    const { POST } = await import("./audit-logs-test");
    const res = await POST(makeRequest());
    expect(res.status).toBe(409);
  });

  it("503s when WORKOS_AUDIT_LOGS_ENABLED is not 'true' on the deployment", async () => {
    delete process.env.WORKOS_AUDIT_LOGS_ENABLED;
    mockSessionAs("admin");
    vi.doMock("../../../src/db/audit", () => ({
      appendAuditEvent: vi.fn(),
      GENESIS_PREV_HASH: "0".repeat(64),
    }));

    const { POST } = await import("./audit-logs-test");
    const res = await POST(makeRequest());
    expect(res.status).toBe(503);
  });

  it("returns 401 when the session is missing (no tenant lookup happens)", async () => {
    vi.doMock("../../_utils/session-with-tenant", () => ({
      requireSessionAndTenant: vi.fn().mockResolvedValue({
        ok: false,
        response: new Response(JSON.stringify({ error: "Unauthorized" }), {
          status: 401,
          headers: { "Content-Type": "application/json" },
        }),
      }),
    }));
    vi.doMock("../../../src/db/audit", () => ({
      appendAuditEvent: vi.fn(),
      GENESIS_PREV_HASH: "0".repeat(64),
    }));

    const { POST } = await import("./audit-logs-test");
    const res = await POST(makeRequest());
    expect(res.status).toBe(401);
  });
});
