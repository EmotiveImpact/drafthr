import { describe, it, expect, beforeEach, vi } from "vitest";

// Fake db/tx: creditBalance() issues one select per subject (tenant then user);
// each resolves to the next queued row-set. insert() records the ledger row.
// transaction() runs the callback with the same fake as `tx`, and execute()
// (the advisory lock) is a no-op we can assert was taken.
type Row = { delta: number; expiresAt: Date | null };
let selectQueue: Row[][] = [];
const inserted: Array<Record<string, unknown>> = [];
const execCalls: unknown[] = [];

const exec = {
  select: () => ({ from: () => ({ where: () => Promise.resolve(selectQueue.shift() ?? []) }) }),
  insert: () => ({
    values: (v: Record<string, unknown>) => {
      inserted.push(v);
      return Promise.resolve();
    },
  }),
  execute: (q: unknown) => {
    execCalls.push(q);
    return Promise.resolve();
  },
};
const db = {
  ...exec,
  transaction: async (cb: (tx: typeof exec) => unknown) => cb(exec),
};

vi.mock("../../../src/db/index.js", () => ({ getDb: () => db }));

import { spendCredits, refundCredits } from "../../../api/_utils/entitlements.js";

beforeEach(() => {
  selectQueue = [];
  inserted.length = 0;
  execCalls.length = 0;
});

describe("spendCredits — atomic debit", () => {
  it("takes the per-pool advisory lock before reading the balance", async () => {
    selectQueue = [[{ delta: 5, expiresAt: null }]]; // user-only (no tenant)
    await spendCredits(null, "u1", 1, "ai_critique");
    expect(execCalls.length).toBe(1); // pg_advisory_xact_lock was issued
  });

  it("debits when the pooled balance is sufficient and returns the new balance", async () => {
    // tenant pool 5 + user packs 2 = 7 available
    selectQueue = [
      [{ delta: 5, expiresAt: null }],
      [{ delta: 2, expiresAt: null }],
    ];
    const r = await spendCredits("t1", "u1", 3, "ai_critique");
    expect(r).toEqual({ ok: true, balance: 4 });
    expect(inserted).toHaveLength(1);
    expect(inserted[0]).toMatchObject({ subjectType: "tenant", subjectId: "t1", delta: -3, reason: "ai_critique" });
  });

  it("refuses (no insert) when the balance is insufficient", async () => {
    selectQueue = [[{ delta: 0, expiresAt: null }]];
    const r = await spendCredits(null, "u1", 1, "ai_critique");
    expect(r).toEqual({ ok: false, balance: 0 });
    expect(inserted).toHaveLength(0);
  });

  it("excludes expired credits from the spendable balance", async () => {
    const past = new Date(Date.now() - 60_000);
    selectQueue = [[{ delta: 10, expiresAt: past }]]; // all expired
    const r = await spendCredits(null, "u1", 1, "ai_critique");
    expect(r.ok).toBe(false);
    expect(inserted).toHaveLength(0);
  });

  it("rejects a non-positive amount without touching the ledger", async () => {
    const r = await spendCredits("t1", "u1", 0, "ai_critique");
    expect(r.ok).toBe(false);
    expect(execCalls).toHaveLength(0);
    expect(inserted).toHaveLength(0);
  });

  it("debits the user directly when there is no tenant pool", async () => {
    selectQueue = [[{ delta: 4, expiresAt: null }]]; // user-only
    const r = await spendCredits(null, "u9", 1, "ai_critique");
    expect(r).toEqual({ ok: true, balance: 3 });
    expect(inserted[0]).toMatchObject({ subjectType: "user", subjectId: "u9", delta: -1 });
  });
});

describe("refundCredits — makes a failed paid action whole", () => {
  it("inserts a positive ledger entry for the debited subject", async () => {
    await refundCredits("t1", "u1", 1, "ai_critique_refund");
    expect(inserted).toHaveLength(1);
    expect(inserted[0]).toMatchObject({ subjectType: "tenant", subjectId: "t1", delta: 1, reason: "ai_critique_refund" });
  });

  it("no-ops on a non-positive amount", async () => {
    await refundCredits("t1", "u1", 0, "ai_critique_refund");
    expect(inserted).toHaveLength(0);
  });
});
