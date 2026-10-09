/**
 * Marketplace Stripe webhook (api/marketplace/_handlers/stripe-webhook.ts):
 * sessions only count when they match the booking's snapshot, async payments
 * are tracked until they settle, and refunds / disputes withdraw access and
 * claw back the consultant's transfer.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { createFakeDb, bookingRow } from "./_fake-db";

const fake = createFakeDb();
vi.mock("../../../src/db/index.js", () => ({ getDb: () => fake.db }));

const transfersRetrieve = vi.fn();
const createReversal = vi.fn(async () => ({ id: "trr_1" }));
const chargesRetrieve = vi.fn();
let nextEvent: unknown;
vi.mock("../../../api/_utils/stripe.js", () => ({
  getStripe: () => ({
    webhooks: { constructEventAsync: async () => nextEvent },
    transfers: { retrieve: transfersRetrieve, createReversal },
    charges: { retrieve: chargesRetrieve },
  }),
}));

const { POST } = await import("../../../api/marketplace/_handlers/stripe-webhook.js");

const BOOKING_ID = "11111111-1111-4111-8111-111111111111";
const PROFILE_ID = "33333333-3333-4333-8333-333333333333";

function req(): Request {
  return new Request("https://x/api/marketplace/stripe-webhook", {
    method: "POST",
    headers: { "stripe-signature": "t=1,v1=x" },
    body: "{}",
  });
}

function session(over: Record<string, unknown> = {}) {
  return {
    id: "cs_1",
    object: "checkout.session",
    metadata: { bookingId: BOOKING_ID },
    client_reference_id: BOOKING_ID,
    amount_total: 15000,
    currency: "gbp",
    payment_status: "paid",
    payment_intent: "pi_1",
    ...over,
  };
}

function event(type: string, object: unknown, extra: Record<string, unknown> = {}) {
  return { id: "evt_1", type, data: { object }, ...extra };
}

function givenBooking(over: Record<string, unknown> = {}, upsertApplies = true) {
  fake.respond(/^select "id", "price_amount", "price_currency" from "consultant_bookings"/, [bookingRow(over)]);
  // ON CONFLICT ... WHERE skips the write (no row back) when the payment is
  // already refunded or disputed.
  fake.respond(/^insert into "booking_payments"/, upsertApplies ? [{ status: "paid" }] : []);
}

function givenPayment(status: string, over: Record<string, unknown> = {}) {
  fake.respond(/^select "booking_payments"."booking_id".* inner join "consultant_bookings"/s, [
    {
      booking_id: BOOKING_ID,
      status,
      transfer_id: null,
      consultant_profile_id: PROFILE_ID,
      ...over,
    },
  ]);
}

const paymentWrites = () => fake.find(/^(insert into|update) "booking_payments"/);
const shareTokenGrants = () => fake.find(/^update "consultant_bookings" set "share_token" = \$1, "share_token_expires_at" = \$2 where .*"share_token" is null/s);
const shareTokenRevokes = () =>
  fake
    .find(/^update "consultant_bookings" set "share_token" = \$1, "share_token_expires_at" = \$2 where "consultant_bookings"\."id" = \$3$/)
    .filter((q) => q.params[0] === null && q.params[1] === null);

beforeEach(() => {
  fake.reset();
  transfersRetrieve.mockReset();
  createReversal.mockClear();
  chargesRetrieve.mockReset();
  process.env.STRIPE_WEBHOOK_SECRET = "whsec_test";
});

describe("checkout sessions", () => {
  it("marks a matching paid session paid and only then opens draft access", async () => {
    givenBooking();
    nextEvent = event("checkout.session.completed", session());
    expect((await POST(req())).status).toBe(200);
    const [upsert] = fake.find(/^insert into "booking_payments"/);
    expect(upsert.params).toEqual(expect.arrayContaining([BOOKING_ID, "cs_1", "pi_1", "paid"]));
    // Retried or late events never pull a refunded / disputed payment back to paid.
    expect(upsert.sql).toMatch(/on conflict \("booking_id"\) do update set .* where "booking_payments"\."status" in/s);
    expect(shareTokenGrants()).toHaveLength(1);
  });

  it("does not reopen draft access when a late paid event meets a refunded payment", async () => {
    givenBooking({}, false);
    nextEvent = event("checkout.session.completed", session());
    expect((await POST(req())).status).toBe(200);
    expect(fake.find(/^insert into "booking_payments"/)).toHaveLength(1);
    expect(shareTokenGrants()).toHaveLength(0);
  });

  it("records a Direct Debit session that hasn't settled as processing, without draft access", async () => {
    givenBooking();
    nextEvent = event("checkout.session.completed", session({ payment_status: "unpaid" }));
    await POST(req());
    const [upsert] = fake.find(/^insert into "booking_payments"/);
    expect(upsert.params).toContain("processing");
    expect(upsert.params).not.toContain("paid");
    expect(shareTokenGrants()).toHaveLength(0);
  });

  it("marks the booking paid when the async payment succeeds", async () => {
    givenBooking();
    nextEvent = event("checkout.session.async_payment_succeeded", session());
    await POST(req());
    const [upsert] = fake.find(/^insert into "booking_payments"/);
    expect(upsert.params).toContain("paid");
    expect(shareTokenGrants()).toHaveLength(1);
  });

  it("marks the payment failed when the async payment fails, for that session only", async () => {
    givenBooking();
    nextEvent = event("checkout.session.async_payment_failed", session({ payment_status: "unpaid" }));
    await POST(req());
    const [update] = fake.find(/^update "booking_payments"/);
    expect(update.params).toEqual(expect.arrayContaining(["failed", BOOKING_ID, "cs_1"]));
    expect(update.sql).toContain('"booking_payments"."checkout_session_id" = $');
    expect(shareTokenGrants()).toHaveLength(0);
  });

  it.each([
    ["the amount differs from the snapshot", session({ amount_total: 100 }), true],
    ["the currency differs from the snapshot", session({ currency: "usd" }), true],
    ["the metadata has no booking id", session({ metadata: {}, client_reference_id: null }), false],
    ["the booking ids disagree", session({ client_reference_id: "55555555-5555-4555-8555-555555555555" }), false],
  ])("ignores a session when %s", async (_label, s, bookingExists) => {
    if (bookingExists) givenBooking();
    nextEvent = event("checkout.session.completed", s);
    expect((await POST(req())).status).toBe(200);
    expect(paymentWrites()).toHaveLength(0);
    expect(shareTokenGrants()).toHaveLength(0);
  });

  it("ignores a session for a booking that doesn't exist", async () => {
    nextEvent = event("checkout.session.completed", session());
    await POST(req());
    expect(paymentWrites()).toHaveLength(0);
  });

  it("ignores payment events from a connected account", async () => {
    givenBooking();
    nextEvent = event("checkout.session.completed", session(), { account: "acct_consultant" });
    await POST(req());
    expect(fake.queries).toHaveLength(0);
  });
});

describe("refunds", () => {
  const charge = (over: Record<string, unknown> = {}) => ({
    id: "ch_1",
    object: "charge",
    payment_intent: "pi_1",
    amount: 15000,
    amount_refunded: 15000,
    refunded: true,
    transfer: "tr_1",
    ...over,
  });

  it("on a full refund marks it refunded, revokes access and reverses the transfer", async () => {
    givenPayment("paid");
    transfersRetrieve.mockResolvedValue({ id: "tr_1", amount: 15000, amount_reversed: 0, reversed: false });
    nextEvent = event("charge.refunded", charge());
    expect((await POST(req())).status).toBe(200);
    const [update] = fake.find(/^update "booking_payments"/);
    expect(update.params).toEqual(expect.arrayContaining(["ch_1", "tr_1", 15000, "refunded"]));
    expect(shareTokenRevokes()).toHaveLength(1);
    expect(createReversal).toHaveBeenCalledWith("tr_1", expect.anything(), { idempotencyKey: "booking-refund-ch_1" });
    // The refunded booking's rating drops out of the consultant's aggregate.
    expect(fake.find(/^update "consultant_profiles"/)).toHaveLength(1);
  });

  it("does not reverse a transfer that the refund already reversed", async () => {
    givenPayment("paid");
    transfersRetrieve.mockResolvedValue({ id: "tr_1", amount: 15000, amount_reversed: 15000, reversed: true });
    nextEvent = event("charge.refunded", charge());
    await POST(req());
    expect(createReversal).not.toHaveBeenCalled();
  });

  it("records a partial refund without revoking access or reversing", async () => {
    givenPayment("paid");
    nextEvent = event("charge.refunded", charge({ amount_refunded: 5000, refunded: false }));
    await POST(req());
    const [update] = fake.find(/^update "booking_payments"/);
    expect(update.params).toContain(5000);
    expect(update.params).not.toContain("refunded");
    expect(shareTokenRevokes()).toHaveLength(0);
    expect(createReversal).not.toHaveBeenCalled();
  });

  it("ignores a refund for a charge that isn't a booking", async () => {
    nextEvent = event("charge.refunded", charge());
    await POST(req());
    expect(paymentWrites()).toHaveLength(0);
    expect(createReversal).not.toHaveBeenCalled();
  });

  it("returns 500 so Stripe retries when the reversal fails", async () => {
    givenPayment("paid");
    transfersRetrieve.mockRejectedValue(new Error("stripe down"));
    nextEvent = event("charge.refunded", charge());
    expect((await POST(req())).status).toBe(500);
  });
});

describe("disputes", () => {
  const dispute = (over: Record<string, unknown> = {}) => ({
    id: "dp_1",
    object: "dispute",
    charge: "ch_1",
    payment_intent: "pi_1",
    status: "needs_response",
    ...over,
  });

  it("marks the payment disputed and revokes draft access", async () => {
    givenPayment("paid");
    nextEvent = event("charge.dispute.created", dispute());
    await POST(req());
    const [update] = fake.find(/^update "booking_payments"/);
    expect(update.params).toEqual(expect.arrayContaining(["disputed", "dp_1"]));
    expect(shareTokenRevokes()).toHaveLength(1);
  });

  it("restores a won dispute to paid and re-opens access", async () => {
    givenPayment("disputed");
    nextEvent = event("charge.dispute.closed", dispute({ status: "won" }));
    await POST(req());
    const [update] = fake.find(/^update "booking_payments"/);
    expect(update.params).toContain("paid");
    expect(shareTokenGrants()).toHaveLength(1);
    expect(createReversal).not.toHaveBeenCalled();
  });

  it("reverses the transfer when a dispute is lost", async () => {
    givenPayment("disputed");
    chargesRetrieve.mockResolvedValue({ id: "ch_1", transfer: "tr_9" });
    transfersRetrieve.mockResolvedValue({ id: "tr_9", amount: 15000, amount_reversed: 0, reversed: false });
    nextEvent = event("charge.dispute.closed", dispute({ status: "lost" }));
    await POST(req());
    const [update] = fake.find(/^update "booking_payments"/);
    expect(update.params).toContain("dispute_lost");
    expect(createReversal).toHaveBeenCalledWith("tr_9", expect.anything(), { idempotencyKey: "booking-dispute-dp_1" });
    expect(shareTokenGrants()).toHaveLength(0);
  });
});
