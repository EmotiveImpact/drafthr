// @vitest-environment node
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { and, eq, inArray } from "drizzle-orm";
import { getDb, closeDb } from "../../../src/db/index";
import { users, tenants, tenantMembers, consultantProfiles, consultantBookings, drafts } from "../../../src/db/schema";
import { POST as createBooking } from "./list-and-create";
import { POST as respond } from "./respond";
import { POST as message } from "./message";
import { GET as shared } from "./shared";
import { DELETE as deleteDraft } from "../../store/_handlers/drafts";

const state = vi.hoisted(() => ({ tenants: new Map<string, string | null>(), roles: new Map<string, string>() }));
vi.mock("../../_utils/session-with-tenant.js", () => ({
  requireSessionAndTenant: async (req: Request) => {
    const id = (req.headers.get("X-Account-ID") ?? "").replace("workos-", "");
    const tenantId = state.tenants.get(id) ?? null;
    return { ok: true, session: { user: { id: `workos-${id}` } }, userRow: { id },
      activeTenant: tenantId ? { id: tenantId } : null, activeMember: tenantId ? { role: state.roles.get(id) ?? "drafter" } : null };
  },
}));
vi.mock("../../_utils/consultant-emails.js", () => ({
  sendBookingRequestEmail: vi.fn().mockResolvedValue(undefined), sendBookingAcceptedEmail: vi.fn().mockResolvedValue(undefined),
  sendBookingDeclinedEmail: vi.fn().mockResolvedValue(undefined), sendBookingDeliveredEmail: vi.fn().mockResolvedValue(undefined),
}));

