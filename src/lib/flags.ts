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

type FlagKey = "pixelPerfectEdit";

const ENV_KEY: Record<FlagKey, string> = {
  pixelPerfectEdit: "VITE_FEATURE_PIXEL_PERFECT_EDIT",
};

const STORAGE_KEY: Record<FlagKey, string> = {
  pixelPerfectEdit: "drafthr.flag.pixel-perfect-edit",
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
  return false;
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
