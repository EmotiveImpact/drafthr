import { describe, it, expect, vi, beforeEach } from "vitest";

const customersCreate = vi.fn(async () => ({ id: "cus_new123" }));
const setValues = vi.fn();
let existingId: string | null = null;

vi.mock("../../../api/_utils/stripe.js", () => ({
  getStripe: () => ({ customers: { create: customersCreate } }),
}));

vi.mock("../../../src/db/index.js", () => ({
  getDb: () => ({
    select: () => ({
      from: () => ({ where: () => ({ limit: async () => [{ id: existingId }] }) }),
    }),
    update: () => ({
      set: (v: Record<string, unknown>) => ({
        where: async () => {
          setValues(v);
        },
      }),
    }),
  }),
}));

import { getOrCreateCustomer } from "../../../api/_utils/stripe-billing.js";

beforeEach(() => {
  customersCreate.mockClear();
  setValues.mockClear();
  existingId = null;
});

describe("getOrCreateCustomer", () => {
  it("reuses an existing stripeCustomerId without creating a new customer", async () => {
    existingId = "cus_existing";
    const id = await getOrCreateCustomer("tenant", "t1", "a@b.com");
    expect(id).toBe("cus_existing");
    expect(customersCreate).not.toHaveBeenCalled();
    expect(setValues).not.toHaveBeenCalled();
  });

  it("creates + persists a customer (with subject metadata) when none exists", async () => {
    existingId = null;
    const id = await getOrCreateCustomer("user", "u1", "x@y.com");
    expect(id).toBe("cus_new123");
    expect(customersCreate).toHaveBeenCalledWith({
      email: "x@y.com",
      metadata: { subjectType: "user", subjectId: "u1" },
    });
    expect(setValues).toHaveBeenCalledWith({ stripeCustomerId: "cus_new123" });
  });
});