describe.skipIf(!process.env.DRAFTHR_LOCAL_DATABASE_URL)("marketplace acceptance against disposable Postgres", () => {
  const tenantA = crypto.randomUUID(), tenantB = crypto.randomUUID();
  const requester = crypto.randomUUID(), requesterB = crypto.randomUUID(), consultant = crypto.randomUUID(), profileId = crypto.randomUUID();
  const origin = "http://localhost:5273";
  let client = 0;
  const request = (body: unknown, actor = requester, workspace = state.tenants.get(actor) ?? "none") => new Request(`${origin}/api/marketplace/action`, {
    method: "POST", headers: { Origin: origin, "Content-Type": "application/json", "X-Account-ID": `workos-${actor}`,
      "X-Workspace-ID": workspace, "X-Real-IP": `192.0.2.${client}` }, body: JSON.stringify(body),
  });
  const intent = (patch: Record<string, unknown> = {}) => ({ requestId: crypto.randomUUID(), consultantProfileId: profileId,
    message: "Fictional review request", matterTitle: "Fictional matter", ...patch });
  async function create(body = intent(), actor = requester) {
    const result = await createBooking(request(body, actor));
    expect(result.status).toBe(201);
    return (await result.json() as { booking: { id: string } }).booking.id;
  }
  async function createDraft(deletedAt: Date | null = null) {
    const id = crypto.randomUUID();
    await getDb().insert(drafts).values({ id, tenantId: tenantA, authorUserId: requester,
      letterType: "offer", mode: "employer", contextJson: {}, snapshotJson: { id }, revision: 1, deletedAt });
    return id;
  }
  const sharedRequest = (token: string) => new Request(`${origin}/api/marketplace/shared?token=${token}`, {
    headers: { "X-Account-ID": `workos-${consultant}`, "X-Workspace-ID": "none", "X-Real-IP": `192.0.2.${client}` },
  });
  async function removeDraft(id: string) {
    state.roles.set(requester, "owner");
    return deleteDraft(new Request(`${origin}/api/store/drafts`, {
      method: "DELETE", headers: { Origin: origin, "Content-Type": "application/json", "X-Account-ID": `workos-${requester}`,
        "X-Workspace-ID": tenantA, "X-Real-IP": `192.0.2.${client}` }, body: JSON.stringify({ id, baseRevision: 1 }),
    }));
  }
  const readBooking = async (id: string) => (await getDb().select().from(consultantBookings).where(eq(consultantBookings.id, id)))[0];
  beforeAll(async () => {
    vi.stubEnv("DRAFTHR_LOCAL_WORKOS_EMULATOR", "1");
    vi.stubEnv("DRAFTHR_RATE_LIMIT_BACKEND", "memory");
    vi.stubEnv("DRAFTHR_DATABASE_WORKSPACE", "true");
    vi.stubEnv("DRAFTHR_DATABASE_DRAFTS", "true");
    vi.stubEnv("WORKOS_AUDIT_LOGS_ENABLED", "false");
    await getDb().insert(tenants).values([{ id: tenantA, name: "Marketplace test A" }, { id: tenantB, name: "Marketplace test B" }]);
    await getDb().insert(users).values([requester, requesterB, consultant].map((id) => ({ id, externalId: `marketplace-test-${id}` })));
    await getDb().insert(tenantMembers).values([
      { userId: requester, tenantId: tenantA, role: "drafter", isActiveTenant: true },
      { userId: requester, tenantId: tenantB, role: "drafter", isActiveTenant: false },
      { userId: requesterB, tenantId: tenantA, role: "drafter", isActiveTenant: true },
    ]);
    await getDb().insert(consultantProfiles).values({ id: profileId, userId: consultant, initials: "FC", fullName: "Fictional Consultant",
      role: "Advisor", bio: "Fictional test profile only.", specialty: "Reviews", specialties: ["Review"], price: 100, currency: "GBP", sla: "24h", status: "published" });
  });
  beforeEach(async () => {
    client++;
    vi.stubEnv("DRAFTHR_DATABASE_WORKSPACE", "true");
    state.tenants.set(requester, tenantA); state.tenants.set(requesterB, tenantA); state.tenants.set(consultant, null);
    state.roles.set(requester, "drafter");
    await getDb().update(tenantMembers).set({ isActiveTenant: false, status: "active", role: "drafter" }).where(eq(tenantMembers.userId, requester));
    await getDb().update(tenantMembers).set({ isActiveTenant: true }).where(and(eq(tenantMembers.userId, requester), eq(tenantMembers.tenantId, tenantA)));
  });
  afterAll(async () => {
    await getDb().delete(tenants).where(inArray(tenants.id, [tenantA, tenantB]));
    await getDb().delete(users).where(inArray(users.id, [requester, requesterB, consultant]));
    await closeDb(); vi.unstubAllEnvs();
  });

  it("creates one database row for concurrent retries of a booking intent", async () => {
    const body = intent();
    const replies = await Promise.all([createBooking(request(body)), createBooking(request(body))]);
    expect(replies.map((r) => r.status).sort()).toEqual([200, 201]);
    const ids = await Promise.all(replies.map(async (r) => (await r.json() as { booking: { id: string } }).booking.id));
    expect(new Set(ids).size).toBe(1);
    expect(await getDb().select().from(consultantBookings).where(eq(consultantBookings.id, body.requestId))).toHaveLength(1);
  });
  it("refuses a deleted draft when binding a new booking", async () => {
    const draftId = await createDraft(new Date());
    const body = intent({ draftId });
    expect((await createBooking(request(body))).status).toBe(404);
    expect(await getDb().select().from(consultantBookings).where(eq(consultantBookings.id, body.requestId))).toHaveLength(0);
  });
  it("blocks old share tokens for tombstones created before token revocation was added", async () => {
    const draftId = await createDraft();
    const bookingId = await create(intent({ draftId }));
    expect((await respond(request({ bookingId, action: "accept" }, consultant))).status).toBe(200);
    const token = (await readBooking(bookingId)).shareToken!;
    expect((await shared(sharedRequest(token))).status).toBe(200);
    await getDb().update(drafts).set({ deletedAt: new Date() }).where(eq(drafts.id, draftId));
    expect((await shared(sharedRequest(token))).status).toBe(404);
  });
  it("does not issue a share token when the attached draft was deleted", async () => {
    const draftId = await createDraft();
    const bookingId = await create(intent({ draftId }));
    expect((await removeDraft(draftId)).status).toBe(200);
    expect((await respond(request({ bookingId, action: "accept" }, consultant))).status).toBe(409);
    expect(await readBooking(bookingId)).toMatchObject({ status: "requested", shareToken: null, shareTokenExpiresAt: null });
  });
  it.each([true, false])("revokes every share when deleting a draft (workspace rollout: %s)", async workspace => {
    vi.stubEnv("DRAFTHR_DATABASE_WORKSPACE", String(workspace));
    const draftId = await createDraft();
    const ids = [await create(intent({ draftId })), await create(intent({ draftId }))];
    for (const bookingId of ids) expect((await respond(request({ bookingId, action: "accept" }, consultant))).status).toBe(200);
    const tokens = await Promise.all(ids.map(async id => (await readBooking(id)).shareToken!));
    expect((await removeDraft(draftId)).status).toBe(200);
    for (let index = 0; index < ids.length; index++) {
      expect(await readBooking(ids[index])).toMatchObject({ shareToken: null, shareTokenExpiresAt: null });
      expect((await shared(sharedRequest(tokens[index]))).status).toBe(404);
    }
  });
  it("never leaves a token active after concurrent acceptance and deletion", async () => {
    const draftId = await createDraft();
    const bookingId = await create(intent({ draftId }));
    const [accept, deleted] = await Promise.all([
      respond(request({ bookingId, action: "accept" }, consultant)), removeDraft(draftId),
    ]);
    expect([200, 409]).toContain(accept.status);
    expect(deleted.status).toBe(200);
    expect(await readBooking(bookingId)).toMatchObject({ shareToken: null, shareTokenExpiresAt: null });
  });
  it("rejects retry IDs reused with changed data or another requester", async () => {
    const body = intent(); await create(body);
    expect((await createBooking(request({ ...body, message: "Changed intent" }))).status).toBe(409);
    expect((await createBooking(request(body, requesterB))).status).toBe(409);
  });
  it("normalizes uppercase consultant UUIDs consistently across accepted creates and retries", async () => {
    const body = intent({ consultantProfileId: profileId.toUpperCase() });
    const bookingId = await create(body);
    const retry = await createBooking(request(body));
    expect(retry.status).toBe(200);
    expect((await retry.json() as { booking: { id: string } }).booking.id).toBe(bookingId);
  });
  it.each(["viewer", "drafter"])("blocks viewer requester mutations even when the authorization snapshot says %s", async (snapshotRole) => {
    const bookingId = await create();
    await getDb().update(consultantBookings).set({ status: "delivered" }).where(eq(consultantBookings.id, bookingId));
    await getDb().update(tenantMembers).set({ role: "viewer" }).where(and(eq(tenantMembers.userId, requester), eq(tenantMembers.tenantId, tenantA)));
    // 'drafter' models a role demotion after the initial authorization lookup.
    state.roles.set(requester, snapshotRole);
    const body = intent();
    expect((await createBooking(request(body))).status).toBe(403);
    expect((await message(request({ bookingId, text: "Forbidden", messageId: crypto.randomUUID() }))).status).toBe(403);
    expect((await respond(request({ bookingId, action: "complete", rating: 5 }))).status).toBe(403);
    expect(await getDb().select().from(consultantBookings).where(eq(consultantBookings.id, body.requestId))).toHaveLength(0);
    const [unchanged] = await getDb().select().from(consultantBookings).where(eq(consultantBookings.id, bookingId));
    expect(unchanged.status).toBe("delivered");
    expect(unchanged.rating).toBeNull();
    expect(unchanged.messages).toEqual([]);
    // Assigned consultant participation does not inherit the requester's role.
    expect((await message(request({ bookingId, text: "Consultant reply", messageId: crypto.randomUUID() }, consultant))).status).toBe(200);
  });
  it("rejects an old workspace pin before creating any record", async () => {
    const body = intent();
    expect((await createBooking(request(body, requester, tenantB))).status).toBe(409);
    expect(await getDb().select().from(consultantBookings).where(eq(consultantBookings.id, body.requestId))).toHaveLength(0);
  });
  it("rechecks the selected workspace inside the transaction after authorization", async () => {
    const body = intent();
    // The mocked session holds the old authorized snapshot; the database has
    // already switched. This is the TOCTOU boundary the transaction must catch.
    await getDb().update(tenantMembers).set({ isActiveTenant: false }).where(eq(tenantMembers.userId, requester));
    await getDb().update(tenantMembers).set({ isActiveTenant: true }).where(and(eq(tenantMembers.userId, requester), eq(tenantMembers.tenantId, tenantB)));
    expect((await createBooking(request(body))).status).toBe(409);
    expect(await getDb().select().from(consultantBookings).where(eq(consultantBookings.id, body.requestId))).toHaveLength(0);
  });
  it("does not let a requester act from another workspace, while the assigned consultant can respond", async () => {
    const bookingId = await create();
    state.tenants.set(requester, tenantB);
    await getDb().update(tenantMembers).set({ isActiveTenant: false }).where(eq(tenantMembers.userId, requester));
    await getDb().update(tenantMembers).set({ isActiveTenant: true }).where(and(eq(tenantMembers.userId, requester), eq(tenantMembers.tenantId, tenantB)));
    expect((await message(request({ bookingId, text: "Wrong workspace", messageId: crypto.randomUUID() }))).status).toBe(403);
    expect((await respond(request({ bookingId, action: "accept" }, consultant))).status).toBe(200);
  });
  it("appends once for concurrent message retries and preserves both participants' messages", async () => {
    const bookingId = await create(), messageId = crypto.randomUUID();
    const responses = await Promise.all([
      message(request({ bookingId, text: "Question", messageId })),
      message(request({ bookingId, text: "Question", messageId })),
      message(request({ bookingId, text: "Reply", messageId: crypto.randomUUID() }, consultant)),
    ]);
    expect(responses.map((r) => r.status)).toEqual([200, 200, 200]);
    const [stored] = await getDb().select().from(consultantBookings).where(eq(consultantBookings.id, bookingId));
    const messages = stored.messages as Array<{ id: string }>;
    expect(messages).toHaveLength(2);
    expect(messages.filter((m) => m.id === messageId)).toHaveLength(1);
    expect((await message(request({ bookingId, text: "Changed", messageId }))).status).toBe(409);
    expect((await message(request({ bookingId, text: "Question", messageId }, consultant))).status).toBe(409);
  });
  it("commits both concurrent completions into the consultant's rating aggregate", async () => {
    const first = await create(), second = await create(intent(), requesterB);
    await getDb().update(consultantBookings).set({ status: "delivered" }).where(inArray(consultantBookings.id, [first, second]));
    const responses = await Promise.all([
      respond(request({ bookingId: first, action: "complete", rating: 3 })),
      respond(request({ bookingId: second, action: "complete", rating: 5 }, requesterB)),
    ]);
    expect(responses.map((r) => r.status)).toEqual([200, 200]);
    const [profile] = await getDb().select().from(consultantProfiles).where(eq(consultantProfiles.id, profileId));
    expect(profile.reviews).toBe(2); expect(profile.rating).toBe(40);
  });
});
