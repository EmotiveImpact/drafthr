/**
 * Auth abstraction. When VITE_CLERK_PUBLISHABLE_KEY is set, we wrap the app
 * in Clerk's provider and gate routes. Local dev can run without auth; a
 * production build fails closed when Clerk is missing unless the deployment
 * explicitly opts into public-demo mode.
 *
 * This keeps the local dev experience seamless without accidentally shipping
 * HR/legal draft data behind a public production app.
 */

export const CLERK_PUBLISHABLE_KEY = (
  import.meta.env.VITE_CLERK_PUBLISHABLE_KEY as string | undefined
)?.trim();

const PUBLIC_APP_FLAG = (import.meta.env.VITE_ALLOW_PUBLIC_APP as string | undefined)?.trim();
export const PUBLIC_APP_ENABLED = /^(1|true|yes)$/i.test(PUBLIC_APP_FLAG ?? "");
export const AUTH_ENABLED = Boolean(CLERK_PUBLISHABLE_KEY);
export const AUTH_MISCONFIGURED =
  import.meta.env.PROD && !AUTH_ENABLED && !PUBLIC_APP_ENABLED;
