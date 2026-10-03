// @vitest-environment node
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { inArray } from "drizzle-orm";
import { closeDb, getDb } from "../../../src/db/index";
import { tenants, users } from "../../../src/db/schema";
import type { WorkspacePreferences } from "../../../src/lib/workspace-preferences";
import { GET, POST } from "./preferences";
const auth = vi.hoisted(() => ({ tenantId: "", userId: "", role: "owner" }));
vi.mock("../../_utils/session-with-tenant.js", () => ({ requireSessionAndTenant: async () => ({ ok: true, activeTenant: { id: auth.tenantId }, userRow: { id: auth.userId }, activeMember: { role: auth.role } }) }));
describe.skipIf(!process.env.DRAFTHR_LOCAL_DATABASE_URL)("database-backed personal and company settings", () => {
  const tenantA = crypto.randomUUID(), tenantB = crypto.randomUUID(), userA = crypto.randomUUID(), userB = crypto.randomUUID();
  const origin = "http://localhost:5273";
  const req = (body?: unknown, tenant = auth.tenantId) => new Request(`${origin}/api/store/preferences`, { method: body ? "POST" : "GET", headers: { Origin: origin, "Content-Type": "application/json", "X-Workspace-ID": tenant }, ...(body ? { body: JSON.stringify(body) } : {}) });
  async function read() { const r = await GET(req()); expect(r.status).toBe(200); return (await r.json() as { documents: Array<{ id: string; snapshot: WorkspacePreferences; revision: number }> }).documents[0]; }
  const save = (snapshot: WorkspacePreferences, revision: number) => POST(req({ id: snapshot.id, snapshot, baseRevision: revision }));
  beforeAll(async () => {
    vi.stubEnv("DRAFTHR_LOCAL_WORKOS_EMULATOR", "1"); vi.stubEnv("DRAFTHR_DATABASE_WORKSPACE", "true"); vi.stubEnv("WORKOS_AUDIT_LOGS_ENABLED", "false");
    await getDb().insert(tenants).values([{ id: tenantA, name: "Preferences A" }, { id: tenantB, name: "Preferences B" }]);
    await getDb().insert(users).values([{ id: userA, externalId: `preferences-${userA}`, tenantId: tenantA }, { id: userB, externalId: `preferences-${userB}`, tenantId: tenantA }]);
  });
  beforeEach(() => { auth.tenantId = tenantA; auth.userId = userA; auth.role = "owner"; });
  afterAll(async () => { await getDb().delete(tenants).where(inArray(tenants.id, [tenantA, tenantB])); await getDb().delete(users).where(inArray(users.id, [userA, userB])); await closeDb(); vi.unstubAllEnvs(); });
  it("shares company details while keeping personal data private", async () => {
    const initial = await read();
    const snapshot = { ...initial.snapshot, role: "employer" as const, employer: { legalName: "Shared company" }, personal: { legalName: "Owner private name" }, setupComplete: true };
    expect((await save(snapshot, initial.revision)).status).toBe(200);
    auth.userId = userB;
    const teammate = await read();
    expect(teammate.snapshot.employer.legalName).toBe("Shared company");
    expect(teammate.snapshot.personal).toEqual({});
    expect(teammate.snapshot.setupComplete).toBe(false);
    auth.tenantId = tenantB;
    expect((await read()).snapshot.employer).toEqual({});
  });
  it("allows viewer preferences but rejects company edits and client-supplied privileges", async () => {
    auth.userId = userB; auth.role = "viewer";
    const initial = await read();
    expect((await save({ ...initial.snapshot, personal: { legalName: "My name" } }, initial.revision)).status).toBe(200);
    const latest = await read();
    expect((await save({ ...latest.snapshot, employer: { legalName: "Unauthorized rename" } }, latest.revision)).status).toBe(403);
    expect((await POST(req({ id: latest.id, snapshot: { ...latest.snapshot, credits: 100000, workspaceRole: "owner" }, baseRevision: latest.revision }))).status).toBe(400);
  });
  it("rejects stale settings and requests pinned to a different workspace", async () => {
    const initial = await read();
    expect((await save({ ...initial.snapshot, autoFill: false }, initial.revision)).status).toBe(200);
    expect((await save(initial.snapshot, initial.revision)).status).toBe(409);
    expect((await GET(req(undefined, tenantB))).status).toBe(409);
  });
  it("keeps an employee's employer details private rather than changing the shared company", async () => {
    auth.userId = userB; auth.role = "viewer";
    const initial = await read();
    expect((await save({ ...initial.snapshot, role: "employee", employer: { legalName: "Private employing entity" } }, initial.revision)).status).toBe(200);
    expect((await read()).snapshot.employer.legalName).toBe("Private employing entity");
    auth.userId = userA;
    expect((await read()).snapshot.employer.legalName).toBe("Shared company");
  });
});
