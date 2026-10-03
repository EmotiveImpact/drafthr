import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock the API client so we drive server responses without network.
const { respondMock } = vi.hoisted(() => ({ respondMock: vi.fn() }));
vi.mock("@/lib/consultantApi", () => ({
  respondToBooking: respondMock,
  // The other named imports must exist for the module to load. getInbox /
  // listMyBookings return a well-formed !ok envelope because the B9 error
  // path now re-pulls both on a failed respond.
  getConsultantProfile: vi.fn(),
  saveConsultantProfile: vi.fn(),
  createBooking: vi.fn(),
  getInbox: vi.fn(async () => ({ ok: false, error: "x", status: 500 })),
  listMyBookings: vi.fn(async () => ({ ok: false, error: "x", status: 500 })),
  sendBookingMessage: vi.fn(),
}));
vi.mock("sonner", () => ({ toast: { error: vi.fn(), success: vi.fn() } }));

import { pushBookingRespond } from "@/lib/marketplaceSync";
import { useBookingsStore, type Booking } from "@/lib/bookings";
import { setMarketplaceScope } from "@/lib/marketplace-scope";

beforeEach(() => {
  setMarketplaceScope(null, null);
  setMarketplaceScope("user_1", "tenant_1");
});

function seedBooking(overrides: Partial<Booking> = {}): Booking {
  return {
    id: "bk_1",
    consultantInitials: "JS",
    consultantProfileId: "prof_1",
    draftId: "",
    bookedAt: 1_000,
    expectedDeliveryAt: 2_000,
    status: "delivered",
    messages: [],
    // Display fields populated by the HR-side list join:
    consultantName: "Jane Smith",
    consultantRole: "Employment Solicitor",
    consultantPhotoUrl: "https://cdn.example.com/jane.jpg",
    consultantCurrency: "£",
    consultantPrice: 150,
    ...overrides,
  };
}

describe("pushBookingRespond — preserves consultant display fields", () => {
  beforeEach(() => {
    respondMock.mockReset();
    useBookingsStore.setState({ bookings: [seedBooking()] });
  });

  it("keeps name/photo/price/role when the respond DTO omits them (complete + rate)", async () => {
    // The respond endpoint's toClient does NOT carry the join-only consultant
    // fields — it returns the bare booking row.
    respondMock.mockResolvedValue({
      ok: true,
      data: {
        booking: {
          id: "bk_1",
          consultantProfileId: "prof_1",
          draftId: null,
          status: "completed",
          rating: 5,
          completedAt: 3_000,
          bookedAt: 1_000,
          expectedDeliveryAt: 2_000,
          messages: [],
          // consultantName / consultantPhotoUrl / consultantPrice ABSENT
        },
      },
    });

    await pushBookingRespond("bk_1", "complete", { rating: 5 });

    const row = useBookingsStore.getState().bookings.find((b) => b.id === "bk_1")!;
    expect(row.status).toBe("completed");
    expect(row.rating).toBe(5);
    // The regression: these must NOT be wiped to undefined.
    expect(row.consultantName).toBe("Jane Smith");
    expect(row.consultantRole).toBe("Employment Solicitor");
    expect(row.consultantPhotoUrl).toBe("https://cdn.example.com/jane.jpg");
    expect(row.consultantCurrency).toBe("£");
    expect(row.consultantPrice).toBe(150);
    expect(row.consultantInitials).toBe("JS");
  });

  it("prefers fresh DTO values over the prior row when the server DOES send them", async () => {
    respondMock.mockResolvedValue({
      ok: true,
      data: {
        booking: {
          id: "bk_1",
          consultantProfileId: "prof_1",
          draftId: null,
          status: "accepted",
          bookedAt: 1_000,
          expectedDeliveryAt: 2_000,
          messages: [],
          consultantName: "Janet Smithson",
          consultantPrice: 200,
          consultantCurrency: "USD", // ISO code on the wire → mapped to "$"
        },
      },
    });

    await pushBookingRespond("bk_1", "accept");

    const row = useBookingsStore.getState().bookings.find((b) => b.id === "bk_1")!;
    expect(row.consultantName).toBe("Janet Smithson");
    expect(row.consultantPrice).toBe(200);
    expect(row.consultantCurrency).toBe("$");
    // Field the DTO still omitted falls back to prior:
    expect(row.consultantRole).toBe("Employment Solicitor");
  });

  it("preserves the prior expectedDeliveryAt when the respond DTO omits it (no SLA reset)", async () => {
    // Real respond DTOs do NOT carry expectedDeliveryAt — only the list-join
    // does. The fallback must keep the prior deadline (2_000), not fabricate a
    // fresh "now + 24h" that would make an overdue booking look on-time.
    respondMock.mockResolvedValue({
      ok: true,
      data: {
        booking: {
          id: "bk_1",
          consultantProfileId: "prof_1",
          draftId: null,
          status: "accepted",
          acceptedAt: 3_000,
          bookedAt: 1_000,
          messages: [],
          // expectedDeliveryAt ABSENT
        },
      },
    });

    await pushBookingRespond("bk_1", "accept");

    const row = useBookingsStore.getState().bookings.find((b) => b.id === "bk_1")!;
    expect(row.status).toBe("accepted");
    expect(row.expectedDeliveryAt).toBe(2_000);
  });

  it("soft-fails (leaves the row untouched) when the server errors", async () => {
    respondMock.mockResolvedValue({ ok: false, error: "boom", status: 500 });
    await pushBookingRespond("bk_1", "complete", { rating: 4 });
    const row = useBookingsStore.getState().bookings.find((b) => b.id === "bk_1")!;
    expect(row.status).toBe("delivered"); // unchanged
    expect(row.consultantName).toBe("Jane Smith");
  });
});

describe("pushBookingRespond — return value signals success (round 19)", () => {
  beforeEach(() => {
    respondMock.mockReset();
    useBookingsStore.setState({ bookings: [seedBooking()] });
  });

  it("returns true on an ok response", async () => {
    respondMock.mockResolvedValue({
      ok: true,
      data: {
        booking: {
          id: "bk_1",
          consultantProfileId: "prof_1",
          draftId: null,
          status: "completed",
          rating: 5,
          bookedAt: 1_000,
          expectedDeliveryAt: 2_000,
          messages: [],
        },
      },
    });
    await expect(pushBookingRespond("bk_1", "complete", { rating: 5 })).resolves.toBe(true);
  });

  it("returns false on a not-ok response so the caller can roll back optimistic UI", async () => {
    respondMock.mockResolvedValue({ ok: false, error: "boom", status: 500 });
    await expect(pushBookingRespond("bk_1", "complete", { rating: 5 })).resolves.toBe(false);
  });
});
