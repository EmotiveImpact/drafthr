/**
 * Invite-acceptance validation. We mock the DB layer + the session helper so
 * the endpoint logic (expired / revoked / accepted / email-mismatch) can run
 * deterministically without a real Postgres.
 *
 * The endpoint imports `getDb` from `../../src/db` and `requireSession` from
 * `../_utils/workos` — vi.mock both, then drive the POST handler with
 * canned responses.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

type Invite = {
  id: string;
  tenantId: string;
  email: string;
  role: string;
  inviteCode: string;
  expiresAt: Date;
  acceptedAt: Date | null;
  revokedAt: Date | null;
};

const session = {
  user: { id: "wos_user_1", email: "user@example.com", firstName: null, lastName: null, profilePictureUrl: null },
  workosSession: "",
  iat: Date.now(),
};

const inviteFixture: Invite = {
  id: "inv_1",
  tenantId: "tenant_1",
  email: "user@example.com",
  role: "drafter",
  inviteCode: "abc123",
  expiresAt: new Date(Date.now() + 86400_000),
  acceptedAt: null,
  revokedAt: null,
};

let mockInvite: Invite = inviteFixture;
let mockExistingMember: boolean = false;
type DbWrite = { kind: "insert" | "update"; values: Record<string, unknown> };

function makeRequest(body: Record<string, unknown>): Request {
  return new Request("http://localhost/api/workspace/accept-invite", {
    method: "POST",
    headers: { "Content-Type": "application/json", origin: "https://app.drafthr.io" },
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  process.env.NODE_ENV = "development"; // preserve local requests that omit Origin
  mockInvite = { ...inviteFixture };
  mockExistingMember = false;

  vi.doMock("../../../api/_utils/workos", async () => {
    const actual = await vi.importActual<typeof import("../../../api/_utils/workos")>("../../../api/_utils/workos");
    return {
      ...actual,
      requireSession: vi.fn().mockResolvedValue({ ok: true, session }),
    };
  });

  vi.doMock("../../../api/_utils/session-with-tenant", () => ({
    requireSessionAndTenant: vi.fn().mockResolvedValue({
      ok: true,
      session,
      userRow: { id: "user_db_1", email: "user@example.com" },
      activeTenant: null,
      activeMember: null,
      userType: "customer",
      canCreateTenant: true,
    }),
  }));

  vi.doMock("../../../src/db/audit", () => ({
    appendAuditEvent: vi.fn().mockResolvedValue({ id: "ae_1", rowHash: "x", prevHash: "0", createdAt: new Date() }),
    GENESIS_PREV_HASH: "0".repeat(64),
  }));

  vi.doMock("../../../src/db", () => ({
    getDb: () => ({
      select: () => ({
        from: () => ({
          where: () => ({
            limit: () =>
              mockInvite
                ? Promise.resolve([mockInvite])
                : Promise.resolve([]),
          }),
        }),
      }),
      transaction: async (fn: (tx: unknown) => unknown) =>
        fn({
          update: () => ({ set: () => ({ where: () => ({ then: undefined }) }) }),
          insert: () => ({ values: () => Promise.resolve() }),
        }),
    }),
  }));
});

afterEach(() => {
  vi.resetModules();
  vi.restoreAllMocks();
});

describe("POST /api/workspace/accept-invite", () => {
  it("rejects an expired invite", async () => {
    mockInvite = { ...inviteFixture, expiresAt: new Date(Date.now() - 1000) };

    // Override select chain to handle the second query (tenant_members existing).
    vi.doMock("../../../src/db", () => buildDbMock([mockInvite], []));

    const mod = await import("../../../api/workspace/_handlers/accept-invite");
    const res = await mod.POST(makeRequest({ inviteCode: "abc123" }));
    expect(res.status).toBe(410);
    const data = (await res.json()) as { error?: string };
    expect(data.error).toMatch(/expired/i);
  });

  it("rejects a revoked invite", async () => {
    mockInvite = { ...inviteFixture, revokedAt: new Date() };
    vi.doMock("../../../src/db", () => buildDbMock([mockInvite], []));

    const mod = await import("../../../api/workspace/_handlers/accept-invite");
    const res = await mod.POST(makeRequest({ inviteCode: "abc123" }));
    expect(res.status).toBe(410);
  });

  it("rejects an invite already accepted", async () => {
    mockInvite = { ...inviteFixture, acceptedAt: new Date() };
    vi.doMock("../../../src/db", () => buildDbMock([mockInvite], []));

    const mod = await import("../../../api/workspace/_handlers/accept-invite");
    const res = await mod.POST(makeRequest({ inviteCode: "abc123" }));
    expect(res.status).toBe(410);
  });

  it("rejects when the session email doesn't match the invite email", async () => {
    mockInvite = { ...inviteFixture, email: "someone-else@example.com" };
    vi.doMock("../../../src/db", () => buildDbMock([mockInvite], []));

    const mod = await import("../../../api/workspace/_handlers/accept-invite");
    const res = await mod.POST(makeRequest({ inviteCode: "abc123" }));
    expect(res.status).toBe(403);
  });

  it("returns 404 when the invite code is unknown", async () => {
    vi.doMock("../../../src/db", () => buildDbMock([], []));

    const mod = await import("../../../api/workspace/_handlers/accept-invite");
    const res = await mod.POST(makeRequest({ inviteCode: "nope" }));
    expect(res.status).toBe(404);
  });

  it("accepts a valid invite", async () => {
    mockExistingMember = false;
    const writes: DbWrite[] = [];
    vi.doMock("../../../src/db", () => buildDbMock([inviteFixture], [], writes));

    const mod = await import("../../../api/workspace/_handlers/accept-invite");
    const res = await mod.POST(makeRequest({ inviteCode: "abc123" }));
    expect(res.status).toBe(200);
    const data = (await res.json()) as { tenantId?: string; role?: string };
    expect(data.tenantId).toBe("tenant_1");
    expect(data.role).toBe("drafter");
    expect(writes).toEqual(
      expect.arrayContaining([
        { kind: "update", values: { isActiveTenant: false } },
        {
          kind: "insert",
          values: expect.objectContaining({ tenantId: "tenant_1", isActiveTenant: true }),
        },
      ]),
    );
  });

  it("switches an existing membership active when accepting its invite", async () => {
    const writes: DbWrite[] = [];
    vi.doMock("../../../src/db", () =>
      buildDbMock([inviteFixture], [{ userId: "user_db_1" }], writes),
    );

    const mod = await import("../../../api/workspace/_handlers/accept-invite");
    const res = await mod.POST(makeRequest({ inviteCode: "abc123" }));
    expect(res.status).toBe(200);
    // The existing-seat update must FULLY re-activate: isActiveTenant true,
    // status reset to "active", deprovision marker cleared, and the invite's
    // role applied — so accepting a re-invite restores access that the
    // active-status gate (session-with-tenant / switch) would otherwise deny.
    expect(writes).toEqual(
      expect.arrayContaining([
        { kind: "update", values: { isActiveTenant: false } },
        {
          kind: "update",
          values: {
            isActiveTenant: true,
            status: "active",
            deprovisionedAt: null,
            role: inviteFixture.role,
          },
        },
      ]),
    );
  });
});

function buildDbMock(
  inviteRows: Invite[],
  existingMemberRows: { userId: string }[],
  writes: DbWrite[] = [],
) {
  // Sequential `select().from().where().limit()` chains — we return invite
  // on call #1 (invite lookup) and existing-member rows on call #2.
  let call = 0;
  return {
    getDb: () => ({
      select: () => ({
        from: () => ({
          where: () => ({
            limit: () => {
              call += 1;
              if (call === 1) return Promise.resolve(inviteRows);
              return Promise.resolve(existingMemberRows);
            },
          }),
        }),
      }),
      transaction: async (fn: (tx: unknown) => unknown) => {
        const tx = {
          update: () => ({
            set: (values: Record<string, unknown>) => ({
              where: () => {
                writes.push({ kind: "update", values });
                return Promise.resolve();
              },
            }),
          }),
          insert: () => ({
            values: (values: Record<string, unknown>) => {
              writes.push({ kind: "insert", values });
              return Promise.resolve();
            },
          }),
        };
        return fn(tx);
      },
    }),
  };
}

void mockExistingMember; // keep the variable referenced for future cases
