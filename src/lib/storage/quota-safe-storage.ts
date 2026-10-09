/**
 * Quota-safe persistence for the draft store.
 *
 * Two problems this solves:
 *
 * 1. Bloat — letterhead/signature images are stored TWICE on each draft: the
 *    raw base64 data URL inside `answers` (wizard echo) AND the validated copy
 *    on `employer` (the render source of truth — every export/preview reads
 *    `draft.employer.*DataUrl`, never `answers.*`). The `answers` copy is dead
 *    weight for rendering. A couple of large embedded images push the whole
 *    store past the 5–10 MB localStorage quota.
 *
 * 2. Silent failure — when `setItem` exceeds quota it THROWS, and zustand's
 *    persist middleware swallows it. The store then silently stops persisting:
 *    the user keeps working, sees everything in memory, and loses every draft
 *    on the next refresh with no warning.
 *
 * Fix: a `StateStorage` wrapper that (a) strips `answers.letterheadDataUrl` /
 * `answers.signatureDataUrl` from the JSON *before* writing — the employer
 * copy is untouched and still drives rendering — and (b) surfaces ONE toast
 * if a write still overflows, so the user can act (remove a large image,
 * export) instead of silently losing data.
 */
import type { StateStorage } from "zustand/middleware";

const IMAGE_KEYS = ["letterheadDataUrl", "signatureDataUrl"] as const;

let quotaToastShown = false;

/** Reset module state — tests only. */
export function _resetQuotaToast(): void {
  quotaToastShown = false;
  health = { nearQuota: false, full: false, usedBytes: 0 };
}

/**
 * Remove the raw image data URLs from every draft's `answers` blob in a
 * persisted zustand JSON string. Operates on the serialized
 * `{ state, version }` envelope. Returns the original string unchanged if the
 * shape isn't what we expect (fail-safe: never lose data by over-trimming).
 */
export function stripPersistedImages(json: string): string {
  let parsed: unknown;
  try {
    parsed = JSON.parse(json);
  } catch {
    return json;
  }
  if (!parsed || typeof parsed !== "object") return json;
  const env = parsed as { state?: { drafts?: Record<string, unknown> } };
  const drafts = env.state?.drafts;
  if (!drafts || typeof drafts !== "object") return json;

  let changed = false;
  for (const draft of Object.values(drafts)) {
    if (!draft || typeof draft !== "object") continue;
    const answers = (draft as { answers?: Record<string, unknown> }).answers;
    if (!answers || typeof answers !== "object") continue;
    for (const k of IMAGE_KEYS) {
      if (typeof answers[k] === "string" && (answers[k] as string).startsWith("data:")) {
        delete answers[k];
        changed = true;
      }
    }
  }
  return changed ? JSON.stringify(parsed) : json;
}

function isQuotaError(err: unknown): boolean {
  if (!(err instanceof DOMException)) return false;
  // Different browsers report quota overflow under different names/codes.
  return (
    err.name === "QuotaExceededError" ||
    err.name === "NS_ERROR_DOM_QUOTA_REACHED" ||
    err.code === 22 ||
    err.code === 1014
  );
}

/* ── Storage health (persistent quota banner) ──────────────────────────────
 * The one-off toast was easy to miss and never came back for the rest of the
 * page load. The banner reads this instead: `nearQuota` while usage is above
 * the threshold, `full` from a failed write until the next successful one. */

/** localStorage is typically capped at 5 MiB per origin (UTF-16, 2 bytes/char). */
export const ASSUMED_QUOTA_BYTES = 5 * 1024 * 1024;
export const NEAR_QUOTA_RATIO = 0.8;

export type StorageHealth = { nearQuota: boolean; full: boolean; usedBytes: number };

let health: StorageHealth = { nearQuota: false, full: false, usedBytes: 0 };
const healthListeners = new Set<() => void>();

export function getStorageHealth(): StorageHealth {
  return health;
}

export function subscribeStorageHealth(listener: () => void): () => void {
  healthListeners.add(listener);
  return () => healthListeners.delete(listener);
}

function setHealth(next: Partial<StorageHealth>): void {
  const merged = { ...health, ...next };
  if (merged.nearQuota === health.nearQuota && merged.full === health.full && merged.usedBytes === health.usedBytes) {
    return;
  }
  health = merged;
  for (const l of healthListeners) l();
}

