/**
 * Per-user preference for how AI-proposed section changes render.
 *   - "inline" (default): track-changes style, <ins>/<del> marks inside
 *     the section's HTML.
 *   - "card":  legacy Cursor-style before/after card above the editor.
 *
 * Persisted to localStorage so the choice survives reloads. Read by
 * proposeSectionChange to decide which path to take, and exposed in the
 * canvas banner so the user can flip mid-flight.
 */
const KEY = "drafthr.diff-view-mode.v1";

export type DiffViewMode = "inline" | "card";
export const DEFAULT_DIFF_VIEW_MODE: DiffViewMode = "inline";

export function getDiffViewMode(): DiffViewMode {
  if (typeof window === "undefined") return DEFAULT_DIFF_VIEW_MODE;
  try {
    const raw = window.localStorage.getItem(KEY);
    return raw === "card" ? "card" : "inline";
  } catch {
    return DEFAULT_DIFF_VIEW_MODE;
  }
}

export function setDiffViewMode(mode: DiffViewMode): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(KEY, mode);
    // Notify listeners (canvas banner toggle etc.) — single global event so
    // multiple editor surfaces re-render without a Zustand round-trip.
    window.dispatchEvent(new CustomEvent("drafthr:diff-view-mode", { detail: mode }));
  } catch {
    /* quota / disabled storage — non-fatal */
  }
}
