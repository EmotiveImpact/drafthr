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
        const redirect = params.get("redirect");
        navigate(redirect && redirect.startsWith("/") ? redirect : "/", { replace: true });
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
