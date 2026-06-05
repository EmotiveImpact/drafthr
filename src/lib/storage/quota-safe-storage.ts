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

/**
 * Build a quota-safe StateStorage over a backing Storage (window.localStorage
 * in prod). `onQuotaError` is injected so the toast dependency stays out of
 * this module's unit tests.
 */
export function createQuotaSafeStorage(
  backing: Pick<Storage, "getItem" | "setItem" | "removeItem">,
  onQuotaError: () => void,
): StateStorage {
  return {
    getItem: (name) => backing.getItem(name),
    removeItem: (name) => backing.removeItem(name),
    setItem: (name, value) => {
      const trimmed = stripPersistedImages(value);
      try {
        backing.setItem(name, trimmed);
      } catch (err) {
        if (isQuotaError(err)) {
          if (!quotaToastShown) {
            quotaToastShown = true;
            onQuotaError();
          }
          // Best effort: don't rethrow — the in-memory store is intact, and a
          // throw here would also be swallowed by the persist middleware. The
          // toast is the actionable signal.
          return;
        }
        throw err;
      }
    },
  };
}
