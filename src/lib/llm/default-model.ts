/**
 * Single source of truth for the default generation model.
 *
 * Imported by:
 *   - profile.ts            — initial value in EMPTY_PROFILE so the user's
 *                              first opened-app state already has a model set
 *   - Settings.tsx          — fallback for the dropdown's `value` prop so
 *                              what's displayed matches what's persisted
 *   - AIPanel.tsx           — fallback for the header pill so it matches
 *                              Settings
 *   - api/draft.ts          — server-side fallback when no model is requested
 *   - api/agent.ts          — same
 *   - server/proxy.ts       — same
 *
 * Change this string to retarget every fallback in lockstep.
 */
export const DEFAULT_MODEL = "gemini-2.0-flash" as const;
