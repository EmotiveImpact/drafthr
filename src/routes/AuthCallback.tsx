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
    // The `started` ref is the single-run guard — it survives React
    // StrictMode's dev-only double-invoke (and remount), so the code is
    // exchanged exactly once. We deliberately do NOT gate the async chain on a
    // `cancelled` cleanup flag: under StrictMode the first effect's cleanup
    // runs immediately, and if it cancelled the chain, the ONLY surviving run
    // (the 2nd invoke returns early on the ref) would never navigate — leaving
    // the user stuck on "Signing you in…" forever. (Bug #21.)
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
        const data = await res.json() as { returnTo?: string };
        await refresh({ force: true });
        // The destination travels in signed, HttpOnly OAuth state, not browser storage.
        navigate(safeInternalRedirect(data.returnTo ?? null) ?? "/", { replace: true });
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

export function safeInternalRedirect(value: string | null): string | null {
  if (!value) return null;
  const redirect = value.trim();
  if (!redirect.startsWith("/") || redirect.startsWith("//") || redirect.includes("\\")) {
    return null;
  }
  try {
    const parsed = new URL(redirect, "https://app.drafthr.local");
    if (parsed.origin !== "https://app.drafthr.local") return null;
    if (parsed.pathname === "/auth/callback") return null;
    return `${parsed.pathname}${parsed.search}${parsed.hash}`;
  } catch {
    return null;
  }
}
