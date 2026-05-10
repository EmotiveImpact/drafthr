import type { ReactNode } from "react";
import { ClerkProvider } from "@clerk/clerk-react";
import { useNavigate } from "react-router-dom";
import { AUTH_ENABLED, CLERK_PUBLISHABLE_KEY } from "./index";

/**
 * Wraps the app in ClerkProvider when AUTH_ENABLED, else passthroughs children.
 */
export function AuthProvider({ children }: { children: ReactNode }) {
  const navigate = useNavigate();
  if (!AUTH_ENABLED) return <>{children}</>;
  return (
    <ClerkProvider
      publishableKey={CLERK_PUBLISHABLE_KEY!}
      routerPush={(to: string) => navigate(to)}
      routerReplace={(to: string) => navigate(to, { replace: true })}
      afterSignInUrl="/"
      afterSignUpUrl="/"
      signInFallbackRedirectUrl="/"
      signUpFallbackRedirectUrl="/"
    >
      {children}
    </ClerkProvider>
  );
}
