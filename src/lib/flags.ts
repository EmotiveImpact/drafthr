/**
 * Runtime feature flags.
 *
 * Resolution order (first non-empty wins):
 *   1. localStorage key — per-browser dogfooding override
 *   2. Vite env var      — per-environment / per-branch default
 *   3. fallback          — safe off
 *
 * The localStorage path lets me flip a flag on in production without a
 * redeploy while we're still smoke-testing a new render path. The env
 * var path lets us turn it on for preview branches but off for prod
 * until it's ready.
 *
 * Read-once at call site — flags don't change inside a session and we
 * don't want hot updates to flip rendering mid-edit.
 */

export type FlagKey = "pixelPerfectEdit" | "trustedReviewLinks" | "emailLetters" | "priorityReviews";

const ENV_KEY: Record<FlagKey, string> = {
  pixelPerfectEdit: "VITE_FEATURE_PIXEL_PERFECT_EDIT",
  trustedReviewLinks: "VITE_FEATURE_TRUSTED_REVIEW_LINKS",
  emailLetters: "VITE_FEATURE_EMAIL_LETTERS",
  priorityReviews: "VITE_FEATURE_PRIORITY_REVIEWS",
};

const STORAGE_KEY: Record<FlagKey, string> = {
  pixelPerfectEdit: "drafthr.flag.pixel-perfect-edit",
  trustedReviewLinks: "drafthr.flag.trusted-review-links",
  emailLetters: "drafthr.flag.email-letters",
  priorityReviews: "drafthr.flag.priority-reviews",
};

/**
 * Default value for each flag when neither the localStorage override
 * nor the env var resolves. Used as the final tier of getFlag().
 *
 * pixelPerfectEdit ships on. Set the localStorage key to "0" to flip
 * back to V1 (legacy single-page editor) without a redeploy if a
 * regression surfaces.
 *
 * trustedReviewLinks: "Someone you trust" review option (a secure, expiring
 * link for the person's own solicitor or HR consultant, no account needed).
 * emailLetters: "Email it from DraftHR" on the Send step.
 * Both ship on. The server side behind each must fail softly with a clear
 * message when it is not ready (for example an unmigrated table).
 *
 * priorityReviews: "Priority, back within 24 hours" when booking an expert,
 * and the expert's opt-in on their profile. Ships OFF: the operator turns it
 * on with VITE_FEATURE_PRIORITY_REVIEWS=1, which the server reads too, so
 * one variable switches on both. Even switched on here, nothing can be booked
 * while the server's switch is off: the listing sends no priority prices and
 * a priority booking is refused.
 */
const DEFAULTS: Record<FlagKey, boolean> = {
  pixelPerfectEdit: true,
  trustedReviewLinks: true,
  emailLetters: true,
  priorityReviews: false,
};

function parseBool(raw: string | null | undefined): boolean | null {
  if (raw == null) return null;
  const v = raw.trim().toLowerCase();
  if (v === "" ) return null;
  if (v === "1" || v === "true" || v === "on" || v === "yes") return true;
  if (v === "0" || v === "false" || v === "off" || v === "no") return false;
  return null;
}

function readLocalStorage(key: string): string | null {
  try {
    return typeof window !== "undefined" ? window.localStorage.getItem(key) : null;
  } catch {
    return null;
  }
}

export function getFlag(key: FlagKey): boolean {
  const ls = parseBool(readLocalStorage(STORAGE_KEY[key]));
  if (ls != null) return ls;
  const env = parseBool(import.meta.env[ENV_KEY[key]] as string | undefined);
  if (env != null) return env;
  return DEFAULTS[key];
}

/**
 * Dev-only helper. Sets the localStorage override and reloads so the
 * change takes effect immediately. Exposed on `window` from the entry
 * file so I can flip flags from the browser devtools while dogfooding.
 */
export function setFlag(key: FlagKey, value: boolean | null): void {
  try {
    if (value == null) {
      window.localStorage.removeItem(STORAGE_KEY[key]);
    } else {
      window.localStorage.setItem(STORAGE_KEY[key], value ? "1" : "0");
    }
    window.location.reload();
  } catch {
    // best-effort — devtool helper only
  }
}
