import { describe, it, expect, vi, beforeEach } from "vitest";
import { drizzle } from "drizzle-orm/pg-proxy";
import * as schema from "../../../src/db/schema.js";

// A real drizzle instance whose driver just records the SQL it is asked to run,
// so these tests check the statements Postgres would actually receive.
const queries: { sql: string; params: unknown[] }[] = [];
const db = drizzle(
  async (sql, params) => {
    queries.push({ sql, params });
    return { rows: [] };
  },
  { schema },
);
vi.mock("../../../src/db/index.js", () => ({ getDb: () => db }));

const retrieve = vi.fn();
let nextEvent: unknown;
vi.mock("../../../api/_utils/stripe.js", () => ({
  getStripe: () => ({
    webhooks: { constructEventAsync: async () => nextEvent },
    subscriptions: { retrieve },
  }),
}));

const { POST, graceUntilFor } = await import(
  "../../../api/marketplace/_handlers/billing-webhook.js"
);

function liveSub(status: string, plan = "pro") {
  return {
    id: "sub_1",
    status,
    cancel_at_period_end: false,
    metadata: { subjectType: "tenant", subjectId: "11111111-1111-1111-1111-111111111111", plan },
    items: { data: [{ price: { id: "price_x" }, current_period_start: 1_760_000_000, current_period_end: 1_762_600_000 }] },
  };
}

function req(): Request {
  return new Request("https://x/api/marketplace/billing-webhook", {
    method: "POST",
    headers: { "stripe-signature": "t=1,v1=x" },
    body: "{}",
  });
}

beforeEach(() => {
  queries.length = 0;
  retrieve.mockReset();
  process.env.STRIPE_BILLING_WEBHOOK_SECRET = "whsec_test";
});

describe("billing webhook", () => {
  it("drips plan credits with an ON CONFLICT that matches the partial unique index", async () => {
    nextEvent = { id: "evt_1", type: "customer.subscription.created", data: { object: { id: "sub_1" } } };
    retrieve.mockResolvedValue(liveSub("active"));
    const res = await POST(req());
    expect(res.status).toBe(200);
    const drip = queries.find((q) => q.sql.includes('insert into "credit_ledger"'));
    expect(drip, "a plan-credit grant should be written").toBeDefined();
    // Without the predicate Postgres rejects the statement outright.
    expect(drip!.sql).toMatch(/on conflict \("grant_key"\) where "credit_ledger"\."grant_key" is not null do nothing/);
  });

  it("mirrors Stripe's current state, not the (possibly stale) event payload", async () => {
    // A late, retried `.updated` still carrying "active" after the customer cancelled.
    nextEvent = {
      id: "evt_2",
      type: "customer.subscription.updated",
      data: { object: { ...liveSub("active"), id: "sub_1" } },
    };
    retrieve.mockResolvedValue(liveSub("canceled"));
    await POST(req());
    expect(retrieve).toHaveBeenCalledWith("sub_1");
    const upsert = queries.find((q) => q.sql.includes('insert into "subscriptions"'));
    expect(upsert!.params).toContain("canceled");
    expect(upsert!.params).not.toContain("active");
    // A canceled period grants nothing.
    expect(queries.some((q) => q.sql.includes('insert into "credit_ledger"'))).toBe(false);
  });

  it("re-reads the subscription on invoice.paid instead of forcing it active", async () => {
    nextEvent = {
      id: "evt_3",
      type: "invoice.paid",
      data: { object: { parent: { subscription_details: { subscription: "sub_1" } } } },
    };
    retrieve.mockResolvedValue(liveSub("canceled"));
    await POST(req());
    const upsert = queries.find((q) => q.sql.includes('insert into "subscriptions"'));
    expect(upsert!.params).toContain("canceled");
  });

  it("returns 500 so Stripe retries when Stripe itself cannot be read", async () => {
    nextEvent = { id: "evt_4", type: "customer.subscription.updated", data: { object: { id: "sub_1" } } };
    retrieve.mockRejectedValue(new Error("stripe down"));
    const res = await POST(req());
    expect(res.status).toBe(500);
  });
});

describe("graceUntilFor", () => {
  const now = Date.parse("2026-10-09T00:00:00Z");
  it("starts a 3-day window when a subscription first goes past_due", () => {
    expect(graceUntilFor("past_due", null, now)?.toISOString()).toBe("2026-10-12T00:00:00.000Z");
  });
  it("keeps the original deadline on later failed retries", () => {
    const first = new Date("2026-10-10T00:00:00Z");
    expect(graceUntilFor("past_due", first, now)).toBe(first);
  });
  it("clears grace for any other status", () => {
    expect(graceUntilFor("active", new Date(now), now)).toBeNull();
    expect(graceUntilFor("canceled", new Date(now), now)).toBeNull();
  });
});
