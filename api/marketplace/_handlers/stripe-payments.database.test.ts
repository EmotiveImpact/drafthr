// @vitest-environment node
import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { eq, inArray } from "drizzle-orm";
import type Stripe from "stripe";
import { getDb, closeDb } from "../../../src/db/index";
import { bookingPayments, consultantBookings, consultantProfiles, stripeConnectAccounts, tenantMembers, tenants, users, webhookEventsSeen } from "../../../src/db/schema";

const mocks = vi.hoisted(() => ({ auth: vi.fn(), create: vi.fn(), retrieve: vi.fn(), event: vi.fn(), account: vi.fn(), intent: vi.fn() }));
vi.mock("../../_utils/session-with-tenant.js", () => ({ requireSessionAndTenant: mocks.auth }));
vi.mock("../../_utils/rate-limit.js", () => ({ rateLimit: vi.fn().mockResolvedValue(null) }));
vi.mock("../../_utils/stripe.js", () => ({
  getStripe: () => ({ checkout: { sessions: { create: mocks.create, retrieve: mocks.retrieve } },
    webhooks: { constructEventAsync: mocks.event }, accounts: { retrieve: mocks.account }, paymentIntents: { retrieve: mocks.intent } }),
  appBaseUrl: () => "https://example.invalid", platformFeeBps: () => 500,
}));
import { POST as checkout } from "./stripe-checkout";
import { POST as webhook } from "./stripe-webhook";

