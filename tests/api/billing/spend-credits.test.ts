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

import { spendCredits, refundCredits, poolBalance } from "../../../api/_utils/entitlements.js";

beforeEach(() => {
  selectQueue = [];
  inserted.length = 0;
  execCalls.length = 0;
});

describe("spendCredits — atomic debit", () => {
  it("takes the per-pool advisory lock before reading the balance", async () => {
    selectQueue = [[{ delta: 5, expiresAt: null }]]; // user-only (no tenant)
    await spendCredits(null, "u1", 1, "ai_critique");
    expect(execCalls.length).toBe(1); // user-pool pg_advisory_xact_lock was issued
  });

  it("debits when the pooled balance is sufficient and returns the new balance", async () => {
    // tenant pool 5 + user packs 2 = 7 available
    selectQueue = [
      [{ delta: 5, expiresAt: null }],
      [{ delta: 2, expiresAt: null }],
    ];
    const r = await spendCredits("t1", "u1", 3, "ai_critique");
    expect(r).toMatchObject({ ok: true, balance: 4 });
    expect(execCalls.length).toBe(2); // tenant + user pool locks
    expect(inserted).toHaveLength(1);
    expect(inserted[0]).toMatchObject({ subjectType: "tenant", subjectId: "t1", delta: -3, reason: "ai_critique" });
  });

  it("refuses (no insert) when the balance is insufficient", async () => {
    selectQueue = [[{ delta: 0, expiresAt: null }]];
    const r = await spendCredits(null, "u1", 1, "ai_critique");
    expect(r).toMatchObject({ ok: false, balance: 0 });
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
    expect(r).toMatchObject({ ok: true, balance: 3 });
    expect(inserted[0]).toMatchObject({ subjectType: "user", subjectId: "u9", delta: -1 });
  });
  it("debits the user's own pack (not the workspace) once the workspace pool is empty", async () => {
    // tenant pool 1 + user pack 10. A 3-credit spend takes 1 from the tenant
    // and 2 from the user, so the user pack can't be re-spent in another workspace.
    selectQueue = [
      [{ delta: 1, expiresAt: null }],
      [{ delta: 10, expiresAt: null }],
    ];
    const r = await spendCredits("t1", "u1", 3, "ai_critique");
    expect(r).toMatchObject({ ok: true, balance: 8 });
    expect(inserted).toEqual([
      expect.objectContaining({ subjectType: "tenant", subjectId: "t1", delta: -1 }),
      expect.objectContaining({ subjectType: "user", subjectId: "u1", delta: -2 }),
    ]);
  });
});

describe("poolBalance — expiring grants", () => {
  const at = (iso: string) => new Date(iso);

  it("does not let last period's spends eat this period's drip", () => {
    const rows = [
      { delta: 50, expiresAt: at("2026-02-01"), createdAt: at("2026-01-01") },
      { delta: -30, expiresAt: null, createdAt: at("2026-01-10") },
      { delta: 50, expiresAt: at("2026-03-01"), createdAt: at("2026-02-01") },
    ];
    expect(poolBalance(rows, at("2026-02-10").getTime())).toBe(50);
  });

  it("spends soonest-expiring credits before non-expiring packs", () => {
    const rows = [
      { delta: 10, expiresAt: null, createdAt: at("2026-01-01") }, // pack
      { delta: 5, expiresAt: at("2026-02-01"), createdAt: at("2026-01-02") }, // drip
      { delta: -5, expiresAt: null, createdAt: at("2026-01-05") },
    ];
    // The drip absorbed the spend, so the whole pack survives the drip's expiry.
    expect(poolBalance(rows, at("2026-02-10").getTime())).toBe(10);
  });

  it("never goes below zero", () => {
    expect(poolBalance([{ delta: -3, expiresAt: null, createdAt: at("2026-01-01") }])).toBe(0);
  });
});

describe("refundCredits — makes a failed paid action whole", () => {
  it("credits back each pool that was debited", async () => {
    await refundCredits(
      [
        { subjectType: "tenant", subjectId: "t1", amount: 1 },
        { subjectType: "user", subjectId: "u1", amount: 2 },
      ],
      "ai_critique_refund",
    );
    expect(inserted).toEqual([
      expect.objectContaining({ subjectType: "tenant", subjectId: "t1", delta: 1, reason: "ai_critique_refund" }),
      expect.objectContaining({ subjectType: "user", subjectId: "u1", delta: 2, reason: "ai_critique_refund" }),
    ]);
  });

  it("no-ops when nothing was debited", async () => {
    await refundCredits([], "ai_critique_refund");
    expect(inserted).toHaveLength(0);
  });
});