/** Rough bytes used by an origin's localStorage (keys + values, UTF-16). */
export function estimateLocalStorageBytes(storage: Storage = window.localStorage): number {
  let chars = 0;
  for (let i = 0; i < storage.length; i += 1) {
    const key = storage.key(i);
    if (key === null) continue;
    chars += key.length + (storage.getItem(key)?.length ?? 0);
  }
  return chars * 2;
}

/* ── Pending (throttled) writes ─────────────────────────────────────────── */

type PendingWrite = { flush: () => void; cancel: () => void };
const pendingWrites = new Set<PendingWrite>();

/** Write every throttled value now (before a backup export, a stash, or the
 *  page going away). */
export function flushPendingWrites(): void {
  for (const p of [...pendingWrites]) p.flush();
}

/** Drop every throttled value without writing it (before a local wipe, so a
 *  trailing write can't put the data back). */
export function cancelPendingWrites(): void {
  for (const p of [...pendingWrites]) p.cancel();
}

/** True when this tab holds state the browser storage doesn't: a write is
 *  waiting on the throttle, or the last write failed on quota. */
export function hasUnpersistedWrites(): boolean {
  return pendingWrites.size > 0 || health.full;
}

if (typeof window !== "undefined") {
  // Don't lose the trailing write of a burst when the tab closes or hides.
  window.addEventListener("pagehide", flushPendingWrites);
  window.addEventListener("beforeunload", flushPendingWrites);
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden") flushPendingWrites();
  });
}

export type QuotaSafeStorageOptions = {
  /** Coalesce writes that land within this window of the previous one (the
   *  first write of a burst goes straight through). Streaming AI output
   *  changes the store on every token; without this each token re-serialised
   *  the whole store into localStorage. 0 writes every change immediately. */
  throttleMs?: number;
  /** Bytes in use after a successful write, for the near-quota banner. */
  estimateUsage?: () => number;
};

/**
 * Build a quota-safe StateStorage over a backing Storage (window.localStorage
 * in prod). `onQuotaError` is injected so the toast dependency stays out of
 * this module's unit tests.
 */
export function createQuotaSafeStorage(
  backing: Pick<Storage, "getItem" | "setItem" | "removeItem">,
  onQuotaError: () => void,
  options: QuotaSafeStorageOptions = {},
): StateStorage {
  const throttleMs = options.throttleMs ?? 0;
  let lastWriteAt = -Infinity;
  const queued = new Map<string, string>();
  let timer: ReturnType<typeof setTimeout> | null = null;

  const write = (name: string, value: string) => {
    lastWriteAt = Date.now();
    const trimmed = stripPersistedImages(value);
    try {
      backing.setItem(name, trimmed);
      const usedBytes = options.estimateUsage?.() ?? 0;
      setHealth({
        full: false,
        usedBytes,
        nearQuota: usedBytes > ASSUMED_QUOTA_BYTES * NEAR_QUOTA_RATIO,
      });
    } catch (err) {
      if (isQuotaError(err)) {
        setHealth({ full: true, nearQuota: true });
        if (!quotaToastShown) {
          quotaToastShown = true;
          onQuotaError();
        }
        // Best effort: don't rethrow — the in-memory store is intact, and a
        // throw here would also be swallowed by the persist middleware. The
        // banner and toast are the actionable signal.
        return;
      }
      throw err;
    }
  };

  const pending: PendingWrite = {
    flush: () => {
      if (timer) clearTimeout(timer);
      timer = null;
      pendingWrites.delete(pending);
      const entries = [...queued];
      queued.clear();
      for (const [name, value] of entries) {
        try {
          write(name, value);
        } catch (err) {
          console.error("[storage] deferred write failed", err);
        }
      }
    },
    cancel: () => {
      if (timer) clearTimeout(timer);
      timer = null;
      queued.clear();
      pendingWrites.delete(pending);
    },
  };

  return {
    getItem: (name) => backing.getItem(name),
    removeItem: (name) => {
      queued.delete(name);
      backing.removeItem(name);
    },
    setItem: (name, value) => {
      const sinceLast = Date.now() - lastWriteAt;
      if (throttleMs <= 0 || (sinceLast >= throttleMs && !timer)) {
        write(name, value);
        return;
      }
      queued.set(name, value);
      pendingWrites.add(pending);
      if (!timer) timer = setTimeout(pending.flush, Math.max(throttleMs - sinceLast, 0));
    },
  };
}
