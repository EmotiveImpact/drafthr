import { describe, it, expect, vi, beforeEach } from "vitest";
import { drizzle } from "drizzle-orm/pg-proxy";
import * as schema from "../../../src/db/schema.js";

// Shared state the mocks read; vi.hoisted so the hoisted factories can see it.
const state = vi.hoisted(() => ({
  role: "owner" as string | null,
  tenantId: "t1" as string | null,
  body: {} as Record<string, unknown>,
  subs: { tenant: true, user: false } as Record<string, boolean>,
  // Which subject's subscription is usable (active, or past_due in grace).
  active: { tenant: false, user: false } as Record<string, boolean>,
  customers: { tenant: "cus_ws", user: "cus_me" } as Record<string, string | null>,
}));
const portalCreate = vi.hoisted(() => vi.fn(async () => ({ url: "https://billing.stripe.com/p/session" })));
const checkoutCreate = vi.hoisted(() => vi.fn(async () => ({ url: "https://checkout.stripe.com/c/session" })));

vi.mock("../../../api/_utils/rate-limit.js", () => ({ rateLimit: () => null }));
vi.mock("../../../api/_utils/request.js", () => ({
  enforceSameOrigin: () => null,
  readJsonRequest: async () => ({ ok: true, body: state.body }),
  jsonError: (error: string, status: number) =>
    new Response(JSON.stringify({ error }), { status, headers: { "Content-Type": "application/json" } }),
}));
vi.mock("../../../api/_utils/session-with-tenant.js", () => ({
  requireSessionAndTenant: async () => ({
    ok: true,
    activeTenant: state.tenantId ? { id: state.tenantId } : null,
    activeMember: state.role ? { role: state.role } : null,
    userRow: { id: "u1", email: "a@b.com" },
  }),
}));
vi.mock("../../../api/_utils/stripe.js", () => ({
  getStripe: () => ({
    billingPortal: { sessions: { create: portalCreate } },
    checkout: { sessions: { create: checkoutCreate } },
  }),
  appBaseUrl: () => "https://app.test",
}));
vi.mock("../../../api/_utils/stripe-billing.js", () => ({
  readStripeCustomerId: async (subjectType: string) => state.customers[subjectType],
  getOrCreateCustomer: async () => "cus_ws",
}));
vi.mock("../../../api/_utils/entitlements.js", () => ({
  subjectHasActiveSubscription: async (subjectType: string) => state.active[subjectType] ?? false,
}));
// A real drizzle instance over a fake driver: a subscriptions lookup finds a
// row when the subject type it asks about has one in `state.subs`.
const db = drizzle(
  async (sql, params) => {
    if (!sql.includes('from "subscriptions"')) return { rows: [] };
    const type = params.includes("tenant") ? "tenant" : "user";
    return { rows: state.subs[type] ? [[`${type}-sub`]] : [] };
  },
  { schema },
);
vi.mock("../../../src/db/index.js", () => ({ getDb: () => db }));

const { POST } = await import("../../../api/marketplace/_handlers/billing-portal.js");
const checkout = await import("../../../api/marketplace/_handlers/billing-checkout.js");

const req = {} as unknown as Request;

beforeEach(() => {
  state.role = "owner";
  state.tenantId = "t1";
  state.body = {};
  state.subs = { tenant: true, user: false };
  state.active = { tenant: false, user: false };
  state.customers = { tenant: "cus_ws", user: "cus_me" };
  portalCreate.mockClear();
  checkoutCreate.mockClear();
});

describe("POST /api/marketplace/billing-portal", () => {
  it("opens the portal on the workspace customer for an owner", async () => {
    const res = await POST(req);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ url: "https://billing.stripe.com/p/session" });
    expect(portalCreate).toHaveBeenCalledWith(
      expect.objectContaining({ customer: "cus_ws", return_url: "https://app.test/settings?tab=billing" }),
    );
  });

  it("refuses a workspace plan to a member who isn't an owner or admin", async () => {
    state.role = "drafter";
    const res = await POST(req);
    expect(res.status).toBe(403);
    expect(portalCreate).not.toHaveBeenCalled();
  });

  it("lets any member manage their own personal plan", async () => {
    state.role = "viewer";
    state.subs = { tenant: false, user: true };
    const res = await POST(req);
    expect(res.status).toBe(200);
    expect(portalCreate).toHaveBeenCalledWith(expect.objectContaining({ customer: "cus_me" }));
  });

  it("opens the plan the app shows: a live personal plan over a dead workspace one", async () => {
    // Settings shows "Employee Plus" here (the workspace plan was cancelled),
    // so Manage billing must open that, not the old workspace subscription.
    state.role = "drafter";
    state.subs = { tenant: true, user: true };
    state.active = { tenant: false, user: true };
    const res = await POST(req);
    expect(res.status).toBe(200);
    expect(portalCreate).toHaveBeenCalledWith(expect.objectContaining({ customer: "cus_me" }));
  });

  it("still prefers a live workspace plan over a live personal one", async () => {
    state.subs = { tenant: true, user: true };
    state.active = { tenant: true, user: true };
    await POST(req);
    expect(portalCreate).toHaveBeenCalledWith(expect.objectContaining({ customer: "cus_ws" }));
  });

  it("says so when there is no subscription to manage", async () => {
    state.subs = { tenant: false, user: false };
    const res = await POST(req);
    expect(res.status).toBe(404);
    expect(portalCreate).not.toHaveBeenCalled();
  });

  it("only returns to known app pages", async () => {
    state.body = { returnTo: "https://evil.example" };
    await POST(req);
    expect(portalCreate).toHaveBeenCalledWith(expect.objectContaining({ return_url: "https://app.test/settings?tab=billing" }));
    state.body = { returnTo: "/pricing" };
    await POST(req);
    expect(portalCreate).toHaveBeenLastCalledWith(expect.objectContaining({ return_url: "https://app.test/pricing" }));
  });
});

describe("POST /api/marketplace/billing-checkout — workspace plans", () => {
  beforeEach(() => {
    process.env.STRIPE_PRICE_SUB_PRO_MONTHLY = "price_pro_monthly";
    process.env.STRIPE_PRICE_SUB_EMPLOYEE_PLUS = "price_plus";
  });

  it("refuses a workspace subscription from a member who isn't an owner or admin", async () => {
    state.role = "drafter";
    state.body = { priceKey: "sub_pro_monthly" };
    const res = await checkout.POST(req);
    expect(res.status).toBe(403);
    expect(checkoutCreate).not.toHaveBeenCalled();
  });

  it("lets an admin start one", async () => {
    state.role = "admin";
    state.body = { priceKey: "sub_pro_monthly" };
    const res = await checkout.POST(req);
    expect(res.status).toBe(200);
    expect(checkoutCreate).toHaveBeenCalled();
  });

  it("does not gate a personal plan on the workspace role", async () => {
    state.role = "viewer";
    state.body = { priceKey: "sub_employee_plus" };
    const res = await checkout.POST(req);
    expect(res.status).toBe(200);
  });
});
