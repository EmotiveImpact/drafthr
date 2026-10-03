import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";
import { getDb, closeDb } from "../../../src/db/index";
import { drafts, tenants, users } from "../../../src/db/schema";
import { GET, POST } from "./drafts";

const authState = vi.hoisted(() => ({ tenantId: "", userId: "" }));
vi.mock("../../_utils/session-with-tenant.js", () => ({
  requireSessionAndTenant: async () => ({
    ok: true,
    activeTenant: { id: authState.tenantId },
    userRow: { id: authState.userId },
  }),
}));

const localDatabase = Boolean(process.env.DRAFTHR_LOCAL_DATABASE_URL);
describe.skipIf(!localDatabase)("database draft round trip (local Postgres only)", () => {
  const tenantA = crypto.randomUUID();
  const tenantB = crypto.randomUUID();
  const userA = crypto.randomUUID();
  const userB = crypto.randomUUID();
  const draftId = crypto.randomUUID();
  const legacyId = crypto.randomUUID();
  const origin = "http://127.0.0.1:5273";

  beforeAll(async () => {
    vi.stubEnv("DRAFTHR_LOCAL_WORKOS_EMULATOR", "1");
    vi.stubEnv("DRAFTHR_DATABASE_DRAFTS", "true");
    // This suite covers the draft-only rollout. The coordinated workspace
    // rollout, including its required tenant header, has separate DB coverage.
    vi.stubEnv("DRAFTHR_DATABASE_WORKSPACE", "false");
    vi.stubEnv("DRAFTHR_DUAL_WRITE", "false");
    vi.stubEnv("DRAFTHR_ENFORCE_PAYWALL", "false");
    vi.stubEnv("WORKOS_AUDIT_LOGS_ENABLED", "false");
    const db = getDb();
    await db.insert(tenants).values([{ id: tenantA, name: "Draft test A" }, { id: tenantB, name: "Draft test B" }]);
    await db.insert(users).values([
      { id: userA, tenantId: tenantA, externalId: `draft-test-${userA}` },
      { id: userB, tenantId: tenantB, externalId: `draft-test-${userB}` },
    ]);
    authState.tenantId = tenantA;
    authState.userId = userA;
  });

  afterAll(async () => {
    const db = getDb();
    await db.delete(users).where(eq(users.id, userA));
    await db.delete(users).where(eq(users.id, userB));
    await db.delete(tenants).where(eq(tenants.id, tenantA));
    await db.delete(tenants).where(eq(tenants.id, tenantB));
    await closeDb();
    vi.unstubAllEnvs();
  });

  const snapshot = {
    id: draftId,
    mode: "employer",
    letterType: "offer",
    context: { mode: "employer", jurisdiction: "UK" },
    employer: { legalName: "Acme", address: "", hasLetterhead: false, signatoryName: "", signatoryTitle: "" },
    employee: { legalName: "Alex", jobTitle: "", address: "", startDate: "", serviceMonths: 0 },
    answers: {},
    sections: [{ id: "sec_1", sectionId: "opening", title: "Opening", html: "<p>Original</p>", required: true, versions: [], status: "edited" }],
    evidence: [{ id: "e_1", kind: "note", content: "Private notes", uploadedAt: 1, includeVerbatim: false }],
    comments: [{ id: "c_1", body: "Check this wording" }],
    createdAt: 1,
    updatedAt: 2,
  };
  function request(body: unknown): Request {
    return new Request(`${origin}/api/store/drafts`, {
      method: "POST", headers: { Origin: origin, "Content-Type": "application/json" }, body: JSON.stringify(body),
    });
  }

  it("stores the complete aggregate and rejects a stale second writer", async () => {
    const created = await POST(request({ id: draftId, snapshot, baseRevision: 0 }));
    expect(created.status).toBe(201);
    expect((await created.json() as { revision: number }).revision).toBe(1);

    const edited = { ...snapshot, sections: [{ ...snapshot.sections[0], html: "<p>Updated</p>", versions: [{ id: "v_1", html: "<p>Original</p>", createdAt: 3 }] }], updatedAt: 4 };
    const saved = await POST(request({ id: draftId, snapshot: edited, baseRevision: 1 }));
    expect(saved.status).toBe(200);
    expect((await saved.json() as { revision: number }).revision).toBe(2);

    const stale = await POST(request({ id: draftId, snapshot: { ...snapshot, title: "Stale overwrite" }, baseRevision: 1 }));
    expect(stale.status).toBe(409);

    const read = await GET(new Request(`${origin}/api/store/drafts?format=documents`));
    expect(read.status).toBe(200);
    const body = await read.json() as { documents: Array<{ id: string; revision: number; snapshot: typeof snapshot }> };
    const document = body.documents.find((row) => row.id === draftId);
    expect(document?.revision).toBe(2);
    expect(document?.snapshot.sections[0].html).toBe("<p>Updated</p>");
    expect(document?.snapshot.sections[0].versions).toHaveLength(1);
    expect(document?.snapshot.evidence[0].content).toBe("Private notes");
    expect(document?.snapshot.comments[0].body).toBe("Check this wording");
  });

  it("does not expose or overwrite the draft from another tenant", async () => {
    authState.tenantId = tenantB;
    authState.userId = userB;
    const read = await GET(new Request(`${origin}/api/store/drafts?format=documents`));
    expect((await read.json() as { documents: unknown[] }).documents).toEqual([]);
    const write = await POST(request({ id: draftId, snapshot, baseRevision: 0 }));
    expect(write.status).toBe(403);
  });

  it("promotes a legacy partial row only if its timestamp still matches", async () => {
    authState.tenantId = tenantA;
    authState.userId = userA;
    const legacyAt = new Date(Date.now() - 2000);
    const db = getDb();
    await db.insert(drafts).values({
      id: legacyId, tenantId: tenantA, authorUserId: userA,
      letterType: "offer", mode: "employer", contextJson: snapshot.context,
      updatedAt: legacyAt,
    });
    const promoted = { ...snapshot, id: legacyId };
    const stale = await POST(request({ id: legacyId, snapshot: promoted, baseRevision: 0, legacyUpdatedAt: legacyAt.getTime() - 1 }));
    expect(stale.status).toBe(409);
    const saved = await POST(request({ id: legacyId, snapshot: promoted, baseRevision: 0, legacyUpdatedAt: legacyAt.getTime() }));
    expect(saved.status).toBe(200);
    expect((await saved.json() as { revision: number }).revision).toBe(1);
  });
});
