import type { ReactNode } from "react";
import { ClerkProvider } from "@clerk/clerk-react";
import { useNavigate } from "react-router-dom";
import { AUTH_ENABLED, AUTH_MISCONFIGURED, CLERK_PUBLISHABLE_KEY } from "./index";

/**
 * Wraps the app in ClerkProvider when AUTH_ENABLED. Production fails closed
 * when auth is missing so draft data does not become public by accident.
 */
export function AuthProvider({ children }: { children: ReactNode }) {
  const navigate = useNavigate();
  if (AUTH_MISCONFIGURED) return <AuthConfigurationError />;
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

function AuthConfigurationError() {
  return (
    <main className="min-h-screen bg-[var(--ds-canvas)] text-[var(--ds-ink)] grid place-items-center px-6">
      <section className="max-w-md rounded-md border border-[var(--ds-line)] bg-[var(--ds-surface)] p-6 shadow-sm">
        <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-[var(--ds-muted)]">
          Configuration required
        </p>
        <h1 className="mt-2 text-xl font-semibold">Authentication is not configured</h1>
        <p className="mt-3 text-sm leading-6 text-[var(--ds-body)]">
          This production deployment is blocked because no Clerk publishable key is
          configured. Set `VITE_CLERK_PUBLISHABLE_KEY`, or explicitly enable a
          public demo deployment with `VITE_ALLOW_PUBLIC_APP=true`.
        </p>
      </section>
    </main>
  );
}
