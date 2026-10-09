/**
 * Wipe all tenant-scoped client state from localStorage.
 *
 * Called on sign-out so a shared / kiosk browser never carries one tenant's
 * drafts, matters, employees, profile, consultant card, or bookings into the
 * next user's session. A workspace switch no longer wipes: the same user's
 * data for each workspace is stashed under a per-user, per-workspace
 * namespace and restored on switching back (switchLocalWorkspace), because
 * much of it (employees, tasks, events, templates, evidence, and every draft
 * when dual-write is off) exists only on this device.
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

import { flushPendingWrites, setPersistenceSuspended } from "../storage/quota-safe-storage";

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
 * on-disk copy is gone before the next user's session initialises. Throttled
 * writes still waiting are dropped and further writes are suspended until
 * that reload, so neither can put the data back.
 *
 * `keepProfile` keeps the user's profile (the employer/employee mode choice +
 * credits) for callers that wipe on behalf of the same user (board JA-03).
 * `includeStashes` also removes other workspaces' data kept on this device
 * (see switchLocalWorkspace): a full sign-out on a shared device.
 *
 * Callers that may destroy unsynced data warn first (see localDataGuard).
 */
export function clearTenantScopedLocalData(opts?: { keepProfile?: boolean; includeStashes?: boolean }): void {
  if (typeof window === "undefined") return;
  setPersistenceSuspended(true);
  const keys = opts?.keepProfile
    ? TENANT_SCOPED_PERSIST_KEYS.filter((k) => k !== "scribehr-profile-v1")
    : TENANT_SCOPED_PERSIST_KEYS;
  clearLiveKeys([...keys, ...TENANT_SCOPED_SYNC_KEYS]);
  if (!opts?.includeStashes) return;
  const ls = storage();
  if (!ls) return;
  try {
    const stashKeys: string[] = [];
    for (let i = 0; i < ls.length; i += 1) {
      const key = ls.key(i);
      if (key?.startsWith(STASH_PREFIX)) stashKeys.push(key);
    }
    clearLiveKeys([...stashKeys, LOCAL_OWNER_KEY]);
  } catch {
    /* storage unavailable */
  }
}

/** Sync bookkeeping that belongs to the active workspace's data (sync-meta
 *  and the dual-write pending-delete list). Cleared and stashed with it. */
export const TENANT_SCOPED_SYNC_KEYS = [
  "drafthr.sync-meta.v1",
  "drafthr.deleted-draft-uuids.v1",
] as const;

/** Keys moved aside (not deleted) when the same user switches workspace. */
const NAMESPACED_KEYS = [
  ...TENANT_SCOPED_PERSIST_KEYS.filter((k) => k !== "scribehr-profile-v1"),
  ...TENANT_SCOPED_SYNC_KEYS,
] as const;

const STASH_PREFIX = "drafthr.stash.v1:";
/** Which user + workspace the live (un-namespaced) keys belong to. */
export const LOCAL_OWNER_KEY = "drafthr.local-owner.v1";
/** Written on a swap so other open tabs reload instead of re-persisting the
 *  previous workspace's in-memory state over the swapped-in data. */
export const WORKSPACE_SWAP_KEY = "drafthr.workspace-swap.v1";

/** The namespace for one user's data in one workspace. */
export function localNamespace(userId: string, tenantId: string): string {
  return `${userId}:${tenantId}`;
}

function stashKey(ns: string, key: string): string {
  return `${STASH_PREFIX}${ns}:${key}`;
}

function storage(): Storage | null {
  try {
    return typeof window === "undefined" ? null : window.localStorage;
  } catch {
    return null;
  }
}

/** The namespace the live keys belong to, or null when unrecorded. */
export function readLocalOwner(): string | null {
  try {
    return storage()?.getItem(LOCAL_OWNER_KEY) ?? null;
  } catch {
    return null;
  }
}

function writeLocalOwner(ns: string): void {
  try {
    storage()?.setItem(LOCAL_OWNER_KEY, ns);
  } catch {
    /* best effort: an unrecorded owner is adopted on next load */
  }
}

