/**
 * Recovery from stale chunks after a deploy.
 *
 * Routes, letter templates and the export libraries are lazily loaded
 * chunks with hashed file names. A tab opened before a deploy still asks for
 * the old names; the new deployment no longer has them (the SPA rewrite
 * answers with index.html), so the dynamic import fails. Reloading once picks
 * up the new build. A short cooldown in sessionStorage stops a reload loop if
 * the chunk is missing for some other reason.
 */

const RELOAD_KEY = "drafthr:chunk-reload-at";
const RELOAD_COOLDOWN_MS = 60_000;

const CHUNK_ERROR_PATTERNS = [
  /Failed to fetch dynamically imported module/i, // Chrome, Edge
  /error loading dynamically imported module/i, // Firefox
  /Importing a module script failed/i, // Safari
  /is not a valid JavaScript MIME type/i, // Safari, index.html served for a missing chunk
  /Unable to preload CSS/i, // Vite CSS preload
  /ChunkLoadError|Loading chunk \S+ failed/i,
];

export function isChunkLoadError(err: unknown): boolean {
  const text =
    err instanceof Error ? `${err.name}: ${err.message}` : typeof err === "string" ? err : "";
  return CHUNK_ERROR_PATTERNS.some((re) => re.test(text));
}

type ReloadWindow = {
  location: Pick<Location, "reload">;
  sessionStorage: Pick<Storage, "getItem" | "setItem">;
};

let reloadStarted = false;

/**
 * Reload the page once to fetch the current build. Returns true when a reload
 * is under way (started now or already started), false when one was tried
 * within the cooldown or sessionStorage is unavailable, in which case the
 * caller shows its error instead of looping.
 */
export function reloadForStaleChunk(win: ReloadWindow = window, now = Date.now()): boolean {
  if (reloadStarted) return true;
  try {
    const last = Number(win.sessionStorage.getItem(RELOAD_KEY)) || 0;
    if (now - last < RELOAD_COOLDOWN_MS) return false;
    win.sessionStorage.setItem(RELOAD_KEY, String(now));
  } catch {
    return false;
  }
  reloadStarted = true;
  win.location.reload();
  return true;
}

/** Test hook. */
export function resetChunkReloadForTests(): void {
  reloadStarted = false;
}
