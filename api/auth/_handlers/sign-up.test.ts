/**
 * sign-up.ts API handler tests.
 *
 * Strategy: stub the WorkOS SDK at the module boundary (`getWorkos()` from
 * api/_utils/workos.ts) and stub buildSessionCookie so we don't need
 * iron-session env vars. Then drive the handler with synthetic Request
 * objects and assert response status + body + headers.
 *
 * The big invariants we lock in:
 *   1. Happy path returns 200 + { ok, requiresVerification: true } and
 *      sends a verification email.
 *   2. NO session cookie is set on sign-up — the user must verify first.
 *   3. ConflictException (existing email) is collapsed to the SAME
 *      response shape (anti-user-enumeration).
 *   4. Rate limiting fires on the 4th attempt from a single IP.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";

const createUser = vi.fn();
const sendVerificationEmail = vi.fn();
const listUsers = vi.fn();

vi.mock("../../_utils/workos.js", () => ({
  getWorkos: () => ({
    userManagement: {
      createUser,
      sendVerificationEmail,
      listUsers,
    },
  }),
}));

beforeEach(() => {
  createUser.mockReset();
  sendVerificationEmail.mockReset();
  listUsers.mockReset();
  // Reset the in-process rate-limit bucket between tests.
  vi.resetModules();
});

function makeRequest(body: unknown, ipSuffix = "1") {
  return new Request("https://app.drafthr.io/api/auth/sign-up", {
    method: "POST",
    headers: {
      origin: "https://app.drafthr.io",
      "content-type": "application/json",
      "x-forwarded-for": `10.0.0.${ipSuffix}`,
    },
    body: JSON.stringify(body),
  });
}

describe("POST /api/auth/sign-up", () => {
  it("creates the user, sends a verification email, and returns requiresVerification:true", async () => {
    createUser.mockResolvedValueOnce({ id: "user_01" });
    sendVerificationEmail.mockResolvedValueOnce({ user: { id: "user_01" } });

    const { POST } = await import("./sign-up.js");
    const res = await POST(
      makeRequest({
        email: "new@example.com",
        password: "longenough123",
        firstName: "Ada",
        lastName: "Lovelace",
      }),
    );

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({ ok: true, requiresVerification: true, userId: "user_01" });

    expect(createUser).toHaveBeenCalledWith({
      email: "new@example.com",
      password: "longenough123",
      firstName: "Ada",
      lastName: "Lovelace",
      emailVerified: false,
    });
    expect(sendVerificationEmail).toHaveBeenCalledWith({ userId: "user_01" });

    // CRITICAL: no Set-Cookie. We do NOT mint a session before verification.
    expect(res.headers.get("set-cookie")).toBeNull();
  });

  it("collapses 'email already exists' (409) to the generic success shape (anti-enumeration)", async () => {
    const conflict = Object.assign(new Error("user_creation_error"), {
      status: 409,
      name: "ConflictException",
    });
    createUser.mockRejectedValueOnce(conflict);
    // Silent resend path: listUsers returns the existing user, and we
    // expect sendVerificationEmail to be called for them.
    listUsers.mockResolvedValueOnce({
      data: [{ id: "user_existing", email: "dupe@example.com", emailVerified: false }],
    });
    sendVerificationEmail.mockResolvedValueOnce({ user: { id: "user_existing" } });

    const { POST } = await import("./sign-up.js");
    const res = await POST(
      makeRequest({
        email: "dupe@example.com",
        password: "longenough123",
        firstName: "Ada",
        lastName: "Lovelace",
      }),
    );

    // Same response as the happy path — attacker can't distinguish.
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      ok: true,
      requiresVerification: true,
      userId: "user_existing",
    });
    // No cookie minted in this branch either.
    expect(res.headers.get("set-cookie")).toBeNull();
    // Background: we DID silently resend so the rightful owner still gets
    // a usable email.
    expect(sendVerificationEmail).toHaveBeenCalledWith({ userId: "user_existing" });
  });

  it("does NOT resend to an already-verified user (would look like phishing)", async () => {
    const conflict = Object.assign(new Error("user_creation_error"), {
      status: 409,
      name: "ConflictException",
    });
    createUser.mockRejectedValueOnce(conflict);
    listUsers.mockResolvedValueOnce({
      data: [{ id: "user_verified", email: "verified@example.com", emailVerified: true }],
    });

    const { POST } = await import("./sign-up.js");
    const res = await POST(
      makeRequest({
        email: "verified@example.com",
        password: "longenough123",
        firstName: "Ada",
        lastName: "Lovelace",
      }),
    );

    expect(res.status).toBe(200);
    expect(sendVerificationEmail).not.toHaveBeenCalled();
  });

  it("surfaces a 422 validation error verbatim (password too weak etc)", async () => {
    const validation = Object.assign(
      new Error("Password must contain a digit and a symbol."),
      { status: 422, name: "UnprocessableEntityException" },
    );
    createUser.mockRejectedValueOnce(validation);

    const { POST } = await import("./sign-up.js");
    const res = await POST(
      makeRequest({
        email: "new2@example.com",
        password: "longenough123",
        firstName: "Ada",
        lastName: "Lovelace",
      }),
    );

    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({
      error: "Password must contain a digit and a symbol.",
    });
  });

  it("rejects malformed input (missing email) with a clean 400", async () => {
    const { POST } = await import("./sign-up.js");
    const res = await POST(
      makeRequest({ password: "longenough123", firstName: "Ada", lastName: "L" }),
    );
    expect(res.status).toBe(400);
    expect(createUser).not.toHaveBeenCalled();
  });

  it("rate-limits the 4th attempt from the same IP within a minute", async () => {
    createUser.mockResolvedValue({ id: "user_x" });
    sendVerificationEmail.mockResolvedValue({ user: { id: "user_x" } });

    const { POST } = await import("./sign-up.js");
    const ip = "55";
    for (let i = 0; i < 3; i++) {
      const ok = await POST(
        makeRequest(
          {
            email: `rl${i}@example.com`,
            password: "longenough123",
            firstName: "Ada",
            lastName: "Lovelace",
          },
          ip,
        ),
      );
      expect(ok.status).toBe(200);
    }
    const blocked = await POST(
      makeRequest(
        {
          email: "rl4@example.com",
          password: "longenough123",
          firstName: "Ada",
          lastName: "Lovelace",
        },
        ip,
      ),
    );
    expect(blocked.status).toBe(429);
  });
});
