// @vitest-environment node
import { afterEach, describe, expect, it, vi } from "vitest";
import { PgDialect } from "drizzle-orm/pg-core";
const db = vi.hoisted(() => ({ transaction: vi.fn() }));
vi.mock("../../src/db/index.js", () => ({ getDb: () => db }));
import { rateLimit } from "./rate-limit.js";
afterEach(() => { vi.unstubAllEnvs(); vi.restoreAllMocks(); db.transaction.mockReset(); });
describe("hosted shared request protection", () => {
  const request = new Request("https://app.drafthr.io/api/draft", { headers: { "x-real-ip": "203.0.113.1" } });
  const rule = { name: "shared-test", max: 3, windowMs: 1000 };
  it("does not permit a hosted memory override", async () => {
    vi.stubEnv("VERCEL", "1"); vi.stubEnv("DRAFTHR_RATE_LIMIT_BACKEND", "memory");
    db.transaction.mockResolvedValue({ hits: 4, retry_after: 1 });
    expect((await rateLimit(request, rule))?.status).toBe(429);
    expect(db.transaction).toHaveBeenCalledOnce();
  });
  it("fails closed, with a retryable service error, when the shared store is unavailable", async () => {
    vi.stubEnv("VERCEL", "1");
    db.transaction.mockRejectedValue(new Error("private database credentials"));
    const logged = vi.spyOn(console, "error").mockImplementation(() => {});
    const response = await rateLimit(request, rule);
    expect(response?.status).toBe(503);
    expect(response?.headers.get("Retry-After")).toBe("5");
    expect(JSON.stringify(logged.mock.calls)).not.toContain("credentials");
  });
  it("allows requests only when the shared count is within the rule", async () => {
    vi.stubEnv("DRAFTHR_RATE_LIMIT_BACKEND", "database");
    db.transaction.mockResolvedValue({ hits: 3, retry_after: 2 });
    expect(await rateLimit(request, rule)).toBeNull();
    db.transaction.mockResolvedValue({ hits: 4, retry_after: 2 });
    expect((await rateLimit(request, rule))?.headers.get("Retry-After")).toBe("2");
  });
  it("captures one database instant for hit count, expiry and retry decisions", async () => {
    vi.stubEnv("DRAFTHR_RATE_LIMIT_BACKEND", "database");
    const execute = vi.fn().mockResolvedValue([{ hits: 1, retry_after: 1 }]);
    db.transaction.mockImplementation(async callback => callback({ execute }));
    expect(await rateLimit(request, rule)).toBeNull();
    const sql = new PgDialect().sqlToQuery(execute.mock.calls[1][0]).sql;
    expect(sql).toContain("AS MATERIALIZED (SELECT clock_timestamp() AS at)");
    expect(sql.match(/clock_timestamp\(\)/g)).toHaveLength(1);
    expect(sql.match(/SELECT at FROM rate_limit_now/g)).toHaveLength(4);
    const cleanup = new PgDialect().sqlToQuery(execute.mock.calls[2][0]).sql;
    expect(cleanup).toContain("ORDER BY expires_at, key LIMIT 1000 FOR UPDATE SKIP LOCKED");
  });
});
