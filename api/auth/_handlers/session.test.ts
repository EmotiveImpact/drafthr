/**
 * session.ts API handler tests.
 *
 * The SPA's only mount-time auth fetch. Untested at 0.16.0 (the deeper
 * test file tests/api/auth/session.test.ts exists for the DB-backed
 * tenant-election branch but doesn't cover the no-DB / no-session paths).
 *
 * Invariants tested here are deliberately the simple, DB-free paths:
 *   1. No cookie → 200 with user=null, activeTenant=null, hasAnyTenant=false.
 *   2. Invalid / expired cookie → same shape (never 401 — the SPA polls
 *      this on every load and a 401 would spam Sentry).
 *   3. When DB is disabled (no DATABASE_URL), valid cookie returns user
 *      but no activeTenant.
 *   4. Cache-Control: no-store so the SPA always sees the latest state.
 *
 * The DB-backed branch (auto-election of activeTenant when no row is
 * flagged active) is covered separately in tests/api/auth/session.test.ts
 * because it needs a Drizzle mock harness — we don't duplicate it here.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../_utils/workos.js", async () => {
  const actual = await vi.importActual<typeof import("../../_utils/workos.js")>(
    "../../_utils/workos.js",
  );
  return {
    ...actual,
    getSessionFromRequest: vi.fn(),
  };
});

vi.mock("../../../src/db/index.js", () => ({
  dbEnabled: () => false,
  getDb: () => {
    throw new Error("DB should not be touched when dbEnabled() is false");
  },
}));

import { getSessionFromRequest } from "../../_utils/workos.js";

beforeEach(() => {
  vi.mocked(getSessionFromRequest).mockReset();
});

function makeRequest() {
  return new Request("https://app.drafthr.io/api/auth/session", {
    method: "GET",
    headers: { accept: "application/json" },
  });
}

describe("GET /api/auth/session", () => {
  it("returns user=null + activeTenant=null when no session cookie is present", async () => {
    vi.mocked(getSessionFromRequest).mockResolvedValueOnce(null);

    const { GET } = await import("./session.js");
    const res = await GET(makeRequest());

    expect(res.status).toBe(200);
    const json = (await res.json()) as {
      user: unknown;
      activeTenant: unknown;
      hasAnyTenant: boolean;
    };
    expect(json.user).toBeNull();
    expect(json.activeTenant).toBeNull();
    expect(json.hasAnyTenant).toBe(false);
  });

  it("never 401s on missing session (SPA polls this; 401 would be Sentry noise)", async () => {
    vi.mocked(getSessionFromRequest).mockResolvedValueOnce(null);

    const { GET } = await import("./session.js");
    const res = await GET(makeRequest());
    expect(res.status).toBe(200);
  });

  it("sets Cache-Control: no-store so stale session state isn't served", async () => {
    vi.mocked(getSessionFromRequest).mockResolvedValueOnce(null);

    const { GET } = await import("./session.js");
    const res = await GET(makeRequest());
    expect(res.headers.get("cache-control")).toBe("no-store");
  });

  it("returns the user payload when a session exists but DB is disabled", async () => {
    vi.mocked(getSessionFromRequest).mockResolvedValueOnce({
      user: {
        id: "user_123",
        email: "alice@example.com",
        firstName: "Alice",
        lastName: null,
        profilePictureUrl: null,
      },
      workosSession: "",
      iat: Date.now(),
    });

    const { GET } = await import("./session.js");
    const res = await GET(makeRequest());

    expect(res.status).toBe(200);
    const json = (await res.json()) as {
      user: { email: string } | null;
      activeTenant: unknown;
      hasAnyTenant: boolean;
    };
    expect(json.user?.email).toBe("alice@example.com");
    // DB disabled → no tenant lookup → null + false
    expect(json.activeTenant).toBeNull();
    expect(json.hasAnyTenant).toBe(false);
  });
});
