// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { sealData } from "iron-session";
const sdk = vi.hoisted(() => ({ url: vi.fn(), code: vi.fn(), local: vi.fn(), epoch: vi.fn() }));
vi.mock("@workos-inc/node", () => ({ WorkOS: class {
  userManagement = { getAuthorizationUrlWithPKCE: sdk.url, authenticateWithCode: sdk.code };
} }));
vi.mock("../../_utils/local-identity.js", () => ({ ensureLocalUser: sdk.local }));
vi.mock("../../_utils/session-epoch.js", () => ({ getUserSessionEpoch: sdk.epoch }));
import { GET } from "./url";
import { POST } from "./callback";
import { readStateCookie } from "../../_utils/workos";
import { safeAuthReturnTo } from "../../_utils/auth-redirect";
const password = "a-secure-test-cookie-password-at-least-32";
const user = { id: "user_test", email: "test@example.test", emailVerified: true };
beforeEach(() => {
  vi.stubEnv("WORKOS_API_KEY", "test"); vi.stubEnv("WORKOS_CLIENT_ID", "client_test");
  vi.stubEnv("WORKOS_COOKIE_PASSWORD", password);
  vi.stubEnv("WORKOS_REDIRECT_URI", "https://app.drafthr.io/auth/callback");
  vi.stubEnv("DRAFTHR_LOCAL_WORKOS_EMULATOR", "");
  sdk.url.mockReset().mockResolvedValue({ url: "https://api.workos.com/authorize", state: "state_1", codeVerifier: "secret-verifier" });
  sdk.code.mockReset().mockResolvedValue({ user, sealedSession: "sealed-provider-session" });
  sdk.local.mockReset().mockResolvedValue({ id: "local_existing" });
  sdk.epoch.mockReset().mockResolvedValue(7);
});
afterEach(() => vi.unstubAllEnvs());
async function callback(state = "state_1", overrides = {}) {
  const cookie = await sealData({ state: "state_1", codeVerifier: "secret-verifier", returnTo: "/signup/workspace?invite=abc", ...overrides }, { password, ttl: 600 });
  return POST(new Request("https://app.drafthr.io/api/auth/callback", {
    method: "POST", headers: { Origin: "https://app.drafthr.io", "Content-Type": "application/json", cookie: "drafthr_oauth_state=" + cookie },
    body: JSON.stringify({ code: "one-time-code", state }),
  }));
}
describe("hosted authentication", () => {
  it("seals destination and PKCE verifier in HttpOnly state, not browser storage", async () => {
    const response = await GET(new Request("https://app.drafthr.io/api/auth/url?redirect=%2Fsignup%2Fworkspace%3Finvite%3Dabc&screen_hint=sign-up"));
    expect(response.status).toBe(200);
    const cookie = response.headers.get("set-cookie")!;
    expect(cookie).toContain("HttpOnly");
    expect(cookie).not.toContain("secret-verifier");
    const stored = await readStateCookie(new Request("https://app.drafthr.io", { headers: { cookie: cookie.split(";")[0] } }));
    expect(stored).toMatchObject({ codeVerifier: "secret-verifier", returnTo: "/signup/workspace?invite=abc" });
    expect(sdk.url).toHaveBeenCalledWith(expect.objectContaining({ provider: "authkit", screenHint: "sign-up" }));
  });
  it("rejects mismatched OAuth state before exchanging a code", async () => {
    expect((await callback("attacker-state")).status).toBe(400);
    expect(sdk.code).not.toHaveBeenCalled();
  });
  it("passes PKCE to WorkOS and preserves the signed invitation destination", async () => {
    const response = await callback();
    expect(response.status).toBe(200);
    expect(sdk.code).toHaveBeenCalledWith(expect.objectContaining({ codeVerifier: "secret-verifier" }));
    expect(await response.json()).toMatchObject({ returnTo: "/signup/workspace?invite=abc" });
    expect(response.headers.getSetCookie()).toHaveLength(2);
    expect(sdk.local.mock.invocationCallOrder[0]).toBeLessThan(sdk.epoch.mock.invocationCallOrder[0]);
  });
  it.each(["missing-session", "unverified", "wrong-organization"])("does not mint an app cookie for %s", async (kind) => {
    sdk.code.mockResolvedValue({
      user: { ...user, emailVerified: kind !== "unverified" },
      sealedSession: kind === "missing-session" ? undefined : "provider-session",
      organizationId: "org_wrong",
    });
    const response = await callback("state_1", kind === "wrong-organization" ? { organizationId: "org_required" } : {});
    expect(response.status).toBe(401);
    expect(response.headers.get("set-cookie")).toBeNull();
    expect(sdk.local).not.toHaveBeenCalled();
  });
  it.each(["https://evil.test", "//evil.test", "/\\evil.test", "/sign-in", "/auth/callback", "/api/private", "/\n/evil.test"])("rejects unsafe return path %s", (url) => {
    expect(safeAuthReturnTo(url)).toBe("/");
  });
});
