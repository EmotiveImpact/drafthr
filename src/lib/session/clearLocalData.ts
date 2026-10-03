import { LEGACY_MARKETPLACE_KEYS, quarantineLegacyMarketplaceData } from "../marketplace-scope";

/**
 * Remove active tenant-scoped caches from localStorage.
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
 * wipe the active local cache at both trust-boundary transitions. The sole
 * migration exception is old marketplace data that was never confirmed by
 * the server: retain an inactive owner-unknown recovery copy, never hydrate it.
 * Quarantine is not encryption or protection from someone inspecting browser
 * storage; an owner must reconcile/remove that legacy data before kiosk use.
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
 * state is torn down by the reload; inactive marketplace quarantine is never
 * loaded by the next user's session and is not treated as a saved record.
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
  // The former marketplace stores may contain requests never accepted by the
  // server. Keep a verified, inactive recovery copy before clearing their old
  // keys. Their owner is unknown, so nothing automatically imports or shows it.
  quarantineLegacyMarketplaceData();
  const keys = opts?.keepProfile
    ? TENANT_SCOPED_PERSIST_KEYS.filter((k) => k !== "scribehr-profile-v1")
    : TENANT_SCOPED_PERSIST_KEYS;
  for (const key of keys) {
    // Quarantine failure must not turn logout into silent data loss. These
    // keys are no longer read by either marketplace store.
    if ((LEGACY_MARKETPLACE_KEYS as readonly string[]).includes(key)) continue;
    try {
      window.localStorage.removeItem(key);
    } catch {
      /* storage disabled / private mode — nothing to clear */
    }
  }
  // Database-first draft metadata is per-tenant. It contains revisions,
  // hashes and pending-delete ids; after a confirmed flush it must not leak
  // the previous workspace's record inventory on a shared browser.
  let itemCount = 0;
  try { itemCount = window.localStorage.length; } catch { return; }
  for (let i = itemCount - 1; i >= 0; i--) {
    try {
      const key = window.localStorage.key(i);
      if (key?.startsWith("drafthr.db-draft-baselines.v1:") ||
          key?.startsWith("drafthr.db-draft-deletes.v1:")) {
        window.localStorage.removeItem(key);
      }
    } catch {
      break;
    }
  }
}
