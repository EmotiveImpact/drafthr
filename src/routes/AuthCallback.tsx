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
        // Force a fresh session fetch (don't coalesce onto a stale background
        // refresh — see AuthProvider).
        await refresh({ force: true });

        // After auth: if the user arrived via /join/{code}, the JoinInvite route
        // stashed the code in sessionStorage. Pick it back up so the workspace
        // setup form opens pre-filled to "Join".
        let pendingInvite: string | null = null;
        try {
          pendingInvite = sessionStorage.getItem("drafthr_pending_invite");
        } catch {
          /* private mode etc */
        }

        // The custom /sign-in page stashes the post-auth target for the
        // social-OAuth path (Google / Microsoft) because that path
        // round-trips through the IdP and loses the URL query string.
        // Consume + clear so a later sign-in doesn't reuse a stale value.
        let stashedRedirect: string | null = null;
        try {
          stashedRedirect = sessionStorage.getItem("drafthr_post_signin_redirect");
          if (stashedRedirect) sessionStorage.removeItem("drafthr_post_signin_redirect");
        } catch {
          /* private mode etc */
        }

        // Decide where to go: explicit ?redirect= wins, then the stashed
        // post-sign-in redirect, then pending invite, else server-side
        // tenant lookup resolves whether they need onboarding.
        const redirect =
          safeInternalRedirect(params.get("redirect")) ?? safeInternalRedirect(stashedRedirect);
        if (redirect) {
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
    <div className="min-h-screen grid place-items-center bg-[var(--ds-canvas)] px-6">
      <div className="w-full max-w-md space-y-4 text-center">
        {error ? (
          <>
            <h1 className="ds-title m-0 text-[28px] leading-tight">Couldn't complete sign-in</h1>
            <p className="text-[14px] text-[var(--ds-muted)]">{error}</p>
            <Link
              to="/sign-in"
              className="inline-flex h-9 items-center rounded-[var(--ds-r-m)] bg-[var(--ds-accent)] px-4 text-[13.5px] font-medium text-[var(--ds-on-accent)] transition hover:bg-[var(--ds-accent-hover)]"
            >
              Try again
            </Link>
          </>
        ) : (
          <>
            <Skeleton className="h-6 w-2/3 mx-auto" />
            <Skeleton className="h-4 w-full" />
            <p className="text-[13px] text-[var(--ds-muted)]">Signing you in…</p>
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
