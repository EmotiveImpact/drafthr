/**
 * GET /api/auth/session — the SPA polls this on every load and uses
 * `activeTenant` to decide whether to send the user to onboarding.
 *
 * Critical regression coverage (#onboarding-bounce): returning users who
 * have memberships but NO row flagged `is_active_tenant=true` were
 * getting bounced to /signup/workspace. The handler now auto-elects a
 * default membership in that case (deterministic — newest joinedAt wins)
 * AND persists the flip so subsequent reads are O(1).
 *
 * We mock `getDb` so the table fixtures are deterministic and we never
 * touch a real Postgres. The mock captures writes so we can assert the
 * transaction-and-flip behaviour.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Shape returned by the handler's select() — note the field is renamed to
 * `isActive` in the projection. Mock must match the renamed shape so that
 * the handler's `.find((m) => m.isActive)` sees the right key.
 */
type ProjectedMembership = {
  tenantId: string;
  role: string;
  isActive: boolean;
  status: string;
  joinedAt: Date;
  tenantName: string | null;
};

type DbWrite =
  | { kind: "update-all"; userId: string; values: Record<string, unknown> }
  | { kind: "update-one"; userId: string; tenantId: string; values: Record<string, unknown> };

const sessionUser = {
  id: "wos_user_42",
  email: "returning@example.com",
  firstName: "Re",
  lastName: "Turning",
  profilePictureUrl: null,
};

const userRow = { id: "user_db_42", externalId: "wos_user_42" };

function makeRequest(): Request {
  return new Request("http://localhost/api/auth/session", {
    method: "GET",
    headers: { Accept: "application/json" },
  });
}

/**
 * Builds a deterministic mock of `getDb()` that returns canned rows and
 * records writes. Order of `select()` calls inside the session handler:
 *   1. users lookup by externalId
 *   2. memberships join
 * Writes happen inside a transaction with two `.update()` calls.
 */
function buildDbMock(opts: {
  userRow: { id: string; externalId: string } | null;
  memberships: ProjectedMembership[];
  writes: DbWrite[];
}) {
  let selectCall = 0;
  return {
    dbEnabled: () => true,
    getDb: () => ({
      select: () => {
        const call = ++selectCall;
        return {
          from: () => ({
            where: () => ({
              limit: () =>
                Promise.resolve(call === 1 ? (opts.userRow ? [opts.userRow] : []) : []),
            }),
            leftJoin: () => ({
              where: () => Promise.resolve(opts.memberships),
            }),
          }),
        };
      },
      transaction: async (fn: (tx: unknown) => unknown) => {
        let currentUserScope: string | null = null;
        let currentTenantScope: string | null = null;
        const tx = {
          update: () => ({
            set: (values: Record<string, unknown>) => ({
              where: () => {
                // We can't easily inspect the WHERE clause; the handler
                // writes in a known order (clear all, then set one). Use
                // call order to disambiguate.
                if (currentUserScope === null) {
                  currentUserScope = opts.userRow?.id ?? "unknown";
                  opts.writes.push({
                    kind: "update-all",
                    userId: currentUserScope,
                    values,
                  });
                } else if (currentTenantScope === null) {
                  currentTenantScope = "set";
                  opts.writes.push({
                    kind: "update-one",
                    userId: currentUserScope,
                    tenantId: "captured-via-handler-order",
                    values,
                  });
                }
                return Promise.resolve();
              },
            }),
          }),
        };
        return fn(tx);
      },
    }),
  };
}

beforeEach(() => {
  vi.doMock("../../../api/_utils/workos", async () => {
    const actual = await vi.importActual<typeof import("../../../api/_utils/workos")>(
      "../../../api/_utils/workos",
    );
    return {
      ...actual,
      getSessionFromRequest: vi.fn().mockResolvedValue({
        user: sessionUser,
        workosSession: "",
        iat: Date.now(),
      }),
    };
  });
});

afterEach(() => {
  vi.resetModules();
  vi.restoreAllMocks();
});

