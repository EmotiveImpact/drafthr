/**
 * /sign-in/reset-password?token=... — landing page from the WorkOS-sent
 * reset email.
 *
 * Flow:
 *   1. We pluck `token` from the URL. If missing, we explain and link
 *      back to the request page.
 *   2. The user enters a new password (twice).
 *   3. POST /api/auth/password-reset-confirm { token, password }.
 *   4. On success the server mints an iron-session cookie (the user
 *      already proved control of the inbox), we refresh the AuthProvider,
 *      and bounce to "/" — RootRedirect then routes based on tenant /
 *      onboarding state.
 *   5. On expired/invalid token we surface a "request a new link" CTA.
 */

import { useEffect, useMemo, useRef, useState } from "react";
import { Link, Navigate, useNavigate, useSearchParams } from "react-router-dom";
import { Loader2 } from "lucide-react";
import { AUTH_ENABLED, useAuth } from "@/lib/auth";
import { AuthShell, ErrorAlert, PasswordField, PrimaryButton } from "@/routes/sign-in/AuthShell";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export function ResetPassword() {
  const navigate = useNavigate();
  const { user, isLoaded, refresh } = useAuth();
  const [params] = useSearchParams();
  const token = useMemo(() => (params.get("token") ?? "").trim(), [params]);

  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const passwordRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    passwordRef.current?.focus();
  }, []);

  if (!AUTH_ENABLED) return <Navigate to="/" replace />;
  if (isLoaded && user) return <Navigate to="/" replace />;

  // No token in URL — the user hit this page directly somehow. Send them
  // back to the request flow rather than show an empty form.
  if (!token) {
    return (
      <AuthShell eyebrow="Reset password" heading="That reset link is invalid.">
        <p className="text-[13.5px] leading-relaxed text-[var(--ds-body)]">
          The reset link is missing or malformed. Request a new one to continue.
        </p>
        <div className="mt-5">
          <Link
            to="/sign-in/forgot-password"
            className={cn(buttonVariants({ size: "lg" }), "w-full")}
          >
            Request a new reset link
          </Link>
        </div>
        <p className="mt-5 text-center text-[12.5px] text-[var(--ds-body)]">
          <Link to="/sign-in" className="font-semibold text-[var(--ds-ink)] hover:underline">
            ← Back to sign in
          </Link>
        </p>
      </AuthShell>
    );
  }

  const passwordTooShort = password.length > 0 && password.length < 8;
  const passwordsMismatch = confirm.length > 0 && password !== confirm;
  const canSubmit =
    !submitting && password.length >= 8 && password === confirm;

  const onSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!canSubmit) return;
    setError(null);
    setSubmitting(true);
    try {
      const res = await fetch("/api/auth/password-reset-confirm", {
        method: "POST",
        credentials: "same-origin",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
        },
        body: JSON.stringify({ token, password }),
      });
      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(data.error ?? "Couldn't update your password. Request a new reset link and try again.");
      }
      // Session minted server-side; pull it into the provider before
      // navigating so RootRedirect sees the user and routes correctly.
      await refresh({ force: true });
      navigate("/", { replace: true });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not reset your password.");
      setSubmitting(false);
    }
  };

  return (
    <AuthShell
      eyebrow="Reset password"
      heading="Set a new DraftHR password."
      subheading="Choose something you don’t use elsewhere. At least 8 characters."
    >
      <form noValidate onSubmit={onSubmit} className="space-y-3.5">
        <PasswordField
          id="password"
          label="New password"
          autoComplete="new-password"
          value={password}
          onChange={setPassword}
          disabled={submitting}
          ref={passwordRef}
          error={passwordTooShort ? "Use at least 8 characters." : null}
        />
        <PasswordField
          id="confirm"
          label="Confirm new password"
          autoComplete="new-password"
          value={confirm}
          onChange={setConfirm}
          disabled={submitting}
          error={passwordsMismatch ? "Passwords don’t match." : null}
        />

        {error && <ErrorAlert title="Couldn't reset your password" message={error} />}

        <PrimaryButton disabled={!canSubmit}>
          {submitting ? (
            <>
              <Loader2 className="size-4 animate-spin" aria-hidden />
              Updating password…
            </>
          ) : (
            "Update password and sign in"
          )}
        </PrimaryButton>
      </form>

      <p className="mt-5 text-center text-[12.5px] text-[var(--ds-body)]">
        <Link to="/sign-in" className="font-semibold text-[var(--ds-ink)] hover:underline">
          ← Back to sign in
        </Link>
      </p>
    </AuthShell>
  );
}
