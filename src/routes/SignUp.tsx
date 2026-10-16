/**
 * /sign-in/signup — DraftHR-branded self-serve sign-up.
 *
 * UX states:
 *   1. The form (email / first+last name / password / confirm / terms).
 *   2. The "check your email" confirmation, with a resend button.
 *
 * Server contract:
 *   POST /api/auth/sign-up { email, password, firstName, lastName }
 *     → 200 { ok: true, requiresVerification: true }
 *     → 4xx { error: string } (validation errors are user-visible verbatim)
 *
 * Anti-user-enumeration: the server returns the same 200 / requiresVerification
 * shape whether the email is new or already exists. So we ALWAYS switch
 * to the "check your email" screen on success — never show a "this email
 * is already taken" branch (would turn this into an existence oracle).
 *
 * Why we do NOT mint a session here: WorkOS rejects authenticateWithPassword
 * for unverified users, so a session before verification would render an
 * "auth/no auth" inconsistency. The user gates on the email loop.
 */

import { useEffect, useMemo, useRef, useState } from "react";
import { Link, Navigate, useNavigate, useSearchParams } from "react-router-dom";
import { CheckCircle2, Loader2, MailCheck } from "lucide-react";
import { AUTH_ENABLED, useAuth } from "@/lib/auth";
import { AuthShell, ErrorAlert, PrimaryButton, TextField } from "@/routes/sign-in/AuthShell";
import { AuthDivider, SocialAuthButtons } from "@/routes/sign-in/SocialAuthButtons";
import { useConsultantStore } from "@/lib/consultantProfile";

type SignUpStage = "form" | "verify";

