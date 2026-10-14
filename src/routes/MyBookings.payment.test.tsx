/**
 * MyBookings payment affordances: a booking delivered before payment was
 * required can still be paid (the server accepts checkout for it and refuses
 * to complete it unpaid), and the rating only appears once it is paid.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { toast } from "sonner";
import { startBookingCheckout } from "@/lib/consultantApi";
import { MemoryRouter } from "react-router-dom";

vi.mock("@/lib/marketplaceSync", () => ({
  pullMyBookings: vi.fn(async () => true),
  pushBookingRespond: vi.fn(async () => true),
  pushBookingMessage: vi.fn(async () => true),
}));
vi.mock("@/lib/consultantApi", () => ({
  getStripeConnectStatus: vi.fn(async () => ({
    ok: true,
    data: { configured: true, hasProfile: false, payoutsEnabled: false, detailsSubmitted: false },
  })),
  startBookingCheckout: vi.fn(),
}));
vi.mock("sonner", () => ({ toast: { error: vi.fn(), success: vi.fn(), info: vi.fn() } }));

import { MyBookings } from "./MyBookings";
import { useBookingsStore, type Booking } from "@/lib/bookings";

function seed(over: Partial<Booking>) {
  const booking: Booking = {
    id: "11111111-1111-4111-8111-111111111111",
    consultantInitials: "JS",
    consultantProfileId: "33333333-3333-4333-8333-333333333333",
    consultantName: "Jo Specialist",
    draftId: "",
    bookedAt: 1_000,
    expectedDeliveryAt: 2_000,
    status: "delivered",
    messages: [],
    priceAmount: 15000,
    priceCurrency: "gbp",
    ...over,
  };
  useBookingsStore.setState({ bookings: [booking] });
}

function renderPage() {
  return render(
    <MemoryRouter>
      <MyBookings />
    </MemoryRouter>,
  );
}

beforeEach(() => {
  useBookingsStore.setState({ bookings: [] });
});

describe("MyBookings payment", () => {
  it("offers payment, not a rating, for a delivered booking that isn't paid", async () => {
    seed({ status: "delivered", paymentStatus: "unpaid" });
    renderPage();
    expect(await screen.findByRole("button", { name: "Pay for review" })).toBeInTheDocument();
    expect(screen.queryByRole("radiogroup", { name: /rate this review/i })).not.toBeInTheDocument();
  });

  it("asks for a rating once a delivered booking is paid", async () => {
    seed({ status: "delivered", paymentStatus: "paid" });
    renderPage();
    expect(await screen.findByRole("radiogroup", { name: /rate this review/i })).toBeInTheDocument();
    await waitFor(() => expect(screen.queryByRole("button", { name: "Pay for review" })).not.toBeInTheDocument());
  });

  it("offers payment for an accepted booking", async () => {
    seed({ status: "accepted", paymentStatus: "failed" });
    renderPage();
    expect(await screen.findByRole("button", { name: "Pay for review" })).toBeInTheDocument();
    expect(screen.getByText(/didn't go through/)).toBeInTheDocument();
  });

  it("explains a refunded delivered booking instead of asking for a rating", async () => {
    seed({ status: "delivered", paymentStatus: "refunded" });
    renderPage();
    expect(await screen.findByText("This booking was refunded.")).toBeInTheDocument();
    expect(screen.queryByRole("radiogroup", { name: /rate this review/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Pay for review" })).not.toBeInTheDocument();
  });

  it("says when an unpaid delivered booking came back", async () => {
    seed({ status: "delivered", paymentStatus: "unpaid", acceptedAt: Date.now() - 8 * 86_400_000, deliveredAt: Date.now() - 6 * 86_400_000 });
    renderPage();
    expect(await screen.findByText(/^Review delivered .+\. Pay to close the booking and rate it\.$/)).toBeInTheDocument();
    expect(screen.queryByText(/accepted 8 days ago/)).not.toBeInTheDocument();
  });

  it("shows its own copy, not the server's, when checkout can't start", async () => {
    vi.mocked(startBookingCheckout).mockResolvedValueOnce({
      ok: false,
      status: 401,
      error: "Session expired \u2014 please sign in again.",
    });
    seed({ status: "accepted", paymentStatus: "unpaid" });
    renderPage();
    fireEvent.click(await screen.findByRole("button", { name: "Pay for review" }));
    await waitFor(() =>
      expect(toast.error).toHaveBeenCalledWith("You've been signed out. Sign in again, then pay for the review."),
    );
    expect(await screen.findByRole("button", { name: "Pay for review" })).toBeEnabled();
  });
});
