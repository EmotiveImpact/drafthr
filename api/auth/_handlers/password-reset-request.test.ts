/**
 * password-reset-request handler tests.
 *
 * The whole reason this endpoint exists in its own file (rather than
 * being combined with confirm) is the anti-user-enumeration contract:
 * THIS endpoint ALWAYS returns 200 + generic body, no matter what.
 * These tests lock that contract in concrete.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";

const createPasswordReset = vi.fn();

vi.mock("../../_utils/workos.js", () => ({
  getWorkos: () => ({
    userManagement: { createPasswordReset },
  }),
}));

beforeEach(() => {
  createPasswordReset.mockReset();
  vi.resetModules();
});

function makeRequest(body: unknown, ipSuffix = "1") {
  return new Request("https://app.drafthr.io/api/auth/password-reset-request", {
    method: "POST",
    headers: {
      origin: "https://app.drafthr.io",
      "content-type": "application/json",
      "x-forwarded-for": `10.2.0.${ipSuffix}`,
    },
    body: JSON.stringify(body),
  });
}

describe("POST /api/auth/password-reset-request", () => {
  it("returns 200 + generic shape for a real email", async () => {
    createPasswordReset.mockResolvedValueOnce({
      passwordResetUrl: "https://app.drafthr.io/sign-in/reset-password?token=tok",
    });

    const { POST } = await import("./password-reset-request.js");
    const res = await POST(makeRequest({ email: "real@example.com" }));

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
    expect(createPasswordReset).toHaveBeenCalledWith({ email: "real@example.com" });
  });

  it("STILL returns 200 + generic shape when WorkOS says 'user not found' (anti-enumeration)", async () => {
    const notFound = Object.assign(new Error("user_not_found"), {
      status: 404,
      name: "NotFoundException",
    });
    createPasswordReset.mockRejectedValueOnce(notFound);

    const { POST } = await import("./password-reset-request.js");
    const res = await POST(makeRequest({ email: "ghost@example.com" }, "2"));

    // The whole anti-enumeration contract: identical shape to the happy path.
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
  });

  it("returns 200 even when WorkOS throws a generic 500", async () => {
    createPasswordReset.mockRejectedValueOnce(new Error("upstream timeout"));

    const { POST } = await import("./password-reset-request.js");
    const res = await POST(makeRequest({ email: "ok@example.com" }, "3"));

    expect(res.status).toBe(200);
  });

  it("rejects malformed email with a 400 (this 4xx is fine — it's about input shape, not existence)", async () => {
    const { POST } = await import("./password-reset-request.js");
    const res = await POST(makeRequest({ email: "not-an-email" }, "4"));
    expect(res.status).toBe(400);
    expect(createPasswordReset).not.toHaveBeenCalled();
  });
});
