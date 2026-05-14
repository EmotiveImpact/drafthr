/// <reference types="vite/client" />

declare module "*.css";

interface ImportMetaEnv {
  readonly VITE_ALLOW_PUBLIC_APP?: string;
  readonly VITE_CLERK_PUBLISHABLE_KEY?: string;
}
