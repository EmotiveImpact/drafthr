/**
 * Wipe all tenant-scoped client state from localStorage.
 *
 * Called on sign-out AND on a successful workspace switch so a shared / kiosk
 * browser never carries one tenant's drafts, matters, employees, profile,
 * consultant card, or bookings into the next user's session.
 *
 * Security board finding SA-01 / SE-02 (2026-06-10): the zustand persist
 * middleware writes the full drafts/matters/employees maps — employee legal
 * names, matter facts, generated letter HTML, all PII — to localStorage under
 * `scribehr-store-v1`. Sign-out only nulled in-memory React state and
 * hard-navigated; workspace-switch just reloaded. Neither cleared the
 * persisted key, so on a shared machine the next user (or anyone who reopens
 * the app / devtools) read the previous tenant's PII straight out of
 * localStorage. Cross-tenant *writes* were already blocked server-side (403),
 * so this was a confidentiality leak, not escalation — but it's real, so we
 * wipe the local cache at both trust-boundary transitions.
 *
 * Theme and the public branding-flag cache are intentionally PRESERVED — they
 * hold no tenant data, and resetting a user's theme on every logout would be a
 * worse experience for no security gain.
 */

/** localStorage keys that hold tenant-scoped data and must be wiped on
 *  sign-out / workspace switch. Keep in sync with each store's persist `name`. */
export const TENANT_SCOPED_PERSIST_KEYS = [
  "scribehr-store-v1", // useDraftStore — drafts / matters / employees (PII)
  "scribehr-profile-v1", // useProfileStore — user profile (legal name, role)
  "drafthr.consultant", // useConsultantStore — consultant marketplace card
  "drafthr.bookings.v1", // useBookingsStore — marketplace bookings + matter titles
] as const;

/**
 * Remove every tenant-scoped persisted store from localStorage. Pure and
 * idempotent: safe to call when no session exists, in SSR (no-ops without
 * `window`), and in private-mode where storage access throws.
 *
 * Callers hard-navigate immediately afterwards, so the in-memory zustand
 * state is torn down by the reload; this function only has to guarantee the
 * on-disk copy is gone before the next user's session initialises.
 *
 * `keepProfile` is set on a WORKSPACE SWITCH (board JA-03): a switch is the
 * SAME user moving between their own tenants, so their profile (the
 * employer/employee mode choice + credits) must survive — otherwise
 * RootRedirect sees a null role and forces them back through the role picker
 * on every switch. On SIGN-OUT we wipe everything (a different person may use
 * the browser next), so callers there pass nothing.
 */
export function clearTenantScopedLocalData(opts?: { keepProfile?: boolean }): void {
  if (typeof window === "undefined") return;
  const keys = opts?.keepProfile
    ? TENANT_SCOPED_PERSIST_KEYS.filter((k) => k !== "scribehr-profile-v1")
    : TENANT_SCOPED_PERSIST_KEYS;
  for (const key of keys) {
    try {
      window.localStorage.removeItem(key);
    } catch {
      /* storage disabled / private mode — nothing to clear */
    }
  }
}
