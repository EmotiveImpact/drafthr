import { act, render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, expect, it, vi } from "vitest";
vi.mock("@/lib/marketplaceSync", () => ({ pullProfile: vi.fn().mockResolvedValue(true), pullInbox: vi.fn().mockResolvedValue(true) }));
vi.mock("@/components/consultants/ConsultantInbox", () => ({ ConsultantInbox: () => <div>Inbox</div> }));
import { ConsultantHome } from "./ConsultantHome";
import { useConsultantStore, type ConsultantProfile } from "@/lib/consultantProfile";
import { useBookingsStore, type Booking, type BookingStatus } from "@/lib/bookings";

const profile: ConsultantProfile = {
  id: "profile", fullName: "Jane Server", initials: "JS", role: "Advisor", bio: "Sufficiently long professional biography.",
  specialty: "Review", specialties: ["Grievance"], price: 100, currency: "£", sla: "24h", availability: "this_week",
  rating: 4, reviews: 3, avatarFrom: "", avatarTo: "", photoUrl: "", payout: { stripeAccountId: null, payoutsEnabled: false },
  updatedAt: 100, status: "published",
};
function booking(id: string, status: BookingStatus, profileId = "profile"): Booking {
  return { id, status, consultantInitials: "JS", consultantProfileId: profileId, draftId: "", bookedAt: 1, expectedDeliveryAt: 0 };
}
beforeEach(() => {
  useConsultantStore.getState().reset();
  useConsultantStore.getState().hydrateFromServer(profile);
  useBookingsStore.getState().reset();
});

it("shows accepted database status counts, not invented earnings or fees", async () => {
  useBookingsStore.setState({ inboxState: "ready", inbox: [
    booking("complete-1", "completed"), booking("complete-2", "completed"), booking("active", "accepted"),
    booking("delivered", "delivered"), booking("requested", "requested"), booking("declined", "declined"),
    booking("another-profile", "completed", "other-profile"),
  ], bookings: [booking("requester-only", "completed")] });
  await act(async () => { render(<MemoryRouter><ConsultantHome /></MemoryRouter>); });
  const activity = within(screen.getByRole("region", { name: "Review activity" }));
  expect(activity.getByText("Completed reviews").parentElement).toHaveTextContent("2");
  expect(activity.getByText("In progress").parentElement).toHaveTextContent("1");
  expect(activity.getByText("Awaiting acknowledgement").parentElement).toHaveTextContent("1");
  expect(activity.getByText("From saved booking statuses")).toBeInTheDocument();
  expect(activity.getByText(/Review counts are not earnings or payout totals/)).toBeInTheDocument();
  expect(screen.queryByText("Potential value")).not.toBeInTheDocument();
  expect(screen.queryByText("Platform fee")).not.toBeInTheDocument();
  expect(screen.queryByText("12%")).not.toBeInTheDocument();
  expect(screen.queryByText("~£4,800")).not.toBeInTheDocument();
});

it.each(["loading", "error"] as const)("does not present %s activity as an empty or current database result", async (state) => {
  useBookingsStore.setState({ inboxState: state, inbox: [booking("previous", "completed")] });
  await act(async () => { render(<MemoryRouter><ConsultantHome /></MemoryRouter>); });
  const activity = within(screen.getByRole("region", { name: "Review activity" }));
  expect(activity.getAllByText("—")).toHaveLength(3);
  expect(activity.getByText(state === "error" ? "Activity unavailable · retry the inbox" : "Loading activity…")).toBeInTheDocument();
  expect(activity.queryByText("From saved booking statuses")).not.toBeInTheDocument();
});
