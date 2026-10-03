import { create } from "zustand";

/**
 * Consultant profile store — used by the consultant signup flow,
 * the /c home dashboard, the /c/profile setup form, and (read-only)
 * by the marketplace. This is a memory cache of accepted server data;
 * form edits stay in the form until the API confirms the save. Legacy
 * localStorage is deliberately never hydrated into an authenticated account.
 */

/** How quickly a consultant can take on new work. Drives the
 *  "Available now" / "Booked" badge in the marketplace card. */
export type Availability = "this_week" | "one_two_weeks" | "three_four_weeks" | "booked";

/** Optional Stripe Connect payout details. Stored as the account id
 *  returned by Stripe; the API resolves balance + payout schedule. */
export type PayoutAccount = {
  /** Stripe Connect account id (acct_…). null until Connect onboarding. */
  stripeAccountId: string | null;
  /** True once the account is fully verified and can receive payouts. */
  payoutsEnabled: boolean;
};

export type ConsultantProfile = {
  /** Stable id, generated on first save. Used as the marketplace card key. */
  id: string;
  initials: string;
  fullName: string;
  /** Short title — e.g. "Solicitor · 12 yrs · ex-DLA Piper". */
  role: string;
  bio: string;
  /** Quote shown in the specialty box of the marketplace card. */
  specialty: string;
  /** Filter-chip tags. */
  specialties: string[];
  /** Hourly rate, integer. */
  price: number;
  /** Currency symbol — "£", "$", "€". */
  currency: "£" | "$" | "€";
  /** Service-level — e.g. "24-48h". */
  sla: string;
  /** Self-reported rating until reviews land. Range 0-5, one decimal. */
  rating: number;
  /** Inbound review count — 0 for new sign-ups. */
  reviews: number;
  /** Two avatar-gradient hex values, used by the canvas card. */
  avatarFrom: string;
  avatarTo: string;
  /** Optional photo URL, accepted and stored by the profile API. */
  photoUrl: string;
  /** Current availability window. Defaults to 'this_week' for new sign-ups. */
  availability: Availability;
  /** Stripe Connect payout details, if onboarded. */
  payout: PayoutAccount;
  /** When the profile was last saved — used to surface "complete your profile"
   *  empty states on first sign-in. */
  updatedAt: number | null;
  /** Server-side moderation status. Only "published" profiles appear in the
   *  marketplace; new sign-ups are "pending_review" until an admin vets them.
   *  Undefined until the server profile has been pulled. Surfaced as an honest
   *  banner on the consultant home (don't claim "discoverable" while pending). */
  status?: "pending_review" | "published" | "paused" | "rejected" | "suspended";
};

type ConsultantStore = {
  profile: ConsultantProfile | null;
  /** Has the user signed up as a consultant (even before completing profile)? */
  enrolled: boolean;
  /** Last server request result; failures never mean the edit was saved. */
  lastSync: {
    at: number | null;
    state: "idle" | "pending" | "ok" | "error";
    error: string | null;
  };
  enrol: () => void;
  /** Replace the cache, including an authoritative empty result. */
  hydrateFromServer: (server: ConsultantProfile | null) => void;
  setSync: (state: ConsultantStore["lastSync"]["state"], error?: string | null) => void;
  reset: () => void;
};

export const useConsultantStore = create<ConsultantStore>((set, get) => ({
  profile: null,
  enrolled: false,
  lastSync: { at: null, state: "idle", error: null },
  enrol: () => set({ enrolled: true }),
  hydrateFromServer: (server) => set({
    profile: server,
    enrolled: server !== null || get().enrolled,
    lastSync: { at: Date.now(), state: "ok", error: null },
  }),
  setSync: (state, error = null) => set({
    lastSync: { at: state === "ok" ? Date.now() : get().lastSync.at, state, error },
  }),
  reset: () => set({ profile: null, enrolled: false, lastSync: { at: null, state: "idle", error: null } }),
}));

/** Convenience selector — true once the profile has all the marketplace
 *  card requires (name, role, ≥1 specialty, bio, rate). */
export function isProfileComplete(p: ConsultantProfile | null): boolean {
  if (!p) return false;
  return (
    p.fullName.trim().length > 0 &&
    p.role.trim().length > 0 &&
    p.bio.trim().length > 20 &&
    p.specialties.length > 0 &&
    p.price > 0
  );
}
