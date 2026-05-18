/**
 * computeRowHash is the load-bearing primitive for the audit chain. This
 * test reproduces the chain algorithm in-process (no DB) — append events,
 * pass each prev_hash forward, then re-walk the chain and verify each row's
 * row_hash matches its inputs. Mirrors the SQL-side `verifyAuditChain`.
 *
 * Also asserts the WorkOS Audit Logs sink is fire-and-forget AFTER the
 * transaction commits — the local chain insert must succeed (and the row
 * must be queryable from a fresh tx) before the WorkOS mirror runs.
 */
import { randomUUID } from "node:crypto";
import { afterAll, afterEach, describe, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";
import { appendAuditEvent, computeRowHash, GENESIS_PREV_HASH } from "./audit.js";
import { verifyAuditChain } from "./audit-verify.js";
import { closeDb, getDb } from "./index.js";
import { auditEvents, tenants } from "./schema.js";
import {
  setWorkosAuditLogsClient,
  type WorkosAuditLogsClient,
} from "../lib/audit/workos-sink.js";

const itIfDb = process.env.DATABASE_URL ? it : it.skip;

afterAll(async () => {
  if (process.env.DATABASE_URL) await closeDb();
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

describe("WorkOS mirror integration", () => {
  const ORIGINAL_FLAG = process.env.WORKOS_AUDIT_LOGS_ENABLED;
  afterEach(() => {
    if (ORIGINAL_FLAG === undefined) delete process.env.WORKOS_AUDIT_LOGS_ENABLED;
    else process.env.WORKOS_AUDIT_LOGS_ENABLED = ORIGINAL_FLAG;
    setWorkosAuditLogsClient(null);
  });

  itIfDb(
    "fires the WorkOS sink AFTER the chain row is persisted, with the row id as idempotency key",
    async () => {
      process.env.WORKOS_AUDIT_LOGS_ENABLED = "true";
      const db = getDb();
      const tenantId = randomUUID();
      const workosOrgId = `org_test_${randomUUID().slice(0, 8)}`;
      await db.insert(tenants).values({
        id: tenantId,
        name: "workos mirror test",
        workosOrgId,
      });

      const createEvent = vi.fn(async (organization: string, _event: unknown, _options?: unknown) => {
        // Critical assertion: the local row must already exist when the
        // mirror runs. If the mirror were called inside the transaction,
        // this query (running in the test's connection, not the writer's
        // tx) would see zero rows.
        const rows = await db
          .select()
          .from(auditEvents)
          .where(eq(auditEvents.tenantId, tenantId));
        expect(rows.length).toBe(1);
        expect(organization).toBe(workosOrgId);
      });
      const fakeClient = { createEvent } as unknown as WorkosAuditLogsClient;
      setWorkosAuditLogsClient(fakeClient);

      try {
        const result = await appendAuditEvent({
          tenantId,
          kind: "draft.exported",
          subjectType: "draft",
          subjectId: randomUUID(),
          payload: { format: "pdf" },
        });

        // appendAuditEvent doesn't await the mirror; wait for the microtask
        // queue to drain so the fire-and-forget completes before assertions.
        await new Promise((r) => setTimeout(r, 50));

        expect(createEvent).toHaveBeenCalledTimes(1);
        const [, event, options] = createEvent.mock.calls[0] as [
          string,
          { action: string },
          { idempotencyKey?: string },
        ];
        expect(options).toEqual({ idempotencyKey: result.id });
        expect(event.action).toBe("letters.draft.exported");
      } finally {
        await db.delete(tenants).where(eq(tenants.id, tenantId));
      }
    },
  );

  itIfDb("does NOT call the WorkOS sink when the tenant has no workos_org_id", async () => {
    process.env.WORKOS_AUDIT_LOGS_ENABLED = "true";
    const db = getDb();
    const tenantId = randomUUID();
    await db.insert(tenants).values({ id: tenantId, name: "no-org tenant" });

    const createEvent = vi.fn(async () => undefined);
    setWorkosAuditLogsClient({ createEvent });

    try {
      await appendAuditEvent({
        tenantId,
        kind: "draft.created",
        subjectType: "draft",
        subjectId: randomUUID(),
        payload: {},
      });
      await new Promise((r) => setTimeout(r, 50));
      expect(createEvent).not.toHaveBeenCalled();
    } finally {
      await db.delete(tenants).where(eq(tenants.id, tenantId));
    }
  });

  itIfDb(
    "does NOT call the WorkOS sink when the env flag is off, even with workos_org_id set",
    async () => {
      delete process.env.WORKOS_AUDIT_LOGS_ENABLED;
      const db = getDb();
      const tenantId = randomUUID();
      const workosOrgId = `org_off_${randomUUID().slice(0, 8)}`;
      await db.insert(tenants).values({
        id: tenantId,
        name: "flag off tenant",
        workosOrgId,
      });

      const createEvent = vi.fn(async () => undefined);
      setWorkosAuditLogsClient({ createEvent });

      try {
        await appendAuditEvent({
          tenantId,
          kind: "draft.created",
          subjectType: "draft",
          subjectId: randomUUID(),
          payload: {},
        });
        await new Promise((r) => setTimeout(r, 50));
        expect(createEvent).not.toHaveBeenCalled();
      } finally {
        await db.delete(tenants).where(eq(tenants.id, tenantId));
      }
    },
  );

  itIfDb(
    "does NOT throw when the WorkOS sink errors — the local row is still persisted",
    async () => {
      process.env.WORKOS_AUDIT_LOGS_ENABLED = "true";
      const db = getDb();
      const tenantId = randomUUID();
      const workosOrgId = `org_err_${randomUUID().slice(0, 8)}`;
      await db.insert(tenants).values({
        id: tenantId,
        name: "sink errors tenant",
        workosOrgId,
      });

      setWorkosAuditLogsClient({
        createEvent: vi.fn(async () => {
          throw new Error("simulated workos outage");
        }),
      });

      try {
        const result = await appendAuditEvent({
          tenantId,
          kind: "draft.created",
          subjectType: "draft",
          subjectId: randomUUID(),
          payload: { title: "still works" },
        });
        await new Promise((r) => setTimeout(r, 50));

        expect(result.id).toBeTruthy();
        const rows = await db
          .select()
          .from(auditEvents)
          .where(eq(auditEvents.tenantId, tenantId));
        expect(rows.length).toBe(1);
        expect(rows[0].id).toBe(result.id);
      } finally {
        await db.delete(tenants).where(eq(tenants.id, tenantId));
      }
    },
  );
});
