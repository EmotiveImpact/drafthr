import type { ReactNode } from "react";
import { Navigate, useLocation } from "react-router-dom";
import { AUTH_ENABLED, AUTH_MISCONFIGURED } from "./index";
import { useAuth } from "./AuthProvider";
import { useProfileStore } from "@/lib/profile";
import { useConsultantStore } from "@/lib/consultantProfile";
import { AppLoadingScreen } from "@/components/AppLoadingScreen";

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
  allowRoleSetup = false,
}: {
  children: ReactNode;
  roles?: GateRole[];
  allowRoleSetup?: boolean;
}) {
  if (AUTH_MISCONFIGURED) return null;
  if (!AUTH_ENABLED) return <>{children}</>;
  return <ProtectedGate roles={roles} allowRoleSetup={allowRoleSetup}>{children}</ProtectedGate>;
}

/**
 * Is `pathname` an onboarding/consultant entry point that a signed-in user
 * WITHOUT an active tenant is allowed to reach? Consultants mint their
 * bootstrap tenant lazily on first marketplace call, so /c and /c/* must
 * stay reachable tenant-less; the workspace-setup + invite-landing routes
 * are the onboarding flow itself.
 */
function isOnboardingPath(pathname: string): boolean {
  return (
    pathname.startsWith("/signup/workspace") ||
    pathname.startsWith("/join/") ||
    pathname === "/c" ||
    pathname.startsWith("/c/")
  );
}

/**
 * Branches SYNCHRONOUSLY during render — no useEffect. Every non-authorized
 * state returns a <Navigate replace/> (which renders nothing and commits no
 * children) or a loading screen, so the gated child can NEVER mount/paint or fire
 * its mount-effects before the redirect lands. (The previous useEffect-based
 * redirect let children flash for a frame whenever the render guard and the
 * effect's predicate diverged — see RootRedirect's header comment for the
 * same lesson.)
 */
function ProtectedGate({
  children,
  roles,
  allowRoleSetup,
}: {
  children: ReactNode;
  roles?: GateRole[];
  allowRoleSetup: boolean;
}) {
  const { user, activeTenant, isLoaded, organizationSignInUrl, isConsultant } = useAuth();
  const location = useLocation();
  const profileRole = useProfileStore((s) => s.profile.role);
  const consultantEnrolled = useConsultantStore((s) => s.enrolled);

  // Effective role: explicit employer/employee profile role wins; otherwise
  // a consultant-enrolled user with no profile role is a consultant.
  const effectiveRole: GateRole | null =
    profileRole ?? (isConsultant || consultantEnrolled ? "consultant" : null);

  // 1. Still resolving the session → stable loading screen, never the child.
  if (!isLoaded) return <AppLoadingScreen />;
  if (organizationSignInUrl && !isOnboardingPath(location.pathname)) {
    return <Navigate to={organizationSignInUrl + "&redirect=" + encodeURIComponent(location.pathname + location.search)} replace />;
  }

  // 2. Signed out → sign-in, preserving the intended destination.
  if (!user) {
    const redirect = encodeURIComponent(location.pathname + location.search);
    return <Navigate to={`/sign-in?redirect=${redirect}`} replace />;
  }

  // 3. Signed in but no workspace yet → force onboarding (except on the
  //    onboarding/consultant routes themselves, so we don't loop).
  if (!activeTenant && !isOnboardingPath(location.pathname)) {
    return <Navigate to="/signup/workspace" replace />;
  }

  // 4. Role-gated route + wrong OR not-yet-resolved role → "/", which
  //    RootRedirect resolves to the user's correct home / role picker.
  //    Guarding on `!effectiveRole` too (not just a mismatch) closes the
  //    fresh-login / cleared-localStorage window where the role is still null.
  if (roles && (effectiveRole ? !roles.includes(effectiveRole) : !allowRoleSetup)) {
    return <Navigate to="/" replace />;
  }

  return <>{children}</>;
}