describe("GET /api/auth/session — activeTenant resolution", () => {
  it("returns activeTenant from the row flagged is_active_tenant=true", async () => {
    const memberships: ProjectedMembership[] = [
      {
        tenantId: "tenant_active",
        role: "owner",
        isActive: true,
        status: "active",
        joinedAt: new Date("2025-01-01"),
        tenantName: "Workspace A",
      },
    ];
    const writes: DbWrite[] = [];
    vi.doMock("../../../src/db/index", () => buildDbMock({ userRow, memberships, writes }));

    const mod = await import("../../../api/auth/_handlers/session");
    const res = await mod.GET(makeRequest());
    expect(res.status).toBe(200);
    const data = (await res.json()) as {
      activeTenant: { id: string; name: string; role: string } | null;
      hasAnyTenant: boolean;
    };
    expect(data.activeTenant).toEqual({ id: "tenant_active", name: "Workspace A", role: "owner" });
    expect(data.hasAnyTenant).toBe(true);
    // No writes — the flag was already set.
    expect(writes).toEqual([]);
  });

  it("auto-elects the most-recently-joined membership when none is flagged active (regression #onboarding-bounce)", async () => {
    const memberships: ProjectedMembership[] = [
      {
        tenantId: "tenant_old",
        role: "drafter",
        isActive: false,
        status: "active",
        joinedAt: new Date("2025-01-01"),
        tenantName: "Workspace Old",
      },
      {
        tenantId: "tenant_new",
        role: "owner",
        isActive: false,
        status: "active",
        joinedAt: new Date("2025-06-01"),
        tenantName: "Workspace New",
      },
    ];
    const writes: DbWrite[] = [];
    vi.doMock("../../../src/db/index", () => buildDbMock({ userRow, memberships, writes }));

    const mod = await import("../../../api/auth/_handlers/session");
    const res = await mod.GET(makeRequest());
    expect(res.status).toBe(200);
    const data = (await res.json()) as {
      activeTenant: { id: string; name: string; role: string } | null;
      hasAnyTenant: boolean;
    };
    // Newest joinedAt wins — the user should NOT be bounced to onboarding.
    expect(data.activeTenant).toEqual({
      id: "tenant_new",
      name: "Workspace New",
      role: "owner",
    });
    expect(data.hasAnyTenant).toBe(true);

    // Give the fire-and-forget persist a tick to run.
    await new Promise((r) => setTimeout(r, 0));
    // Persist path runs in a transaction: first clear all, then set one.
    expect(writes.length).toBeGreaterThanOrEqual(2);
    expect(writes[0]).toEqual({
      kind: "update-all",
      userId: userRow.id,
      values: { isActiveTenant: false },
    });
    expect(writes[1].values).toEqual({ isActiveTenant: true });
  });

  it("excludes deprovisioned memberships from hasAnyTenant and auto-election", async () => {
    const memberships: ProjectedMembership[] = [
      {
        tenantId: "tenant_deprovisioned",
        role: "drafter",
        isActive: false,
        status: "deprovisioned",
        joinedAt: new Date("2025-06-01"),
        tenantName: "Deprovisioned Workspace",
      },
    ];
    const writes: DbWrite[] = [];
    vi.doMock("../../../src/db/index", () => buildDbMock({ userRow, memberships, writes }));

    const mod = await import("../../../api/auth/_handlers/session");
    const res = await mod.GET(makeRequest());
    const data = (await res.json()) as {
      activeTenant: { id: string; name: string; role: string } | null;
      hasAnyTenant: boolean;
    };
    expect(data.activeTenant).toBeNull();
    expect(data.hasAnyTenant).toBe(false);
    expect(writes).toEqual([]);
  });

  it("returns activeTenant=null and hasAnyTenant=false when the user has no memberships at all", async () => {
    const writes: DbWrite[] = [];
    vi.doMock("../../../src/db/index", () =>
      buildDbMock({ userRow, memberships: [], writes }),
    );

    const mod = await import("../../../api/auth/_handlers/session");
    const res = await mod.GET(makeRequest());
    const data = (await res.json()) as {
      activeTenant: { id: string; name: string; role: string } | null;
      hasAnyTenant: boolean;
    };
    expect(data.activeTenant).toBeNull();
    expect(data.hasAnyTenant).toBe(false);
  });

  it("returns activeTenant=null + user=null when there is no session", async () => {
    // Override the workos mock to return null.
    vi.doMock("../../../api/_utils/workos", async () => {
      const actual = await vi.importActual<typeof import("../../../api/_utils/workos")>(
        "../../../api/_utils/workos",
      );
      return { ...actual, getSessionFromRequest: vi.fn().mockResolvedValue(null) };
    });
    vi.doMock("../../../src/db/index", () => ({
      dbEnabled: () => true,
      getDb: () => {
        throw new Error("should not be called");
      },
    }));

    const mod = await import("../../../api/auth/_handlers/session");
    const res = await mod.GET(makeRequest());
    expect(res.status).toBe(200);
    const data = (await res.json()) as {
      user: unknown;
      activeTenant: unknown;
      hasAnyTenant: boolean;
    };
    expect(data.user).toBeNull();
    expect(data.activeTenant).toBeNull();
    expect(data.hasAnyTenant).toBe(false);
  });

  it("uses tenant_id as a deterministic tiebreaker when two memberships share joinedAt", async () => {
    const sameDate = new Date("2025-03-15T12:00:00Z");
    const memberships: ProjectedMembership[] = [
      {
        tenantId: "tenant_zzz",
        role: "drafter",
        isActive: false,
        status: "active",
        joinedAt: sameDate,
        tenantName: "Workspace Z",
      },
      {
        tenantId: "tenant_aaa",
        role: "owner",
        isActive: false,
        status: "active",
        joinedAt: sameDate,
        tenantName: "Workspace A",
      },
    ];
    const writes: DbWrite[] = [];
    vi.doMock("../../../src/db/index", () => buildDbMock({ userRow, memberships, writes }));

    const mod = await import("../../../api/auth/_handlers/session");
    const res = await mod.GET(makeRequest());
    const data = (await res.json()) as {
      activeTenant: { id: string } | null;
    };
    // tenant_aaa < tenant_zzz, so aaa wins the tie.
    expect(data.activeTenant?.id).toBe("tenant_aaa");
  });
});
