// @vitest-environment node
import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { closeDb } from "../../src/db/index.js";
import { eq } from "drizzle-orm";
import { rateLimitBuckets } from "../../src/db/schema.js";
import { rateLimit } from "./rate-limit.js";

describe.skipIf(!process.env.DRAFTHR_LOCAL_DATABASE_URL)("shared rate limits against disposable Postgres", () => {
  beforeAll(() => {
    vi.stubEnv("DRAFTHR_LOCAL_WORKOS_EMULATOR", "1");
    vi.stubEnv("DRAFTHR_RATE_LIMIT_BACKEND", "database");
  });
  afterAll(async () => { await closeDb(); vi.unstubAllEnvs(); });
  const req = new Request("http://localhost/api/draft", { headers: { "x-real-ip": "198.51.100.20" } });
  it("atomically grants only the configured number of concurrent requests", async () => {
    const rule = { name: `test-${randomUUID()}`, max: 5, windowMs: 60_000 };
    const responses = await Promise.all(Array.from({ length: 16 }, () => rateLimit(req, rule)));
    expect(responses.filter(response => response === null)).toHaveLength(5);
    expect(responses.filter(response => response?.status === 429)).toHaveLength(11);
  });
  it("shares counters across independently loaded worker modules", async () => {
    const rule = { name: `test-${randomUUID()}`, max: 1, windowMs: 60_000 };
    expect(await rateLimit(req, rule)).toBeNull();
    vi.resetModules();
    const second = await import("./rate-limit.js");
    const db = await import("../../src/db/index.js");
    try { expect((await second.rateLimit(req, rule))?.status).toBe(429); }
    finally { await db.closeDb(); }
  });
  it("permits a new request after the stored window expires", async () => {
    const rule = { name: `test-${randomUUID()}`, max: 1, windowMs: 40 };
    expect(await rateLimit(req, rule)).toBeNull();
    await new Promise(resolve => setTimeout(resolve, 65));
    expect(await rateLimit(req, rule)).toBeNull();
  });
  it("admits requests while another worker holds a refreshed expired bucket", async () => {
    // Cleanup can see the old expired version while a refresh is uncommitted.
    // It must skip the lock instead of waiting for a circular dependency.
    vi.resetModules();
    const worker = await import("./rate-limit.js");
    const database = await import("../../src/db/index.js");
    const db = database.getDb();
    const key = `cleanup-lock-${randomUUID()}`;
    await db.insert(rateLimitBuckets).values({ key, hits: 1, expiresAt: new Date(Date.now() - 7_200_000) });
    let release!: () => void;
    let locked!: () => void;
    const held = new Promise<void>(resolve => { release = resolve; });
    const acquired = new Promise<void>(resolve => { locked = resolve; });
    const holder = db.transaction(async tx => {
      await tx.update(rateLimitBuckets).set({ expiresAt: new Date(Date.now() + 60_000) }).where(eq(rateLimitBuckets.key, key));
      locked();
      await held;
    });
    try {
      await Promise.race([acquired, holder]);
      expect(await worker.rateLimit(req, { name: `cleanup-${randomUUID()}`, max: 1, windowMs: 60_000 })).toBeNull();
    } finally {
      release(); await holder;
      await db.delete(rateLimitBuckets).where(eq(rateLimitBuckets.key, key));
      await database.closeDb();
    }
  });
});
