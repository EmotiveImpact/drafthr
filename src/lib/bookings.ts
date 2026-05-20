import { create } from "zustand";
import { persist } from "zustand/middleware";

/**
 * Booking lifecycle states. Forward-only — once a booking lands in a
 * terminal state (`declined`, `delivered`, `completed`), it stays there.
 *
 *   requested  → consultant has not yet seen / responded
 *   accepted   → consultant accepted; work in progress
 *   declined   → consultant declined; HR can rebook
 *   delivered  → consultant has delivered the review / notes
 *   completed  → HR has acknowledged delivery (and ideally rated)
 *
 * The legacy "pending"/"in_review"/"completed" states map onto
 * requested/accepted/completed respectively — old bookings persisted
 * under those names migrate transparently in normaliseBooking().
 */
export type BookingStatus =
  | "requested"
  | "accepted"
  | "declined"
  | "delivered"
  | "completed";

export type BookingMessage = {
  id: string;
  /** 'requester' = HR booker, 'consultant' = the reviewing specialist. */
  from: "requester" | "consultant";
  text: string;
  ts: number;
};

export type Booking = {
  id: string;
  consultantInitials: string;
  /** Optional — set when an HR user books from inside a draft. */
  draftId: string;
  /** Optional human-friendly title — used by the consultant inbox card. */
  matterTitle?: string;
  /** Free-text request from HR — what they want reviewed and why. */
  message?: string;
  /** Consultant's response when accepting/declining — surfaced to HR. */
  responseNote?: string;
  /** Deliverable when consultant marks delivered — the review/notes. */
  deliveryNote?: string;
  /** 0-5 rating from HR after delivery. */
  rating?: number;
  bookedAt: number;
  /** When the consultant accepted (and SLA timer starts). */
  acceptedAt?: number;
  deliveredAt?: number;
  completedAt?: number;
  expectedDeliveryAt: number;
  status: BookingStatus;
  /** Per-booking chat thread — added 2026-05-20. Older records normalise
   *  to an empty array on read. */
  messages?: BookingMessage[];
};

type RecordBookingInput = Omit<
  Booking,
  "id" | "bookedAt" | "status" | "acceptedAt" | "deliveredAt" | "completedAt" | "responseNote" | "deliveryNote" | "rating"
>;

type Store = {
  bookings: Booking[];
  recordBooking: (input: RecordBookingInput) => Booking;
  bookingsForDraft: (draftId: string) => Booking[];
  /** Inbox view for a consultant — all bookings addressed to them. */
  bookingsForConsultant: (initials: string) => Booking[];
  acceptBooking: (id: string, responseNote?: string) => void;
  declineBooking: (id: string, responseNote?: string) => void;
  deliverBooking: (id: string, deliveryNote?: string) => void;
  completeBooking: (id: string, rating?: number) => void;
  /** Append a chat message to a booking. */
  appendMessage: (id: string, from: BookingMessage["from"], text: string) => void;
};

/** Migrate persisted bookings from older lifecycle vocab to the new one. */
function normaliseBooking(b: Booking): Booking {
  const legacyMap: Record<string, BookingStatus> = {
    pending: "requested",
    in_review: "accepted",
  };
  if (b.status in legacyMap) {
    return { ...b, status: legacyMap[b.status as string] };
  }
  return b;
}

export const useBookingsStore = create<Store>()(
  persist(
    (set, get) => ({
      bookings: [],
      recordBooking: (input) => {
        const booking: Booking = {
          id: crypto.randomUUID(),
          bookedAt: Date.now(),
          status: "requested",
          ...input,
        };
        set((state) => ({ bookings: [...state.bookings, booking] }));
        return booking;
      },
      bookingsForDraft: (draftId) =>
        get().bookings.map(normaliseBooking).filter((b) => b.draftId === draftId),
      bookingsForConsultant: (initials) =>
        get()
          .bookings.map(normaliseBooking)
          .filter((b) => b.consultantInitials === initials)
          .sort((a, b) => b.bookedAt - a.bookedAt),
      acceptBooking: (id, responseNote) =>
        set((state) => ({
          bookings: state.bookings.map((b) =>
            b.id === id
              ? { ...b, status: "accepted", acceptedAt: Date.now(), responseNote: responseNote ?? b.responseNote }
              : b,
          ),
        })),
      declineBooking: (id, responseNote) =>
        set((state) => ({
          bookings: state.bookings.map((b) =>
            b.id === id
              ? { ...b, status: "declined", responseNote: responseNote ?? b.responseNote }
              : b,
          ),
        })),
      deliverBooking: (id, deliveryNote) =>
        set((state) => ({
          bookings: state.bookings.map((b) =>
            b.id === id
              ? { ...b, status: "delivered", deliveredAt: Date.now(), deliveryNote: deliveryNote ?? b.deliveryNote }
              : b,
          ),
        })),
      completeBooking: (id, rating) =>
        set((state) => ({
          bookings: state.bookings.map((b) =>
            b.id === id
              ? { ...b, status: "completed", completedAt: Date.now(), rating: rating ?? b.rating }
              : b,
          ),
        })),
      appendMessage: (id, from, text) => {
        const trimmed = text.trim();
        if (!trimmed) return;
        const msg: BookingMessage = {
          id: crypto.randomUUID(),
          from,
          text: trimmed.slice(0, 4000),
          ts: Date.now(),
        };
        set((state) => ({
          bookings: state.bookings.map((b) =>
            b.id === id ? { ...b, messages: [...(b.messages ?? []), msg] } : b,
          ),
        }));
      },
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
