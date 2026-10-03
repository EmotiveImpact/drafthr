import { useCallback, useEffect, useRef, useState } from "react";
import { Link, Navigate, useSearchParams } from "react-router-dom";
import { AUTH_ENABLED, useAuth } from "@/lib/auth";
import { BrandMark, Wordmark } from "@/components/ds";
import { safeInternalRedirect } from "@/routes/AuthCallback";
import { AuthFooter } from "@/routes/sign-in/AuthShell";

/** Credentials, recovery, MFA and company SSO are one WorkOS-hosted journey. */
export function SignIn({ screenHint = "sign-in" }: { screenHint?: "sign-in" | "sign-up" }) {
  const { user, isLoaded, organizationSignInUrl } = useAuth();
  const [params] = useSearchParams();
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const started = useRef(false);
  const workspace = params.get("workspace");
  const signedOut = params.get("signed_out") === "1";
  const returnTo = safeInternalRedirect(params.get("redirect")) ??
    (params.get("as") === "consultant" ? "/c/profile" : "/");
  const needsLogin = !user || Boolean(workspace);

  const start = useCallback(async () => {
    setError(null);
    setBusy(true);
    try {
      const query = new URLSearchParams({ redirect: returnTo, screen_hint: screenHint });
      if (workspace) query.set("workspace", workspace);
      const response = await fetch(`/api/auth/url?${query}`, {
        credentials: "same-origin", headers: { Accept: "application/json" },
      });
      if (!response.headers.get("content-type")?.includes("application/json")) {
        throw new Error("The sign-in service is unavailable. Please try again.");
      }
      const data = await response.json() as { url?: string; error?: string };
      if (!response.ok || !data.url) throw new Error(data.error ?? "Unable to start sign-in.");
      window.location.assign(data.url);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to start sign-in.");
      setBusy(false);
    }
  }, [returnTo, screenHint, workspace]);

  useEffect(() => {
    if (!AUTH_ENABLED || !isLoaded || !needsLogin || started.current || signedOut) return;
    started.current = true;
    void start();
  }, [isLoaded, needsLogin, start, signedOut]);

  if (!AUTH_ENABLED) return <Navigate to="/" replace />;
  if (isLoaded && !needsLogin) return <Navigate to={organizationSignInUrl ?? returnTo} replace />;

  return (
    <main className="min-h-screen flex flex-col bg-[var(--ds-canvas)] text-[var(--ds-ink)]">
      <div className="flex-1 grid place-items-center px-6 py-12">
        <section className="w-full max-w-sm text-center" aria-labelledby="sign-in-heading">
          <Link to="/" aria-label="DraftHR home" className="inline-flex items-center gap-2.5 mb-10">
            <BrandMark size={40} /><Wordmark size={28} />
          </Link>
          <h1 id="sign-in-heading" className="text-2xl font-semibold">
            {screenHint === "sign-up" ? "Create your DraftHR account" : "Sign in to DraftHR"}
          </h1>
          <p className="mt-3 text-sm leading-6 text-[var(--ds-body)]">
            {workspace ? "Continue with your company’s sign-in requirements." : "Secure access to your workspace, letters and matters."}
          </p>
          {error ? <p role="alert" className="mt-6 text-sm text-[var(--ds-red-fg)]">{error}</p> :
            <p role="status" className="mt-6 text-sm text-[var(--ds-muted)]">{signedOut ? "You’re signed out." : "Opening secure sign-in…"}</p>}
          <button type="button" onClick={() => void start()} disabled={busy || !isLoaded}
            className="mt-6 w-full rounded-lg bg-[var(--ds-ink)] px-4 py-3 text-sm font-semibold text-white disabled:opacity-60">
            {busy ? "Connecting…" : "Continue to secure sign-in"}
          </button>
        </section>
      </div>
      <AuthFooter />
    </main>
  );
}
