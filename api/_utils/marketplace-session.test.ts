// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ auth: vi.fn(), lock: vi.fn(), getDb: vi.fn() }));
vi.mock("./session-with-tenant.js", () => ({ requireSessionAndTenant: mocks.auth }));
vi.mock("./tenant-active-lock.js", () => ({ lockUserActiveTenant: mocks.lock }));
vi.mock("../../src/db/index.js", () => ({ getDb: mocks.getDb }));
import { requireMarketplaceSession, withMarketplaceWriteScope, canAccessMarketplaceBooking, canWriteMarketplaceBookings } from "./marketplace-session";
import type { RequireSessionAndTenantResult } from "./session-with-tenant";

type Auth = Extract<RequireSessionAndTenantResult, { ok: true }>;
function session(tenantId: string | null = "workspace-a", role = "drafter"): Auth {
  return { ok: true, session: { user: { id: "workos-alice" } }, userRow: { id: "alice" },
    activeTenant: tenantId ? { id: tenantId } : null, activeMember: tenantId ? { role } : null,
  } as Auth;
}
const req = (user = "workos-alice", tenant = "workspace-a") => new Request("http://localhost/api/marketplace/profile", {
  headers: { "X-Account-ID": user, "X-Workspace-ID": tenant },
});
beforeEach(() => { vi.resetAllMocks(); mocks.auth.mockResolvedValue(session()); });

describe("marketplace pinned session", () => {
  it.each([
    new Request("http://localhost/api/marketplace/profile"),
    req("workos-bob"), req("workos-alice", "workspace-b"),
  ])("rejects missing, mismatched account or mismatched workspace pins", async (request) => {
    const auth = await requireMarketplaceSession(request);
    expect(auth.ok).toBe(false);
    if (!auth.ok) expect(auth.response.status).toBe(409);
  });
  it("accepts the existing authenticated session and matching pins", async () => {
    expect((await requireMarketplaceSession(req())).ok).toBe(true);
  });
  it("supports a consultant with no active workspace using an explicit none pin", async () => {
    mocks.auth.mockResolvedValue(session(null));
    expect((await requireMarketplaceSession(req("workos-alice", "none"))).ok).toBe(true);
  });
  it("cannot use pins to bypass session failure", async () => {
    mocks.auth.mockResolvedValue({ ok: false, response: new Response(null, { status: 401 }) });
    const auth = await requireMarketplaceSession(req());
    if (auth.ok) throw new Error("Unexpected authorization");
    expect(auth.response.status).toBe(401);
  });
});

describe("marketplace locked writes and participant scopes", () => {
  function database(active: string | null, role = "drafter") {
    const tx = { select: vi.fn(), from: vi.fn(), where: vi.fn(), limit: vi.fn(), for: vi.fn() };
    tx.select.mockReturnValue(tx); tx.from.mockReturnValue(tx); tx.where.mockReturnValue(tx);
    tx.limit.mockReturnValue(tx); tx.for.mockResolvedValue(active ? [{ tenantId: active, role }] : []);
    mocks.getDb.mockReturnValue({ transaction: (run: (value: unknown) => Promise<Response>) => run(tx) });
    return tx;
  }
  it("rechecks active membership after acquiring the same lock as workspace switching", async () => {
    const tx = database("workspace-b"), write = vi.fn();
    expect((await withMarketplaceWriteScope(session(), write)).status).toBe(409);
    expect(mocks.lock).toHaveBeenCalledWith(tx, "alice");
    expect(mocks.lock.mock.invocationCallOrder[0]).toBeLessThan(tx.select.mock.invocationCallOrder[0]);
    expect(write).not.toHaveBeenCalled();
  });
  it("does not write after membership was removed", async () => {
    database(null); const write = vi.fn();
    expect((await withMarketplaceWriteScope(session(), write)).status).toBe(409);
    expect(write).not.toHaveBeenCalled();
  });
  it("executes the write only in the checked transaction", async () => {
    const tx = database("workspace-a"), write = vi.fn().mockResolvedValue(new Response(null, { status: 201 }));
    expect((await withMarketplaceWriteScope(session(), write)).status).toBe(201);
    expect(write).toHaveBeenCalledWith(tx, session());
    expect(tx.for).toHaveBeenCalledWith("share");
  });
  it("passes the locked membership role instead of an earlier privileged snapshot", async () => {
    database("workspace-a", "viewer");
    const write = vi.fn(async (_tx, current: Auth) => new Response(null, { status: canWriteMarketplaceBookings(current) ? 201 : 403 }));
    expect((await withMarketplaceWriteScope(session("workspace-a", "admin"), write)).status).toBe(403);
    expect(write).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ activeMember: { role: "viewer" } }));
  });
  it.each(["owner", "admin", "drafter", "reviewer"])("allows requester writes for workspace %s roles", (role) => {
    expect(canWriteMarketplaceBookings(session("workspace-a", role))).toBe(true);
  });
  it.each(["viewer", "member", "", "unknown"])("fails closed for read-only or unknown %s roles", (role) => {
    expect(canWriteMarketplaceBookings(session("workspace-a", role))).toBe(false);
    expect(canWriteMarketplaceBookings(session(null, role))).toBe(false);
  });
  it("keeps assigned consultants cross-workspace but confines requesters to their booking workspace", () => {
    const booking = { consultantUserId: "consultant", requesterUserId: "alice", tenantId: "workspace-a" };
    expect(canAccessMarketplaceBooking(session("workspace-a"), booking)).toBe(true);
    expect(canAccessMarketplaceBooking(session("workspace-b"), booking)).toBe(false);
    expect(canAccessMarketplaceBooking(session(null), booking)).toBe(false);
    const consultant = { ...session("consultant-workspace"), userRow: { id: "consultant" } } as Auth;
    expect(canAccessMarketplaceBooking(consultant, booking)).toBe(true);
    expect(canAccessMarketplaceBooking({ ...consultant, userRow: { id: "stranger" } } as Auth, booking)).toBe(false);
  });
});
