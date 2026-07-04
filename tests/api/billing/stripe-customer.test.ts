import { describe, it, expect, vi, beforeEach } from "vitest";

const customersCreate = vi.fn(async () => ({ id: "cus_new123" }));
const setValues = vi.fn();
let readQueue: (string | null)[] = []; // successive stripeCustomerId reads
let claimWins = true; // does the conditional "set-if-null" flip a row

vi.mock("../../../api/_utils/stripe.js", () => ({
  getStripe: () => ({ customers: { create: customersCreate } }),
}));

vi.mock("../../../src/db/index.js", () => ({
  getDb: () => ({
    select: () => ({
      from: () => ({
        where: () => ({
          limit: async () => [{ id: readQueue.length ? readQueue.shift()! : null }],
        }),
      }),
    }),
    update: () => ({
      set: (v: Record<string, unknown>) => ({
        where: () => ({
          returning: async () => {
            setValues(v);
            return claimWins ? [{ id: v.stripeCustomerId }] : [];
          },
        }),
      }),
    }),
  }),
}));

import { getOrCreateCustomer } from "../../../api/_utils/stripe-billing.js";

beforeEach(() => {
  customersCreate.mockClear();
  setValues.mockClear();
  readQueue = [];
  claimWins = true;
});

describe("getOrCreateCustomer", () => {
  it("reuses an existing stripeCustomerId without creating a new customer", async () => {
    readQueue = ["cus_existing"];
    const id = await getOrCreateCustomer("tenant", "t1", "a@b.com");
    expect(id).toBe("cus_existing");
    expect(customersCreate).not.toHaveBeenCalled();
    expect(setValues).not.toHaveBeenCalled();
  });

  it("creates + atomically claims a customer (with subject metadata) when none exists", async () => {
    readQueue = [null];
    claimWins = true;
    const id = await getOrCreateCustomer("user", "u1", "x@y.com");
    expect(id).toBe("cus_new123");
    expect(customersCreate).toHaveBeenCalledWith({
      email: "x@y.com",
      metadata: { subjectType: "user", subjectId: "u1" },
    });
    expect(setValues).toHaveBeenCalledWith({ stripeCustomerId: "cus_new123" });
  });

  it("on a lost claim race, returns the concurrently-set customer (not ours)", async () => {
    readQueue = [null, "cus_concurrent"]; // initial read null → create; re-read after lost claim
    claimWins = false;
    const id = await getOrCreateCustomer("tenant", "t9", "z@z.com");
    expect(customersCreate).toHaveBeenCalledOnce();
    expect(id).toBe("cus_concurrent");
  });
});
