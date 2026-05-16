import { Navigate } from "react-router-dom";
import { Box, Button, Card, Flex, Heading, Text } from "@radix-ui/themes";
import { ArrowRight } from "lucide-react";
import { useAuth } from "@/lib/auth";
import { useProfileStore } from "@/lib/profile";
import { ModePicker } from "./ModePicker";
import { Skeleton } from "@/components/ui/skeleton";

/**
 * Smart-routes the root path based on the current auth + onboarding state.
 *
 * State machine:
 *   loading                   → centered skeleton
 *   signed out                → public landing card with "Sign in"
 *   signed in, no tenant      → /signup/workspace (create / join)
 *   signed in, no role        → ModePicker (one-time role choice)
 *   signed in, fully onboarded → /hr or /me based on stored role
 *
 * IMPORTANT: this component is NOT wrapped in <Protected> — it owns the
 * auth-state branching itself. Wrapping in Protected creates a useEffect
 * race where the previous route flashes briefly before the redirect
 * fires. Doing the branch synchronously here eliminates the flash.
 */
export function RootRedirect() {
  const { user, isLoaded, activeTenant } = useAuth();
  const profile = useProfileStore((s) => s.profile);

  if (!isLoaded) return <CenteredLoadingScreen />;

  // 1. Not signed in → public landing
  if (!user) return <PublicLanding />;

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

function PublicLanding() {
  const { signIn } = useAuth();

  return (
    <Box className="min-h-screen grid place-items-center px-6 py-10">
      <Card size="4" className="w-full max-w-md">
        <Flex direction="column" gap="4">
          <Box>
            <Text size="1" color="gray" weight="medium" className="uppercase tracking-[0.18em]">
              DRAFTHR
            </Text>
            <Heading size="6" mt="2" mb="1" weight="medium">
              AI-assisted HR letters for the UK and US
            </Heading>
            <Text size="2" color="gray" as="p">
              Wizard-guided drafts with legal awareness for grievance,
              redundancy, performance, and tribunal-bound letters.
              Defensible by default.
            </Text>
          </Box>
          <Button size="3" onClick={() => signIn()} className="w-full">
            Sign in or create an account
            <ArrowRight className="size-4" />
          </Button>
          <Text size="1" color="gray" as="p">
            One button — sign in if you have an account, create one if you
            don't. Powered by WorkOS.
          </Text>
        </Flex>
      </Card>
    </Box>
  );
}
