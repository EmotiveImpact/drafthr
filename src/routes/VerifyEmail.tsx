/**
 * /sign-in/verify-email — landing page for the email-verification link.
 *
 * URL shape (configured in WorkOS dashboard → Authentication → Emails →
 * Email verification URL):
 *   https://app.drafthr.io/sign-in/verify-email?code=<code>&user_id=<userId>
 *
 * Flow:
 *   1. On mount, pluck `code` + `user_id` from the URL.
 *   2. POST /api/auth/verify-email { code, userId }.
 *   3. Server verifies + mints an iron-session cookie (user proved control
 *      of the inbox; no need to also re-prompt for password).
 *   4. We refresh AuthProvider and bounce to "/" — RootRedirect routes
 *      onward (workspace setup, role picker, or home).
 *   5. On failure, show a "request a new link" CTA that links to sign-up
 *      again (sign-up implicitly re-sends the verification email).
 */

import { useEffect, useRef, useState } from "react";
import { Link, Navigate, useNavigate, useSearchParams } from "react-router-dom";
import { CheckCircle2, Loader2 } from "lucide-react";
import { AUTH_ENABLED, useAuth } from "@/lib/auth";
import { AuthShell, ErrorAlert } from "@/routes/sign-in/AuthShell";

type Stage = "verifying" | "ok" | "failed" | "missing";

export function VerifyEmail() {
  const navigate = useNavigate();
  const { isLoaded, refresh } = useAuth();
  const [params] = useSearchParams();
  const [stage, setStage] = useState<Stage>("verifying");
  const [error, setError] = useState<string | null>(null);
  // StrictMode double-fires effects in dev; guard so we don't burn a
  // single-use code on the second invocation.
  const ran = useRef(false);

  useEffect(() => {
    if (ran.current) return;
    ran.current = true;

    if (!AUTH_ENABLED) {
      // Auth disabled — nothing to verify. Just route home.
      navigate("/", { replace: true });
      return;
    }

    const code = (params.get("code") ?? "").trim();
    // WorkOS templates typically pass user_id (snake) — accept camel too
    // in case future template tweaks change shape.
    const userId =
      (params.get("user_id") ?? params.get("userId") ?? "").trim();
    const pendingAuthenticationToken =
      (params.get("pending_authentication_token") ?? "").trim();

    if (!code || (!userId && !pendingAuthenticationToken)) {
      setStage("missing");
      return;
    }

    void (async () => {
      try {
        const res = await fetch("/api/auth/verify-email", {
          method: "POST",
          credentials: "same-origin",
          headers: {
            "Content-Type": "application/json",
            Accept: "application/json",
          },
          body: JSON.stringify({
            code,
            userId: userId || undefined,
            pendingAuthenticationToken: pendingAuthenticationToken || undefined,
          }),
        });
        if (!res.ok) {
          const data = (await res.json().catch(() => ({}))) as { error?: string };
          throw new Error(data.error ?? `Verification failed (HTTP ${res.status})`);
        }
        await refresh({ force: true });
        setStage("ok");
        // Brief pause so the user sees the success state, then route on.
        // RootRedirect picks the right next destination based on tenant
        // and onboarding state.
        setTimeout(() => navigate("/", { replace: true }), 800);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Verification failed.");
        setStage("failed");
      }
    })();
  }, [navigate, params, refresh]);

  if (!AUTH_ENABLED) return <Navigate to="/" replace />;
  // Wait for the AuthProvider to settle before deciding what to render —
  // avoids a flash of "verifying" when the user is already signed in.
  if (!isLoaded && stage === "verifying") {
    return (
      <AuthShell eyebrow="Verifying" heading="Confirming your email…">
        <Centered>
          <Loader2 className="size-6 animate-spin text-[var(--ds-muted)]" aria-hidden />
        </Centered>
      </AuthShell>
    );
  }

  if (stage === "verifying") {
    return (
      <AuthShell eyebrow="Verifying" heading="Confirming your email…">
        <Centered>
          <Loader2 className="size-6 animate-spin text-[var(--ds-muted)]" aria-hidden />
        </Centered>
      </AuthShell>
    );
  }

  if (stage === "ok") {
    return (
      <AuthShell eyebrow="Verified" heading="Your email is confirmed.">
        <Centered>
          <CheckCircle2
            className="size-7 text-[var(--ds-green-fg)]"
            aria-hidden
          />
          <p className="mt-3 text-[13.5px] text-[var(--ds-body)]">
            Taking you to your workspace…
          </p>
        </Centered>
      </AuthShell>
    );
  }

  if (stage === "missing") {
    return (
      <AuthShell eyebrow="Verify email" heading="That verification link is incomplete.">
        <p className="text-[13.5px] leading-relaxed text-[var(--ds-body)]">
          The link is missing a verification code. Open the most recent
          verification email and click the button again.
        </p>
        <p className="mt-6 text-center text-[12.5px] text-[var(--ds-body)]">
          <Link to="/sign-in" className="font-semibold text-[var(--ds-ink)] hover:underline">
            ← Back to sign in
          </Link>
        </p>
      </AuthShell>
    );
  }

  // failed
  return (
    <AuthShell eyebrow="Verify email" heading="This verification link has expired.">
      {error && <ErrorAlert message={error} />}
      <p className="mt-4 text-[13.5px] leading-relaxed text-[var(--ds-body)]">
        Sign in to request a new verification email and we’ll send a fresh
        link to your inbox.
      </p>
      <div className="mt-5">
        <Link
          to="/sign-in"
          className="inline-flex items-center justify-center w-full h-[42px] rounded-[var(--ds-r-m)] bg-[var(--ds-accent)] text-[var(--ds-on-accent)] font-medium text-[14px] hover:bg-[var(--ds-accent-hover)] transition"
        >
          Back to sign in
        </Link>
      </div>
    </AuthShell>
  );
}

function Centered({ children }: { children: React.ReactNode }) {
  return (
    <div className="py-6 flex flex-col items-center justify-center text-center">
      {children}
    </div>
  );
}
