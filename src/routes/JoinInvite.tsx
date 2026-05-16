import { useEffect } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useAuth } from "@/lib/auth";
import { Skeleton } from "@/components/ui/skeleton";

/**
 * /join/:inviteCode — public entry point for invite links.
 *
 * Behaviour:
 *  - Signed-out users: stash the invite code in sessionStorage, then bounce
 *    through sign-in. After auth, the SPA picks the code back up and routes
 *    to /signup/workspace?invite={code} with the form pre-filled.
 *  - Signed-in users: jump straight to /signup/workspace?invite={code} where
 *    they can confirm + redeem.
 */
export function JoinInvite() {
  const { inviteCode } = useParams<{ inviteCode: string }>();
  const { user, isLoaded } = useAuth();
  const nav = useNavigate();

  useEffect(() => {
    if (!isLoaded) return;
    if (!inviteCode) {
      nav("/sign-in", { replace: true });
      return;
    }
    if (!user) {
      try {
        sessionStorage.setItem("drafthr_pending_invite", inviteCode);
      } catch {
        /* private mode etc — fall back to URL only */
      }
      nav(
        `/sign-in?redirect=${encodeURIComponent(`/signup/workspace?invite=${inviteCode}`)}`,
        { replace: true },
      );
      return;
    }
    nav(`/signup/workspace?invite=${inviteCode}`, { replace: true });
  }, [inviteCode, user, isLoaded, nav]);

  return (
    <div className="min-h-screen grid place-items-center px-6">
      <div className="w-full max-w-md space-y-4 text-center">
        <Skeleton className="h-6 w-2/3 mx-auto" />
        <p className="text-sm text-muted-foreground">Opening invite…</p>
      </div>
    </div>
  );
}
