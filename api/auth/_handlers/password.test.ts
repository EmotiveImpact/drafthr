/**
 * password.ts API handler tests.
 *
 * This is the headless sign-in path — POST { email, password } → WorkOS
 * authenticateWithPassword → iron-session cookie. The same wire protocol
 * the SPA's /sign-in page calls. Was untested at 0.16.0; locking in the
 * invariants now so future refactors don't silently break login.
 *
 * Invariants tested:
 *   1. Happy path: 200, response body has user shape, Set-Cookie present.
 *   2. Wrong credentials: 401 + GENERIC "Incorrect email or password"
 *      (never echo WorkOS's specific error — anti-enumeration).
 *   3. Missing email / password / both: 400.
 *   4. Cross-origin POST: 403 (CSRF guard).
 *   5. Rate limit fires on the 11th attempt from a single IP.
 *   6. The Set-Cookie carries the expected attributes (HttpOnly, Path=/,
 *      SameSite=Lax) so post-login navigations actually see the cookie.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";
vi.mock("../../_utils/session-epoch.js", () => ({ getUserSessionEpoch: vi.fn(async () => 0) }));

const authenticateWithPassword = vi.fn();

vi.mock("../../_utils/workos.js", async () => {
  // Real buildSessionCookie needs env vars we don't set in tests; stub
  // it to a deterministic value we can assert on directly.
  return {
    getWorkos: () => ({
      userManagement: {
        authenticateWithPassword,
      },
    }),
    buildSessionCookie: vi.fn().mockResolvedValue(
      "drafthr_session=test-sealed-cookie-value; HttpOnly; Path=/; SameSite=Lax",
    ),
    type: undefined,
  };
});

beforeEach(() => {
  authenticateWithPassword.mockReset();
  vi.resetModules();
});

function makeRequest(body: unknown, ipSuffix = "1") {
  return new Request("https://app.drafthr.io/api/auth/password", {
    method: "POST",
    headers: {
      origin: "https://app.drafthr.io",
      "content-type": "application/json",
      "x-forwarded-for": `10.0.0.${ipSuffix}`,
    },
    body: JSON.stringify(body),
  });
}

describe("POST /api/auth/password", () => {
  it("returns 200 + Set-Cookie + user payload on valid credentials", async () => {
    authenticateWithPassword.mockResolvedValueOnce({
      user: {
        id: "user_123",
        email: "alice@example.com",
        emailVerified: true,
        firstName: "Alice",
        lastName: "Smith",
        profilePictureUrl: null,
      },
      sealedSession: "sealed-test-session",
    });

    const { POST } = await import("./password.js");
    const res = await POST(makeRequest({ email: "alice@example.com", password: "real-pw-here" }));

    expect(res.status).toBe(200);
    const json = (await res.json()) as { ok: boolean; user: { email: string } };
    expect(json.ok).toBe(true);
    expect(json.user.email).toBe("alice@example.com");

    const cookie = res.headers.get("set-cookie") ?? "";
    expect(cookie).toContain("drafthr_session=");
    expect(cookie).toContain("HttpOnly");
    expect(cookie).toContain("Path=/");
    expect(cookie).toContain("SameSite=Lax");
  });

  it("collapses WorkOS auth errors to a single user-safe 401 message", async () => {
    // Both "wrong password" and "no such user" must look identical from
    // the outside — otherwise this endpoint becomes an enumeration oracle.
    const errs = [
      { name: "InvalidCredentialsException", status: 401, message: "Invalid password" },
      { name: "NotFoundException", status: 404, message: "User not found" },
    ];

    for (const err of errs) {
      authenticateWithPassword.mockReset();
      authenticateWithPassword.mockRejectedValueOnce(err);
      vi.resetModules();

      const { POST } = await import("./password.js");
      const res = await POST(
        makeRequest({ email: "alice@example.com", password: "wrong-or-missing" }),
      );

      expect(res.status).toBe(401);
      const json = (await res.json()) as { error: string };
      expect(json.error).toBe("Incorrect email or password.");
      // The cookie MUST NOT be set on a failure — otherwise a stale
      // session from a prior attempt could leak.
      expect(res.headers.get("set-cookie")).toBeNull();
    }
  });

  it("returns the pending token (200, not 401) when email is unverified", async () => {
    // WorkOS throws AuthenticationException{ code, pendingAuthenticationToken }
    // when credentials are correct but the inbox isn't verified. The handler
    // must surface the token so the client can finish via verify-email (Flow B),
    // NOT collapse it to "incorrect password" (the old dead end).
    authenticateWithPassword.mockRejectedValueOnce({
      name: "AuthenticationException",
      status: 403,
      code: "email_verification_required",
      pendingAuthenticationToken: "pat_test_123",
    });

    const { POST } = await import("./password.js");
    const res = await POST(makeRequest({ email: "alice@example.com", password: "real-pw-here" }));

    expect(res.status).toBe(200);
    const json = (await res.json()) as {
      ok: boolean;
      status: string;
      pendingAuthenticationToken: string;
    };
    expect(json.ok).toBe(false);
    expect(json.status).toBe("email_verification_required");
    expect(json.pendingAuthenticationToken).toBe("pat_test_123");
    // No session cookie yet — the user isn't signed in until they verify.
    expect(res.headers.get("set-cookie")).toBeNull();
  });

  it("also reads the pending token from rawData.pending_authentication_token", async () => {
    authenticateWithPassword.mockRejectedValueOnce({
      name: "AuthenticationException",
      status: 403,
      rawData: {
        code: "email_verification_required",
        pending_authentication_token: "pat_raw_456",
      },
    });

    const { POST } = await import("./password.js");
    const res = await POST(makeRequest({ email: "bob@example.com", password: "real-pw-here" }));

    expect(res.status).toBe(200);
    const json = (await res.json()) as { pendingAuthenticationToken: string };
    expect(json.pendingAuthenticationToken).toBe("pat_raw_456");
  });

  it("returns 400 for missing or malformed email", async () => {
    const { POST } = await import("./password.js");
    for (const body of [
      { password: "x" }, // no email
      { email: "", password: "x" }, // empty email
      { email: "no-at-symbol", password: "x" }, // not an email
      { email: "a".repeat(321) + "@b.com", password: "x" }, // too long
    ]) {
      const res = await POST(makeRequest(body));
      expect(res.status).toBe(400);
    }
  });

  it("returns 400 for missing password", async () => {
    const { POST } = await import("./password.js");
    const res = await POST(makeRequest({ email: "alice@example.com" }));
    expect(res.status).toBe(400);
    expect(authenticateWithPassword).not.toHaveBeenCalled();
  });

  it("blocks cross-origin POSTs (CSRF guard)", async () => {
    const req = new Request("https://app.drafthr.io/api/auth/password", {
      method: "POST",
      headers: {
        origin: "https://evil.example.com",
        "content-type": "application/json",
      },
      body: JSON.stringify({ email: "a@b.com", password: "x" }),
    });
    const { POST } = await import("./password.js");
    const res = await POST(req);
    expect(res.status).toBe(403);
    expect(authenticateWithPassword).not.toHaveBeenCalled();
  });

  it("rate-limits at 10 attempts/min/IP", async () => {
    // 10 attempts allowed → 11th blocked. authenticateWithPassword always
    // rejects so we don't conflate "Set-Cookie not present" with "the
    // happy path consumed the limiter".
    authenticateWithPassword.mockRejectedValue({ status: 401, name: "InvalidCredentialsException" });

    const { POST } = await import("./password.js");
    const ip = "rate-test-ip";
    let lastStatus = 0;
    for (let i = 0; i < 11; i++) {
      const res = await POST(makeRequest({ email: "a@b.com", password: "x" }, ip));
      lastStatus = res.status;
    }
    // The 11th call should hit the rate limiter before WorkOS — 429.
    expect(lastStatus).toBe(429);
  });
});
