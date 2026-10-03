import { act, fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  pull: vi.fn(), respond: vi.fn(), message: vi.fn(), checkout: vi.fn(), stripeStatus: vi.fn(),
}));
vi.mock("@/lib/marketplaceSync", () => ({
  pullMyBookings: mocks.pull, pullInbox: mocks.pull, pushBookingRespond: mocks.respond, pushBookingMessage: mocks.message,
}));
vi.mock("@/lib/consultantApi", () => ({ getStripeConnectStatus: mocks.stripeStatus, startBookingCheckout: mocks.checkout }));
vi.mock("sonner", () => ({ toast: { error: vi.fn() } }));

import { MyBookings } from "@/routes/MyBookings";
import { ConsultantInbox } from "./ConsultantInbox";
import { BookingThread } from "./BookingThread";
import { useBookingsStore, type Booking } from "@/lib/bookings";
import { useConsultantStore } from "@/lib/consultantProfile";
import { setMarketplaceScope } from "@/lib/marketplace-scope";
import { beginSessionTransition, useSessionTransition } from "@/lib/session/transition";

const booking: Booking = {
  id: "booking", consultantInitials: "JS", consultantProfileId: "profile", draftId: "", status: "accepted",
  bookedAt: 100, expectedDeliveryAt: 200, messages: [],
};
function deferred<T>() { let resolve!: (value: T) => void; const promise = new Promise<T>((r) => { resolve = r; }); return { promise, resolve }; }
function cancelTransition() { const transition = beginSessionTransition("Signing out")!; transition.release(); }
const originalLocation = window.location;
const assign = vi.fn();

beforeEach(() => {
  vi.resetAllMocks();
  useSessionTransition.setState({ label: null, epoch: 0 });
  setMarketplaceScope(null, null); setMarketplaceScope("user", "workspace");
  mocks.pull.mockResolvedValue(true);
  mocks.stripeStatus.mockResolvedValue({ ok: true, data: { configured: true } });
  Object.defineProperty(window, "location", { configurable: true, value: { ...originalLocation, assign } });
});
afterEach(() => { Object.defineProperty(window, "location", { configurable: true, value: originalLocation }); });

it("releases checkout after a cancelled switch and never follows the old payment URL", async () => {
  const reply = deferred<unknown>(); mocks.checkout.mockReturnValueOnce(reply.promise)
    .mockResolvedValue({ ok: false, error: "Unavailable", status: 503 });
  useBookingsStore.setState({ bookings: [booking] });
  await act(async () => { render(<MemoryRouter><MyBookings /></MemoryRouter>); });
  fireEvent.click(screen.getByRole("button", { name: "Pay for review" }));
  expect(screen.getByRole("button", { name: "Starting…" })).toBeDisabled();
  cancelTransition();
  await act(async () => { reply.resolve({ ok: true, data: { url: "https://stripe.invalid/old-checkout" } }); });
  expect(assign).not.toHaveBeenCalled();
  expect(screen.getByRole("button", { name: "Pay for review" })).not.toBeDisabled();
  await act(async () => { fireEvent.click(screen.getByRole("button", { name: "Pay for review" })); });
  expect(mocks.checkout).toHaveBeenCalledTimes(2);
  expect(screen.getByRole("button", { name: "Pay for review" })).not.toBeDisabled();
});

it("releases a rating submission while preserving the selected rating", async () => {
  const reply = deferred<boolean>(); mocks.respond.mockReturnValue(reply.promise);
  useBookingsStore.setState({ bookings: [{ ...booking, status: "delivered" }] });
  await act(async () => { render(<MemoryRouter><MyBookings /></MemoryRouter>); });
  fireEvent.click(screen.getByRole("radio", { name: "4 stars" }));
  fireEvent.click(screen.getByRole("button", { name: "Submit" }));
  expect(screen.getByRole("button", { name: "Saving…" })).toBeDisabled();
  cancelTransition();
  await act(async () => { reply.resolve(false); });
  expect(screen.getByRole("button", { name: "Submit" })).not.toBeDisabled();
  expect(screen.getByRole("radio", { name: "4 stars" })).toHaveAttribute("aria-checked", "true");
});

it.each(["decline", "deliver"] as const)("releases a consultant %s form without discarding notes", async (action) => {
  const reply = deferred<boolean>(); mocks.respond.mockReturnValue(reply.promise);
  useConsultantStore.getState().hydrateFromServer({
    id: "profile", fullName: "Jane Server", initials: "JS", role: "Advisor", bio: "A long enough professional biography.",
    specialty: "Reviews", specialties: ["Grievance"], price: 100, currency: "£", sla: "24h", availability: "this_week", rating: 0, reviews: 0,
    avatarFrom: "", avatarTo: "", photoUrl: "", payout: { stripeAccountId: null, payoutsEnabled: false }, updatedAt: 100,
  });
  useBookingsStore.setState({ inbox: [{ ...booking, status: action === "decline" ? "requested" : "accepted" }], inboxState: "ready" });
  render(<ConsultantInbox />);
  fireEvent.click(screen.getByRole("button", { name: action === "decline" ? "Decline" : "Mark delivered" }));
  const input = screen.getByRole("textbox", { name: action === "decline" ? "Reason for declining" : "Delivery summary" });
  fireEvent.change(input, { target: { value: "Keep this detailed note" } });
  const submit = screen.getByRole("button", { name: action === "decline" ? "Confirm decline" : "Send delivery" });
  fireEvent.click(submit);
  expect(submit).toBeDisabled();
  cancelTransition();
  await act(async () => { reply.resolve(false); });
  expect(submit).not.toBeDisabled();
  expect(input).toHaveValue("Keep this detailed note");
});

it("releases a message submission after recovery without inventing a sent message", async () => {
  const reply = deferred<boolean>(); mocks.message.mockReturnValue(reply.promise);
  render(<BookingThread booking={booking} perspective="requester" />);
  fireEvent.click(screen.getByText("Thread"));
  const input = screen.getByRole("textbox", { name: "Message" });
  fireEvent.change(input, { target: { value: "Keep my message" } });
  fireEvent.submit(input.closest("form")!);
  expect(screen.getByRole("button", { name: "Sending…" })).toBeDisabled();
  cancelTransition();
  await act(async () => { reply.resolve(false); });
  expect(screen.getByRole("button", { name: "Send" })).not.toBeDisabled();
  expect(input).toHaveValue("Keep my message");
  expect(screen.getByText("No messages yet — say hello.")).toBeInTheDocument();
});
