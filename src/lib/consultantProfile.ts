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
  /** Last server sync result — used to surface a quiet status on the UI
   *  (e.g. small "Saved" / "Saved locally only" indicator). */
  lastSync: {
    at: number | null;
    /** 'ok' = synced, 'local' = saved locally but server didn't accept,
     *  'pending' = mid-flight. */
    state: "idle" | "pending" | "ok" | "local";
    error: string | null;
  };
  enrol: () => void;
  saveProfile: (patch: Partial<Omit<ConsultantProfile, "id" | "updatedAt">>) => void;
  /** Replace the local profile with the server's canonical version. */
  hydrateFromServer: (server: ConsultantProfile) => void;
  setSync: (state: ConsultantStore["lastSync"]["state"], error?: string | null) => void;
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
      lastSync: { at: null, state: "idle", error: null },

      enrol: () => set({ enrolled: true }),

      hydrateFromServer: (server) =>
        set({
          profile: server,
          enrolled: true,
          lastSync: { at: Date.now(), state: "ok", error: null },
        }),

      setSync: (state, error = null) =>
        set({
          lastSync: { at: state === "ok" ? Date.now() : get().lastSync.at, state, error },
        }),

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
        // Use `!== undefined` (not truthiness) so clearing the name to "" also
        // resets the initials instead of leaving the old ones stranded.
        if (patch.fullName !== undefined)
          merged.initials = computeInitials(merged.fullName);
        set({ profile: merged, enrolled: true });
      },

      reset: () => set({ profile: null, enrolled: false }),
    }),
    {
      name: "drafthr.consultant",
      // v2: the persisted profile shape gained `specialties`, `availability`,
      // and `payout` after v1 shipped. A v1 blob hydrates those as undefined,
      // and the first read of `profile.specialties.length` (isProfileComplete,
      // ConsultantHome, MyBookings) throws → white screen. Backfill on migrate.
      version: 2,
      migrate: (persisted, fromVersion) => {
        const state = persisted as Partial<ConsultantStore> | undefined;
        if (!state) return state as unknown as ConsultantStore;
        if (fromVersion < 2 && state.profile) {
          const p = state.profile as Partial<ConsultantProfile>;
          state.profile = {
            specialties: [],
            availability: "this_week",
            payout: { stripeAccountId: null, payoutsEnabled: false },
            specialty: "",
            avatarFrom: "#f3dca5",
            avatarTo: "#e9b75c",
            photoUrl: "",
            rating: 5.0,
            reviews: 0,
            ...p,
          } as ConsultantProfile;
        }
        return state as unknown as ConsultantStore;
      },
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
