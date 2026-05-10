/**
 * Auth abstraction. When VITE_CLERK_PUBLISHABLE_KEY is set, we wrap the app
 * in Clerk's provider and gate routes. When unset (local dev or self-host
 * without auth), the app runs in "open" mode where every route is public.
 *
 * This keeps the local dev experience seamless while letting production flip
 * a single env var to enable auth.
 */

export const CLERK_PUBLISHABLE_KEY = (
  import.meta.env.VITE_CLERK_PUBLISHABLE_KEY as string | undefined
)?.trim();

export const AUTH_ENABLED = Boolean(CLERK_PUBLISHABLE_KEY);
