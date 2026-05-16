import { create } from "zustand";
import { persist } from "zustand/middleware";

export type Booking = {
  id: string;
  consultantInitials: string;
  draftId: string;
  bookedAt: number;
  expectedDeliveryAt: number;
  status: "pending" | "in_review" | "completed";
};

type Store = {
  bookings: Booking[];
  recordBooking: (input: Omit<Booking, "id" | "bookedAt" | "status">) => Booking;
  bookingsForDraft: (draftId: string) => Booking[];
};

export const useBookingsStore = create<Store>()(
  persist(
    (set, get) => ({
      bookings: [],
      recordBooking: (input) => {
        const booking: Booking = {
          id: crypto.randomUUID(),
          bookedAt: Date.now(),
          status: "pending",
          ...input,
        };
        set((state) => ({ bookings: [...state.bookings, booking] }));
        return booking;
      },
      bookingsForDraft: (draftId) =>
        get().bookings.filter((b) => b.draftId === draftId),
    }),
    { name: "drafthr.bookings.v1" },
  ),
);

/** Parse SLA string like "18h", "26h", "24-48h" → hours (takes low end of range). */
export function parseSlaHours(sla: string): number {
  // Handle ranges like "24-48h" — take the low end
  const rangeMatch = sla.match(/^(\d+)-\d+h$/);
  if (rangeMatch) return parseInt(rangeMatch[1], 10);
  const singleMatch = sla.match(/^(\d+)h$/);
  if (singleMatch) return parseInt(singleMatch[1], 10);
  return 24; // fallback
}

export function slaMs(sla: string): number {
  return parseSlaHours(sla) * 60 * 60 * 1000;
}
