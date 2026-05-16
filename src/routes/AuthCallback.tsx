import { useEffect, useRef, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { useAuth } from "@/lib/auth";
import { Skeleton } from "@/components/ui/skeleton";

/**
 * Receives WorkOS's redirect at /auth/callback?code=...&state=...
 * Exchanges the code via /api/auth/callback, refreshes auth state, and
 * navigates the user to ?redirect= (or `/` if absent).
 */
export function AuthCallback() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const { refresh } = useAuth();
  const [error, setError] = useState<string | null>(null);
  const started = useRef(false);

  useEffect(() => {
    if (started.current) return;
    started.current = true;

    const code = params.get("code");
    const state = params.get("state");
    if (!code) {
      setError("Missing authorization code in callback URL.");
      return;
    }

    (async () => {
      try {
        const res = await fetch("/api/auth/callback", {
          method: "POST",
          credentials: "same-origin",
          headers: { "Content-Type": "application/json", Accept: "application/json" },
          body: JSON.stringify({ code, state: state ?? "" }),
        });
        if (!res.ok) {
          const data = await res.json().catch(() => ({}) as { error?: string });
          throw new Error(data.error ?? `Sign-in failed (HTTP ${res.status})`);
        }
        await refresh();

        // After auth: if the user arrived via /join/{code}, the JoinInvite route
        // stashed the code in sessionStorage. Pick it back up so the workspace
        // setup form opens pre-filled to "Join".
        let pendingInvite: string | null = null;
        try {
          pendingInvite = sessionStorage.getItem("drafthr_pending_invite");
        } catch {
          /* private mode etc */
        }

        // Decide where to go: explicit ?redirect= wins, else pending invite
        // sends them to /signup/workspace, else server-side tenant lookup
        // resolves whether they need onboarding.
        const redirect = params.get("redirect");
        if (redirect && redirect.startsWith("/")) {
          navigate(redirect, { replace: true });
        } else if (pendingInvite) {
          navigate(`/signup/workspace?invite=${encodeURIComponent(pendingInvite)}`, {
            replace: true,
          });
        } else {
          // Re-query /api/auth/session for the freshly-active tenant. The
          // first refresh() above already updated the AuthProvider state, but
          // we re-fetch here to avoid a one-render flicker before the redirect.
          let activeTenant: { id: string } | null = null;
          try {
            const sessRes = await fetch("/api/auth/session", {
              credentials: "same-origin",
              headers: { Accept: "application/json" },
            });
            if (sessRes.ok) {
              const data = (await sessRes.json()) as { activeTenant?: { id: string } | null };
              activeTenant = data.activeTenant ?? null;
            }
          } catch {
            /* network blip — fall through to the default route */
          }
          navigate(activeTenant ? "/" : "/signup/workspace", { replace: true });
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : "Sign-in failed");
      }
    })();
  }, [params, navigate, refresh]);

  return (
    <div className="min-h-screen grid place-items-center px-6">
      <div className="w-full max-w-md space-y-4 text-center">
        {error ? (
          <>
            <h1 className="text-lg font-semibold">Couldn't complete sign-in</h1>
            <p className="text-sm text-muted-foreground">{error}</p>
            <Link
              to="/sign-in"
              className="inline-block text-sm font-medium text-primary underline-offset-4 hover:underline"
            >
              Try again
            </Link>
          </>
        ) : (
          <>
            <Skeleton className="h-6 w-2/3 mx-auto" />
            <Skeleton className="h-4 w-full" />
            <p className="text-sm text-muted-foreground">Signing you in…</p>
          </>
        )}
      </div>
    </div>
  );
}
