import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { drizzle } from "drizzle-orm/pg-proxy";
import * as schema from "../../../src/db/schema.js";

// A real drizzle instance whose driver just records the SQL it is asked to run,
// so these tests check the statements Postgres would actually receive.
const queries: { sql: string; params: unknown[] }[] = [];
// Rows the fake driver returns for a statement (array rows, as pg-proxy expects).
let respond: (sql: string) => unknown[][] = () => [];
const db = drizzle(
  async (sql, params) => {
    queries.push({ sql, params });
    return { rows: respond(sql) };
  },
  { schema },
);
// pg-proxy has no transactions; run the callback on the same recorder.
(db as unknown as { transaction: (cb: (tx: typeof db) => unknown) => unknown }).transaction = async (cb) => cb(db);
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
  respond = () => [];
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

describe("billing webhook — annual plans get monthly credits", () => {
  afterEach(() => {
    vi.useRealTimers();
    delete process.env.STRIPE_PRICE_SUB_PRO_ANNUAL;
  });

  it("grants this month's credits, expiring at the end of the month, not the year", async () => {
    process.env.STRIPE_PRICE_SUB_PRO_ANNUAL = "price_pro_annual";
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-05-10T12:00:00Z"));
    const start = Date.UTC(2026, 0, 1) / 1000;
    const end = Date.UTC(2027, 0, 1) / 1000;
    retrieve.mockResolvedValue({
      ...liveSub("active", "starter"),
      items: { data: [{ price: { id: "price_pro_annual" }, current_period_start: start, current_period_end: end }] },
    });
    nextEvent = { id: "evt_a1", type: "customer.subscription.updated", data: { object: { id: "sub_1" } } };
    await POST(req());

    const upsert = queries.find((q) => q.sql.includes('insert into "subscriptions"'));
    // The plan comes from the live price, not the "starter" checkout metadata.
    expect(upsert!.params).toContain("pro");
    expect(upsert!.params).not.toContain("starter");

    const drip = queries.find((q) => q.sql.includes('insert into "credit_ledger"'));
    expect(drip!.params).toContain(20);
    expect(drip!.params).toContain(`drip:sub_1:${Date.UTC(2026, 4, 1) / 1000}`);
    expect(drip!.params).toContain("2026-06-01T00:00:00.000Z");
  });

  it("keeps the period-start key on monthly plans, so existing grants aren't repeated", async () => {
    retrieve.mockResolvedValue(liveSub("active"));
    nextEvent = { id: "evt_a2", type: "customer.subscription.updated", data: { object: { id: "sub_1" } } };
    await POST(req());
    const drip = queries.find((q) => q.sql.includes('insert into "credit_ledger"'));
    expect(drip!.params).toContain("drip:sub_1:1760000000");
  });
});

describe("billing webhook — refunded one-off purchases", () => {
  const USER = "22222222-2222-2222-2222-222222222222";

  it("revokes a refunded credit pack's own grant and marks the purchase refunded", async () => {
    respond = (sql) => {
      if (sql.startsWith('update "entitlement_purchases"')) return [[USER, "credits_small"]];
      if (sql.startsWith('select "id" from "credit_ledger"')) return [["grant-1"]];
      return [];
    };
    nextEvent = {
      id: "evt_r1",
      type: "charge.refunded",
      data: { object: { id: "ch_1", payment_intent: "pi_1", refunded: true } },
    };
    const res = await POST(req());
    expect(res.status).toBe(200);

    const mark = queries.find((q) => q.sql.startsWith('update "entitlement_purchases"'));
    expect(mark!.sql).toContain('"refunded_at" is null');
    expect(mark!.params).toContain("pi_1");

    // Finds the grant by its purchase key, or (older grants) by the purchase's created_at.
    const find = queries.find((q) => q.sql.startsWith('select "id" from "credit_ledger"'));
    expect(find!.params).toContain("purchase:pi_1");
    expect(find!.sql).toContain(
      '"credit_ledger"."created_at" = (select "entitlement_purchases"."created_at" from "entitlement_purchases" where "entitlement_purchases"."stripe_payment_intent_id" = $',
    );

    const revoke = queries.find((q) => q.sql.includes('insert into "credit_ledger"'));
    expect(revoke!.params).toEqual(expect.arrayContaining([USER, -5, "purchase_refund", "revoke:grant-1"]));
    expect(revoke!.sql).toMatch(/on conflict \("grant_key"\) where "credit_ledger"\."grant_key" is not null do nothing/);
  });

  it("changes nothing for a charge that isn't a billing purchase (or was already reversed)", async () => {
    nextEvent = {
      id: "evt_r2",
      type: "charge.refunded",
      data: { object: { id: "ch_2", payment_intent: "pi_booking", refunded: true } },
    };
    await POST(req());
    expect(queries.some((q) => q.sql.includes('insert into "credit_ledger"'))).toBe(false);
  });

  it("leaves a partial refund alone", async () => {
    nextEvent = {
      id: "evt_r3",
      type: "charge.refunded",
      data: { object: { id: "ch_3", payment_intent: "pi_1", refunded: false } },
    };
    await POST(req());
    expect(queries.some((q) => q.sql.startsWith('update "entitlement_purchases"'))).toBe(false);
  });

  it("tags a new purchase's credit grant so a refund can find it", async () => {
    respond = (sql) => (sql.startsWith('insert into "entitlement_purchases"') ? [["ent-1"]] : []);
    nextEvent = {
      id: "evt_r4",
      type: "checkout.session.completed",
      data: {
        object: {
          mode: "payment",
          payment_status: "paid",
          payment_intent: "pi_9",
          metadata: { purpose: "billing", priceKey: "credits_small", userId: USER },
        },
      },
    };
    await POST(req());
    const grant = queries.find((q) => q.sql.includes('insert into "credit_ledger"'));
    expect(grant!.params).toContain("purchase:pi_9");
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
