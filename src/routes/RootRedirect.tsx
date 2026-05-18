import { Navigate } from "react-router-dom";
import { Box, Flex } from "@radix-ui/themes";
import { AUTH_ENABLED, useAuth } from "@/lib/auth";
import { useProfileStore } from "@/lib/profile";
import { ModePicker } from "./ModePicker";
import { Skeleton } from "@/components/ui/skeleton";

/**
 * Smart-routes the root path based on the current auth + onboarding state.
 *
 * State machine:
 *   loading                    → centered skeleton
 *   signed out                 → redirect to the in-app /sign-in page
 *                                (DraftHR-branded form; no marketing
 *                                card — app.drafthr.io is the APP,
 *                                marketing lives at drafthr.io)
 *   signed in, no tenant       → /signup/workspace (create / join)
 *   signed in, no role         → ModePicker (one-time role choice)
 *   signed in, fully onboarded → /hr or /me based on stored role
 *
 * Branches synchronously during render — never wrapped in <Protected>
 * because Protected's useEffect-based redirect creates a flash where the
 * previous state's UI paints before the redirect fires.
 */
export function RootRedirect() {
  const { user, isLoaded, activeTenant } = useAuth();
  const profile = useProfileStore((s) => s.profile);

  if (!AUTH_ENABLED) {
    if (!profile.role) return <ModePicker />;
    return <Navigate to={profile.role === "employer" ? "/hr" : "/me"} replace />;
  }

  if (!isLoaded) return <CenteredLoadingScreen />;

  // 1. Not signed in → bounce to the in-app /sign-in page. The page
  //    owns the branded form + "Continue with Google / Microsoft"
  //    affordances; this just routes the user there. We deliberately
  //    use <Navigate> (router-level) rather than calling signIn() in an
  //    effect, so there's no flash of the prior state's UI.
  if (!user) return <Navigate to="/sign-in" replace />;

  // 2. Signed in but no tenant → workspace setup
  if (!activeTenant) return <Navigate to="/signup/workspace" replace />;

  // 3. Signed in + tenant but no role → mode picker (chromeless)
  if (!profile.role) return <ModePicker />;

  // 4. Fully onboarded → route to their home
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
