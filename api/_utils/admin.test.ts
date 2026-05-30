import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock the session/tenant chokepoint so we can drive the admin gate without
// a real session. vi.hoisted so the mock fn exists before the factory runs.
const { mockRequire } = vi.hoisted(() => ({ mockRequire: vi.fn() }));
vi.mock("./session-with-tenant.js", () => ({
  requireSessionAndTenant: mockRequire,
}));

import { requireAdmin, isAdminEmail } from "./admin.js";

function req(): Request {
  return new Request("https://app.drafthr.io/api/marketplace/admin-queue", {
    method: "GET",
  });
}

function session(email: string) {
  return {
    ok: true as const,
    session: { user: { id: "u1", email } },
    userRow: { id: "u1", email },
  };
}

describe("isAdminEmail", () => {
  beforeEach(() => {
    delete process.env.DRAFTHR_ADMIN_EMAILS;
  });

  it("is false for everyone when the allowlist is unset (fail closed)", () => {
    expect(isAdminEmail("anyone@example.com")).toBe(false);
  });

  it("is false for null/empty input", () => {
    process.env.DRAFTHR_ADMIN_EMAILS = "admin@drafthr.io";
    expect(isAdminEmail(null)).toBe(false);
    expect(isAdminEmail(undefined)).toBe(false);
    expect(isAdminEmail("")).toBe(false);
  });

  it("matches case-insensitively and ignores surrounding whitespace", () => {
    process.env.DRAFTHR_ADMIN_EMAILS = " Admin@DraftHR.io , ops@drafthr.io ";
    expect(isAdminEmail("admin@drafthr.io")).toBe(true);
    expect(isAdminEmail("OPS@DRAFTHR.IO")).toBe(true);
    expect(isAdminEmail("intruder@drafthr.io")).toBe(false);
  });
});

describe("requireAdmin", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    delete process.env.DRAFTHR_ADMIN_EMAILS;
  });

  it("passes through the 401 when there is no session", async () => {
    mockRequire.mockResolvedValue({
      ok: false,
      response: new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401 }),
    });
    const r = await requireAdmin(req());
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.response.status).toBe(401);
  });

  it("fails closed (403) for a valid session when the allowlist is unset", async () => {
    mockRequire.mockResolvedValue(session("admin@drafthr.io"));
    const r = await requireAdmin(req());
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.response.status).toBe(403);
  });

  it("denies (403) a signed-in user not on the allowlist", async () => {
    process.env.DRAFTHR_ADMIN_EMAILS = "admin@drafthr.io";
    mockRequire.mockResolvedValue(session("intruder@example.com"));
    const r = await requireAdmin(req());
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.response.status).toBe(403);
  });

  it("allows a signed-in user whose email is on the allowlist", async () => {
    process.env.DRAFTHR_ADMIN_EMAILS = "admin@drafthr.io";
    mockRequire.mockResolvedValue(session("admin@drafthr.io"));
    const r = await requireAdmin(req());
    expect(r.ok).toBe(true);
  });
});
