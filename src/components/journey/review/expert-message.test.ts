import { beforeEach, describe, expect, it, vi } from "vitest";
import { useBookingsStore } from "@/lib/bookings";
import type { ReviewRequest } from "@/lib/journey/reviews";

// The booking thread sync: drive success and failure without a server.
const { pushMock } = vi.hoisted(() => ({ pushMock: vi.fn() }));
vi.mock("@/lib/marketplaceSync", () => ({ pushBookingMessage: pushMock, pushBookingCreate: vi.fn() }));
vi.mock("sonner", () => ({ toast: Object.assign(vi.fn(), { error: vi.fn(), success: vi.fn() }) }));

import { messageTheReviewer } from "./actions";

const me = { name: "Alex Morgan", email: "alex@example.com" } as never;
const review = { id: "rv1", draftId: "d1", kind: "expert", bookingId: "bk1", reviewer: { name: "Claire Booth" } } as unknown as ReviewRequest;

describe("messaging an expert reviewer (REVIEW-X5)", () => {
  beforeEach(() => {
    pushMock.mockReset();
    useBookingsStore.setState({
      bookings: [{ id: "bk1", consultantInitials: "CB", draftId: "d1", bookedAt: 1, expectedDeliveryAt: 2, status: "accepted", messages: [] }],
    });
  });

  it("keeps the message when the thread got it", async () => {
    pushMock.mockResolvedValue(true);
    await expect(messageTheReviewer(review, "Thanks, that's right.", me)).resolves.toBe(true);
    expect(useBookingsStore.getState().bookings[0].messages?.map((m) => m.text)).toEqual(["Thanks, that's right."]);
  });

  it("takes the bubble back when it didn't send, so nothing shows as sent that wasn't", async () => {
    pushMock.mockResolvedValue(false);
    await expect(messageTheReviewer(review, "Thanks, that's right.", me)).resolves.toBe(false);
    expect(useBookingsStore.getState().bookings[0].messages).toEqual([]);
  });
});
