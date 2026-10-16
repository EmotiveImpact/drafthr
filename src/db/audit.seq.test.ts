/**
 * The audit chain is ordered by a per-tenant `seq`, not by the app clock.
 *
 * These tests run without a database: appendAuditEvent is exercised against a
 * fake transaction that records what it was asked to do, and the verifier's
 * pure walk is exercised directly. The DB-backed concurrency test lives in
 * audit.test.ts (skipped without DATABASE_URL).
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";

type Recorded = {
  executed: number;
  orderByArgs: unknown[];
  inserted: Record<string, unknown> | null;
  steps: string[];
};

const rec = vi.hoisted(
  (): Recorded => ({ executed: 0, orderByArgs: [], inserted: null, steps: [] }),
);
const head = vi.hoisted(() => ({ row: null as null | { rowHash: string; seq: number | string } }));

vi.mock("../lib/audit/workos-sink.js", () => ({
  sendToWorkOSAuditLogs: vi.fn(async () => ({ ok: true })),
}));

vi.mock("./index.js", () => {
  const tx = {
    execute: async () => {
      rec.executed += 1;
      rec.steps.push("lock");
      return { rows: [] };
    },
    select: () => ({
      from: () => ({
        where: () => ({
          orderBy: (...args: unknown[]) => {
            rec.orderByArgs = args;
            rec.steps.push("read-head");
            return { limit: async () => (head.row ? [head.row] : []) };
          },
          limit: async () => [],
        }),
      }),
    }),
    insert: () => ({
      values: (v: Record<string, unknown>) => {
        rec.inserted = v;
        rec.steps.push("insert");
        return {
          returning: async () => [
            { id: "evt_1", seq: v.seq, rowHash: v.rowHash, prevHash: v.prevHash, createdAt: v.createdAt },
          ],
        };
      },
    }),
  };
  return {
    getDb: () => ({
      ...tx,
      transaction: async (fn: (t: typeof tx) => unknown) => fn(tx),
    }),
  };
});

import { appendAuditEvent, computeRowHash, GENESIS_PREV_HASH, nextAuditSeq } from "./audit.js";
import { verifyAuditRows } from "./audit-verify.js";
import { auditEvents } from "./schema.js";

beforeEach(() => {
  rec.executed = 0;
  rec.orderByArgs = [];
  rec.inserted = null;
  rec.steps = [];
  head.row = null;
});

describe("nextAuditSeq", () => {
  it("starts a tenant's chain at 1", () => {
    expect(nextAuditSeq(null)).toBe(1);
    expect(nextAuditSeq(undefined)).toBe(1);
  });

  it("advances by one and tolerates bigint-as-string from the driver", () => {
    expect(nextAuditSeq(41)).toBe(42);
    expect(nextAuditSeq("41")).toBe(42);
    expect(nextAuditSeq(BigInt(7))).toBe(8);
  });

  it("refuses a corrupt head rather than guessing", () => {
    expect(() => nextAuditSeq("not-a-number")).toThrow();
    expect(() => nextAuditSeq(-1)).toThrow();
  });
});

describe("appendAuditEvent ordering", () => {
  const input = {
    tenantId: "00000000-0000-0000-0000-0000000000aa",
    kind: "draft.updated",
    subjectType: "draft",
    subjectId: "00000000-0000-0000-0000-0000000000bb",
    payload: { n: 1 },
  };

  it("locks the tenant, reads the head by seq, then inserts head.seq + 1", async () => {
    head.row = { rowHash: "a".repeat(64), seq: "9" };
    const out = await appendAuditEvent(input);

    expect(rec.steps).toEqual(["lock", "read-head", "insert"]);
    // Head is chosen by seq, never by created_at.
    const order = rec.orderByArgs[0] as { queryChunks?: unknown[] };
    expect(order.queryChunks).toContain(auditEvents.seq);
    expect(order.queryChunks).not.toContain(auditEvents.createdAt);
    expect(rec.inserted?.seq).toBe(10);
    expect(rec.inserted?.prevHash).toBe("a".repeat(64));
    expect(out.seq).toBe(10);
  });

  it("uses the genesis hash and seq 1 for a tenant's first event", async () => {
    await appendAuditEvent(input);
    expect(rec.inserted?.seq).toBe(1);
    expect(rec.inserted?.prevHash).toBe(GENESIS_PREV_HASH);
  });
});

describe("verifyAuditRows", () => {
  function buildChain(createdAts: number[]) {
    let prev = GENESIS_PREV_HASH;
    return createdAts.map((ms, i) => {
      const payload = { i };
      const rowHash = computeRowHash({
        prevHash: prev,
        payload,
        kind: "draft.updated",
        subjectId: "s",
        createdAtEpochMs: ms,
      });
      const row = {
        id: `row_${i}`,
        seq: i + 1,
        prevHash: prev,
        rowHash,
        payloadJson: payload,
        kind: "draft.updated",
        subjectId: "s",
        createdAt: new Date(ms),
      };
      prev = rowHash;
      return row;
    });
  }

  it("accepts a burst of events in the same millisecond (no clock-based fork)", () => {
    const rows = buildChain([1000, 1000, 1000, 1000]);
    expect(verifyAuditRows(rows)).toEqual({ ok: true, rowCount: 4 });
  });

  it("accepts a chain whose clock went backwards between instances", () => {
    const rows = buildChain([5000, 4000, 4500]);
    expect(verifyAuditRows(rows)).toEqual({ ok: true, rowCount: 3 });
  });

  it("reports a missing position as a seq gap", () => {
    const rows = buildChain([1, 2, 3]);
    const withGap = [rows[0], rows[2]];
    const result = verifyAuditRows(withGap);
    expect(result).toMatchObject({ ok: false, reason: "seq_gap", brokenAtId: "row_2" });
  });

  it("still detects a tampered payload", () => {
    const rows = buildChain([1, 2]);
    rows[0] = { ...rows[0], payloadJson: { i: 99 } };
    expect(verifyAuditRows(rows)).toMatchObject({ ok: false, reason: "row_hash_mismatch" });
  });
});

describe("migration 0021 (append-only audit table)", () => {
  const root = path.resolve(__dirname, "../..");
  const sqlText = readFileSync(path.join(root, "drizzle/migrations/0021_ops_security.sql"), "utf8");

  it("is registered in the drizzle journal as idx 21", () => {
    const journal = JSON.parse(
      readFileSync(path.join(root, "drizzle/migrations/meta/_journal.json"), "utf8"),
    ) as { entries: { idx: number; tag: string }[] };
    expect(journal.entries.find((e) => e.idx === 21)?.tag).toBe("0021_ops_security");
  });

  it("adds seq idempotently and backfills by (created_at, id) per tenant", () => {
    expect(sqlText).toMatch(/ADD COLUMN IF NOT EXISTS "seq" bigint/);
    expect(sqlText).toMatch(/PARTITION BY "tenant_id" ORDER BY "created_at" ASC, "id" ASC/);
    expect(sqlText).toMatch(/CREATE UNIQUE INDEX IF NOT EXISTS "audit_events_tenant_seq_uniq"/);
  });

  it("installs a re-runnable trigger that rejects UPDATE and DELETE", () => {
    expect(sqlText).toMatch(/CREATE OR REPLACE FUNCTION "audit_events_reject_mutation"/);
    const drop = sqlText.indexOf('DROP TRIGGER IF EXISTS "audit_events_append_only"');
    const create = sqlText.indexOf('CREATE TRIGGER "audit_events_append_only"');
    expect(drop).toBeGreaterThan(-1);
    expect(create).toBeGreaterThan(drop);
    expect(sqlText).toMatch(/BEFORE UPDATE OR DELETE ON "audit_events"/);
  });

  it("numbers rows inserted without a seq, so code from before 0021 keeps its audit trail", () => {
    // The app and the migration don't ship atomically: until the new code is
    // live (or after a rollback), inserts arrive without seq and would fail
    // the NOT NULL. A BEFORE INSERT trigger numbers them; it must only fill a
    // missing seq, never override one the app assigned under its lock.
    const fn = sqlText.slice(sqlText.indexOf('CREATE OR REPLACE FUNCTION "audit_events_assign_seq"'));
    expect(fn.length).toBeLessThan(sqlText.length);
    expect(fn).toMatch(/IF NEW\."seq" IS NULL THEN/);
    expect(fn).toMatch(/coalesce\(max\("seq"\), 0\) \+ 1/i);
    const drop = sqlText.indexOf('DROP TRIGGER IF EXISTS "audit_events_assign_seq"');
    const create = sqlText.indexOf('CREATE TRIGGER "audit_events_assign_seq"');
    expect(drop).toBeGreaterThan(-1);
    expect(create).toBeGreaterThan(drop);
    expect(sqlText).toMatch(/BEFORE INSERT ON "audit_events"/);
    // Installed only once every existing row has a seq (after the backfill).
    expect(create).toBeGreaterThan(sqlText.indexOf('ALTER COLUMN "seq" SET NOT NULL'));
  });

  it("creates the durable rate_limits table idempotently", () => {
    expect(sqlText).toMatch(/CREATE TABLE IF NOT EXISTS "rate_limits"/);
    expect(sqlText).toMatch(/PRIMARY KEY \("key", "window_start"\)/);
  });
});
