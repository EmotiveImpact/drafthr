import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { CheckCircle2, Loader2, MailCheck } from "lucide-react";
import { useAuth } from "@/lib/auth";
import { AuthShell, ErrorAlert, PrimaryButton } from "@/routes/sign-in/AuthShell";
import { useConsultantStore } from "@/lib/consultantProfile";
import { SignIn } from "./SignIn";

export function SignUp() { return <SignIn screenHint="sign-up" />; }

// Compatibility for verification links issued before the hosted-login cutover.
export function CheckYourEmail({
  email,
  userId,
  pendingAuthenticationToken = null,
  heading,
  blurb,
}: {
  email: string;
  userId: string | null;
  /** Flow B (sign-in-while-unverified): verify via this token instead of a
   *  userId. Exactly one of userId / pendingAuthenticationToken is set. */
  pendingAuthenticationToken?: string | null;
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
        }),
      });
      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(
          data.error ?? `Verification failed (HTTP ${res.status}). Try again.`,
        );
      }
      const verification = await res.json() as { requiresSignIn?: boolean };
      if (verification.requiresSignIn) {
        navigate("/sign-in?redirect=" + encodeURIComponent(asConsultant ? "/c/profile" : "/"), { replace: true });
        return;
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
        {!userId && !pendingAuthenticationToken && (
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
            "Verify email"
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
