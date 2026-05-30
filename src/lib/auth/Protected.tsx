import type { ReactNode } from "react";
import { useEffect } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { AUTH_ENABLED, AUTH_MISCONFIGURED } from "./index";
import { useAuth } from "./AuthProvider";
import { useProfileStore } from "@/lib/profile";
import { useConsultantStore } from "@/lib/consultantProfile";
import { Skeleton } from "@/components/ui/skeleton";

/** Roles a route can be restricted to. Omit `roles` to allow any
 *  authenticated user (the default — shared routes like /editor,
 *  /settings, /calendar). */
export type GateRole = "employer" | "employee" | "consultant";

/**
 * Gates a route. Local dev can pass through without auth; production without
 * auth is blocked by AuthProvider before routes render. When auth is on and
 * the user is signed out, we redirect to /sign-in with the current location
 * stashed as ?redirect= so they land back where they started after login.
 *
 * Pass `roles` to additionally restrict by role. Without it, a route is
 * auth+tenant gated only. WITH it, a signed-in user whose role isn't in the
 * list is bounced to "/" (RootRedirect then sends them to their own home).
 * This is what stops a logged-in employee from rendering an HR-only surface
 * (e.g. /reports, /employees) by typing the URL — previously those were
 * hidden in the nav but the route itself still rendered. Note: the APIs are
 * already tenant/owner-scoped, so this is defence-in-depth + correct UX, not
 * the only thing standing between a user and another tenant's data.
 */
export function Protected({
  children,
  roles,
}: {
  children: ReactNode;
  roles?: GateRole[];
}) {
  if (AUTH_MISCONFIGURED) return null;
  if (!AUTH_ENABLED) return <>{children}</>;
  return <ProtectedGate roles={roles}>{children}</ProtectedGate>;
}

function ProtectedGate({
  children,
  roles,
}: {
  children: ReactNode;
  roles?: GateRole[];
}) {
  const { user, activeTenant, isLoaded } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const profileRole = useProfileStore((s) => s.profile.role);
  const consultantEnrolled = useConsultantStore((s) => s.enrolled);

  // Effective role: explicit employer/employee profile role wins; otherwise
  // a consultant-enrolled user with no profile role is a consultant.
  const effectiveRole: GateRole | null =
    profileRole ?? (consultantEnrolled ? "consultant" : null);

  const roleMismatch =
    !!roles && !!effectiveRole && !roles.includes(effectiveRole);

  useEffect(() => {
    if (!isLoaded) return;
    if (!user) {
      const redirect = encodeURIComponent(location.pathname + location.search);
      navigate(`/sign-in?redirect=${redirect}`, { replace: true });
      return;
    }
    // Signed in but no workspace yet — force onboarding. Allow the workspace
    // signup route itself + the invite landing + consultant onboarding
    // through so we don't loop.
    const onboardingPath =
      location.pathname.startsWith("/signup/workspace") ||
      location.pathname.startsWith("/join/") ||
      location.pathname === "/c" ||
      location.pathname.startsWith("/c/");
    if (!activeTenant && !onboardingPath) {
      navigate("/signup/workspace", { replace: true });
      return;
    }
    // Role-gated route + wrong role (or no role yet) → bounce to "/", which
    // RootRedirect resolves to the user's correct home / role picker.
    if (roles && (!effectiveRole || !roles.includes(effectiveRole))) {
      navigate("/", { replace: true });
    }
  }, [
    isLoaded,
    user,
    activeTenant,
    navigate,
    location.pathname,
    location.search,
    roles,
    effectiveRole,
  ]);

  if (!isLoaded || !user) return <LoadingSkeleton />;
  // Don't flash the wrong-role surface while the redirect effect runs.
  if (roleMismatch) return <LoadingSkeleton />;
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
