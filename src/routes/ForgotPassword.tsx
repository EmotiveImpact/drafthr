/**
 * /sign-in/forgot-password — kicks the password-reset email flow.
 *
 * Two states: the email-entry form, and a generic "check your email"
 * confirmation. Critically, we ALWAYS switch to the confirmation on
 * success — there's no "no account found" branch. The server returns
 * 200 + generic shape regardless of whether the email exists (anti-
 * enumeration), and the UI mirrors that contract.
 *
 * The user gets a WorkOS-delivered email with a link to
 *   /sign-in/reset-password?token=<one-time-token>
 * which lands on ResetPassword.tsx. (URL is configured in the WorkOS
 * dashboard → Authentication → Emails → Password reset URL.)
 */

import { useEffect, useRef, useState } from "react";
import { Link, Navigate } from "react-router-dom";
import { Loader2, MailCheck } from "lucide-react";
import { AUTH_ENABLED, useAuth } from "@/lib/auth";
import { AuthShell, ErrorAlert, PrimaryButton, TextField } from "@/routes/sign-in/AuthShell";

type Stage = "form" | "sent";

export function ForgotPassword() {
  const { user, isLoaded } = useAuth();
  const [stage, setStage] = useState<Stage>("form");
  const [email, setEmail] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const emailRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    emailRef.current?.focus();
  }, []);

  if (!AUTH_ENABLED) return <Navigate to="/" replace />;
  if (isLoaded && user) return <Navigate to="/" replace />;

  const onSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (submitting) return;
    if (!email.trim()) return;
    setError(null);
    setSubmitting(true);
    try {
      const res = await fetch("/api/auth/password-reset-request", {
        method: "POST",
        credentials: "same-origin",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
        },
        body: JSON.stringify({ email: email.trim() }),
      });
      if (!res.ok) {
        // The server is designed to almost never get here — it returns
        // 200 even when WorkOS errors. The only cases that legitimately
        // 4xx are bad-shape input (invalid email) or rate-limit.
        const data = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(data.error ?? "Couldn't send the reset link. Try again in a minute.");
      }
      setStage("sent");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not send the reset link.");
    } finally {
      setSubmitting(false);
    }
  };

  if (stage === "sent") {
    return (
      <AuthShell eyebrow="Check your email" heading="If that account exists, we sent a link.">
        <div className="mt-1 flex items-start gap-3 rounded-[10px] border border-[var(--ds-line)] bg-[var(--ds-surface-2)]/60 p-4">
          <MailCheck className="mt-0.5 size-5 text-[var(--ds-muted)]" aria-hidden />
          <div className="text-[13.5px] leading-relaxed text-[var(--ds-body)]">
            If <span className="font-semibold text-[var(--ds-ink)]">{email.trim()}</span> matches
            an account, a password-reset link is on its way. The link expires in a few minutes,
            so check your inbox now.
          </div>
        </div>
        <p className="mt-6 text-center text-[12.5px] text-[var(--ds-body)]">
          <Link to="/sign-in" className="font-semibold text-[var(--ds-ink)] hover:underline">
            ← Back to sign in
          </Link>
        </p>
      </AuthShell>
    );
  }

  return (
    <AuthShell
      eyebrow="Forgot password"
      heading="Reset your DraftHR password."
      subheading="Enter the email you signed up with. We’ll email you a single-use reset link."
    >
      <form noValidate onSubmit={onSubmit} className="space-y-3.5">
        <TextField
          ref={emailRef}
          id="email"
          label="Email"
          type="email"
          autoComplete="email"
          inputMode="email"
          value={email}
          onChange={setEmail}
          required
          disabled={submitting}
        />

        {error && <ErrorAlert message={error} />}

        <PrimaryButton disabled={submitting || !email.trim()}>
          {submitting ? (
            <>
              <Loader2 className="size-4 animate-spin" aria-hidden />
              Sending…
            </>
          ) : (
            "Send reset link"
          )}
        </PrimaryButton>
      </form>

      <p className="mt-5 text-center text-[12.5px] text-[var(--ds-body)]">
        Remembered it?{" "}
        <Link to="/sign-in" className="font-semibold text-[var(--ds-ink)] hover:underline">
          Back to sign in
        </Link>
      </p>
    </AuthShell>
  );
}
