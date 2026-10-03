// @vitest-environment node
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { eq, inArray } from "drizzle-orm";
import { getDb, closeDb } from "../../src/db/index";
import { tenants, users, tenantMembers, matters } from "../../src/db/schema";
import { ensureLocalUser } from "./local-identity";
import type { SessionPayload } from "./workos";

const provider = vi.hoisted(() => ({ memberships: vi.fn(), directoryUser: vi.fn() }));
vi.mock("./workos.js", () => ({
  getWorkos: () => ({
    userManagement: { listOrganizationMemberships: provider.memberships },
    directorySync: { getUser: provider.directoryUser },
  }),
}));
describe.skipIf(!process.env.DRAFTHR_LOCAL_DATABASE_URL)("directory identity linking (disposable local Postgres)", () => {
  const company = crypto.randomUUID();
  const otherCompany = crypto.randomUUID();
  const runId = crypto.randomUUID();
  const ids: string[] = [];
  const org = "org_auth_test_" + runId;
  function session(email: string, id = crypto.randomUUID()): SessionPayload {
    return { user: { id, email, emailVerified: true, firstName: "Test", lastName: null, profilePictureUrl: null },
      organizationId: org, workosSession: "verified-by-session-boundary", iat: Date.now() };
  }
  async function placeholder(email: string, tenantId = company) {
    const id = crypto.randomUUID();
    ids.push(id);
    await getDb().insert(users).values({
      id, externalId: "dsync:" + id, workosDirectoryUserId: id, workosDirectoryId: "directory_test",
      email, tenantId,
    });
    await getDb().insert(tenantMembers).values({ userId: id, tenantId, role: "drafter", status: "active", isActiveTenant: true });
    return id;
  }
  beforeAll(async () => {
    process.env.DRAFTHR_LOCAL_WORKOS_EMULATOR = "1";
    await getDb().insert(tenants).values([
      { id: company, name: "Auth test company", workosOrgId: org },
      { id: otherCompany, name: "Other auth test company", workosOrgId: org + "_other" },
    ]);
  });
  beforeEach(() => {
    provider.memberships.mockImplementation(async ({ userId, organizationId }) => ({
      data: [{ userId, organizationId, status: "active" }],
    }));
    provider.directoryUser.mockReset();
  });
  afterAll(async () => {
    // Only delete this suite's randomly generated fixtures, never shared demo data.
    if (ids.length) await getDb().delete(users).where(inArray(users.id, ids));
    await getDb().delete(tenants).where(inArray(tenants.id, [company, otherCompany]));
    await closeDb();
  });
  it("claims the provisioned row in place, preserving its ID and membership", async () => {
    const email = "link-" + runId + "@example.test";
    const id = await placeholder(email);
    provider.directoryUser.mockResolvedValue({ organizationId: org, email, state: "active" });
    const login = session(email.toUpperCase());
    const linked = await ensureLocalUser(login);
    expect(linked.id).toBe(id);
    expect(linked.externalId).toBe(login.user.id);
    const [member] = await getDb().select().from(tenantMembers).where(eq(tenantMembers.userId, id));
    expect(member.tenantId).toBe(company);
    expect(member.role).toBe("drafter");
    expect((await ensureLocalUser(login)).id).toBe(id);
  });
  it("does not claim a same-email identity in a different organization", async () => {
    const email = "cross-" + runId + "@example.test";
    const victim = await placeholder(email, otherCompany);
    const local = await ensureLocalUser(session(email));
    ids.push(local.id);
    expect(local.id).not.toBe(victim);
    const [untouched] = await getDb().select().from(users).where(eq(users.id, victim));
    expect(untouched.externalId).toBe("dsync:" + victim);
    expect(await getDb().select().from(tenantMembers).where(eq(tenantMembers.userId, local.id))).toEqual([]);
    expect(provider.directoryUser).not.toHaveBeenCalled();
  });
  it("treats email wildcard characters as literal characters", async () => {
    const victim = await placeholder("wildZ-" + runId + "@example.test");
    const local = await ensureLocalUser(session("wild_-" + runId + "@example.test"));
    ids.push(local.id);
    expect(local.id).not.toBe(victim);
    expect(provider.directoryUser).not.toHaveBeenCalled();
  });
  it("denies a claim without an active provider organization membership", async () => {
    const email = "inactive-" + runId + "@example.test";
    const id = await placeholder(email);
    provider.memberships.mockResolvedValue({ data: [] });
    await expect(ensureLocalUser(session(email))).rejects.toThrow("No active company membership");
    expect((await getDb().select().from(users).where(eq(users.id, id)))[0].externalId).toBe("dsync:" + id);
  });
  it("denies a directory account that was deactivated after provisioning", async () => {
    const email = "removed-" + runId + "@example.test";
    await placeholder(email);
    provider.directoryUser.mockResolvedValue({ organizationId: org, email, state: "inactive" });
    await expect(ensureLocalUser(session(email))).rejects.toThrow("no longer matches");
  });
  it("refuses ambiguous directory records instead of selecting an arbitrary email match", async () => {
    const email = "ambiguous-" + runId + "@example.test";
    await placeholder(email);
    await placeholder(email);
    await expect(ensureLocalUser(session(email))).rejects.toThrow("Multiple directory identities");
  });
  it("creates one identity under concurrent first requests without an implicit workspace", async () => {
    const login = { ...session("new-" + runId + "@example.test"), organizationId: undefined };
    const [a, b] = await Promise.all([ensureLocalUser(login), ensureLocalUser(login)]);
    ids.push(a.id);
    expect(a.id).toBe(b.id);
    expect(a.tenantId).toBeNull();
    expect(await getDb().select().from(tenantMembers).where(eq(tenantMembers.userId, a.id))).toEqual([]);
  });

  it("connects a first unscoped account to a later company login without replacing the real account ID", async () => {
    const email = "later-company-" + runId + "@example.test";
    const login = session(email);
    const account = await ensureLocalUser({ ...login, organizationId: undefined });
    ids.push(account.id);
    const directoryId = await placeholder(email);
    provider.directoryUser.mockResolvedValue({ organizationId: org, email, state: "active" });
    const linked = await ensureLocalUser(login);
    expect(linked.id).toBe(account.id);
    expect(linked.workosDirectoryUserId).toBe(directoryId);
    const seats = await getDb().select().from(tenantMembers).where(eq(tenantMembers.userId, linked.id));
    expect(seats).toEqual([expect.objectContaining({ tenantId: company, status: "active", role: "drafter" })]);
    const [retained] = await getDb().select().from(users).where(eq(users.id, directoryId));
    expect(retained.externalId).toBe("dsync-linked:" + directoryId);
    expect(retained.workosDirectoryUserId).toBeNull();
    expect((await ensureLocalUser(login)).id).toBe(account.id);
  });

  it("refuses a destructive merge when a duplicate directory account already owns business records", async () => {
    const email = "history-" + runId + "@example.test";
    const login = session(email);
    const account = await ensureLocalUser({ ...login, organizationId: undefined });
    ids.push(account.id);
    const directoryId = await placeholder(email);
    const matterId = crypto.randomUUID();
    await getDb().insert(matters).values({ id: matterId, tenantId: company, ownerUserId: directoryId, name: "History", mode: "employer", type: "disciplinary" });
    provider.directoryUser.mockResolvedValue({ organizationId: org, email, state: "active" });
    await expect(ensureLocalUser(login)).rejects.toThrow("business history");
    expect((await getDb().select().from(matters).where(eq(matters.id, matterId)))[0].ownerUserId).toBe(directoryId);
    expect((await getDb().select().from(users).where(eq(users.id, directoryId)))[0].workosDirectoryUserId).toBe(directoryId);
  });
});
