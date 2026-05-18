/**
 * verify-email handler tests — covers both entry points:
 *
 *   A) Post-sign-up: { code, userId } → verifyEmail() → session.
 *   B) Sign-in-while-unverified: { code, pendingAuthenticationToken } →
 *      authenticateWithEmailVerification() → session.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";

const verifyEmail = vi.fn();
const authenticateWithEmailVerification = vi.fn();

vi.mock("../../_utils/workos.js", () => ({
  getWorkos: () => ({
    userManagement: { verifyEmail, authenticateWithEmailVerification },
  }),
  buildSessionCookie: vi.fn(async () => "drafthr_session=fake; Path=/; HttpOnly"),
  SESSION_COOKIE: "drafthr_session",
}));

beforeEach(() => {
  verifyEmail.mockReset();
  authenticateWithEmailVerification.mockReset();
  process.env.WORKOS_CLIENT_ID = "client_test";
  process.env.WORKOS_COOKIE_PASSWORD = "x".repeat(32);
  vi.resetModules();
});

function makeRequest(body: unknown, ipSuffix = "1") {
  return new Request("https://app.drafthr.io/api/auth/verify-email", {
    method: "POST",
    headers: {
      origin: "https://app.drafthr.io",
      "content-type": "application/json",
      "x-forwarded-for": `10.4.0.${ipSuffix}`,
    },
    body: JSON.stringify(body),
  });
}

describe("POST /api/auth/verify-email", () => {
  it("post-sign-up: verifies + mints a session", async () => {
    verifyEmail.mockResolvedValueOnce({
      user: {
        id: "user_1",
        email: "a@b.co",
        firstName: "Ada",
        lastName: "Lovelace",
        profilePictureUrl: null,
      },
    });

    const { POST } = await import("./verify-email.js");
    const res = await POST(makeRequest({ code: "123456", userId: "user_1" }));

    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ ok: true, user: { id: "user_1" } });
    expect(res.headers.get("set-cookie")).toContain("drafthr_session=");
    expect(verifyEmail).toHaveBeenCalledWith({ code: "123456", userId: "user_1" });
    expect(authenticateWithEmailVerification).not.toHaveBeenCalled();
  });

  it("sign-in-while-unverified: uses authenticateWithEmailVerification with the pending token", async () => {
    authenticateWithEmailVerification.mockResolvedValueOnce({
      user: {
        id: "user_2",
        email: "b@c.co",
        firstName: null,
        lastName: null,
        profilePictureUrl: null,
      },
      sealedSession: "sealed_xxx",
    });

    const { POST } = await import("./verify-email.js");
    const res = await POST(
      makeRequest(
        { code: "123456", pendingAuthenticationToken: "pending_xyz" },
        "2",
      ),
    );

    expect(res.status).toBe(200);
    expect(verifyEmail).not.toHaveBeenCalled();
    const callArgs = authenticateWithEmailVerification.mock.calls[0]![0];
    expect(callArgs).toMatchObject({
      code: "123456",
      pendingAuthenticationToken: "pending_xyz",
      clientId: "client_test",
    });
  });

  it("rejects when neither userId nor pendingAuthenticationToken is present", async () => {
    const { POST } = await import("./verify-email.js");
    const res = await POST(makeRequest({ code: "123456" }, "3"));
    expect(res.status).toBe(400);
    expect(verifyEmail).not.toHaveBeenCalled();
  });

  it("collapses any verification failure to a single user-fixable message", async () => {
    verifyEmail.mockRejectedValueOnce(new Error("code_already_used"));

    const { POST } = await import("./verify-email.js");
    const res = await POST(makeRequest({ code: "old", userId: "user_x" }, "4"));

    expect(res.status).toBe(400);
    expect(((await res.json()) as { error: string }).error).toMatch(/invalid or has expired/i);
    expect(res.headers.get("set-cookie")).toBeNull();
  });
});
