import { create } from "zustand";
import { persist } from "zustand/middleware";

/**
 * Consultant profile store — used by the consultant signup flow,
 * the /c home dashboard, the /c/profile setup form, and (read-only)
 * by the public /consultants marketplace, which merges this profile
 * (if present) with the hardcoded CONSULTANTS list.
 *
 * Persisted to localStorage under "drafthr.consultant" so the data
 * survives reloads. When the real backend lands this hook keeps the
 * same shape — only the persistence target changes.
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
  /** Optional uploaded photo URL (data:image/* base64 for now). */
  photoUrl: string;
  /** Current availability window. Defaults to 'this_week' for new sign-ups. */
  availability: Availability;
  /** Stripe Connect payout details, if onboarded. */
  payout: PayoutAccount;
  /** When the profile was last saved — used to surface "complete your profile"
   *  empty states on first sign-in. */
  updatedAt: number | null;
};

type ConsultantStore = {
  profile: ConsultantProfile | null;
  /** Has the user signed up as a consultant (even before completing profile)? */
  enrolled: boolean;
  enrol: () => void;
  saveProfile: (patch: Partial<Omit<ConsultantProfile, "id" | "updatedAt">>) => void;
  reset: () => void;
};

const newId = () =>
  `c_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;

const computeInitials = (name: string) => {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "??";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
};

export const useConsultantStore = create<ConsultantStore>()(
  persist(
    (set, get) => ({
      profile: null,
      enrolled: false,

      enrol: () => set({ enrolled: true }),

      saveProfile: (patch) => {
        const existing = get().profile;
        const merged: ConsultantProfile = {
          // Defaults for a freshly-enrolled user — overwritten by patch.
          id: existing?.id ?? newId(),
          initials: existing?.initials ?? "??",
          fullName: existing?.fullName ?? "",
          role: existing?.role ?? "",
          bio: existing?.bio ?? "",
          specialty: existing?.specialty ?? "",
          specialties: existing?.specialties ?? [],
          price: existing?.price ?? 150,
          currency: existing?.currency ?? "£",
          sla: existing?.sla ?? "24-48h",
          rating: existing?.rating ?? 5.0,
          reviews: existing?.reviews ?? 0,
          avatarFrom: existing?.avatarFrom ?? "#f3dca5",
          avatarTo: existing?.avatarTo ?? "#e9b75c",
          photoUrl: existing?.photoUrl ?? "",
          availability: existing?.availability ?? "this_week",
          payout: existing?.payout ?? { stripeAccountId: null, payoutsEnabled: false },
          ...patch,
          updatedAt: Date.now(),
        };
        // Always derive initials from the saved fullName so the two stay in
        // sync — prevents the marketplace card from showing stale initials.
        if (patch.fullName) merged.initials = computeInitials(patch.fullName);
        set({ profile: merged, enrolled: true });
      },

      reset: () => set({ profile: null, enrolled: false }),
    }),
    {
      name: "drafthr.consultant",
      version: 1,
    },
  ),
);

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
