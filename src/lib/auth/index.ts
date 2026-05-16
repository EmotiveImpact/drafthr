/**
 * Auth abstraction. When VITE_WORKOS_CLIENT_ID is set, the app uses WorkOS
 * AuthKit (hosted OAuth) via the /api/auth/* serverless functions. Local dev
 * can run without auth; a production build fails closed when WorkOS is
 * missing unless the deployment explicitly opts into public-demo mode.
 *
 * This keeps the local dev experience seamless without accidentally shipping
 * HR/legal draft data behind a public production app.
 */

export const WORKOS_CLIENT_ID = (
  import.meta.env.VITE_WORKOS_CLIENT_ID as string | undefined
)?.trim();

const PUBLIC_APP_FLAG = (import.meta.env.VITE_ALLOW_PUBLIC_APP as string | undefined)?.trim();
export const PUBLIC_APP_ENABLED = /^(1|true|yes)$/i.test(PUBLIC_APP_FLAG ?? "");
export const AUTH_ENABLED = Boolean(WORKOS_CLIENT_ID);
export const AUTH_MISCONFIGURED =
  import.meta.env.PROD && !AUTH_ENABLED && !PUBLIC_APP_ENABLED;

export { AuthProvider, useAuth } from "./AuthProvider";
export type { AuthContextValue, AuthUser } from "./AuthProvider";
export { Protected } from "./Protected";
export { UserChip } from "./UserChip";
