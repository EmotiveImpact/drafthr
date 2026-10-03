import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
const mocked = vi.hoisted(() => ({ session: vi.fn(), provider: vi.fn(), append: vi.fn(), db: vi.fn() }));
vi.mock("../../_utils/session-with-tenant", () => ({ requireSessionAndTenant: mocked.session }));
vi.mock("../../_utils/rate-limit", () => ({ rateLimit: vi.fn().mockResolvedValue(null) }));
vi.mock("../../_utils/workos", () => ({ getWorkos: mocked.provider }));
vi.mock("../../../src/db/audit", () => ({ appendAuditEvent: mocked.append }));
vi.mock("../../../src/db/index", () => ({ getDb: mocked.db }));
import { POST as portal } from "./portal-link";
import { POST as testEvent } from "./audit-logs-test";
import { GET as status } from "./audit-logs-status";
import { enforceWorkspacePin } from "../../_utils/workspace-pin";

describe("WorkOS settings scope pins", () => {
  beforeEach(() => {
    mocked.session.mockResolvedValue({ ok: true, activeTenant: { id: "tenant_new", workosOrgId: "org_new" },
      activeMember: { role: "admin" }, session: { user: { id: "account_new" } }, userRow: { id: "db_user" } });
  });
  afterEach(() => vi.clearAllMocks());

  it.each([
    ["status", status, "GET"], ["test event", testEvent, "POST"], ["portal", portal, "POST"],
  ] as const)("rejects a stale workspace before %s reads or side effects", async (_name, handler, method) => {
    const response = await handler(new Request("https://app.drafthr.io/api/workos/action", { method,
      headers: { Origin: "https://app.drafthr.io", "Content-Type": "application/json", "X-Workspace-ID": "tenant_old" },
      ...(method === "POST" ? { body: JSON.stringify({ intent: "audit_logs" }) } : {}),
    }));
    expect(response.status).toBe(409);
    expect(await response.json()).toMatchObject({ code: "workspace_changed" });
    expect(mocked.provider).not.toHaveBeenCalled();
    expect(mocked.append).not.toHaveBeenCalled();
    expect(mocked.db).not.toHaveBeenCalled();
  });

  it("rejects another account even when it has the same active workspace", () => {
    expect(enforceWorkspacePin(new Request("https://example.test", { headers: { "X-Workspace-ID": "tenant_new", "X-Account-ID": "account_old" } }), "tenant_new", "account_new")?.status).toBe(409);
  });
  it("accepts matching pins and retains compatibility for older unpinned callers", () => {
    expect(enforceWorkspacePin(new Request("https://example.test", { headers: { "X-Workspace-ID": "tenant_new", "X-Account-ID": "account_new" } }), "tenant_new", "account_new")).toBeNull();
    expect(enforceWorkspacePin(new Request("https://example.test"), "tenant_new", "account_new")).toBeNull();
  });
});
