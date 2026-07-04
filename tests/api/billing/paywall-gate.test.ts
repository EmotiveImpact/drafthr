import { describe, it, expect, afterEach, vi } from "vitest";

// Fake db: every select chain resolves to [] — no subscription, no credits, no
// one-off entitlements — so with enforcement ON the caller has nothing to
// authorise a create and must be blocked.
type Chain = {
  from: () => Chain;
  where: () => Chain;
  orderBy: () => Chain;
  limit: () => Promise<unknown[]>;
  then: (resolve: (v: unknown[]) => unknown) => unknown;
};
const emptyChain: Chain = {
  from: () => emptyChain,
  where: () => emptyChain,
  orderBy: () => emptyChain,
  limit: () => Promise.resolve([]),
  then: (resolve) => resolve([]),
};
vi.mock("../../../src/db/index.js", () => ({
  getDb: () => ({ select: () => emptyChain }),
}));

import { assertCanCreateLetter } from "../../../api/_utils/entitlements.js";

describe("assertCanCreateLetter — hard-paywall gate", () => {
  const prev = process.env.DRAFTHR_ENFORCE_PAYWALL;
  afterEach(() => {
    if (prev === undefined) delete process.env.DRAFTHR_ENFORCE_PAYWALL;
    else process.env.DRAFTHR_ENFORCE_PAYWALL = prev;
  });

  it("is a no-op (ok) when enforcement is OFF — never touches the DB", async () => {
    delete process.env.DRAFTHR_ENFORCE_PAYWALL;
    const gate = await assertCanCreateLetter("t1", "u1");
    expect(gate.ok).toBe(true);
  });

  it("stays a no-op for any non-'1' flag value", async () => {
    process.env.DRAFTHR_ENFORCE_PAYWALL = "true";
    const gate = await assertCanCreateLetter("t1", "u1");
    expect(gate.ok).toBe(true);
  });

  it("BLOCKS with 402 when enforcement is ON and the caller has no plan or one-off", async () => {
    process.env.DRAFTHR_ENFORCE_PAYWALL = "1";
    const gate = await assertCanCreateLetter("t1", "u1");
    expect(gate.ok).toBe(false);
    if (!gate.ok) expect(gate.code).toBe(402);
  });
});
