/** Hash integrity, deterministic sequence order and transactional delivery. */
import { randomUUID } from "node:crypto";
import { afterAll, afterEach, describe, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";
import { appendAuditEvent, computeRowHash, GENESIS_PREV_HASH } from "./audit.js";
import { verifyAuditChain } from "./audit-verify.js";
import { closeDb, getDb } from "./index.js";
import { auditEvents, auditLogDeliveries, tenants } from "./schema.js";
import {
  setWorkosAuditLogsClient,
} from "../lib/audit/workos-sink.js";

import { AUDIT_MAX_ATTEMPTS, AUDIT_RETRY_WINDOW_MS, dispatchWorkOSAuditOutbox } from "../lib/audit/workos-outbox.js";

const localUrl = process.env.DRAFTHR_LOCAL_DATABASE_URL;
const localTestDatabase = process.env.DRAFTHR_LOCAL_WORKOS_EMULATOR === "1" && Boolean(localUrl && (() => {
  const url = new URL(localUrl);
  return ["localhost", "127.0.0.1"].includes(url.hostname) && url.port === "55432" && url.pathname.endsWith("_test");
})());
const itIfDb = localTestDatabase ? it : it.skip;

afterAll(async () => {
  if (localTestDatabase) await closeDb();
});

describe("audit chain", () => {
  it("produces a valid chain across draft.created → draft.updated → draft.deleted", () => {
    const subjectId = "11111111-1111-1111-1111-111111111111";
    const t0 = 1_700_000_000_000;

    const events = [
      {
        kind: "draft.created",
        payload: { letterType: "termination", title: "Test", sectionCount: 5 },
        createdAtEpochMs: t0,
      },
      {
        kind: "draft.updated",
        payload: { title: "Renamed", reviewStatus: "draft", sectionCount: 5 },
        createdAtEpochMs: t0 + 1000,
      },
      {
        kind: "draft.deleted",
        payload: { letterType: "termination", title: "Renamed" },
        createdAtEpochMs: t0 + 2000,
      },
    ];

    const chain: { rowHash: string; prevHash: string }[] = [];
    let prev = GENESIS_PREV_HASH;
    for (const e of events) {
      const rowHash = computeRowHash({
        prevHash: prev,
        payload: e.payload,
        kind: e.kind,
        subjectId,
        createdAtEpochMs: e.createdAtEpochMs,
      });
      chain.push({ rowHash, prevHash: prev });
      prev = rowHash;
    }

    expect(chain[0].prevHash).toBe(GENESIS_PREV_HASH);
    expect(chain[1].prevHash).toBe(chain[0].rowHash);
    expect(chain[2].prevHash).toBe(chain[1].rowHash);
    expect(new Set(chain.map((c) => c.rowHash)).size).toBe(3);

    // Re-walk: recompute every hash against the stored prevHash + payload.
    let expectedPrev = GENESIS_PREV_HASH;
    for (let i = 0; i < events.length; i++) {
      const recomputed = computeRowHash({
        prevHash: expectedPrev,
        payload: events[i].payload,
        kind: events[i].kind,
        subjectId,
        createdAtEpochMs: events[i].createdAtEpochMs,
      });
      expect(recomputed).toBe(chain[i].rowHash);
      expect(chain[i].prevHash).toBe(expectedPrev);
      expectedPrev = recomputed;
    }
  });

  it("breaks when a payload is tampered with retroactively", () => {
    const subjectId = "22222222-2222-2222-2222-222222222222";
    const events = [
      { kind: "draft.created", payload: { title: "Original" }, createdAtEpochMs: 1000 },
      { kind: "draft.updated", payload: { title: "Edit" }, createdAtEpochMs: 2000 },
    ];
    let prev = GENESIS_PREV_HASH;
    const chain: { rowHash: string; prevHash: string }[] = [];
    for (const e of events) {
      const rowHash = computeRowHash({
        prevHash: prev,
        payload: e.payload,
        kind: e.kind,
        subjectId,
        createdAtEpochMs: e.createdAtEpochMs,
      });
      chain.push({ rowHash, prevHash: prev });
      prev = rowHash;
    }

    // Tamper: an attacker rewrites event 0's payload.
    const tamperedRehash = computeRowHash({
      prevHash: GENESIS_PREV_HASH,
      payload: { title: "Tampered" },
      kind: "draft.created",
      subjectId,
      createdAtEpochMs: 1000,
    });
    expect(tamperedRehash).not.toBe(chain[0].rowHash);
    // Event 1's prevHash still points at the OLD hash — the chain is broken.
    expect(chain[1].prevHash).not.toBe(tamperedRehash);
  });

  itIfDb("serializes concurrent appends for the same tenant", async () => {
    const db = getDb();
    const tenantId = randomUUID();
    await db.insert(tenants).values({ id: tenantId, name: "audit concurrency test" });

    try {
      await Promise.all(
        Array.from({ length: 10 }, (_, i) =>
          appendAuditEvent({
            tenantId,
            kind: "draft.updated",
            subjectType: "draft",
            subjectId: randomUUID(),
            payload: { index: i },
          }),
        ),
      );

      const result = await verifyAuditChain(tenantId);
      expect(result).toEqual({ ok: true, rowCount: 10 });
    } finally {
      await db.delete(tenants).where(eq(tenants.id, tenantId));
    }
  });
});

describe("transactional WorkOS audit outbox", () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllEnvs();
    setWorkosAuditLogsClient(null);
  });

  async function fixture(run: (tenantId: string, createEvent: ReturnType<typeof vi.fn>) => Promise<void>) {
    vi.stubEnv("WORKOS_AUDIT_LOGS_ENABLED", "true");
    const tenantId = randomUUID();
    await getDb().insert(tenants).values({ id: tenantId, name: "fictional audit test", workosOrgId: `org_test_${tenantId}` });
    const createEvent = vi.fn(async () => undefined);
    setWorkosAuditLogsClient({ createEvent });
    try { await run(tenantId, createEvent); }
    finally { await getDb().delete(tenants).where(eq(tenants.id, tenantId)); }
  }
  function append(tenantId: string) {
    return appendAuditEvent({ tenantId, kind: "draft.updated", subjectType: "draft", subjectId: randomUUID(), payload: { title: "fictional test" } });
  }
  async function queued(tenantId: string) {
    return getDb().select().from(auditLogDeliveries).where(eq(auditLogDeliveries.tenantId, tenantId));
  }
  async function due(tenantId: string) {
    await getDb().update(auditLogDeliveries).set({ nextAttemptAt: new Date(0) }).where(eq(auditLogDeliveries.tenantId, tenantId));
  }

  itIfDb("commits audit + job together and never sends from the business transaction", async () => {
    await fixture(async (tenantId, createEvent) => {
      const db = getDb();
      const row = await db.transaction(async (tx) => {
        const result = await appendAuditEvent({ tenantId, kind: "draft.exported", subjectType: "draft", subjectId: randomUUID(), payload: { format: "pdf" } }, tx);
        expect(createEvent).not.toHaveBeenCalled();
        const uncommitted = await tx.select().from(auditLogDeliveries).where(eq(auditLogDeliveries.auditEventId, result.id));
        expect(uncommitted).toHaveLength(1);
        expect(await queued(tenantId)).toHaveLength(0);
        return result;
      });
      expect(await queued(tenantId)).toHaveLength(1);
      expect(createEvent).not.toHaveBeenCalled();
      createEvent.mockImplementation(async () => {
        expect(await queued(tenantId)).toHaveLength(1);
      });
      expect(await dispatchWorkOSAuditOutbox({ tenantId })).toMatchObject({ delivered: 1 });
      expect(createEvent).toHaveBeenCalledTimes(1);
      expect(createEvent.mock.calls[0][2]).toEqual({ idempotencyKey: row.id });
      expect((await queued(tenantId))[0].status).toBe("delivered");
      expect(await dispatchWorkOSAuditOutbox({ tenantId })).toMatchObject({ processed: 0 });
    });
  });

  itIfDb("rolls back delivery jobs with their business transaction", async () => {
    await fixture(async (tenantId, createEvent) => {
      await expect(getDb().transaction(async (tx) => {
        await appendAuditEvent({ tenantId, kind: "draft.updated", subjectType: "draft", subjectId: randomUUID(), payload: {} }, tx);
        throw new Error("business failure");
      })).rejects.toThrow("business failure");
      expect(await queued(tenantId)).toHaveLength(0);
      expect(await verifyAuditChain(tenantId)).toEqual({ ok: true, rowCount: 0 });
      await dispatchWorkOSAuditOutbox({ tenantId });
      expect(createEvent).not.toHaveBeenCalled();
    });
  });

  itIfDb("uses sequence order for same-millisecond appends and a backwards clock", async () => {
    await fixture(async (tenantId) => {
      vi.useFakeTimers({ toFake: ["Date"] });
      vi.setSystemTime(new Date("2026-10-03T10:00:00Z"));
      const rows = [];
      for (let n = 0; n < 12; n++) rows.push(await append(tenantId));
      vi.setSystemTime(new Date("2026-10-03T09:00:00Z"));
      rows.push(await append(tenantId));
      expect(rows.map(row => row.sequence)).toEqual(Array.from({ length: 13 }, (_, n) => n + 1));
      expect(await verifyAuditChain(tenantId)).toEqual({ ok: true, rowCount: 13 });
    });
  });

  itIfDb("retains the local event and retries a downstream failure with an identical snapshot", async () => {
    await fixture(async (tenantId, createEvent) => {
      createEvent.mockRejectedValueOnce(Object.assign(new Error("private provider details"), { status: 503 }));
      const row = await append(tenantId);
      expect(await dispatchWorkOSAuditOutbox({ tenantId })).toMatchObject({ retried: 1 });
      expect((await queued(tenantId))[0]).toMatchObject({ status: "pending", attempts: 1, lastError: "workos_http_503" });
      expect(await verifyAuditChain(tenantId)).toEqual({ ok: true, rowCount: 1 });
      await due(tenantId);
      expect(await dispatchWorkOSAuditOutbox({ tenantId })).toMatchObject({ delivered: 1 });
      expect(createEvent.mock.calls[1]).toEqual(createEvent.mock.calls[0]);
      expect(createEvent.mock.calls[1][2]).toEqual({ idempotencyKey: row.id });
    });
  });

  itIfDb("does not claim an unexpired lease twice across concurrent workers", async () => {
    await fixture(async (tenantId, createEvent) => {
      await append(tenantId);
      const results = await Promise.all([dispatchWorkOSAuditOutbox({ tenantId }), dispatchWorkOSAuditOutbox({ tenantId })]);
      expect(results.reduce((n, item) => n + item.delivered, 0)).toBe(1);
      expect(createEvent).toHaveBeenCalledTimes(1);
    });
  });

  itIfDb("recovers a crashed worker using the same idempotency key and frozen body", async () => {
    await fixture(async (tenantId, createEvent) => {
      const row = await append(tenantId);
      await getDb().update(auditLogDeliveries).set({
        status: "delivering", attempts: 1, firstAttemptAt: new Date(), leaseToken: randomUUID(), leaseExpiresAt: new Date(0),
      }).where(eq(auditLogDeliveries.auditEventId, row.id));
      expect(await dispatchWorkOSAuditOutbox({ tenantId })).toMatchObject({ delivered: 1 });
      expect(createEvent.mock.calls[0][2]).toEqual({ idempotencyKey: row.id });
      expect((await queued(tenantId))[0].attempts).toBe(2);
    });
  });

  itIfDb("retains expired ambiguous deliveries for reconciliation rather than duplicating them", async () => {
    await fixture(async (tenantId, createEvent) => {
      const row = await append(tenantId);
      await getDb().update(auditLogDeliveries).set({
        status: "delivering", attempts: 1, firstAttemptAt: new Date(Date.now() - AUDIT_RETRY_WINDOW_MS - 1000), leaseToken: randomUUID(), leaseExpiresAt: new Date(0),
      }).where(eq(auditLogDeliveries.auditEventId, row.id));
      expect(await dispatchWorkOSAuditOutbox({ tenantId })).toMatchObject({ failed: 1 });
      expect(createEvent).not.toHaveBeenCalled();
      expect((await queued(tenantId))[0]).toMatchObject({ status: "failed", lastError: "idempotency_window_expired" });
    });
  });

  itIfDb("dead-letters permanent errors without blocking unrelated events", async () => {
    await fixture(async (tenantId, createEvent) => {
      await append(tenantId); await append(tenantId);
      createEvent.mockRejectedValueOnce(Object.assign(new Error("invalid schema containing private values"), { status: 422 }));
      expect(await dispatchWorkOSAuditOutbox({ tenantId })).toMatchObject({ failed: 1, delivered: 1 });
      const failures = (await queued(tenantId)).filter(row => row.status === "failed");
      expect(failures[0].lastError).toBe("workos_http_422");
      expect(await verifyAuditChain(tenantId)).toEqual({ ok: true, rowCount: 2 });
    });
  });

  itIfDb("bounds retry attempts and leaves the failed job available for review", async () => {
    await fixture(async (tenantId, createEvent) => {
      await append(tenantId);
      createEvent.mockRejectedValue(new Error("connection failed"));
      for (let n = 0; n < AUDIT_MAX_ATTEMPTS; n++) { await due(tenantId); await dispatchWorkOSAuditOutbox({ tenantId }); }
      expect(createEvent).toHaveBeenCalledTimes(AUDIT_MAX_ATTEMPTS);
      expect((await queued(tenantId))[0]).toMatchObject({ status: "failed", attempts: AUDIT_MAX_ATTEMPTS });
      expect(await dispatchWorkOSAuditOutbox({ tenantId })).toMatchObject({ processed: 0 });
    });
  });

  itIfDb("never sends a queued event to a reassigned organization", async () => {
    await fixture(async (tenantId, createEvent) => {
      await append(tenantId);
      await getDb().update(tenants).set({ workosOrgId: `org_reassigned_${tenantId}` }).where(eq(tenants.id, tenantId));
      expect(await dispatchWorkOSAuditOutbox({ tenantId })).toMatchObject({ failed: 1 });
      expect(createEvent).not.toHaveBeenCalled();
      expect((await queued(tenantId))[0].lastError).toBe("workos_org_changed");
    });
  });

  itIfDb("does not enqueue when the opt-in flag or tenant organization is absent", async () => {
    await fixture(async (tenantId, createEvent) => {
      vi.stubEnv("WORKOS_AUDIT_LOGS_ENABLED", "false");
      await append(tenantId);
      vi.stubEnv("WORKOS_AUDIT_LOGS_ENABLED", "true");
      await getDb().update(tenants).set({ workosOrgId: null }).where(eq(tenants.id, tenantId));
      await append(tenantId);
      expect(await queued(tenantId)).toHaveLength(0);
      expect(createEvent).not.toHaveBeenCalled();
    });
  });

  itIfDb("reports payload corruption instead of treating sequence order as integrity proof", async () => {
    await fixture(async (tenantId) => {
      const row = await append(tenantId);
      await getDb().update(auditEvents).set({ payloadJson: { title: "tampered" } }).where(eq(auditEvents.id, row.id));
      expect(await verifyAuditChain(tenantId)).toMatchObject({ ok: false, reason: "row_hash_mismatch", brokenAtId: row.id });
    });
  });
});
