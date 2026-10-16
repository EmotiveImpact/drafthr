/**
 * Durable (Postgres-backed) rate limiting. The DB is faked with a shared
 * counter map so we can simulate several serverless instances: each
 * `vi.resetModules()` + re-import is a fresh instance with an empty in-memory
 * limiter, but the same "database".
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const db = vi.hoisted(() => ({
  enabled: true,
  down: false,
  counters: new Map<string, number>(),
  statements: [] as string[],
}));

vi.mock("../../src/db/index.js", () => ({
  dbEnabled: () => db.enabled,
  getDb: () => ({
    execute: async (query: { queryChunks: unknown[] }) => {
      if (db.down) throw new Error("connect ECONNREFUSED");
      const text = query.queryChunks
        .map((c) =>
          typeof c === "object" && c && "value" in c ? (c as { value: string[] }).value.join("") : "?",
        )
        .join("");
      db.statements.push(text);
      if (text.includes("DELETE FROM rate_limits")) return { rows: [] };
      const params = query.queryChunks.filter((c) => typeof c === "string") as string[];
      const k = `${params[0]}|${params[1]}`;
      const next = (db.counters.get(k) ?? 0) + 1;
      db.counters.set(k, next);
      return { rows: [{ count: next }] };
    },
  }),
}));

function req(ip: string): Request {
  return new Request("https://app.drafthr.io/api/auth/password", {
    method: "POST",
    headers: { "x-real-ip": ip },
  });
}

async function freshInstance() {
  vi.resetModules();
  return await import("./rate-limit.js");
}

beforeEach(() => {
  db.enabled = true;
  db.down = false;
  db.counters.clear();
  db.statements = [];
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("rateLimitDurable", () => {
  const opts = { name: "auth-password", max: 3, windowMs: 60_000 };

  it("uses an atomic upsert that returns the new count", async () => {
    const { rateLimitDurable } = await freshInstance();
    expect(await rateLimitDurable(req("203.0.113.9"), opts)).toBeNull();
    const stmt = db.statements[0];
    expect(stmt).toMatch(/INSERT INTO rate_limits/);
    expect(stmt).toMatch(/ON CONFLICT \(key, window_start\)/);
    expect(stmt).toMatch(/DO UPDATE SET count = rate_limits.count \+ 1/);
    expect(stmt).toMatch(/RETURNING count/);
  });

  it("holds the limit across instances that each have an empty in-memory limiter", async () => {
    const ip = "198.51.100.20";
    // Four requests, each landing on a different cold instance.
    const results: (Response | null)[] = [];
    for (let i = 0; i < 4; i++) {
      const { rateLimitDurable } = await freshInstance();
      results.push(await rateLimitDurable(req(ip), opts));
    }
    expect(results.slice(0, 3).every((r) => r === null)).toBe(true);
    expect(results[3]?.status).toBe(429);
    expect(Number(results[3]?.headers.get("Retry-After"))).toBeGreaterThan(0);
  });

  it("checks the in-memory limiter first and skips the database when it already refuses", async () => {
    const { rateLimitDurable } = await freshInstance();
    const ip = "198.51.100.21";
    for (let i = 0; i < 3; i++) await rateLimitDurable(req(ip), opts);
    const before = db.statements.length;
    const limited = await rateLimitDurable(req(ip), opts);
    expect(limited?.status).toBe(429);
    expect(db.statements.length).toBe(before);
  });

  it("fails open with a console error when the database is unreachable", async () => {
    db.down = true;
    const errSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const { rateLimitDurable } = await freshInstance();
    expect(await rateLimitDurable(req("198.51.100.22"), opts)).toBeNull();
    expect(errSpy).toHaveBeenCalled();
  });

  it("still enforces the in-memory limit while the database is down", async () => {
    db.down = true;
    vi.spyOn(console, "error").mockImplementation(() => {});
    const { rateLimitDurable } = await freshInstance();
    const ip = "198.51.100.23";
    for (let i = 0; i < 3; i++) expect(await rateLimitDurable(req(ip), opts)).toBeNull();
    expect((await rateLimitDurable(req(ip), opts))?.status).toBe(429);
  });

  it("is a pure in-memory limiter when no database is configured", async () => {
    db.enabled = false;
    const { rateLimitDurable } = await freshInstance();
    expect(await rateLimitDurable(req("198.51.100.24"), opts)).toBeNull();
    expect(db.statements).toHaveLength(0);
  });
});

describe("rateLimitKeyDurable", () => {
  it("limits a subject across different client IPs and instances", async () => {
    const opts = { name: "auth-password-email", max: 2, windowMs: 60_000 };
    const results: (Response | null)[] = [];
    for (let i = 0; i < 3; i++) {
      const { rateLimitKeyDurable } = await freshInstance();
      results.push(await rateLimitKeyDurable("email:victim@acme.com", opts));
    }
    expect(results[0]).toBeNull();
    expect(results[1]).toBeNull();
    expect(results[2]?.status).toBe(429);
  });

  it("never stores the raw subject", async () => {
    const { durableRateLimitKey } = await freshInstance();
    const key = durableRateLimitKey("auth-password-email", "email:victim@acme.com");
    expect(key.startsWith("auth-password-email:")).toBe(true);
    expect(key).not.toContain("victim");
    expect(key).toMatch(/:[0-9a-f]{64}$/);
  });
});
