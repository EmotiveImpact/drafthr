/**
 * Directory webhook handler tests.
 *
 * Strategy: mock the WorkOS SDK and the Drizzle db client at the module
 * boundary so we never touch the network or a real Postgres. Each test
 * stages the fake db state (tenants by org id, users by directory id /
 * email) and inspects which inserts / updates the handler issued.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// --- WorkOS SDK mock ---------------------------------------------------------
const constructEventMock = vi.fn();
vi.mock("../../_utils/workos.js", () => ({
  getWorkos: () => ({
    webhooks: { constructEvent: constructEventMock },
  }),
}));

// --- audit append mock -------------------------------------------------------
const appendAuditEventMock = vi.fn(async () => ({
  id: "audit_1",
  rowHash: "0".repeat(64),
  prevHash: "0".repeat(64),
  createdAt: new Date(),
}));
vi.mock("../../../src/db/audit.js", () => ({
  appendAuditEvent: appendAuditEventMock,
}));

// --- Drizzle client mock -----------------------------------------------------
// We hand-build a chainable query object that matches the small slice of the
// Drizzle API the handler actually uses: select().from().where().limit(),
// insert().values().returning() / .onConflictDoUpdate(), update().set().where().
// Per-test state lives on the `state` object exported below; tests reset and
// stage it explicitly.

type FakeTenantRow = {
  id: string;
  name: string;
  workosOrgId: string | null;
};

type FakeUserRow = {
  id: string;
  email: string | null;
  legalName: string | null;
  workosDirectoryUserId: string | null;
  workosDirectoryId: string | null;
  externalId: string;
  tenantId: string | null;
};

type FakeMemberRow = {
  userId: string;
  tenantId: string;
  role: string;
  status: string;
  deprovisionedAt: Date | null;
  isActiveTenant: boolean;
};

type FakeState = {
  tenants: FakeTenantRow[];
  users: FakeUserRow[];
  members: FakeMemberRow[];
  inserts: { table: string; values: Record<string, unknown> }[];
  updates: { table: string; set: Record<string, unknown>; where: string }[];
  upserts: { table: string; values: Record<string, unknown>; set: Record<string, unknown> }[];
};

const state: FakeState = {
  tenants: [],
  users: [],
  members: [],
  inserts: [],
  updates: [],
  upserts: [],
};

function resetState() {
  state.tenants = [];
  state.users = [];
  state.members = [];
  state.inserts = [];
  state.updates = [];
  state.upserts = [];
}

vi.mock("../../../src/db/index.js", () => {
  // Each call site uses the column ref as an opaque object — we don't read it,
  // we just look for the column NAMES the handler passes to eq().
  function makeSelectBuilder(table: string) {
    return {
      from: (_t: unknown) => ({
        where: (predicate: {
          __col: string;
          __val: unknown;
          __preds?: Record<string, unknown>;
        }) => ({
          limit: (_n: number) => {
            if (table === "tenants" && predicate.__col === "workos_org_id") {
              const found = state.tenants.find((t) => t.workosOrgId === predicate.__val);
              return Promise.resolve(found ? [found] : []);
            }
            if (table === "users") {
              if (predicate.__col === "workos_directory_user_id") {
                const found = state.users.find((u) => u.workosDirectoryUserId === predicate.__val);
                return Promise.resolve(found ? [found] : []);
              }
              if (predicate.__col === "email") {
                const found = state.users.find(
                  (u) => (u.email ?? "").toLowerCase() === String(predicate.__val ?? "").toLowerCase(),
                );
                return Promise.resolve(found ? [found] : []);
              }
            }
            // "does this user already have an active membership anywhere?"
            //   select().from(tenant_members).where(and(userId=?, isActiveTenant=true))
            if (table === "tenant_members" && predicate.__col === "__and__") {
              const userId = (predicate.__val as { userId?: string }).userId;
              const wantActive = predicate.__preds?.["is_active_tenant"] === true;
              const found = state.members.find(
                (m) => m.userId === userId && (!wantActive || m.isActiveTenant),
              );
              return Promise.resolve(found ? [found] : []);
            }
            return Promise.resolve([]);
          },
        }),
      }),
    };
  }

  function makeInsertBuilder(table: string) {
    return {
      values: (values: Record<string, unknown>) => {
        const apply = () => {
          if (table === "users") {
            const row: FakeUserRow = {
              id: `user_${state.users.length + 1}`,
              email: (values.email as string) ?? null,
              legalName: (values.legalName as string) ?? null,
              workosDirectoryUserId: (values.workosDirectoryUserId as string) ?? null,
              workosDirectoryId: (values.workosDirectoryId as string) ?? null,
              externalId: (values.externalId as string) ?? "",
              tenantId: (values.tenantId as string) ?? null,
            };
            state.users.push(row);
            return row;
          }
          if (table === "tenant_members") {
            const row: FakeMemberRow = {
              userId: values.userId as string,
              tenantId: values.tenantId as string,
              role: (values.role as string) ?? "drafter",
              status: (values.status as string) ?? "active",
              deprovisionedAt: (values.deprovisionedAt as Date | null) ?? null,
              isActiveTenant: Boolean(values.isActiveTenant ?? false),
            };
            state.members.push(row);
            return row;
          }
          return {};
        };

        const row = apply();
        state.inserts.push({ table, values });
        return {
          returning: () => Promise.resolve([row]),
          onConflictDoUpdate: ({ set }: { set: Record<string, unknown> }) => {
            state.upserts.push({ table, values, set });
            // Apply the conflict update if a matching row exists.
            if (table === "tenant_members") {
              const existing = state.members.find(
                (m) => m.userId === values.userId && m.tenantId === values.tenantId,
              );
              if (existing) {
                Object.assign(existing, set);
              }
            }
            return Promise.resolve();
          },
        };
      },
    };
  }

  function makeUpdateBuilder(table: string) {
    return {
      set: (patch: Record<string, unknown>) => ({
        where: (predicate: { __col: string; __val: unknown }) => {
          state.updates.push({ table, set: patch, where: String(predicate.__col) });
          if (table === "users" && predicate.__col === "id") {
            const u = state.users.find((row) => row.id === predicate.__val);
            if (u) Object.assign(u, patch);
            return {
              returning: () => Promise.resolve(u ? [u] : []),
            };
          }
          if (table === "tenant_members" && predicate.__col === "__and__") {
            const matches = state.members.filter(
              (m) => m.userId === (predicate.__val as { userId: string }).userId
                && m.tenantId === (predicate.__val as { tenantId: string }).tenantId,
            );
            matches.forEach((m) => Object.assign(m, patch));
            return Promise.resolve();
          }
          return Promise.resolve();
        },
      }),
    };
  }

  const tablesByRef = new WeakMap<object, string>();
  return {
    getDb: () => ({
      select: (_cols?: unknown) => ({
        from: (table: { __table: string }) => {
          return makeSelectBuilder(table.__table).from(table);
        },
      }),
      insert: (table: { __table: string }) => makeInsertBuilder(table.__table),
      update: (table: { __table: string }) => makeUpdateBuilder(table.__table),
    }),
    __tablesByRef: tablesByRef,
  };
});

// --- schema mock: columns expose name strings so eq() can stash them ---------
vi.mock("../../../src/db/schema.js", () => {
  const col = (name: string) => ({ __col: name });
  return {
    tenants: {
      __table: "tenants",
      id: col("id"),
      name: col("name"),
      workosOrgId: col("workos_org_id"),
    },
    users: {
      __table: "users",
      id: col("id"),
      email: col("email"),
      tenantId: col("tenant_id"),
      externalId: col("external_id"),
      workosDirectoryUserId: col("workos_directory_user_id"),
      workosDirectoryId: col("workos_directory_id"),
      legalName: col("legal_name"),
    },
    tenantMembers: {
      __table: "tenant_members",
      userId: col("user_id"),
      tenantId: col("tenant_id"),
      role: col("role"),
      isActiveTenant: col("is_active_tenant"),
      status: col("status"),
      deprovisionedAt: col("deprovisioned_at"),
    },
  };
});

// drizzle-orm eq / and — produce predicate descriptors the fake db consumes.
vi.mock("drizzle-orm", () => ({
  eq: (col: { __col: string }, val: unknown) => ({ __col: col.__col, __val: val }),
  and: (...preds: Array<{ __col: string; __val: unknown }>) => {
    // Collapse the eqs into a single predicate the fake builders can read.
    const userIdEq = preds.find((p) => p.__col === "user_id");
    const tenantIdEq = preds.find((p) => p.__col === "tenant_id");
    const byCol: Record<string, unknown> = {};
    for (const p of preds) byCol[p.__col] = p.__val;
    return {
      __col: "__and__",
      __val: { userId: userIdEq?.__val, tenantId: tenantIdEq?.__val },
      __preds: byCol,
    };
  },
}));

// Stub drizzle-orm pg-core so schema.ts can be imported transitively (it
// isn't actually used because schema is fully mocked above, but its import
// graph still pulls in the real module otherwise).
vi.mock("drizzle-orm/pg-core", () => ({
  pgTable: () => ({}),
  text: () => ({}),
  uuid: () => ({}),
  timestamp: () => ({}),
  jsonb: () => ({}),
  integer: () => ({}),
  boolean: () => ({}),
  date: () => ({}),
  index: () => ({}),
  uniqueIndex: () => ({}),
  check: () => ({}),
}));

// --- import after mocks ------------------------------------------------------
async function loadHandler() {
  vi.resetModules();
  return await import("./directory-webhook.js");
}

function makeRequest(body: unknown, signature: string | null = "t=123,v1=abc"): Request {
  const init: RequestInit = {
    method: "POST",
    body: JSON.stringify(body),
    headers: signature
      ? { "Content-Type": "application/json", "workos-signature": signature }
      : { "Content-Type": "application/json" },
  };
  return new Request("https://app.drafthr.io/api/workos/directory-webhook", init);
}

describe("POST /api/workos/directory-webhook", () => {
  beforeEach(() => {
    resetState();
    constructEventMock.mockReset();
    appendAuditEventMock.mockClear();
    process.env.WORKOS_WEBHOOK_SECRET = "whsec_test_super_secret_value";
  });

  afterEach(() => {
    delete process.env.WORKOS_WEBHOOK_SECRET;
  });

  it("returns 503 when WORKOS_WEBHOOK_SECRET is missing", async () => {
    delete process.env.WORKOS_WEBHOOK_SECRET;
    const { POST } = await loadHandler();
    const res = await POST(makeRequest({ event: "dsync.user.created", data: {} }));
    expect(res.status).toBe(503);
  });

  it("returns 400 when WorkOS-Signature header is missing", async () => {
    const { POST } = await loadHandler();
    const res = await POST(makeRequest({ event: "dsync.user.created", data: {} }, null));
    expect(res.status).toBe(400);
  });

  it("returns 400 on signature verification failure", async () => {
    constructEventMock.mockRejectedValueOnce(new Error("signature mismatch"));
    const { POST } = await loadHandler();
    const res = await POST(makeRequest({ event: "dsync.user.created", data: {} }));
    expect(res.status).toBe(400);
    const body = (await res.json()) as { error: string };
    expect(body.error).toMatch(/invalid signature/i);
  });

  it("acknowledges unknown event types without processing", async () => {
    constructEventMock.mockResolvedValueOnce({
      id: "evt_1",
      event: "dsync.fake.something",
      data: {},
    });
    const { POST } = await loadHandler();
    const res = await POST(makeRequest({ event: "dsync.fake.something", data: {} }));
    expect(res.status).toBe(200);
    expect(state.inserts).toHaveLength(0);
    expect(appendAuditEventMock).not.toHaveBeenCalled();
  });

  it("provisions a new user on dsync.user.created with role mapping + audit event", async () => {
    state.tenants.push({ id: "tenant_1", name: "Acme", workosOrgId: "org_123" });

    constructEventMock.mockResolvedValueOnce({
      id: "evt_1",
      event: "dsync.user.created",
      data: {
        id: "dir_user_1",
        directoryId: "directory_1",
        organizationId: "org_123",
        email: "jane@acme.com",
        firstName: "Jane",
        lastName: "Patel",
        state: "active",
        role: { slug: "admin" },
      },
    });

    const { POST } = await loadHandler();
    const res = await POST(makeRequest({}));
    expect(res.status).toBe(200);

    expect(state.users).toHaveLength(1);
    expect(state.users[0]).toMatchObject({
      email: "jane@acme.com",
      legalName: "Jane Patel",
      workosDirectoryUserId: "dir_user_1",
      workosDirectoryId: "directory_1",
      externalId: "dsync:dir_user_1",
    });
    // Membership upserted as admin
    expect(state.inserts.find((i) => i.table === "tenant_members")?.values.role).toBe("admin");
    expect(appendAuditEventMock).toHaveBeenCalledWith(
      expect.objectContaining({ kind: "directory.user.provisioned", tenantId: "tenant_1" }),
    );
  });

  it("is idempotent — re-delivering the same dsync.user.created doesn't dupe the user row", async () => {
    state.tenants.push({ id: "tenant_1", name: "Acme", workosOrgId: "org_123" });

    constructEventMock.mockResolvedValue({
      id: "evt_1",
      event: "dsync.user.created",
      data: {
        id: "dir_user_1",
        directoryId: "directory_1",
        organizationId: "org_123",
        email: "jane@acme.com",
        firstName: "Jane",
        lastName: "Patel",
        state: "active",
        role: { slug: "drafter" },
      },
    });

    const { POST } = await loadHandler();
    await POST(makeRequest({}));
    await POST(makeRequest({}));

    expect(state.users).toHaveLength(1);
    // Second delivery should have hit the update path, not insert
    expect(state.updates.filter((u) => u.table === "users")).toHaveLength(1);
    // Audit appended once per delivery (good — the audit chain is the
    // record of what we observed, including re-delivery).
    expect(appendAuditEventMock).toHaveBeenCalledTimes(2);
    // Both audit events are role_changed because the second delivery
    // matched the existing user via workos_directory_user_id and went
    // through the "existing" branch.
    const secondCallArgs = appendAuditEventMock.mock.calls[1] as unknown as [Record<string, unknown>];
    expect(secondCallArgs[0]).toMatchObject({
      kind: "directory.user.role_changed",
    });
  });

  it("joins as INACTIVE when an email-matched user is already active in another tenant", async () => {
    // Existing user (matched by email, no directory id yet) active in tenant_1.
    state.tenants.push({ id: "tenant_1", name: "Acme", workosOrgId: "org_acme" });
    state.tenants.push({ id: "tenant_2", name: "Globex", workosOrgId: "org_globex" });
    state.users.push({
      id: "user_existing",
      email: "jane@acme.com",
      legalName: "Jane Patel",
      workosDirectoryUserId: null,
      workosDirectoryId: null,
      externalId: "authkit:jane",
      tenantId: "tenant_1",
    });
    state.members.push({
      userId: "user_existing",
      tenantId: "tenant_1",
      role: "admin",
      status: "active",
      deprovisionedAt: null,
      isActiveTenant: true,
    });

    // A directory webhook provisions the same person (by email) into tenant_2.
    constructEventMock.mockResolvedValueOnce({
      id: "evt_x",
      event: "dsync.user.created",
      data: {
        id: "dir_user_z",
        directoryId: "directory_2",
        organizationId: "org_globex",
        email: "jane@acme.com",
        firstName: "Jane",
        lastName: "Patel",
        state: "active",
        role: { slug: "drafter" },
      },
    });

    const { POST } = await loadHandler();
    const res = await POST(makeRequest({}));
    expect(res.status).toBe(200);

    // The new tenant_2 membership must NOT be active — that would leave the
    // user with two active memberships and silently switch their workspace.
    const newMember = state.members.find((m) => m.tenantId === "tenant_2");
    expect(newMember?.isActiveTenant).toBe(false);
    // The user's original active tenant is left untouched.
    expect(
      state.members.find((m) => m.tenantId === "tenant_1")?.isActiveTenant,
    ).toBe(true);
  });

  it("joins as ACTIVE when the user has no existing active membership", async () => {
    state.tenants.push({ id: "tenant_1", name: "Acme", workosOrgId: "org_123" });
    constructEventMock.mockResolvedValueOnce({
      id: "evt_y",
      event: "dsync.user.created",
      data: {
        id: "dir_user_1",
        directoryId: "directory_1",
        organizationId: "org_123",
        email: "newhire@acme.com",
        firstName: "New",
        lastName: "Hire",
        state: "active",
        role: { slug: "drafter" },
      },
    });

    const { POST } = await loadHandler();
    await POST(makeRequest({}));

    const member = state.members.find((m) => m.tenantId === "tenant_1");
    expect(member?.isActiveTenant).toBe(true);
  });

  it("soft-deletes the membership on dsync.user.deleted", async () => {
    state.tenants.push({ id: "tenant_1", name: "Acme", workosOrgId: "org_123" });
    state.users.push({
      id: "user_pre",
      email: "jane@acme.com",
      legalName: "Jane Patel",
      workosDirectoryUserId: "dir_user_1",
      workosDirectoryId: "directory_1",
      externalId: "dsync:dir_user_1",
      tenantId: "tenant_1",
    });
    state.members.push({
      userId: "user_pre",
      tenantId: "tenant_1",
      role: "admin",
      status: "active",
      deprovisionedAt: null,
      isActiveTenant: true,
    });

    constructEventMock.mockResolvedValueOnce({
      id: "evt_2",
      event: "dsync.user.deleted",
      data: {
        id: "dir_user_1",
        directoryId: "directory_1",
        organizationId: "org_123",
        email: "jane@acme.com",
        firstName: "Jane",
        lastName: "Patel",
        state: "inactive",
      },
    });

    const { POST } = await loadHandler();
    const res = await POST(makeRequest({}));
    expect(res.status).toBe(200);
    // User row stays — soft-delete only touches membership status.
    expect(state.users).toHaveLength(1);
    expect(state.members[0].status).toBe("deprovisioned");
    expect(state.members[0].deprovisionedAt).toBeInstanceOf(Date);
    expect(appendAuditEventMock).toHaveBeenCalledWith(
      expect.objectContaining({ kind: "directory.user.deprovisioned" }),
    );
  });

  it("soft-deletes on dsync.group.user_removed", async () => {
    state.tenants.push({ id: "tenant_1", name: "Acme", workosOrgId: "org_123" });
    state.users.push({
      id: "user_pre",
      email: "alex@acme.com",
      legalName: "Alex",
      workosDirectoryUserId: "dir_user_alex",
      workosDirectoryId: "directory_1",
      externalId: "dsync:dir_user_alex",
      tenantId: "tenant_1",
    });
    state.members.push({
      userId: "user_pre",
      tenantId: "tenant_1",
      role: "drafter",
      status: "active",
      deprovisionedAt: null,
      isActiveTenant: true,
    });

    constructEventMock.mockResolvedValueOnce({
      id: "evt_3",
      event: "dsync.group.user_removed",
      data: {
        directoryId: "directory_1",
        user: {
          id: "dir_user_alex",
          directoryId: "directory_1",
          organizationId: "org_123",
          email: "alex@acme.com",
          firstName: "Alex",
          lastName: null,
          state: "active",
        },
        group: {
          id: "group_1",
          name: "HR",
          directoryId: "directory_1",
          organizationId: "org_123",
        },
      },
    });

    const { POST } = await loadHandler();
    await POST(makeRequest({}));
    expect(state.members[0].status).toBe("deprovisioned");
    expect(appendAuditEventMock).toHaveBeenCalledWith(
      expect.objectContaining({ kind: "directory.user.group_removed" }),
    );
  });

  it("acknowledges (no-op) when the workos org id has no matching tenant — never mutates state", async () => {
    // No tenants staged
    constructEventMock.mockResolvedValueOnce({
      id: "evt_orphan",
      event: "dsync.user.created",
      data: {
        id: "dir_user_orphan",
        directoryId: "directory_1",
        organizationId: "org_unknown",
        email: "ghost@example.com",
        firstName: "Ghost",
        lastName: null,
        state: "active",
      },
    });

    const { POST } = await loadHandler();
    const res = await POST(makeRequest({}));
    expect(res.status).toBe(200);
    expect(state.users).toHaveLength(0);
    expect(state.members).toHaveLength(0);
    expect(appendAuditEventMock).not.toHaveBeenCalled();
  });
});
