/**
 * Priority expert reviews (api/_utils/priority-reviews.ts): off until the
 * operator switches them on, offered only by experts who set a priority price
 * above their standard one, due 24 hours after payment, and a late delivery
 * refunds the difference exactly once.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { createFakeDb, bookingRow } from "./_fake-db";

const fake = createFakeDb();
vi.mock("../../../src/db/index.js", () => ({ getDb: () => fake.db }));

let currentUser = "hr-user";
let nextBody: Record<string, unknown> = {};
vi.mock("../../../api/_utils/rate-limit.js", () => ({ rateLimit: () => null }));
vi.mock("../../../api/_utils/session-with-tenant.js", () => ({
  requireSessionAndTenant: async () => ({
    ok: true,
    activeTenant: { id: "22222222-2222-4222-8222-222222222222" },
    userRow: { id: currentUser, email: "a@b.com" },
  }),
}));
vi.mock("../../../api/_utils/request.js", () => ({
  enforceSameOrigin: () => null,
  readJsonRequest: async () => ({ ok: true, body: nextBody }),
  jsonError: (error: string, status: number) =>
    new Response(JSON.stringify({ error }), { status, headers: { "Content-Type": "application/json" } }),
}));
vi.mock("../../../api/_utils/consultant-emails.js", () => ({
  sendBookingRequestEmail: async () => {},
  sendBookingAcceptedEmail: async () => {},
  sendBookingDeclinedEmail: async () => {},
  sendBookingDeliveredEmail: async () => {},
}));

const refundsCreate = vi.fn(async () => ({ id: "re_1" }));
const paymentIntentsRetrieve = vi.fn(async () => ({ id: "pi_1", application_fee_amount: null }));
let stripeOn = true;
vi.mock("../../../api/_utils/stripe.js", () => ({
  getStripe: () =>
    stripeOn ? { refunds: { create: refundsCreate }, paymentIntents: { retrieve: paymentIntentsRetrieve } } : null,
  appBaseUrl: () => "https://app.test",
  platformFeeBps: () => 0,
}));

const create = await import("../../../api/marketplace/_handlers/list-and-create.js");
const respond = await import("../../../api/marketplace/_handlers/respond.js");
const listing = await import("../../../api/marketplace/_handlers/marketplace.js");
const profile = await import("../../../api/marketplace/_handlers/profile.js");
const payments = await import("../../../api/_utils/marketplace-payments.js");
const priority = await import("../../../api/_utils/priority-reviews.js");

const PROFILE_ID = "33333333-3333-4333-8333-333333333333";
const BOOKING_ID = "11111111-1111-4111-8111-111111111111";
const req = {} as Request;

function profileRow(over: Record<string, unknown> = {}) {
  return {
    id: PROFILE_ID,
    user_id: "consultant-user",
    initials: "JS",
    full_name: "Jo Specialist",
    role: "Solicitor",
    bio: "Employment solicitor with twelve years in practice.",
    specialty: "",
    specialties: [],
    price: 150,
    priority_price: 250,
    currency: "GBP",
    sla: "24-48h",
    availability: "this_week",
    rating_x10: 50,
    reviews: 0,
    photo_url: null,
    status: "published",
    created_at: new Date(),
    updated_at: new Date(),
    ...over,
  };
}

const PAID_AT = new Date("2026-10-14T09:00:00Z");
const DUE_AT = new Date("2026-10-15T09:00:00Z");

function priorityBooking(over: Record<string, unknown> = {}) {
  return bookingRow({
    turnaround: "priority",
    price_amount: 25000,
    standard_price_amount: 15000,
    priority_due_at: DUE_AT,
    late_refund_status: null,
    late_refund_amount: null,
    ...over,
  });
}

beforeEach(() => {
  fake.reset();
  refundsCreate.mockClear();
  paymentIntentsRetrieve.mockClear();
  stripeOn = true;
  currentUser = "hr-user";
  vi.stubEnv("FEATURE_PRIORITY_REVIEWS", "");
  vi.stubEnv("VITE_FEATURE_PRIORITY_REVIEWS", "");
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.useRealTimers();
});

describe("the switch", () => {
  it("is off unless the operator turns it on", () => {
    expect(priority.priorityReviewsOn()).toBe(false);
    vi.stubEnv("VITE_FEATURE_PRIORITY_REVIEWS", "1");
    expect(priority.priorityReviewsOn()).toBe(true);
    // The server's own setting wins over the client's.
    vi.stubEnv("FEATURE_PRIORITY_REVIEWS", "0");
    expect(priority.priorityReviewsOn()).toBe(false);
    vi.stubEnv("FEATURE_PRIORITY_REVIEWS", "on");
    expect(priority.priorityReviewsOn()).toBe(true);
  });
});

describe("booking a priority review", () => {
  it("is refused while priority reviews are switched off", async () => {
    fake.respond(/from "consultant_profiles"/, [profileRow()]);
    nextBody = { consultantProfileId: PROFILE_ID, turnaround: "priority" };
    expect((await create.POST(req)).status).toBe(412);
    expect(fake.find(/^insert into "consultant_bookings"/)).toHaveLength(0);
  });

  it("is refused for an expert who doesn't offer it", async () => {
    vi.stubEnv("FEATURE_PRIORITY_REVIEWS", "1");
    fake.respond(/from "consultant_profiles"/, [profileRow({ priority_price: null })]);
    nextBody = { consultantProfileId: PROFILE_ID, turnaround: "priority" };
    expect((await create.POST(req)).status).toBe(412);
    expect(fake.find(/^insert into "consultant_bookings"/)).toHaveLength(0);
  });

  it("refuses a turnaround it doesn't know", async () => {
    fake.respond(/from "consultant_profiles"/, [profileRow()]);
    nextBody = { consultantProfileId: PROFILE_ID, turnaround: "express" };
    expect((await create.POST(req)).status).toBe(400);
  });

  it("charges the priority price and keeps the standard one for a late refund", async () => {
    vi.stubEnv("FEATURE_PRIORITY_REVIEWS", "1");
    fake.respond(/from "consultant_profiles"/, [profileRow()]);
    fake.respond(/^insert into "consultant_bookings"/, [priorityBooking({ status: "requested", priority_due_at: null })]);
    nextBody = { consultantProfileId: PROFILE_ID, turnaround: "priority", expectedDeliveryAt: "2027-01-01T00:00:00Z" };
    const res = await create.POST(req);
    expect(res.status).toBe(201);
    const [insert] = fake.find(/^insert into "consultant_bookings"/);
    const cols = insert.sql.match(/\(([^)]*)\) values/)![1].split(", ").map((c) => c.replace(/"/g, ""));
    const valueOf = (col: string) => {
      // Each column gets its own $n placeholder in order; defaults are inlined.
      const placeholders = insert.sql.match(/values \((.*)\)/)![1].split(", ");
      const ph = placeholders[cols.indexOf(col)];
      return ph.startsWith("$") ? insert.params[Number(ph.slice(1)) - 1] : ph;
    };
    expect(valueOf("price_amount")).toBe(25000);
    expect(valueOf("standard_price_amount")).toBe(15000);
    expect(valueOf("turnaround")).toBe("priority");
    // The 24 hours are an estimate until payment, whatever the client sent.
    const expected = new Date(valueOf("expected_delivery_at") as string).getTime();
    expect(Math.abs(expected - (Date.now() + 24 * 3600_000))).toBeLessThan(60_000);
    const body = await res.json();
    expect(body.booking).toMatchObject({ turnaround: "priority", standardPriceAmount: 15000 });
  });

  it("books the standard rate when no turnaround is given", async () => {
    vi.stubEnv("FEATURE_PRIORITY_REVIEWS", "1");
    fake.respond(/from "consultant_profiles"/, [profileRow()]);
    fake.respond(/^insert into "consultant_bookings"/, [bookingRow({ status: "requested", turnaround: "standard" })]);
    nextBody = { consultantProfileId: PROFILE_ID };
    expect((await create.POST(req)).status).toBe(201);
    const [insert] = fake.find(/^insert into "consultant_bookings"/);
    expect(insert.params).toContain(15000);
    expect(insert.params).not.toContain(25000);
  });
});

describe("the marketplace listing", () => {
  const listingReq = () => new Request("https://app.test/api/marketplace/listing");

  it("shows no priority price while priority reviews are off", async () => {
    fake.respond(/from "consultant_profiles"/, [profileRow()]);
    const body = await (await listing.GET(listingReq())).json();
    expect(body.consultants[0].priorityPrice).toBeNull();
  });

  it("shows an expert's priority price once they're on", async () => {
    vi.stubEnv("FEATURE_PRIORITY_REVIEWS", "1");
    fake.respond(/from "consultant_profiles"/, [profileRow(), profileRow({ id: "x", priority_price: null })]);
    const body = await (await listing.GET(listingReq())).json();
    expect(body.consultants.map((c: { priorityPrice: number | null }) => c.priorityPrice)).toEqual([250, null]);
  });
});

describe("the expert's priority price", () => {
  function givenProfile(over: Record<string, unknown> = {}) {
    fake.respond(/^select .* from "consultant_profiles"/s, [profileRow(over)]);
    fake.respond(/^update "consultant_profiles"/, [profileRow(over)]);
  }
  const written = () => fake.find(/^update "consultant_profiles"/)[0];

  it.each([
    [150, "the same as"],
    [100, "below"],
  ])("refuses a priority price %s (%s the standard price)", async (p) => {
    givenProfile({ priority_price: null });
    currentUser = "consultant-user";
    nextBody = { priorityPrice: p };
    const res = await profile.PATCH(req);
    expect(res.status).toBe(400);
    expect(fake.find(/^update "consultant_profiles"/)).toHaveLength(0);
  });

  it("saves a priority price and sends a listed profile for a fresh check", async () => {
    givenProfile({ priority_price: null });
    currentUser = "consultant-user";
    nextBody = { priorityPrice: 240 };
    expect((await profile.PATCH(req)).status).toBe(200);
    expect(written().sql).toContain('"priority_price" = $');
    expect(written().params).toContain(240);
    expect(written().params).toContain("pending_review");
  });

  it("turns priority off with null", async () => {
    givenProfile({ priority_price: 250 });
    currentUser = "consultant-user";
    nextBody = { priorityPrice: null };
    expect((await profile.PATCH(req)).status).toBe(200);
    const update = written();
    const cols = update.sql.split(" where ")[0];
    const idx = cols.split(", ").findIndex((c) => c.includes('"priority_price"'));
    expect(idx).toBeGreaterThanOrEqual(0);
    expect(update.params[idx]).toBeNull();
  });

  it("turns priority off when a form without it raises the standard price to meet it", async () => {
    givenProfile({ priority_price: 250 });
    currentUser = "consultant-user";
    nextBody = { price: 260 };
    expect((await profile.PATCH(req)).status).toBe(200);
    const update = written();
    const cols = update.sql.split(" where ")[0].split(", ");
    const idx = cols.findIndex((c) => c.includes('"priority_price"'));
    expect(update.params[idx]).toBeNull();
  });

  it("keeps the stored priority price when a form without it changes something else", async () => {
    givenProfile({ priority_price: 250, status: "published" });
    currentUser = "consultant-user";
    nextBody = { availability: "booked" };
    await profile.PATCH(req);
    expect(written().params).toContain(250);
    expect(written().params).toContain("published");
  });
});

describe("the 24 hours", () => {
  it("start when the booking is paid", async () => {
    fake.respond(/^select "id", "price_amount", "price_currency" from "consultant_bookings"/, [priorityBooking()]);
    fake.respond(/^insert into "booking_payments"/, [{ status: "paid" }]);
    const result = await payments.applyCheckoutSession(
      fake.db as never,
      {
        id: "cs_1",
        metadata: { bookingId: BOOKING_ID },
        client_reference_id: BOOKING_ID,
        amount_total: 25000,
        currency: "gbp",
        payment_status: "paid",
        payment_intent: "pi_1",
      } as never,
      "completed",
    );
    expect(result).toBe("paid");
    const [clock] = fake.find(/^update "consultant_bookings" set "expected_delivery_at" = \$1, "priority_due_at" = \$2/);
    expect(clock).toBeDefined();
    // Only an unstarted priority booking that's being worked on.
    expect(clock.sql).toMatch(/"turnaround" = \$\d+ and "consultant_bookings"\."priority_due_at" is null and "consultant_bookings"\."status" = \$\d+/);
    expect(clock.params).toEqual(expect.arrayContaining(["priority", "accepted"]));
    const due = clock.params[1] as Date | string;
    const startedAt = Date.parse(String(clock.params[0]));
    expect(Date.parse(String(due))).toBe(startedAt);
  });
});

describe("a late priority delivery", () => {
  function givenDelivery(over: Record<string, unknown>, claim = true) {
    currentUser = "consultant-user";
    fake.respond(/^select .* from "consultant_bookings" where "consultant_bookings"."id" = \$1 limit/s, [priorityBooking(over)]);
    fake.respond(/^select "status" from "booking_payments"/, [{ status: "paid" }]);
    fake.respond(/^select "status", "payment_intent_id" from "booking_payments"/, [{ status: "paid", payment_intent_id: "pi_1" }]);
    if (!claim) fake.respond(/^update "consultant_bookings" set "late_refund_status" = \$1, "late_refund_amount" = \$2/, []);
    fake.respond(/^update "consultant_bookings"/, [priorityBooking({ ...over, status: "delivered" })]);
    nextBody = { bookingId: BOOKING_ID, action: "deliver", note: "Reviewed." };
  }
  const statusesWritten = () =>
    fake
      .find(/^update "consultant_bookings" set "late_refund_status" = \$1/)
      .map((q) => q.params[0]);

  it("refunds the difference, taking it from the expert's share", async () => {
    vi.useFakeTimers({ now: new Date("2026-10-15T10:00:00Z"), toFake: ["Date"] });
    givenDelivery({});
    expect((await respond.POST(req)).status).toBe(200);
    expect(refundsCreate).toHaveBeenCalledTimes(1);
    const [params, opts] = refundsCreate.mock.calls[0] as unknown as [Record<string, unknown>, Record<string, unknown>];
    expect(params).toMatchObject({ payment_intent: "pi_1", amount: 10000, reverse_transfer: true });
    // No platform fee was taken, so there's none to refund.
    expect(params).not.toHaveProperty("refund_application_fee");
    expect(opts).toEqual({ idempotencyKey: `booking-priority-late-${BOOKING_ID}` });
    expect(statusesWritten()).toEqual(["pending", "refunded"]);
  });

  it("refunds the platform's share of a fee too when one was taken", async () => {
    vi.useFakeTimers({ now: new Date("2026-10-15T10:00:00Z"), toFake: ["Date"] });
    paymentIntentsRetrieve.mockResolvedValueOnce({ id: "pi_1", application_fee_amount: 2500 });
    givenDelivery({});
    await respond.POST(req);
    expect((refundsCreate.mock.calls[0] as unknown as [Record<string, unknown>])[0]).toMatchObject({ refund_application_fee: true });
  });

  it("refunds nothing when it's back in time", async () => {
    vi.useFakeTimers({ now: new Date("2026-10-15T08:59:00Z"), toFake: ["Date"] });
    givenDelivery({});
    expect((await respond.POST(req)).status).toBe(200);
    expect(refundsCreate).not.toHaveBeenCalled();
    expect(statusesWritten()).toEqual([]);
  });

  it("refunds nothing for a standard booking", async () => {
    vi.useFakeTimers({ now: new Date("2026-10-20T10:00:00Z"), toFake: ["Date"] });
    givenDelivery({ turnaround: "standard", standard_price_amount: null, priority_due_at: null });
    await respond.POST(req);
    expect(refundsCreate).not.toHaveBeenCalled();
  });

  it("refunds only once", async () => {
    vi.useFakeTimers({ now: new Date("2026-10-15T10:00:00Z"), toFake: ["Date"] });
    givenDelivery({}, false);
    await respond.POST(req);
    expect(refundsCreate).not.toHaveBeenCalled();
  });

  it("records the refund as owed when payments are off", async () => {
    vi.useFakeTimers({ now: new Date("2026-10-15T10:00:00Z"), toFake: ["Date"] });
    stripeOn = false;
    givenDelivery({});
    await respond.POST(req);
    expect(refundsCreate).not.toHaveBeenCalled();
    expect(statusesWritten()).toEqual(["pending", "owed"]);
  });

  it("records a failed refund and still delivers", async () => {
    vi.useFakeTimers({ now: new Date("2026-10-15T10:00:00Z"), toFake: ["Date"] });
    refundsCreate.mockRejectedValueOnce(new Error("card_declined"));
    givenDelivery({});
    expect((await respond.POST(req)).status).toBe(200);
    expect(statusesWritten()).toEqual(["pending", "failed"]);
  });
});

describe("validatePriorityPrice", () => {
  it("accepts a whole price above the standard one, up to the cap", () => {
    expect(priority.validatePriorityPrice(200, 150)).toEqual({ ok: true, value: 200 });
    expect(priority.validatePriorityPrice(5000, 150)).toEqual({ ok: true, value: 5000 });
    expect(priority.validatePriorityPrice(5001, 150).ok).toBe(false);
    expect(priority.validatePriorityPrice(150.5, 150).ok).toBe(false);
    expect(priority.validatePriorityPrice("200", 150).ok).toBe(false);
  });

  it("treats null, 0 and empty as off", () => {
    for (const off of [null, 0, ""]) expect(priority.validatePriorityPrice(off, 150)).toEqual({ ok: true, value: null });
  });
});
