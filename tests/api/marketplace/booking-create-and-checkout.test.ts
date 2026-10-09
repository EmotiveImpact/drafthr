/**
 * Booking creation and checkout: no self-booking, the price is snapshotted on
 * the booking, checkout charges the snapshot rather than the live rate, and the
 * share link refuses an unpaid booking.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
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
}));

const sessionsCreate = vi.fn(async () => ({ id: "cs_new", url: "https://checkout.stripe.test/cs_new" }));
vi.mock("../../../api/_utils/stripe.js", () => ({
  getStripe: () => ({ checkout: { sessions: { create: sessionsCreate, retrieve: vi.fn(), expire: vi.fn() } } }),
  appBaseUrl: () => "https://app.test",
  platformFeeBps: () => 0,
}));

const create = await import("../../../api/marketplace/_handlers/list-and-create.js");
const checkout = await import("../../../api/marketplace/_handlers/stripe-checkout.js");
const shared = await import("../../../api/marketplace/_handlers/shared.js");

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

beforeEach(() => {
  fake.reset();
  sessionsCreate.mockClear();
  currentUser = "hr-user";
});

describe("booking creation", () => {
  it("refuses a consultant booking their own profile", async () => {
    currentUser = "consultant-user";
    fake.respond(/from "consultant_profiles"/, [profileRow()]);
    nextBody = { consultantProfileId: PROFILE_ID };
    const res = await create.POST(req);
    expect(res.status).toBe(403);
    expect(fake.find(/^insert into "consultant_bookings"/)).toHaveLength(0);
  });

  it("stores the agreed price and currency on the booking", async () => {
    fake.respond(/from "consultant_profiles"/, [profileRow({ price: 150, currency: "GBP" })]);
    fake.respond(/^insert into "consultant_bookings"/, [bookingRow({ status: "requested" })]);
    nextBody = { consultantProfileId: PROFILE_ID };
    const res = await create.POST(req);
    expect(res.status).toBe(201);
    const [insert] = fake.find(/^insert into "consultant_bookings"/);
    expect(insert.sql).toContain('"price_amount"');
    expect(insert.params).toEqual(expect.arrayContaining([15000, "gbp"]));
  });

  it("refuses to book a consultant with no rate set", async () => {
    fake.respond(/from "consultant_profiles"/, [profileRow({ price: 0 })]);
    nextBody = { consultantProfileId: PROFILE_ID };
    expect((await create.POST(req)).status).toBe(412);
  });
});

describe("checkout", () => {
  function givenPayableBooking(snapshot: { price_amount: number | null; price_currency: string | null }) {
    fake.respond(/from "consultant_bookings"/, [bookingRow({ status: "accepted", ...snapshot })]);
    fake.respond(/from "booking_payments"/, []);
    fake.respond(/from "stripe_connect_accounts"/, [
      { profile_id: PROFILE_ID, account_id: "acct_1", payouts_enabled: true, details_submitted: true, updated_at: new Date() },
    ]);
    // The consultant has since raised their rate to 400; checkout must ignore it.
    fake.respond(/from "consultant_profiles"/, [{ full_name: "Jo Specialist", price: 400, currency: "USD" }]);
  }

  it("charges the booking's price snapshot, not the consultant's live rate", async () => {
    givenPayableBooking({ price_amount: 15000, price_currency: "gbp" });
    nextBody = { bookingId: BOOKING_ID };
    const res = await checkout.POST(req);
    expect(res.status).toBe(200);
    const args = (sessionsCreate.mock.calls[0] as unknown[])[0] as {
      line_items: { price_data: { unit_amount: number; currency: string } }[];
      metadata: { bookingId: string };
    };
    expect(args.line_items[0].price_data).toMatchObject({ unit_amount: 15000, currency: "gbp" });
    expect(args.metadata.bookingId).toBe(BOOKING_ID);
  });

  it("refuses a booking with no price snapshot instead of reading the live rate", async () => {
    givenPayableBooking({ price_amount: null, price_currency: null });
    nextBody = { bookingId: BOOKING_ID };
    expect((await checkout.POST(req)).status).toBe(412);
    expect(sessionsCreate).not.toHaveBeenCalled();
  });

  it("refuses a second checkout while a Direct Debit is still processing", async () => {
    fake.respond(/from "consultant_bookings"/, [bookingRow({ status: "accepted" })]);
    fake.respond(/from "booking_payments"/, [{ status: "processing", checkout_session_id: "cs_old" }]);
    nextBody = { bookingId: BOOKING_ID };
    expect((await checkout.POST(req)).status).toBe(409);
    expect(sessionsCreate).not.toHaveBeenCalled();
  });
});

describe("share link", () => {
  it("refuses to open the draft for a booking that isn't paid", async () => {
    currentUser = "consultant-user";
    fake.respond(/^select .* from "consultant_bookings"/s, [bookingRow({ share_token: "sht_abc" })]);
    fake.respond(/^select "status" from "booking_payments"/, [{ status: "refunded" }]);
    const res = await shared.GET(new Request("https://app.test/api/marketplace/shared?token=sht_abc"));
    expect(res.status).toBe(402);
    expect(fake.find(/from "drafts"/)).toHaveLength(0);
  });
});
