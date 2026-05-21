import type { ReactNode } from "react";
import { useEffect } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { AUTH_ENABLED, AUTH_MISCONFIGURED } from "./index";
import { useAuth } from "./AuthProvider";
import { Skeleton } from "@/components/ui/skeleton";

/**
 * Gates a route. Local dev can pass through without auth; production without
 * auth is blocked by AuthProvider before routes render. When auth is on and
 * the user is signed out, we redirect to /sign-in with the current location
 * stashed as ?redirect= so they land back where they started after login.
 */
export function Protected({ children }: { children: ReactNode }) {
  if (AUTH_MISCONFIGURED) return null;
  if (!AUTH_ENABLED) return <>{children}</>;
  return <ProtectedGate>{children}</ProtectedGate>;
}

function ProtectedGate({ children }: { children: ReactNode }) {
  const { user, activeTenant, isLoaded } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  useEffect(() => {
    if (!isLoaded) return;
    if (!user) {
      const redirect = encodeURIComponent(location.pathname + location.search);
      navigate(`/sign-in?redirect=${redirect}`, { replace: true });
      return;
    }
    // Signed in but no workspace yet — force onboarding. Allow:
    //   - /signup/workspace (the onboarding form itself)
    //   - /join/ (invite landing)
    //   - /c (consultant home + profile setup — consultants don't need
    //     to create an HR workspace; the bootstrap tenant is minted
    //     server-side on their first /api/marketplace/* call).
    // Skipping these prevents the loop where Protected redirects a
    // consultant signup to /signup/workspace (wrong flow for them).
    const onboardingPath =
      location.pathname.startsWith("/signup/workspace") ||
      location.pathname.startsWith("/join/") ||
      location.pathname === "/c" ||
      location.pathname.startsWith("/c/");
    if (!activeTenant && !onboardingPath) {
      navigate("/signup/workspace", { replace: true });
    }
  }, [isLoaded, user, activeTenant, navigate, location.pathname, location.search]);

  if (!isLoaded || !user) return <LoadingSkeleton />;
  return <>{children}</>;
}

function LoadingSkeleton() {
  return (
    <div className="min-h-screen grid place-items-center px-6">
      <div className="w-full max-w-md space-y-3">
        <Skeleton className="h-8 w-2/3" />
        <Skeleton className="h-4 w-full" />
        <Skeleton className="h-4 w-5/6" />
      </div>
    </div>
  );
}