describe.skipIf(!process.env.DRAFTHR_LOCAL_DATABASE_URL)("booking payments against disposable Postgres", () => {
  const tenantId = randomUUID(), userId = randomUUID(), consultantId = randomUUID(), profileId = randomUUID();
  const eventIds: string[] = [];
  let bookingId: string;
  const sessions = new Map<string, Stripe.Checkout.Session>();
  const keys = new Map<string, Stripe.Checkout.Session>();
  const request = () => new Request("http://localhost:5273/api/marketplace/stripe-checkout", { method: "POST",
    headers: { Origin: "http://localhost:5273", "Content-Type": "application/json", "X-Account-ID": `workos-${userId}`, "X-Workspace-ID": tenantId },
    body: JSON.stringify({ bookingId }) });
  async function stored() { return (await getDb().select().from(bookingPayments).where(eq(bookingPayments.bookingId, bookingId)))[0]; }
  function providerCreate(params: Stripe.Checkout.SessionCreateParams, options: Stripe.RequestOptions) {
    const key = options.idempotencyKey!;
    if (keys.has(key)) return keys.get(key)!;
    const price = params.line_items![0].price_data!;
    const session = { id: `cs_${randomUUID()}`, object: "checkout.session", mode: "payment", status: "open", payment_status: "unpaid",
      url: `https://checkout.example.invalid/${key}`, metadata: params.metadata, client_reference_id: bookingId,
      amount_total: price.unit_amount, currency: price.currency, payment_intent: null } as Stripe.Checkout.Session;
    keys.set(key, session); sessions.set(session.id, session); return session;
  }
  async function deliver(session: Stripe.Checkout.Session, type = "checkout.session.completed", eventId = `evt_${randomUUID()}`) {
    eventIds.push(`marketplace:${eventId}`);
    if (type === "checkout.session.async_payment_failed") eventIds.push(`marketplace:failed-session:${session.id}`);
    mocks.event.mockResolvedValue({ id: eventId, type, data: { object: session } });
    return webhook(new Request("https://example.invalid/api/marketplace/stripe-webhook", { method: "POST",
      headers: { "stripe-signature": "fixture-signature" }, body: "fictional signed event fixture" }));
  }
  beforeAll(async () => {
    vi.stubEnv("DRAFTHR_LOCAL_WORKOS_EMULATOR", "1"); vi.stubEnv("STRIPE_WEBHOOK_SECRET", "whsec_fixture");
    await getDb().insert(tenants).values({ id: tenantId, name: "Fictional payment workspace" });
    await getDb().insert(users).values([userId, consultantId].map(id => ({ id, externalId: `payment-test-${id}` })));
    await getDb().insert(tenantMembers).values({ userId, tenantId, role: "owner", isActiveTenant: true });
    await getDb().insert(consultantProfiles).values({ id: profileId, userId: consultantId, initials: "FC", fullName: "Fictional Consultant",
      role: "Advisor", bio: "Fictional fixture", specialty: "Reviews", specialties: [], price: 100, currency: "GBP", sla: "24h", status: "published" });
    await getDb().insert(stripeConnectAccounts).values({ profileId, accountId: "acct_fixture", payoutsEnabled: true });
  });
  beforeEach(async () => {
    vi.clearAllMocks(); sessions.clear(); keys.clear(); bookingId = randomUUID();
    mocks.auth.mockResolvedValue({ ok: true, session: { user: { id: `workos-${userId}` } }, userRow: { id: userId },
      activeTenant: { id: tenantId }, activeMember: { role: "owner" } });
    mocks.create.mockImplementation(async (params, options) => providerCreate(params, options));
    mocks.retrieve.mockImplementation(async id => { if (!sessions.has(id)) throw new Error("Unknown fixture session"); return sessions.get(id); });
    mocks.intent.mockResolvedValue({ status: "processing" });
    await getDb().update(consultantProfiles).set({ price: 100, currency: "GBP" }).where(eq(consultantProfiles.id, profileId));
    await getDb().insert(consultantBookings).values({ id: bookingId, consultantUserId: consultantId, consultantProfileId: profileId,
      requesterUserId: userId, tenantId, matterTitle: "Fictional payment review", status: "requested" });
  });
  afterAll(async () => {
    if (eventIds.length) await getDb().delete(webhookEventsSeen).where(inArray(webhookEventsSeen.eventId, eventIds));
    await getDb().delete(tenants).where(eq(tenants.id, tenantId));
    await getDb().delete(users).where(inArray(users.id, [userId, consultantId]));
    await closeDb(); vi.unstubAllEnvs();
  });

  it("reserves one immutable provider request for simultaneous checkout clicks", async () => {
    let release!: () => void, entered!: () => void;
    const firstEntered = new Promise<void>(resolve => { entered = resolve; });
    const bothEntered = new Promise<void>(resolve => { release = resolve; });
    let calls = 0;
    mocks.create.mockImplementation(async (params, options) => {
      const session = providerCreate(params, options);
      if (++calls === 1) entered(); else release();
      await bothEntered; return session;
    });
    const first = checkout(request());
    await Promise.race([firstEntered, first.then(response => { throw new Error(`Checkout returned before reaching provider: ${response.status}`); })]);
    const replies = await Promise.all([first, checkout(request())]);
    expect(replies.map(response => response.status)).toEqual([200, 200]);
    const urls = await Promise.all(replies.map(async response => (await response.json() as { url: string }).url));
    expect(new Set(urls).size).toBe(1); expect(keys.size).toBe(1);
    expect((await stored()).checkoutSessionId).toBe([...sessions.keys()][0]);
    expect(mocks.create.mock.calls[0]).toEqual(mocks.create.mock.calls[1]);
  });
  it("reuses an open session without expiring it or making another", async () => {
    const first = await checkout(request()), second = await checkout(request());
    expect(await first.json()).toEqual(await second.json()); expect(mocks.create).toHaveBeenCalledTimes(1);
  });
  it("recovers a lost create response with the original price, destination, parameters and key", async () => {
    mocks.create.mockImplementationOnce(async (params, options) => { providerCreate(params, options); throw new Error("Connection lost after provider commit"); });
    expect((await checkout(request())).status).toBe(502);
    await getDb().update(consultantProfiles).set({ price: 999, currency: "USD" }).where(eq(consultantProfiles.id, profileId));
    expect((await checkout(request())).status).toBe(200);
    expect(mocks.create.mock.calls[0]).toEqual(mocks.create.mock.calls[1]);
    expect((await stored()).amount).toBe(10000); expect(keys.size).toBe(1);
  });
  it("keeps expiry valid when the first provider call happens after a short outage", async () => {
    mocks.create.mockRejectedValueOnce(new Error("Request not sent"));
    expect((await checkout(request())).status).toBe(502);
    const advance = vi.spyOn(Date, "now").mockReturnValue(Date.now() + 31 * 60_000);
    try {
      expect((await checkout(request())).status).toBe(200);
      const params = mocks.create.mock.calls[1][0] as Stripe.Checkout.SessionCreateParams;
      expect(params.expires_at! - Math.floor(Date.now() / 1000)).toBeGreaterThan(30 * 60);
    } finally { advance.mockRestore(); }
  });
  it("requires reconciliation before replaying an unknown create outside the safe key lifetime", async () => {
    mocks.create.mockRejectedValueOnce(new Error("Request outcome unknown"));
    await checkout(request());
    await getDb().update(bookingPayments).set({ checkoutRequestedAt: new Date(Date.now() - 24 * 60 * 60_000) }).where(eq(bookingPayments.bookingId, bookingId));
    const response = await checkout(request()); expect(response.status).toBe(409);
    expect((await response.json() as { code: string }).code).toBe("payment_reconciliation_required"); expect(mocks.create).toHaveBeenCalledTimes(1);
  });
  it("replaces a confirmed expired session once, while concurrent callers reuse the replacement", async () => {
    await checkout(request()); const old = await stored(); sessions.get(old.checkoutSessionId!)!.status = "expired";
    const replies = await Promise.all([checkout(request()), checkout(request())]);
    expect(replies.map(response => response.status)).toEqual([200, 200]); expect(keys.size).toBe(2);
    expect((await stored()).checkoutAttemptId).not.toBe(old.checkoutAttemptId);
  });
  it("commits an early paid webhook before the checkout response is attached", async () => {
    mocks.create.mockImplementationOnce(async (params, options) => {
      const session = providerCreate(params, options); session.payment_status = "paid"; session.status = "complete"; session.payment_intent = "pi_fixture";
      expect((await deliver(session)).status).toBe(200); return session;
    });
    expect((await checkout(request())).status).toBe(409);
    expect(await stored()).toMatchObject({ status: "paid", paymentIntentId: "pi_fixture", checkoutSessionId: [...sessions.keys()][0] });
  });
  it("makes repeated paid deliveries harmless and blocks another checkout", async () => {
    await checkout(request()); const session = sessions.get((await stored()).checkoutSessionId!)!;
    session.payment_status = "paid"; session.status = "complete"; session.payment_intent = "pi_paid";
    const id = `evt_${randomUUID()}`;
    expect((await deliver(session, undefined, id)).status).toBe(200);
    expect((await deliver(session, undefined, id)).status).toBe(200);
    expect((await checkout(request())).status).toBe(409); expect(mocks.create).toHaveBeenCalledTimes(1);
    expect(await stored()).toMatchObject({ status: "paid", paymentIntentId: "pi_paid" });
  });
  it("retries an event when the reservation is missing, then records it when storage is available", async () => {
    await checkout(request()); const payment = await stored(), session = sessions.get(payment.checkoutSessionId!)!;
    session.payment_status = "paid"; session.payment_intent = "pi_retry";
    await getDb().delete(bookingPayments).where(eq(bookingPayments.bookingId, bookingId));
    const id = `evt_${randomUUID()}`;
    expect((await deliver(session, undefined, id)).status).toBe(503);
    expect(await getDb().select().from(webhookEventsSeen).where(eq(webhookEventsSeen.eventId, `marketplace:${id}`))).toHaveLength(0);
    await getDb().insert(bookingPayments).values(payment);
    expect((await deliver(session, undefined, id)).status).toBe(200);
    expect((await stored()).status).toBe("paid");
  });
  it.each(["session", "amount", "currency"])("rejects a paid event with a mismatched %s", async mismatch => {
    await checkout(request()); const session = { ...sessions.get((await stored()).checkoutSessionId!)!, payment_status: "paid", payment_intent: "pi_wrong" } as Stripe.Checkout.Session;
    if (mismatch === "session") session.id = "cs_different";
    if (mismatch === "amount") session.amount_total = 1;
    if (mismatch === "currency") session.currency = "usd";
    expect((await deliver(session)).status).toBe(503); expect((await stored()).status).toBe("unpaid");
  });
  it("supports legacy rows whose only provider reference is a session ID", async () => {
    await checkout(request()); const payment = await stored();
    await getDb().update(bookingPayments).set({ checkoutAttemptId: null, checkoutParams: null, checkoutRequestedAt: null }).where(eq(bookingPayments.bookingId, bookingId));
    expect((await checkout(request())).status).toBe(200); expect(mocks.create).toHaveBeenCalledTimes(1);
    const session = sessions.get(payment.checkoutSessionId!)!; session.payment_status = "paid"; session.payment_intent = "pi_legacy";
    expect((await deliver(session)).status).toBe(200); expect((await stored()).status).toBe("paid");
  });
  it("keeps delayed payments pending, then records asynchronous success", async () => {
    await checkout(request()); const session = sessions.get((await stored()).checkoutSessionId!)!;
    session.status = "complete"; session.payment_intent = "pi_delayed";
    expect((await deliver(session)).status).toBe(200); expect((await stored()).status).toBe("unpaid");
    expect((await checkout(request())).status).toBe(409); expect(mocks.create).toHaveBeenCalledTimes(1);
    session.payment_status = "paid";
    expect((await deliver(session, "checkout.session.async_payment_succeeded")).status).toBe(200);
    expect((await stored()).status).toBe("paid");
  });
  it("permits a new attempt after asynchronous failure and ignores that old failure's redelivery", async () => {
    await checkout(request()); const payment = await stored(), session = sessions.get(payment.checkoutSessionId!)!;
    session.status = "complete"; session.payment_intent = "pi_failed";
    const id = `evt_${randomUUID()}`;
    expect((await deliver(session, "checkout.session.async_payment_failed", id)).status).toBe(200);
    expect((await stored()).status).toBe("failed"); expect((await checkout(request())).status).toBe(200);
    const replacement = await stored(); expect(replacement.checkoutAttemptId).not.toBe(payment.checkoutAttemptId);
    expect((await deliver(session, "checkout.session.async_payment_failed", id)).status).toBe(200);
    expect(await stored()).toEqual(replacement);
  });
  it("recovers terminal delayed failures even if their old webhook was missed", async () => {
    await checkout(request()); const session = sessions.get((await stored()).checkoutSessionId!)!;
    session.status = "complete"; session.payment_intent = "pi_failed_before_fix";
    mocks.intent.mockResolvedValue({ status: "requires_payment_method" });
    expect((await checkout(request())).status).toBe(200); expect(keys.size).toBe(2);
    eventIds.push(`marketplace:reconciled-failure:${session.id}`, `marketplace:failed-session:${session.id}`);
    const replacement = await stored();
    expect((await deliver(session, "checkout.session.async_payment_failed")).status).toBe(200);
    expect(await stored()).toEqual(replacement);
  });
  it("ignores another product's Checkout event even when client_reference_id is a UUID", async () => {
    const session = { id: "cs_subscription_fixture", mode: "subscription", payment_status: "paid", client_reference_id: bookingId, metadata: {} } as Stripe.Checkout.Session;
    expect((await deliver(session)).status).toBe(200); expect(await stored()).toBeUndefined();
  });
});
