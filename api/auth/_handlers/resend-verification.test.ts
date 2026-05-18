/**
 * resend-verification handler tests.
 *
 * Key invariants:
 *   1. Always returns 200 regardless of whether the email exists.
 *   2. Only sends a verification email when the user exists AND is unverified.
 *   3. Rate-limited at 3/min/IP.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";

const sendVerificationEmail = vi.fn();
const listUsers = vi.fn();

vi.mock("../../_utils/workos.js", () => ({
  getWorkos: () => ({
    userManagement: { sendVerificationEmail, listUsers },
  }),
}));

beforeEach(() => {
  sendVerificationEmail.mockReset();
  listUsers.mockReset();
  vi.resetModules();
});

function makeRequest(body: unknown, ipSuffix = "1") {
  return new Request("https://app.drafthr.io/api/auth/resend-verification", {
    method: "POST",
    headers: {
      origin: "https://app.drafthr.io",
      "content-type": "application/json",
      "x-forwarded-for": `10.1.0.${ipSuffix}`,
    },
    body: JSON.stringify(body),
  });
}

describe("POST /api/auth/resend-verification", () => {
  it("returns 200 + generic shape for an unknown email (no sendVerificationEmail call)", async () => {
    listUsers.mockResolvedValueOnce({ data: [] });

    const { POST } = await import("./resend-verification.js");
    const res = await POST(makeRequest({ email: "ghost@example.com" }));

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
    expect(sendVerificationEmail).not.toHaveBeenCalled();
  });

  it("resends to an existing unverified user", async () => {
    listUsers.mockResolvedValueOnce({
      data: [{ id: "user_1", emailVerified: false }],
    });
    sendVerificationEmail.mockResolvedValueOnce({ user: { id: "user_1" } });

    const { POST } = await import("./resend-verification.js");
    const res = await POST(makeRequest({ email: "pending@example.com" }, "2"));

    expect(res.status).toBe(200);
    expect(sendVerificationEmail).toHaveBeenCalledWith({ userId: "user_1" });
  });

  it("does NOT resend when the user is already verified", async () => {
    listUsers.mockResolvedValueOnce({
      data: [{ id: "user_v", emailVerified: true }],
    });

    const { POST } = await import("./resend-verification.js");
    const res = await POST(makeRequest({ email: "v@example.com" }, "3"));

    expect(res.status).toBe(200);
    expect(sendVerificationEmail).not.toHaveBeenCalled();
  });

  it("still returns 200 when WorkOS throws (never reveals the failure)", async () => {
    listUsers.mockRejectedValueOnce(new Error("workos down"));

    const { POST } = await import("./resend-verification.js");
    const res = await POST(makeRequest({ email: "ok@example.com" }, "4"));

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
  });
});
