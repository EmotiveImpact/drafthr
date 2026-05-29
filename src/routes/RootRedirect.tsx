import { Navigate } from "react-router-dom";
import { Box, Flex } from "@radix-ui/themes";
import { AUTH_ENABLED, useAuth } from "@/lib/auth";
import { useProfileStore } from "@/lib/profile";
import { useConsultantStore } from "@/lib/consultantProfile";
import { ModePicker } from "./ModePicker";
import { Skeleton } from "@/components/ui/skeleton";

/**
 * Smart-routes the root path based on the current auth + onboarding state.
 *
 * State machine:
 *   loading                       → centered skeleton
 *   signed out                    → redirect to the in-app /sign-in page
 *   signed in, consultant         → /c  (BEFORE the tenant/role checks —
 *                                   consultants don't create HR workspaces
 *                                   and never set an employer/employee role)
 *   signed in, no tenant          → /signup/workspace (create / join)
 *   signed in, no role            → ModePicker (one-time role choice)
 *   signed in, fully onboarded    → /hr or /me based on stored role
 *
 * Branches synchronously during render — never wrapped in <Protected>
 * because Protected's useEffect-based redirect creates a flash where the
 * previous state's UI paints before the redirect fires.
 */
export function RootRedirect() {
  const { user, isLoaded, activeTenant } = useAuth();
  const profile = useProfileStore((s) => s.profile);
  const consultantEnrolled = useConsultantStore((s) => s.enrolled);

  // A consultant is identified by enrollment with NO employer/employee
  // role chosen. If they later explicitly pick an HR/Employee role, that
  // wins (they opted into the other surface). This is the single signal
  // RootRedirect was missing — without it a returning consultant was
  // dumped into ModePicker (tenant minted) or stranded on workspace
  // setup (tenant not yet minted) every login.
  const isConsultant = consultantEnrolled && !profile.role;

  if (!AUTH_ENABLED) {
    if (isConsultant) return <Navigate to="/c" replace />;
    if (!profile.role) return <ModePicker />;
    return <Navigate to={profile.role === "employer" ? "/hr" : "/me"} replace />;
  }

  if (!isLoaded) return <CenteredLoadingScreen />;

  // 1. Not signed in → bounce to the in-app /sign-in page.
  if (!user) return <Navigate to="/sign-in" replace />;

  // 2. Consultant → their dashboard. Must come before the tenant + role
  //    checks: a consultant's bootstrap tenant is minted lazily on their
  //    first /api/marketplace/* call (from /c), so they legitimately have
  //    no activeTenant at this point and must NOT be routed to workspace
  //    setup or the role picker.
  if (isConsultant) return <Navigate to="/c" replace />;

  // 3. Signed in but no tenant → workspace setup
  if (!activeTenant) return <Navigate to="/signup/workspace" replace />;

  // 4. Signed in + tenant but no role → mode picker (chromeless)
  if (!profile.role) return <ModePicker />;

  // 5. Fully onboarded → route to their home
  return <Navigate to={profile.role === "employer" ? "/hr" : "/me"} replace />;
}

function CenteredLoadingScreen() {
  return (
    <Box className="min-h-screen grid place-items-center px-6">
      <Flex direction="column" gap="3" className="w-full max-w-md">
        <Skeleton className="h-8 w-1/2" />
        <Skeleton className="h-4 w-full" />
        <Skeleton className="h-4 w-5/6" />
      </Flex>
    </Box>
  );
}
