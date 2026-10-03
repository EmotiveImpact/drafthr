// @vitest-environment node
import { afterEach, beforeEach, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ event: vi.fn(), payment: vi.fn(), account: vi.fn(), write: vi.fn() }));
vi.mock("../../_utils/stripe.js", () => ({ getStripe: () => ({ webhooks: { constructEventAsync: mocks.event }, accounts: { retrieve: mocks.account } }) }));
vi.mock("../../_utils/marketplace-payments.js", () => ({ recordBookingPayment: mocks.payment }));
vi.mock("../../../src/db/index.js", () => ({ getDb: () => ({ update: () => ({ set: () => ({ where: mocks.write }) }) }) }));
import { POST } from "./stripe-webhook";
const request = () => new Request("https://example.invalid/api/marketplace/stripe-webhook", { method: "POST", headers: { "stripe-signature": "fixture" }, body: "fixture payload" });
beforeEach(() => {
  vi.clearAllMocks(); vi.stubEnv("STRIPE_WEBHOOK_SECRET", "whsec_fixture");
  mocks.payment.mockResolvedValue(undefined); mocks.write.mockResolvedValue(undefined);
  mocks.account.mockResolvedValue({ payouts_enabled: true, details_submitted: true });
});
afterEach(() => vi.unstubAllEnvs());
it("rejects invalid signatures before touching payment state", async () => {
  mocks.event.mockRejectedValue(new Error("Signature mismatch"));
  expect((await POST(request())).status).toBe(400); expect(mocks.payment).not.toHaveBeenCalled();
});
it("returns a retryable failure when the payment database operation fails", async () => {
  mocks.event.mockResolvedValue({ id: "evt_fixture", type: "checkout.session.completed", data: { object: { id: "cs_fixture", payment_status: "paid" } } });
  mocks.payment.mockRejectedValueOnce(new Error("Database unavailable"));
  expect((await POST(request())).status).toBe(503);
  expect((await POST(request())).status).toBe(200); expect(mocks.payment).toHaveBeenCalledTimes(2);
});
it.each(["checkout.session.completed", "checkout.session.async_payment_succeeded", "checkout.session.async_payment_failed"])("reconciles %s before acknowledging", async type => {
  const session = { id: "cs_fixture" };
  mocks.event.mockResolvedValue({ id: "evt_fixture", type, data: { object: session } });
  expect((await POST(request())).status).toBe(200);
  expect(mocks.payment).toHaveBeenCalledWith(session, { id: "evt_fixture", failed: type.endsWith("failed") });
});
it("retries account updates if current provider state cannot be read", async () => {
  mocks.event.mockResolvedValue({ id: "evt_account", type: "account.updated", data: { object: { id: "acct_fixture", payouts_enabled: false } } });
  mocks.account.mockRejectedValueOnce(new Error("Provider unavailable"));
  expect((await POST(request())).status).toBe(503); expect(mocks.write).not.toHaveBeenCalled();
});
it("retries account updates if their database commit fails", async () => {
  mocks.event.mockResolvedValue({ id: "evt_account", type: "account.updated", data: { object: { id: "acct_fixture" } } });
  mocks.write.mockRejectedValueOnce(new Error("Database unavailable"));
  expect((await POST(request())).status).toBe(503);
});
