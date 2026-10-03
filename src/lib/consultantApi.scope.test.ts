import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { setMarketplaceScope } from "./marketplace-scope";
import { createBooking, sendBookingMessage } from "./consultantApi";
beforeEach(() => {
  setMarketplaceScope("workos-user", "workspace-a");
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(Response.json({ booking: { id: "accepted" } })));
});
afterEach(() => { vi.unstubAllGlobals(); });
it("pins an authenticated request to the captured account and workspace", async () => {
  await createBooking({ consultantProfileId: "profile", requestId: "intent" });
  expect(fetch).toHaveBeenCalledWith("/api/marketplace/bookings-create", expect.objectContaining({
    headers: expect.objectContaining({ "X-Account-ID": "workos-user", "X-Workspace-ID": "workspace-a" }),
    body: JSON.stringify({ consultantProfileId: "profile", requestId: "intent" }),
  }));
});
it("sends the caller's stable message ID and explicit unscoped consultant pin", async () => {
  setMarketplaceScope("workos-consultant", null);
  await sendBookingMessage("booking", "hello", "message-intent");
  expect(fetch).toHaveBeenCalledWith("/api/marketplace/bookings-message", expect.objectContaining({
    headers: expect.objectContaining({ "X-Account-ID": "workos-consultant", "X-Workspace-ID": "none" }),
    body: JSON.stringify({ bookingId: "booking", text: "hello", messageId: "message-intent" }),
  }));
});
