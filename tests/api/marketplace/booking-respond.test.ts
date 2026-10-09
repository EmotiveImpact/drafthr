/**
 * Booking state machine payment rules (api/marketplace/_handlers/respond.ts):
 * nothing past "accepted" without a paid booking, no share link on accept, no
 * self-dealing, and one 1 to 5 rating per completed, paid booking.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { createFakeDb, bookingRow } from "./_fake-db";

const fake = createFakeDb();
vi.mock("../../../src/db/index.js", () => ({ getDb: () => fake.db }));

let currentUser = "consultant-user";
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
  sendBookingAcceptedEmail: async () => {},
  sendBookingDeclinedEmail: async () => {},
  sendBookingDeliveredEmail: async () => {},
}));

const { POST } = await import("../../../api/marketplace/_handlers/respond.js");

const BOOKING_ID = "11111111-1111-4111-8111-111111111111";
const req = {} as Request;

function givenBooking(over: Record<string, unknown>, paymentStatus: string | null) {
  fake.respond(/^select .* from "consultant_bookings" where "consultant_bookings"."id" = \$1 limit/s, [bookingRow(over)]);
  fake.respond(/^select "status" from "booking_payments"/, paymentStatus ? [{ status: paymentStatus }] : []);
  // The compare-and-set UPDATE returns the row as if the write succeeded.
  fake.respond(/^update "consultant_bookings"/, [bookingRow(over)]);
}

const bookingUpdates = () => fake.find(/^update "consultant_bookings"/);

beforeEach(() => {
  fake.reset();
  currentUser = "consultant-user";
});

describe("payment gate", () => {
  it("refuses to deliver an unpaid booking and writes nothing", async () => {
    givenBooking({ status: "accepted" }, "unpaid");
    nextBody = { bookingId: BOOKING_ID, action: "deliver", note: "Reviewed." };
    const res = await POST(req);
    expect(res.status).toBe(402);
    expect(bookingUpdates()).toHaveLength(0);
  });

  it("refuses to deliver while an async payment is still processing", async () => {
    givenBooking({ status: "accepted" }, "processing");
    nextBody = { bookingId: BOOKING_ID, action: "deliver" };
    expect((await POST(req)).status).toBe(402);
  });

  it("refuses to complete a booking whose payment was refunded", async () => {
    currentUser = "hr-user";
    givenBooking({ status: "delivered" }, "refunded");
    nextBody = { bookingId: BOOKING_ID, action: "complete", rating: 5 };
    expect((await POST(req)).status).toBe(402);
    expect(bookingUpdates()).toHaveLength(0);
  });

  it("delivers a paid booking and re-checks payment inside the UPDATE", async () => {
    givenBooking({ status: "accepted" }, "paid");
    nextBody = { bookingId: BOOKING_ID, action: "deliver", note: "Reviewed." };
    const res = await POST(req);
    expect(res.status).toBe(200);
    const [update] = bookingUpdates();
    expect(update.sql).toMatch(/exists \(select "booking_id" from "booking_payments" where \("booking_payments"\."booking_id" = "consultant_bookings"\."id" and "booking_payments"\."status" = \$\d+\)\)/);
    expect(update.params).toContain("paid");
    const body = await res.json();
    expect(body.booking.paymentStatus).toBe("paid");
  });

  it("does not mint a share link when the consultant accepts", async () => {
    givenBooking({ status: "requested" }, null);
    nextBody = { bookingId: BOOKING_ID, action: "accept" };
    const res = await POST(req);
    expect(res.status).toBe(200);
    const [update] = bookingUpdates();
    const setClause = update.sql.split(" where ")[0];
    expect(setClause).toContain('"status" = $1');
    expect(setClause).not.toContain("share_token");
  });

  it("snapshots the price on accept for a legacy booking that has none", async () => {
    givenBooking({ status: "requested", price_amount: null, price_currency: null }, null);
    fake.respond(/^select "price", "currency" from "consultant_profiles"/, [{ price: 120, currency: "EUR" }]);
    nextBody = { bookingId: BOOKING_ID, action: "accept" };
    await POST(req);
    const [update] = bookingUpdates();
    expect(update.sql).toContain('"price_amount" = $');
    expect(update.params).toEqual(expect.arrayContaining([12000, "eur"]));
  });
});

describe("self-dealing", () => {
  it("refuses any action on a booking the consultant placed on their own profile", async () => {
    currentUser = "same-user";
    givenBooking({ status: "delivered", requester_user_id: "same-user", consultant_user_id: "same-user" }, "paid");
    nextBody = { bookingId: BOOKING_ID, action: "complete", rating: 5 };
    expect((await POST(req)).status).toBe(403);
    expect(bookingUpdates()).toHaveLength(0);
  });

  it("does not let the consultant rate their own booking", async () => {
    givenBooking({ status: "completed" }, "paid");
    nextBody = { bookingId: BOOKING_ID, action: "rate", rating: 5 };
    expect((await POST(req)).status).toBe(403);
    expect(bookingUpdates()).toHaveLength(0);
  });
});

describe("ratings", () => {
  beforeEach(() => {
    currentUser = "hr-user";
  });

  it.each([0, 6, 2.5, "5"])("rejects an out-of-range rating (%s)", async (rating) => {
    givenBooking({ status: "delivered" }, "paid");
    nextBody = { bookingId: BOOKING_ID, action: "complete", rating };
    expect((await POST(req)).status).toBe(400);
  });

  it("completes with a rating and recomputes the aggregate from paid, non-self bookings only", async () => {
    givenBooking({ status: "delivered" }, "paid");
    fake.respond(/^select "consultant_bookings"."rating" from "consultant_bookings" inner join/, [{ rating: 4 }, { rating: 5 }]);
    nextBody = { bookingId: BOOKING_ID, action: "complete", rating: 4 };
    expect((await POST(req)).status).toBe(200);
    const [agg] = fake.find(/inner join "booking_payments"/);
    expect(agg.sql).toContain('"consultant_bookings"."requester_user_id" <> "consultant_bookings"."consultant_user_id"');
    expect(agg.sql).toContain('"booking_payments"."status" = $');
    const [profileUpdate] = fake.find(/^update "consultant_profiles"/);
    expect(profileUpdate.params).toEqual(expect.arrayContaining([45, 2]));
  });

  it("rates a completed, paid booking once, guarded in the UPDATE", async () => {
    givenBooking({ status: "completed" }, "paid");
    nextBody = { bookingId: BOOKING_ID, action: "rate", rating: 3 };
    expect((await POST(req)).status).toBe(200);
    const [update] = bookingUpdates();
    expect(update.sql).toContain('"consultant_bookings"."rating" is null');
  });

  it("refuses a second rating", async () => {
    givenBooking({ status: "completed", rating: 4 }, "paid");
    nextBody = { bookingId: BOOKING_ID, action: "rate", rating: 1 };
    expect((await POST(req)).status).toBe(409);
  });

  it("refuses to rate a booking that isn't completed", async () => {
    givenBooking({ status: "delivered" }, "paid");
    nextBody = { bookingId: BOOKING_ID, action: "rate", rating: 5 };
    expect((await POST(req)).status).toBe(409);
  });

  it("refuses to rate an unpaid booking", async () => {
    givenBooking({ status: "completed" }, "disputed");
    nextBody = { bookingId: BOOKING_ID, action: "rate", rating: 5 };
    expect((await POST(req)).status).toBe(402);
  });
});
