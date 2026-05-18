/**
 * Onboarding tour persistence. Single-key localStorage flag — we don't need
 * a Zustand store because the only read is at mount-time (does the tour
 * render?) and there's no in-app surface that needs to react when it flips.
 *
 * Key versioned (v1) so a future redesigned tour can re-prompt existing users
 * by bumping to v2 without colliding with the old flag.
 */
export const ONBOARDING_TOUR_KEY = "drafthr.onboarding.tour.v1";

export function hasSeenTour(): boolean {
  if (typeof window === "undefined") return true;
  try {
    return window.localStorage.getItem(ONBOARDING_TOUR_KEY) === "1";
  } catch {
    // Private mode / quota exhaustion — fail closed so we don't loop the
    // tour on every nav.
    return true;
  }
}

export function markTourSeen(): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(ONBOARDING_TOUR_KEY, "1");
  } catch {
    // Best-effort; the tour will re-show next visit but that's acceptable
    // versus crashing.
  }
}

export function resetTour(): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(ONBOARDING_TOUR_KEY);
  } catch {
    /* noop */
  }
}