/**
 * Move the live workspace data aside under `ns`. Values are moved one at a
 * time (remove, then write the stash) so a nearly full quota still has room.
 * If a write fails everything moved so far is put back and false is
 * returned: nothing is lost, but the caller must not treat the data as safe.
 */
export function stashLiveData(ns: string): boolean {
  const ls = storage();
  if (!ls) return false;
  flushPendingWrites();
  const moved: [string, string][] = [];
  try {
    for (const key of NAMESPACED_KEYS) {
      const value = ls.getItem(key);
      if (value === null) continue;
      ls.removeItem(key);
      moved.push([key, value]);
      ls.setItem(stashKey(ns, key), value);
    }
    return true;
  } catch {
    for (const [key, value] of moved) {
      try {
        ls.removeItem(stashKey(ns, key));
        ls.setItem(key, value);
      } catch {
        /* nothing more we can do; the caller warns before discarding */
      }
    }
    return false;
  }
}

/** Move a stashed workspace's data back into the live keys. */
export function restoreStashedData(ns: string): void {
  const ls = storage();
  if (!ls) return;
  for (const key of NAMESPACED_KEYS) {
    try {
      const value = ls.getItem(stashKey(ns, key));
      if (value === null) {
        ls.removeItem(key);
        continue;
      }
      ls.removeItem(stashKey(ns, key));
      ls.setItem(key, value);
    } catch {
      /* leave the stash in place; it is retried on the next switch back */
    }
  }
}

/** Namespaces with stashed data on this device, other than `exceptNs`. */
export function stashedNamespaces(exceptNs?: string | null): string[] {
  const ls = storage();
  if (!ls) return [];
  const out = new Set<string>();
  try {
    for (let i = 0; i < ls.length; i += 1) {
      const key = ls.key(i);
      if (!key?.startsWith(STASH_PREFIX)) continue;
      // <prefix><userId>:<tenantId>:<key>; none of the parts contain ":".
      const [userId, tenantId] = key.slice(STASH_PREFIX.length).split(":");
      const ns = localNamespace(userId, tenantId);
      if (ns !== exceptNs) out.add(ns);
    }
  } catch {
    /* storage unavailable */
  }
  return [...out];
}

/**
 * Swap this device's live workspace data from one namespace to another:
 * stash the current workspace's data, restore the target's (if any), and
 * record the new owner. Returns false, changing nothing, when the current
 * data could not be stashed (storage full); the caller then warns before
 * discarding it.
 */
export function switchLocalWorkspace(fromNs: string | null, toNs: string): boolean {
  if (fromNs === toNs) return true;
  if (fromNs && !stashLiveData(fromNs)) return false;
  if (!fromNs) clearLiveKeys(NAMESPACED_KEYS);
  restoreStashedData(toNs);
  writeLocalOwner(toNs);
  // This tab's memory still holds the previous workspace until it reloads.
  setPersistenceSuspended(true);
  try {
    storage()?.setItem(WORKSPACE_SWAP_KEY, String(Date.now()));
  } catch {
    /* other tabs then reload on their next session check instead */
  }
  return true;
}

/**
 * Make sure the live data belongs to the signed-in user and workspace. Run
 * once auth has loaded: if the data on this device was left by another
 * workspace (or another user who didn't sign out), it is stashed under its
 * owner rather than shown here or deleted, and this workspace's own stash is
 * restored. Returns true when a reload is needed to pick up the swapped data.
 */
export function reconcileLocalDataOwner(userId: string, tenantId: string): boolean {
  const ns = localNamespace(userId, tenantId);
  const owner = readLocalOwner();
  if (owner === ns) return false;
  if (owner === null) {
    // Data from before ownership was recorded belongs to whoever is here now.
    writeLocalOwner(ns);
    return false;
  }
  if (!switchLocalWorkspace(owner, ns)) {
    // Couldn't stash (storage full). Keep the data where it is rather than
    // lose it; the next successful switch or sign-out deals with it.
    return false;
  }
  return true;
}

function clearLiveKeys(keys: readonly string[]): void {
  const ls = storage();
  if (!ls) return;
  for (const key of keys) {
    try {
      ls.removeItem(key);
    } catch {
      /* storage disabled / private mode — nothing to clear */
    }
  }
}
