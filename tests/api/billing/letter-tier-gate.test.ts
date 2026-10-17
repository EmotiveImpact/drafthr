import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { entitlementPurchases } from "../../../src/db/schema.js";

// Fake db: no subscription and no credits. entitlement_purchases selects
// resolve in order: first the unconsumed single letters, then the packs.
let purchaseQueue: unknown[][] = [];
function chain(rows: () => unknown[]) {
  const c = {
    where: () => c,
    orderBy: () => c,
    limit: () => Promise.resolve(rows()),
    then: (resolve: (v: unknown[]) => unknown) => resolve(rows()),
  };
  return c;
}
vi.mock("../../../src/db/index.js", () => ({
  getDb: () => ({
    select: () => ({
      from: (table: unknown) =>
        chain(() => (table === entitlementPurchases ? purchaseQueue.shift() ?? [] : [])),
    }),
  }),
}));

const { assertCanCreateLetter } = await import("../../../api/_utils/entitlements.js");

describe("assertCanCreateLetter — one-off letters unlock only their tier", () => {
  const prev = process.env.DRAFTHR_ENFORCE_PAYWALL;
  beforeEach(() => {
    process.env.DRAFTHR_ENFORCE_PAYWALL = "1";
  });
  afterEach(() => {
    if (prev === undefined) delete process.env.DRAFTHR_ENFORCE_PAYWALL;
    else process.env.DRAFTHR_ENFORCE_PAYWALL = prev;
  });

  it("refuses a tribunal-bound letter on a routine purchase", async () => {
    purchaseQueue = [[{ id: "e1", kind: "letter_routine" }], []];
    const gate = await assertCanCreateLetter("t1", "u1", "tribunal_cover");
    expect(gate.ok).toBe(false);
    if (!gate.ok) {
      expect(gate.code).toBe(402);
      expect(gate.reason).toMatch(/doesn't cover this type of letter/);
    }
  });

  it("allows the letter the purchase was bought for, and consumes that purchase", async () => {
    purchaseQueue = [[{ id: "e1", kind: "letter_routine" }], []];
    const gate = await assertCanCreateLetter("t1", "u1", "resignation_clean");
    expect(gate).toEqual({ ok: true, consume: { entitlementId: "e1", kind: "letter" } });
  });

  it("falls through to a pack with letters left when no single letter covers it", async () => {
    purchaseQueue = [[{ id: "e1", kind: "letter_routine" }], [{ id: "p1", lettersTotal: 4, lettersUsed: 1 }]];
    const gate = await assertCanCreateLetter("t1", "u1", "grievance");
    expect(gate).toEqual({ ok: true, consume: { entitlementId: "p1", kind: "pack" } });
  });
});
