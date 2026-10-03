// @vitest-environment node
import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
import { sealData, unsealData } from "iron-session";
const mocks = vi.hoisted(() => ({
  authenticate: vi.fn(), refresh: vi.fn(), epoch: vi.fn(),
}));
vi.mock("@workos-inc/node", () => ({
  WorkOS: class {
    userManagement = { loadSealedSession: () => ({ authenticate: mocks.authenticate, refresh: mocks.refresh }) };
  },
}));
vi.mock("./session-epoch.js", async (original) => ({
  ...await original<object>(), getUserSessionEpoch: mocks.epoch,
}));
import {
  buildSessionCookie, buildClearCookie, getSessionFromRequest, ensureOrganizationSession,
  withSessionResponse, type SessionPayload,
} from "./workos";
const user = { id: "user_verified", email: "hr@example.test", emailVerified: true, firstName: null, lastName: null, profilePictureUrl: null };
const payload = (): SessionPayload => ({ user, workosSession: "provider-session", iat: Date.now(), epoch: 4 });
const valid = () => ({ authenticated: true, user, sessionId: "session_1", organizationId: undefined });
async function request(data = payload()) {
  // Use the actual seal, not a mocked cookie reader.
  const sealed = await sealData(data, { password: process.env.WORKOS_COOKIE_PASSWORD!, ttl: 604800 });
  return new Request("http://localhost/api/store/drafts", { headers: { cookie: "drafthr_session=" + sealed } });
}
beforeEach(() => {
  vi.stubEnv("WORKOS_COOKIE_PASSWORD", "test-password-of-at-least-32-characters");
  vi.stubEnv("WORKOS_API_KEY", "sk_test");
  vi.stubEnv("WORKOS_CLIENT_ID", "client_test");
  vi.stubEnv("DRAFTHR_LOCAL_WORKOS_EMULATOR", "");
  mocks.authenticate.mockReset().mockResolvedValue(valid());
  mocks.refresh.mockReset();
  mocks.epoch.mockReset().mockResolvedValue(4);
});
afterEach(() => vi.unstubAllEnvs());
describe("the WorkOS session boundary", () => {
  it("validates once per request and uses the provider identity", async () => {
    const req = await request();
    const [a, b] = await Promise.all([getSessionFromRequest(req), getSessionFromRequest(req)]);
    expect(a).toBe(b);
    expect(a?.sessionId).toBe("session_1");
    expect(mocks.authenticate).toHaveBeenCalledTimes(1);
    expect(mocks.refresh).not.toHaveBeenCalled();
  });
  it("rejects old reset/verification cookies without a WorkOS session", async () => {
    const req = await request({ ...payload(), workosSession: "" });
    const response = await withSessionResponse(req, async () => {
      expect(await getSessionFromRequest(req)).toBeNull();
      return new Response(null, { status: 401 });
    });
    expect(response.headers.get("set-cookie")).toContain("Max-Age=0");
    expect(mocks.authenticate).not.toHaveBeenCalled();
  });
  it.each(["wrong-user", "unverified", "revoked"])("rejects %s even with a valid encrypted app cookie", async (kind) => {
    if (kind === "revoked") mocks.epoch.mockResolvedValue(5);
    else mocks.authenticate.mockResolvedValue({ ...valid(), user: { ...user,
      ...(kind === "wrong-user" ? { id: "attacker" } : { emailVerified: false }) } });
    expect(await getSessionFromRequest(await request())).toBeNull();
  });
  it("rotates cookies on a streaming response without changing body, headers or epoch", async () => {
    mocks.authenticate.mockResolvedValueOnce({ authenticated: false, reason: "invalid_jwt" }).mockResolvedValue(valid());
    mocks.refresh.mockResolvedValue({ authenticated: true, sealedSession: "rotated-provider-session" });
    const req = await request();
    const response = await withSessionResponse(req, async () => {
      expect(await getSessionFromRequest(req)).not.toBeNull();
      return new Response(new ReadableStream({ start(c) { c.enqueue(new TextEncoder().encode("data: hello\n\n")); c.close(); } }),
        { headers: { "Content-Type": "text/event-stream", "X-Test": "preserved" } });
    });
    expect(await response.text()).toBe("data: hello\n\n");
    expect(response.headers.get("X-Test")).toBe("preserved");
    const seal = response.headers.get("set-cookie")!.split(";")[0].split("=")[1];
    const data = await unsealData<SessionPayload>(decodeURIComponent(seal), { password: process.env.WORKOS_COOKIE_PASSWORD! });
    expect(data.epoch).toBe(4);
    expect(data.workosSession).toBe("rotated-provider-session");
  });
  it("never revives a revoked app epoch during WorkOS refresh", async () => {
    mocks.authenticate.mockResolvedValueOnce({ authenticated: false }).mockResolvedValue(valid());
    mocks.refresh.mockResolvedValue({ authenticated: true, sealedSession: "rotated" });
    mocks.epoch.mockResolvedValue(5);
    const req = await request();
    const response = await withSessionResponse(req, async () => {
      expect(await getSessionFromRequest(req)).toBeNull();
      return new Response(null);
    });
    expect(response.headers.get("set-cookie")).toContain("Max-Age=0");
  });
  it("renews a session whose previous signing key is no longer published", async () => {
    mocks.authenticate.mockRejectedValueOnce(Object.assign(new Error("old key"), { code: "ERR_JWKS_NO_MATCHING_KEY" }))
      .mockResolvedValue(valid());
    mocks.refresh.mockResolvedValue({ authenticated: true, sealedSession: "new-key-session" });
    const req = await request();
    const response = await withSessionResponse(req, async () => {
      expect((await getSessionFromRequest(req))?.user.id).toBe(user.id);
      return new Response(null);
    });
    expect(mocks.refresh).toHaveBeenCalledTimes(1);
    expect(mocks.authenticate).toHaveBeenCalledTimes(2);
    expect(response.status).toBe(200);
    expect(response.headers.get("set-cookie")).toContain("drafthr_session=");
    expect(response.headers.get("set-cookie")).not.toContain("Max-Age=0");
  });
  it("returns to sign-in rather than an outage when an old key and refresh token are both invalid", async () => {
    mocks.authenticate.mockRejectedValue(Object.assign(new Error("old key"), { code: "ERR_JWKS_NO_MATCHING_KEY" }));
    mocks.refresh.mockResolvedValue({ authenticated: false, reason: "invalid_grant" });
    const req = await request();
    const response = await withSessionResponse(req, async () => {
      expect(await getSessionFromRequest(req)).toBeNull();
      return new Response(null);
    });
    expect(response.status).toBe(200);
    expect(response.headers.get("set-cookie")).toContain("Max-Age=0");
  });
  it("never accepts a refreshed session whose signature still cannot be verified", async () => {
    mocks.authenticate.mockRejectedValue(Object.assign(new Error("unknown key"), { code: "ERR_JWKS_NO_MATCHING_KEY" }));
    mocks.refresh.mockResolvedValue({ authenticated: true, sealedSession: "unverifiable" });
    expect(await getSessionFromRequest(await request())).toBeNull();
    expect(mocks.refresh).toHaveBeenCalledTimes(1);
  });
  it.each(["ERR_JWKS_TIMEOUT", "ECONNREFUSED"])("preserves sessions during real key-service failure: %s", async (code) => {
    mocks.authenticate.mockRejectedValue(Object.assign(new Error("unavailable"), { code }));
    const req = await request();
    const response = await withSessionResponse(req, async () => {
      await getSessionFromRequest(req);
      return new Response("sensitive");
    });
    expect(response.status).toBe(503);
    expect(response.headers.get("set-cookie")).toBeNull();
    expect(mocks.refresh).not.toHaveBeenCalled();
  });
  it("preserves the cookie but denies access during a provider or database outage", async () => {
    mocks.epoch.mockRejectedValue(new Error("database unavailable"));
    const req = await request();
    const response = await withSessionResponse(req, async () => {
      await getSessionFromRequest(req);
      return new Response("sensitive");
    });
    expect(response.status).toBe(503);
    expect(response.headers.get("set-cookie")).toBeNull();
    expect(await response.text()).not.toContain("sensitive");
  });
  it("clears an expired/revoked WorkOS refresh token", async () => {
    mocks.authenticate.mockResolvedValue({ authenticated: false });
    mocks.refresh.mockResolvedValue({ authenticated: false, reason: "invalid_grant" });
    expect(await getSessionFromRequest(await request())).toBeNull();
  });
  it("does not overwrite an explicit logout cookie with a pending refresh", async () => {
    mocks.authenticate.mockResolvedValueOnce({ authenticated: false }).mockResolvedValue(valid());
    mocks.refresh.mockResolvedValue({ authenticated: true, sealedSession: "rotated" });
    const req = await request();
    const response = await withSessionResponse(req, async () => {
      await getSessionFromRequest(req);
      return new Response(null, { headers: { "Set-Cookie": buildClearCookie() } });
    });
    expect(response.headers.getSetCookie()).toHaveLength(1);
    expect(response.headers.get("set-cookie")).toContain("Max-Age=0");
  });
  it("requires company sign-in without changing the current session when SSO is required", async () => {
    const session = payload();
    mocks.refresh.mockResolvedValue({ authenticated: false, reason: "sso_required" });
    const denied = await ensureOrganizationSession(await request(), session, "org_company", "tenant_1");
    expect(denied?.status).toBe(409);
    expect(await denied?.json()).toMatchObject({ signInUrl: "/sign-in?workspace=tenant_1" });
    expect(session.organizationId).toBeUndefined();
  });
  it("validates the refreshed identity before accepting an organization switch", async () => {
    mocks.refresh.mockResolvedValue({ authenticated: true, sealedSession: "rotated", user });
    mocks.authenticate.mockResolvedValue({ ...valid(), organizationId: "org_wrong" });
    expect((await ensureOrganizationSession(await request(), payload(), "org_company", "tenant"))?.status).toBe(409);
    mocks.authenticate.mockResolvedValue({ ...valid(), organizationId: "org_company" });
    const session = payload();
    expect(await ensureOrganizationSession(await request(), session, "org_company", "tenant")).toBeNull();
    expect(session.organizationId).toBe("org_company");
  });
  it("never creates a new app cookie without provider authentication", async () => {
    await expect(buildSessionCookie({ ...payload(), workosSession: "" })).rejects.toThrow();
  });
});
