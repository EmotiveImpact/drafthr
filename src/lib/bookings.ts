import { create } from "zustand";

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
  /** Server-side consultant profile id (UUID). The stable key for
   *  matching a booking to a marketplace consultant card — initials are
   *  neither unique nor stable, so display/lookup uses this when present.
   *  Absent only for local-only demo bookings against seed consultants. */
  consultantProfileId?: string;
  /** Optional — set when an HR user books from inside a draft. After a server
   *  sync this holds the server's UUID (the draft_id column is a uuid). */
  draftId: string;
  /** The ORIGINAL local, human-readable draft id (e.g. "draft_x7k2…") used to
   *  open the draft in the editor. `draftId` is hashed to a one-way UUID for
   *  the server, so without this the HR "Open draft" link breaks after sync
   *  (the editor store is keyed by readable ids). Preserved across hydrates. */
  localDraftId?: string;
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
  /** Matter-scoped share token issued by the server on accept. Used by
   *  the consultant to open the specific draft they were booked to
   *  review without needing membership in the HR tenant. */
  shareToken?: string;
  /** Token expiry in ms. */
  shareTokenExpiresAt?: number;
  /** Consultant display fields, populated from the server join on the
   *  HR-side list so the booking row can render the consultant's name /
   *  photo without matching a UUID back to a locally-cached card. */
  consultantName?: string;
  consultantRole?: string;
  consultantPhotoUrl?: string;
  consultantCurrency?: "£" | "$" | "€";
  consultantPrice?: number;
};

type Store = {
  /** Requester's bookings in the active workspace, as returned by the API. */
  bookings: Booking[];
  /** Consultant's inbox is a separate read model, never mixed into HR's list. */
  inbox: Booking[];
  inboxState: "idle" | "loading" | "ready" | "error";
  bookingsForDraft: (draftId: string) => Booking[];
  /** Initials are display-only; only the stable server profile ID matches. */
  bookingsForConsultant: (initials: string, profileId?: string) => Booking[];
  reset: () => void;
};

/** Memory cache only. The transport is the sole writer of accepted records;
 * UI commands never manufacture local bookings or delivered messages. */
export const useBookingsStore = create<Store>((set, get) => ({
  bookings: [],
  inbox: [],
  inboxState: "idle",
  bookingsForDraft: (draftId) => get().bookings.filter((b) => b.draftId === draftId || b.localDraftId === draftId),
  bookingsForConsultant: (_initials, profileId) => get().inbox
    .filter((b) => Boolean(profileId) && b.consultantProfileId === profileId)
    .sort((a, b) => b.bookedAt - a.bookedAt),
  reset: () => set({ bookings: [], inbox: [], inboxState: "idle" }),
}));

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