export function SignUp() {
  const { user, isLoaded } = useAuth();
  const [stage, setStage] = useState<SignUpStage>("form");
  const [email, setEmail] = useState("");
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [agree, setAgree] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Captured from the sign-up response so we can verify the 6-digit code
  // WorkOS emails. Null when the response was the verified-already branch
  // (anti-enumeration). In that case we show a "try signing in" hint
  // instead of a useless code input.
  const [pendingUserId, setPendingUserId] = useState<string | null>(null);
  const emailRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    emailRef.current?.focus();
  }, []);

  // Auth disabled (public-demo build) — route past sign-up. Same gate
  // SignIn uses; keeps demo deployments from showing a non-functional form.
  if (!AUTH_ENABLED) return <Navigate to="/" replace />;
  // Already signed in — RootRedirect picks the right destination.
  if (isLoaded && user) return <Navigate to="/" replace />;

  // Minimum password rule mirrors the server's floor (8 chars). WorkOS
  // enforces the policy that actually counts; we just stop empty submits.
  const passwordTooShort = password.length > 0 && password.length < 8;
  const passwordsMismatch = confirm.length > 0 && password !== confirm;
  const canSubmit =
    !submitting &&
    !!email.trim() &&
    !!firstName.trim() &&
    !!lastName.trim() &&
    password.length >= 8 &&
    password === confirm &&
    agree;

  const onSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!canSubmit) return;
    setError(null);
    setSubmitting(true);
    try {
      const res = await fetch("/api/auth/sign-up", {
        method: "POST",
        credentials: "same-origin",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
        },
        body: JSON.stringify({
          email: email.trim(),
          password,
          firstName: firstName.trim(),
          lastName: lastName.trim(),
        }),
      });
      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(data.error ?? `Sign-up failed (HTTP ${res.status})`);
      }
      // Success path is always the same — even for an existing email
      // (server anti-enumerates). userId is present for new + unverified-
      // duplicate accounts (we resend for both); absent for the verified-
      // already branch (the verify form will show a "try signing in" hint
      // instead).
      const data = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        userId?: string | null;
      };
      setPendingUserId(typeof data.userId === "string" ? data.userId : null);
      setStage("verify");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Sign-up failed.");
    } finally {
      setSubmitting(false);
    }
  };

  if (stage === "verify") {
    return <CheckYourEmail email={email.trim()} userId={pendingUserId} password={password} />;
  }

  return (
    <AuthShell
      eyebrow="Sign up"
      heading="Create your DraftHR account."
      subheading="Start drafting tribunal-grade letters in minutes. Free while you’re evaluating."
      withSlideshow
    >
      {/* Social sign-up — same OAuth shim as /sign-in. Going through Google,
       * Microsoft, or LinkedIn skips the email-verification step entirely
       * because the IdP already verified the address. */}
      <SocialAuthButtons onError={(message) => setError(message)} externallyBusy={submitting} />

      <AuthDivider label="or create one with email" />

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

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
          <TextField
            id="firstName"
            label="First name"
            autoComplete="given-name"
            value={firstName}
            onChange={setFirstName}
            required
            disabled={submitting}
          />
          <TextField
            id="lastName"
            label="Last name"
            autoComplete="family-name"
            value={lastName}
            onChange={setLastName}
            required
            disabled={submitting}
          />
        </div>

        <PasswordField
          id="password"
          label="Password"
          value={password}
          onChange={setPassword}
          autoComplete="new-password"
          disabled={submitting}
          hint="At least 12 characters recommended."
          showError={passwordTooShort}
          errorText="At least 8 characters."
        />
        <PasswordField
          id="confirm"
          label="Confirm password"
          value={confirm}
          onChange={setConfirm}
          autoComplete="new-password"
          disabled={submitting}
          showError={passwordsMismatch}
          errorText="Passwords don’t match."
        />

        <label className="mt-1 flex items-start gap-2.5 text-[12.5px] leading-snug text-[var(--ds-body)] select-none">
          <input
            type="checkbox"
            checked={agree}
            onChange={(e) => setAgree(e.target.checked)}
            disabled={submitting}
            className="mt-[2px] size-[15px] rounded-[4px] border border-[var(--ds-line)] text-[var(--ds-ink)] focus:ring-[var(--ds-ink)]/30"
          />
          <span>
            I agree to the{" "}
            <Link to="/terms" className="font-semibold text-[var(--ds-ink)] hover:underline">
              Terms
            </Link>{" "}
            and{" "}
            <Link to="/privacy" className="font-semibold text-[var(--ds-ink)] hover:underline">
              Privacy Policy
            </Link>
            .
          </span>
        </label>

        {error && <ErrorAlert message={error} />}

        <PrimaryButton disabled={!canSubmit}>
          {submitting ? (
            <>
              <Loader2 className="size-4 animate-spin" aria-hidden />
              Creating account…
            </>
          ) : (
            "Create account"
          )}
        </PrimaryButton>
      </form>

      <p className="mt-5 text-center text-[12.5px] text-[var(--ds-body)]">
        Already have an account?{" "}
        <Link to="/sign-in" className="font-semibold text-[var(--ds-ink)] hover:underline">
          Sign in
        </Link>
      </p>
    </AuthShell>
  );
}

/* ─── Password field (with reveal toggle + inline error) ──────────────── */

function PasswordField({
  id,
  label,
  value,
  onChange,
  autoComplete,
  disabled,
  hint,
  showError,
  errorText,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (v: string) => void;
  autoComplete?: string;
  disabled?: boolean;
  hint?: string;
  showError?: boolean;
  errorText?: string;
}) {
  const [show, setShow] = useState(false);
  return (
    <div>
      <label
        htmlFor={id}
        className="block text-[12px] font-semibold tracking-[0.01em] text-[var(--ds-ink)] mb-1.5"
      >
        {label}
      </label>
      <div className="relative">
        <input
          id={id}
          type={show ? "text" : "password"}
          autoComplete={autoComplete}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          required
          disabled={disabled}
          className="w-full h-[40px] rounded-[8px] border border-[var(--ds-line)] bg-white pl-3 pr-16 text-[14px] text-[var(--ds-ink)] placeholder:text-[var(--ds-subtle)] focus:border-[var(--ds-ink)] focus:outline-none focus:ring-2 focus:ring-[var(--ds-ink)]/10 disabled:opacity-60"
        />
        <button
          type="button"
          onClick={() => setShow((v) => !v)}
          tabIndex={-1}
          aria-pressed={show}
          aria-label={show ? "Hide password" : "Show password"}
          className="absolute right-2 top-1/2 -translate-y-1/2 text-[11px] font-semibold uppercase tracking-[0.08em] text-[var(--ds-muted)] hover:text-[var(--ds-ink)] transition"
        >
          {show ? "Hide" : "Show"}
        </button>
      </div>
      {showError && errorText ? (
        <p className="mt-1 text-[11.5px] leading-snug text-[var(--ds-red-fg)]">{errorText}</p>
      ) : hint ? (
        <p className="mt-1 text-[11.5px] leading-snug text-[var(--ds-muted)]">{hint}</p>
      ) : null}
    </div>
  );
}

