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
  const { user, isLoaded } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  useEffect(() => {
    if (!isLoaded || user) return;
    const redirect = encodeURIComponent(location.pathname + location.search);
    navigate(`/sign-in?redirect=${redirect}`, { replace: true });
  }, [isLoaded, user, navigate, location.pathname, location.search]);

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
