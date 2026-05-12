/**
 * Tiny localStorage-backed history of recently submitted AI-panel prompts.
 * Surfaced in the composer footer (chips) when the user has sent prompts
 * before, so they don't have to retype the same instruction twice.
 *
 * Capped at 5 entries; newest first; dedup by exact-match string.
 */
const KEY = "drafthr.recent-prompts.v1";
const CAP = 5;

export function getRecentPrompts(): string[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((s): s is string => typeof s === "string" && s.length > 0).slice(0, CAP);
  } catch {
    return [];
  }
}

export function pushRecentPrompt(prompt: string): string[] {
  const trimmed = prompt.trim();
  if (!trimmed || typeof window === "undefined") return getRecentPrompts();
  const current = getRecentPrompts().filter((p) => p !== trimmed);
  const next = [trimmed, ...current].slice(0, CAP);
  try {
    window.localStorage.setItem(KEY, JSON.stringify(next));
  } catch {
    /* quota / disabled storage — non-fatal */
  }
  return next;
}

export function clearRecentPrompts(): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(KEY);
  } catch {
    /* non-fatal */
  }
}
