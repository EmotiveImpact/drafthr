import { useEffect, useRef, useState } from "react";
import { useAuth } from "@/lib/auth";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";

/**
 * Public route. On mount, calls signIn() which redirects the browser to
 * WorkOS-hosted login. If that call fails (network, server error) we show
 * a retry button so the user isn't stuck on an empty page.
 */
export function SignIn() {
  const { signIn } = useAuth();
  const [error, setError] = useState<string | null>(null);
  // StrictMode in dev double-invokes effects — guard so we don't kick off
  // two parallel /api/auth/url calls.
  const started = useRef(false);

  useEffect(() => {
    if (started.current) return;
    started.current = true;
    signIn().catch((err) => {
      setError(err instanceof Error ? err.message : "Sign-in failed");
    });
  }, [signIn]);

  return (
    <div className="min-h-screen grid place-items-center px-6">
      <div className="w-full max-w-md space-y-4 text-center">
        {error ? (
          <>
            <h1 className="text-lg font-semibold">Sign-in unavailable</h1>
            <p className="text-sm text-muted-foreground">{error}</p>
            <Button
              onClick={() => {
                setError(null);
                started.current = false;
                signIn().catch((err) =>
                  setError(err instanceof Error ? err.message : "Sign-in failed")
                );
              }}
            >
              Try again
            </Button>
          </>
        ) : (
          <>
            <Skeleton className="h-6 w-2/3 mx-auto" />
            <Skeleton className="h-4 w-full" />
            <p className="text-sm text-muted-foreground">Redirecting to sign-in…</p>
          </>
        )}
      </div>
    </div>
  );
}
