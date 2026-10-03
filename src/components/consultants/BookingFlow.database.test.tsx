import { act, fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ create: vi.fn(), message: vi.fn() }));
vi.mock("@/lib/marketplaceSync", () => ({ pushBookingCreate: mocks.create, pushBookingMessage: mocks.message }));
vi.mock("sonner", () => ({ toast: { error: vi.fn() } }));
import { BookingDialog } from "./BookingDialog";
import { BookingThread } from "./BookingThread";
import { setMarketplaceScope } from "@/lib/marketplace-scope";
import { beginSessionTransition, useSessionTransition } from "@/lib/session/transition";
import type { Booking } from "@/lib/bookings";
import type { Consultant } from "./types";

const consultant: Consultant = { profileId: "server-profile", initials: "FC", name: "Fictional Consultant", role: "Advisor", rating: 0, reviews: 0,
  price: 100, sla: "24h", avatarFrom: "", avatarTo: "", photoUrl: "", specialty: "Reviews", specialties: [] };
const accepted: Booking = { id: "server-booking", consultantInitials: "FC", consultantProfileId: "server-profile", draftId: "", status: "requested", bookedAt: 100, expectedDeliveryAt: 200, messages: [] };
function deferred<T>() { let resolve!: (v: T) => void; const promise = new Promise<T>((r) => { resolve = r; }); return { promise, resolve }; }
beforeEach(() => {
  vi.resetAllMocks(); useSessionTransition.setState({ label: null, epoch: 0 });
  setMarketplaceScope(null, null); setMarketplaceScope("user", "workspace");
});

describe("database-first booking controls", () => {
  it("waits for acceptance and reports the real booking, not a placeholder", async () => {
    const reply = deferred<Booking>(); mocks.create.mockReturnValue(reply.promise);
    const onBooked = vi.fn(), onClose = vi.fn();
    render(<BookingDialog consultant={consultant} draftId="" onClose={onClose} onBooked={onBooked} />);
    fireEvent.click(screen.getByRole("button", { name: "Send booking request" }));
    expect(screen.getByRole("button", { name: "Sending…" })).toBeDisabled();
    expect(onBooked).not.toHaveBeenCalled(); expect(onClose).not.toHaveBeenCalled();
    await act(async () => { reply.resolve(accepted); });
    expect(onBooked).toHaveBeenCalledWith(accepted); expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("retains failed booking notes and reuses the same request ID for retry", async () => {
    mocks.create.mockResolvedValue(null);
    const onBooked = vi.fn();
    render(<BookingDialog consultant={consultant} draftId="" onClose={vi.fn()} onBooked={onBooked} />);
    fireEvent.change(screen.getByLabelText("Focus notes (optional)"), { target: { value: "Keep these notes" } });
    await act(async () => { fireEvent.click(screen.getByRole("button", { name: "Send booking request" })); });
    expect(screen.getByLabelText("Focus notes (optional)")).toHaveValue("Keep these notes");
    const first = mocks.create.mock.calls[0][0];
    await act(async () => { fireEvent.click(screen.getByRole("button", { name: "Send booking request" })); });
    expect(mocks.create.mock.calls[1][0]).toEqual(first);
    expect(onBooked).not.toHaveBeenCalled();
  });

  it("does not close or report success if the workspace changed while saving", async () => {
    const reply = deferred<Booking>(); mocks.create.mockReturnValue(reply.promise);
    const onBooked = vi.fn(), onClose = vi.fn();
    render(<BookingDialog consultant={consultant} draftId="" onClose={onClose} onBooked={onBooked} />);
    fireEvent.click(screen.getByRole("button", { name: "Send booking request" }));
    setMarketplaceScope("other-user", "other-workspace");
    await act(async () => { reply.resolve(accepted); });
    expect(onBooked).not.toHaveBeenCalled(); expect(onClose).not.toHaveBeenCalled();
  });

  it("releases a booking form after a failed session transition and preserves its retry identity", async () => {
    const reply = deferred<Booking>(); mocks.create.mockReturnValueOnce(reply.promise).mockResolvedValue(null);
    const onBooked = vi.fn(), onClose = vi.fn();
    render(<BookingDialog consultant={consultant} draftId="" onClose={onClose} onBooked={onBooked} />);
    fireEvent.change(screen.getByLabelText("Focus notes (optional)"), { target: { value: "Keep these notes" } });
    fireEvent.click(screen.getByRole("button", { name: "Send booking request" }));
    const request = mocks.create.mock.calls[0][0];
    const transition = beginSessionTransition("Signing out")!;
    transition.release();
    await act(async () => { reply.resolve(accepted); });
    expect(screen.getByRole("button", { name: "Send booking request" })).not.toBeDisabled();
    expect(screen.getByRole("button", { name: "Cancel" })).not.toBeDisabled();
    expect(screen.getByLabelText("Focus notes (optional)")).toHaveValue("Keep these notes");
    expect(onBooked).not.toHaveBeenCalled(); expect(onClose).not.toHaveBeenCalled();
    await act(async () => { fireEvent.click(screen.getByRole("button", { name: "Send booking request" })); });
    expect(mocks.create.mock.calls[1][0]).toEqual(request);
  });

  it("does not manufacture bookings for cards without a real profile ID", () => {
    render(<BookingDialog consultant={{ ...consultant, profileId: undefined }} draftId="" onClose={vi.fn()} />);
    expect(screen.getByRole("button", { name: "Send booking request" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Cancel" })).not.toBeDisabled();
  });

  it("keeps failed message text and reuses its message ID; accepted messages clear the composer", async () => {
    mocks.message.mockResolvedValueOnce(false).mockResolvedValueOnce(true);
    render(<BookingThread booking={accepted} perspective="requester" />);
    fireEvent.click(screen.getByText("Thread"));
    const input = screen.getByRole("textbox", { name: "Message" });
    fireEvent.change(input, { target: { value: "Please review" } });
    await act(async () => { fireEvent.submit(input.closest("form")!); });
    expect(input).toHaveValue("Please review");
    const id = mocks.message.mock.calls[0][3];
    expect(id).toEqual(expect.any(String));
    await act(async () => { fireEvent.submit(input.closest("form")!); });
    expect(mocks.message.mock.calls[1][3]).toBe(id);
    expect(input).toHaveValue("");
  });
});
