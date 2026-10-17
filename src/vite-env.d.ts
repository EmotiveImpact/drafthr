/// <reference types="vite/client" />

declare module "*.css";

interface ImportMetaEnv {
  readonly VITE_ALLOW_PUBLIC_APP?: string;
  readonly VITE_WORKOS_CLIENT_ID?: string;
  readonly VITE_WORKOS_REDIRECT_URI?: string;
  /** "cards" brings back the pastel letter-card panel on sign-in; anything else shows the photos. */
  readonly VITE_SIGN_IN_PANEL?: string;
}
