/**
 * password-reset-confirm handler tests.
 *
 *   - Happy path: token + new password → 200, Set-Cookie minted.
 *   - Invalid token: 400 with a "request a new link" message.
 *   - Password too weak: 400 with the WorkOS message echoed.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";

const resetPassword = vi.fn();

vi.mock("../../_utils/workos.js", () => ({
  getWorkos: () => ({
    userManagement: { resetPassword },
  }),
  buildClearCookie: vi.fn(() => "drafthr_session=; Path=/; Max-Age=0; HttpOnly"),
  // SessionPayload is a type, not a value — vi.mock factories only need to
  // surface the values the handler imports.
  SESSION_COOKIE: "drafthr_session",
}));

beforeEach(() => {
  resetPassword.mockReset();
  vi.resetModules();
});

function makeRequest(body: unknown, ipSuffix = "1") {
  return new Request("https://app.drafthr.io/api/auth/password-reset-confirm", {
    method: "POST",
    headers: {
      origin: "https://app.drafthr.io",
      "content-type": "application/json",
      "x-forwarded-for": `10.3.0.${ipSuffix}`,
    },
    body: JSON.stringify(body),
  });
}

describe("POST /api/auth/password-reset-confirm", () => {
  it("resets the password and requires WorkOS sign-in instead of minting a bypass cookie", async () => {
    resetPassword.mockResolvedValueOnce({
      user: {
        id: "user_1",
        email: "ok@example.com",
        firstName: "Ada",
        lastName: "Lovelace",
        profilePictureUrl: null,
      },
    });

    const { POST } = await import("./password-reset-confirm.js");
    const res = await POST(
      makeRequest({ token: "tok_abc", password: "newpassword123" }),
    );

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, requiresSignIn: true });
    expect(res.headers.get("set-cookie")).toContain("Max-Age=0");
    expect(resetPassword).toHaveBeenCalledWith({
      token: "tok_abc",
      newPassword: "newpassword123",
    });
  });

  it("returns 400 with the expired-link message on a generic failure", async () => {
    resetPassword.mockRejectedValueOnce(new Error("password_reset_not_found"));

    const { POST } = await import("./password-reset-confirm.js");
    const res = await POST(
      makeRequest({ token: "expired", password: "newpassword123" }, "2"),
    );

    expect(res.status).toBe(400);
    expect(((await res.json()) as { error: string }).error).toMatch(/expired/i);
    expect(res.headers.get("set-cookie")).toBeNull();
  });

  it("echoes a 422 password-policy error", async () => {
    const policy = Object.assign(
      new Error("password_too_weak"),
      { status: 422, name: "UnprocessableEntityException" },
    );
    resetPassword.mockRejectedValueOnce(policy);

    const { POST } = await import("./password-reset-confirm.js");
    const res = await POST(
      makeRequest({ token: "tok", password: "newpassword123" }, "3"),
    );

    expect(res.status).toBe(400);
    expect(((await res.json()) as { error: string }).error).toBe("password_too_weak");
  });

  it("rejects an empty token / short password before calling WorkOS", async () => {
    const { POST } = await import("./password-reset-confirm.js");
    const r1 = await POST(makeRequest({ token: "", password: "newpassword123" }, "4"));
    expect(r1.status).toBe(400);
    const r2 = await POST(makeRequest({ token: "tok", password: "short" }, "5"));
    expect(r2.status).toBe(400);
    expect(resetPassword).not.toHaveBeenCalled();
  });
});