/* ─── "Check your email" screen with 6-digit OTP entry ─────────────────── */

export function CheckYourEmail({
  email,
  userId,
  pendingAuthenticationToken = null,
  password,
  heading,
  blurb,
}: {
  email: string;
  userId: string | null;
  /** Flow B (sign-in-while-unverified): verify via this token instead of a
   *  userId. Exactly one of userId / pendingAuthenticationToken is set. */
  pendingAuthenticationToken?: string | null;
  /** Flow A: the password from the sign-up form. The server sets it once the
   *  code is accepted, because a repeat sign-up for an unverified address
   *  replaces that account's password with a random one. */
  password?: string;
  /** Optional copy overrides so the sign-in entry point can reword the screen. */
  heading?: string;
  blurb?: string;
}) {
  const navigate = useNavigate();
  const { refresh } = useAuth();
  const [params] = useSearchParams();
  const enrolConsultant = useConsultantStore((s) => s.enrol);
  // ?as=consultant carried over from the marketing site's "Join the
  // marketplace" CTA — pre-enrols the user and routes them to consultant
  // onboarding instead of the HR/Employee picker after verification.
  const asConsultant = params.get("as") === "consultant";
  const [code, setCode] = useState("");
  const [verifying, setVerifying] = useState(false);
  const [verifyError, setVerifyError] = useState<string | null>(null);
  const [resendState, setResendState] = useState<"idle" | "sending" | "sent" | "error">("idle");
  const [resendError, setResendError] = useState<string | null>(null);
  const codeRef = useRef<HTMLInputElement>(null);

  // Display-friendly email — preserves user-typed casing but trims.
  const displayEmail = useMemo(() => email, [email]);

  // Auto-focus the code field on mount — the user just came from their
  // inbox holding a 6-digit number; we want zero friction between
  // pasting / typing and submitting.
  useEffect(() => {
    codeRef.current?.focus();
  }, []);

  const normalisedCode = code.replace(/\D/g, "").slice(0, 6);
  // Need a verification context — either a userId (Flow A, post-sign-up) or a
  // pendingAuthenticationToken (Flow B, sign-in-while-unverified). Without
  // either, /api/auth/verify-email 400s; disable the form and point at sign-in.
  const hasContext = !!userId || !!pendingAuthenticationToken;
  const canVerify = !verifying && normalisedCode.length === 6 && hasContext;

  const onVerify = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!canVerify) return;
    setVerifyError(null);
    setVerifying(true);
    try {
      const res = await fetch("/api/auth/verify-email", {
        method: "POST",
        credentials: "same-origin",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
        },
        body: JSON.stringify({
          code: normalisedCode,
          userId: userId || undefined,
          pendingAuthenticationToken: pendingAuthenticationToken || undefined,
          password: userId && password ? password : undefined,
        }),
      });
      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(
          data.error ?? `Verification failed (HTTP ${res.status}). Try again.`,
        );
      }
      // verify-email mints the iron-session cookie on success. Refresh
      // the auth context so the next render sees the signed-in user,
      // then bounce to / — RootRedirect handles whether to show
      // /signup/workspace (no tenant yet) or /hr or /me.
      await refresh({ force: true });
      if (asConsultant) {
        // Skip the HR/Employee picker entirely — the user explicitly
        // came in via the "Join the marketplace" door, so drop them
        // on the consultant profile form.
        enrolConsultant();
        navigate("/c/profile", { replace: true });
        return;
      }
      navigate("/", { replace: true });
    } catch (err) {
      setVerifyError(err instanceof Error ? err.message : "Verification failed.");
    } finally {
      setVerifying(false);
    }
  };

  const onResend = async () => {
    if (resendState === "sending") return;
    setResendError(null);
    setResendState("sending");
    try {
      const res = await fetch("/api/auth/resend-verification", {
        method: "POST",
        credentials: "same-origin",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
        },
        body: JSON.stringify({ email }),
      });
      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(data.error ?? `Could not resend (HTTP ${res.status})`);
      }
      setResendState("sent");
    } catch (err) {
      setResendError(err instanceof Error ? err.message : "Could not resend the email.");
      setResendState("error");
    }
  };

  return (
    <AuthShell eyebrow="Check your email" heading={heading ?? "Verify your email."}>
      <div className="mt-1 flex items-start gap-3 rounded-[10px] border border-[var(--ds-line)] bg-[var(--ds-surface-2)]/60 p-4">
        <MailCheck className="mt-0.5 size-5 text-[var(--ds-muted)]" aria-hidden />
        <div className="text-[13.5px] leading-relaxed text-[var(--ds-body)]">
          {blurb ? (
            <>{blurb} </>
          ) : null}
          We sent a 6-digit code to{" "}
          <span className="font-semibold text-[var(--ds-ink)]">{displayEmail}</span>. Enter
          it below — the code expires in 10 minutes.
        </div>
      </div>

      <form noValidate onSubmit={onVerify} className="mt-5 space-y-3.5">
        <div>
          <label
            htmlFor="verification-code"
            className="block text-[12px] font-semibold tracking-[0.01em] text-[var(--ds-ink)] mb-1.5"
          >
            Verification code
          </label>
          <input
            ref={codeRef}
            id="verification-code"
            type="text"
            inputMode="numeric"
            autoComplete="one-time-code"
            pattern="\d{6}"
            maxLength={6}
            value={code}
            onChange={(e) => setCode(e.target.value)}
            disabled={verifying}
            placeholder="000000"
            className="w-full h-[44px] rounded-[8px] border border-[var(--ds-line)] bg-white px-3 text-center font-mono text-[20px] tracking-[0.4em] text-[var(--ds-ink)] placeholder:text-[var(--ds-subtle)] focus:border-[var(--ds-ink)] focus:outline-none focus:ring-2 focus:ring-[var(--ds-ink)]/10 disabled:opacity-60"
          />
        </div>

        {verifyError && <ErrorAlert message={verifyError} />}
        {!userId && (
          <ErrorAlert
            message="If you already have an account, sign in instead — no new code was sent."
          />
        )}

        <PrimaryButton disabled={!canVerify}>
          {verifying ? (
            <>
              <Loader2 className="size-4 animate-spin" aria-hidden />
              Verifying…
            </>
          ) : (
            "Verify and sign in"
          )}
        </PrimaryButton>
      </form>

      <div className="mt-4">
        <button
          type="button"
          onClick={() => void onResend()}
          disabled={resendState === "sending"}
          className="w-full inline-flex items-center justify-center gap-2 h-[36px] rounded-[8px] border border-[var(--ds-line)] bg-white text-[var(--ds-ink)] font-medium text-[12.5px] hover:border-[var(--ds-subtle)] hover:bg-[var(--ds-surface-2)] transition disabled:opacity-60"
        >
          {resendState === "sending" && (
            <Loader2 className="size-4 animate-spin" aria-hidden />
          )}
          {resendState === "sent" && (
            <CheckCircle2 className="size-4 text-[var(--ds-green-fg)]" aria-hidden />
          )}
          {resendState === "sent"
            ? "Sent — check your inbox"
            : resendState === "sending"
              ? "Sending…"
              : "Didn't get a code? Resend"}
        </button>
        {resendError && (
          <div className="mt-2">
            <ErrorAlert message={resendError} />
          </div>
        )}
      </div>

      <p className="mt-6 text-center text-[12.5px] text-[var(--ds-body)]">
        <Link to="/sign-in" className="font-semibold text-[var(--ds-ink)] hover:underline">
          ← Back to sign in
        </Link>
      </p>
    </AuthShell>
  );
}
