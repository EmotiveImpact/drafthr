/**
 * Directory webhook handler tests.
 *
 * Strategy: mock the WorkOS SDK (signature verification) and swap the Drizzle
 * DirectoryStore for the in-memory one, so the real provisioning policy runs
 * end to end against staged state without a network or Postgres.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  createMemoryDirectoryStore,
  createMemoryState,
  type MemoryState,
} from "../../_utils/directory-store.memory.js";

const constructEventMock = vi.fn();
vi.mock("../../_utils/workos.js", () => ({
  getWorkos: () => ({
    webhooks: { constructEvent: constructEventMock },
  }),
}));

const holder = vi.hoisted(() => ({ state: null as unknown }));
vi.mock("../../_utils/directory-store.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../_utils/directory-store.js")>();
  return {
    ...actual,
    createDrizzleDirectoryStore: () => createMemoryDirectoryStore(holder.state as MemoryState),
  };
});

let state: MemoryState;

async function loadHandler() {
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

function dirUser(over: Record<string, unknown> = {}) {
  return {
    id: "dir_user_1",
    directoryId: "directory_1",
    organizationId: "org_123",
    email: "jane@acme.com",
    firstName: "Jane",
    lastName: "Patel",
    state: "active",
    role: { slug: "drafter" },
    ...over,
  };
}

describe("POST /api/workos/directory-webhook", () => {
  beforeEach(() => {
    state = createMemoryState();
    holder.state = state;
    constructEventMock.mockReset();
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
    vi.spyOn(console, "warn").mockImplementation(() => {});
    const { POST } = await loadHandler();
    const res = await POST(makeRequest({ event: "dsync.user.created", data: {} }));
    expect(res.status).toBe(400);
    const body = (await res.json()) as { error: string };
    expect(body.error).toMatch(/invalid signature/i);
  });

  it("acknowledges unknown event types without processing", async () => {
    constructEventMock.mockResolvedValueOnce({ id: "evt_1", event: "dsync.fake.something", data: {} });
    const { POST } = await loadHandler();
    const res = await POST(makeRequest({}));
    expect(res.status).toBe(200);
    expect(state.users).toHaveLength(0);
    expect(state.audit).toHaveLength(0);
  });

  it("provisions a new user on dsync.user.created with role mapping + audit event", async () => {
    state.tenants.push({ id: "tenant_1", workosOrgId: "org_123" });
    constructEventMock.mockResolvedValueOnce({
      id: "evt_1",
      event: "dsync.user.created",
      data: dirUser({ role: { slug: "admin" } }),
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
    expect(state.members[0]).toMatchObject({ tenantId: "tenant_1", role: "admin", isActiveTenant: true });
    expect(state.audit).toContainEqual(
      expect.objectContaining({ kind: "directory.user.provisioned", tenantId: "tenant_1" }),
    );
  });

  it("is idempotent: re-delivering the same dsync.user.created doesn't dupe the user row", async () => {
    state.tenants.push({ id: "tenant_1", workosOrgId: "org_123" });
    constructEventMock.mockResolvedValue({ id: "evt_1", event: "dsync.user.created", data: dirUser() });

    const { POST } = await loadHandler();
    await POST(makeRequest({}));
    await POST(makeRequest({}));

    expect(state.users).toHaveLength(1);
    expect(state.members).toHaveLength(1);
    // Audit appended once per delivery; the second matched the existing row.
    expect(state.audit.map((a) => a.kind)).toEqual([
      "directory.user.provisioned",
      "directory.user.role_changed",
    ]);
  });

  it("joins as INACTIVE when the user is already active in another tenant", async () => {
    state.tenants.push({ id: "tenant_1", workosOrgId: "org_acme" });
    state.tenants.push({ id: "tenant_2", workosOrgId: "org_globex" });
    // Jane is already a member of BOTH tenants (e.g. invited to Globex) and
    // active in Acme.
    state.users.push({
      id: "user_existing",
      email: "jane@acme.com",
      legalName: "Jane Patel",
      workosDirectoryUserId: null,
      workosDirectoryId: null,
      externalId: "user_01WORKOS",
      tenantId: "tenant_1",
    });
    state.members.push(
      { userId: "user_existing", tenantId: "tenant_1", role: "admin", status: "active", deprovisionedAt: null, isActiveTenant: true },
      { userId: "user_existing", tenantId: "tenant_2", role: "viewer", status: "deprovisioned", deprovisionedAt: new Date(), isActiveTenant: false },
    );

    constructEventMock.mockResolvedValueOnce({
      id: "evt_x",
      event: "dsync.user.created",
      data: dirUser({ id: "dir_user_z", directoryId: "directory_2", organizationId: "org_globex" }),
    });

    const { POST } = await loadHandler();
    expect((await POST(makeRequest({}))).status).toBe(200);

    const globex = state.members.find((m) => m.tenantId === "tenant_2");
    expect(globex).toMatchObject({ status: "active", isActiveTenant: false, role: "drafter" });
    expect(state.members.find((m) => m.tenantId === "tenant_1")?.isActiveTenant).toBe(true);
  });

  it("joins as ACTIVE when the user has no existing active membership", async () => {
    state.tenants.push({ id: "tenant_1", workosOrgId: "org_123" });
    constructEventMock.mockResolvedValueOnce({
      id: "evt_y",
      event: "dsync.user.created",
      data: dirUser({ email: "newhire@acme.com" }),
    });

    const { POST } = await loadHandler();
    await POST(makeRequest({}));
    expect(state.members.find((m) => m.tenantId === "tenant_1")?.isActiveTenant).toBe(true);
  });

  it("soft-deletes the membership on dsync.user.deleted", async () => {
    state.tenants.push({ id: "tenant_1", workosOrgId: "org_123" });
    state.users.push({
      id: "user_pre",
      email: "jane@acme.com",
      legalName: "Jane Patel",
      workosDirectoryUserId: "dir_user_1",
      workosDirectoryId: "directory_1",
      externalId: "dsync:dir_user_1",
      tenantId: "tenant_1",
    });
    state.members.push({ userId: "user_pre", tenantId: "tenant_1", role: "admin", status: "active", deprovisionedAt: null, isActiveTenant: true });
    vi.spyOn(console, "error").mockImplementation(() => {});

    constructEventMock.mockResolvedValueOnce({
      id: "evt_2",
      event: "dsync.user.deleted",
      data: dirUser({ state: "inactive" }),
    });

    const { POST } = await loadHandler();
    expect((await POST(makeRequest({}))).status).toBe(200);
    expect(state.users).toHaveLength(1);
    expect(state.members[0].status).toBe("deprovisioned");
    expect(state.members[0].deprovisionedAt).toBeInstanceOf(Date);
    expect(state.audit).toContainEqual(expect.objectContaining({ kind: "directory.user.deprovisioned" }));
  });

  it("soft-deletes on dsync.group.user_removed", async () => {
    state.tenants.push({ id: "tenant_1", workosOrgId: "org_123" });
    state.users.push({
      id: "user_pre",
      email: "alex@acme.com",
      legalName: "Alex",
      workosDirectoryUserId: "dir_user_alex",
      workosDirectoryId: "directory_1",
      externalId: "dsync:dir_user_alex",
      tenantId: "tenant_1",
    });
    state.members.push({ userId: "user_pre", tenantId: "tenant_1", role: "drafter", status: "active", deprovisionedAt: null, isActiveTenant: true });
    vi.spyOn(console, "error").mockImplementation(() => {});

    constructEventMock.mockResolvedValueOnce({
      id: "evt_3",
      event: "dsync.group.user_removed",
      data: {
        directoryId: "directory_1",
        user: dirUser({ id: "dir_user_alex", email: "alex@acme.com", firstName: "Alex", lastName: null }),
        group: { id: "group_1", name: "HR", directoryId: "directory_1", organizationId: "org_123" },
      },
    });

    const { POST } = await loadHandler();
    await POST(makeRequest({}));
    expect(state.members[0].status).toBe("deprovisioned");
    expect(state.audit).toContainEqual(expect.objectContaining({ kind: "directory.user.group_removed" }));
  });

  it("acknowledges (no-op) when the workos org id has no matching tenant", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    constructEventMock.mockResolvedValueOnce({
      id: "evt_orphan",
      event: "dsync.user.created",
      data: dirUser({ organizationId: "org_unknown", email: "ghost@example.com" }),
    });

    const { POST } = await loadHandler();
    expect((await POST(makeRequest({}))).status).toBe(200);
    expect(state.users).toHaveLength(0);
    expect(state.members).toHaveLength(0);
    expect(state.audit).toHaveLength(0);
  });
});
