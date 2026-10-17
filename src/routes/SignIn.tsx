import { useEffect, useMemo, useRef, useState } from "react";
import { Link, Navigate, useNavigate, useSearchParams } from "react-router-dom";
import { Loader2 } from "lucide-react";
import { AUTH_ENABLED, useAuth } from "@/lib/auth";
import { Wordmark } from "@/components/ds";
import { safeInternalRedirect } from "@/routes/AuthCallback";
import {
  AUTH_HEADING_CLASS,
  AuthFooter,
  AuthSecurityNote,
  ErrorAlert,
  PasswordField,
  TextField,
  emailProblem,
} from "@/routes/sign-in/AuthShell";
import { AuthSplitShell } from "@/routes/sign-in/AuthSplitShell";
import { CheckYourEmail } from "@/routes/SignUp";

/**
 * /sign-in — the in-app, DraftHR-branded sign-in page.
 *
 * This page is the Tier 2 / "Build your own UI" pattern: the form lives
 * on our origin (app.drafthr.io), but the credentials never live in our
 * code. The password path POSTs to /api/auth/password which calls
 * WorkOS userManagement.authenticateWithPassword server-side. The
 * "Continue with Google / Microsoft" buttons hit /api/auth/url?provider=...
 * which mints a WorkOS authorization URL and bounces the browser through
 * the IdP — that path comes back to /auth/callback, identical to the
 * legacy hosted-login flow.
 *
 * Either way, the same iron-session cookie is set, the same /api/auth/*
 * handlers run, and the rest of the app can't tell which sign-in path
 * was used.
 *
 * Why a custom page (not the AuthKit hosted page)?
 *   • Tribunal-grade material lives behind this login — the first
 *     impression should be DraftHR, not a third-party domain.
 *   • Future SSO buttons / SAML connections still flow through the same
 *     /api/auth/url shim — we don't have to re-platform when we add them.
 *
 * Why not the @workos-inc/authkit-react components?
 *   • That SDK is provider + hook only — its `signIn()` redirects to the
 *     hosted page, which is exactly what we're trying to replace. There
 *     is no `<SignIn />` form component to drop in (as of v0.16.x).
 */
export function SignIn() {
  const navigate = useNavigate();
  const { user, isLoaded, refresh } = useAuth();
  const [params] = useSearchParams();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState<
    null | "password" | "google" | "microsoft" | "linkedin"
  >(null);
  const [error, setError] = useState<string | null>(null);
  // Inline field errors (kit 04), shown after a submit attempt or when the
  // email field is left with something that is not an address.
  const [emailError, setEmailError] = useState<string | null>(null);
  const [passwordError, setPasswordError] = useState<string | null>(null);
  // Set when sign-in succeeds on credentials but the email isn't verified yet
  // (WorkOS email_verification_required). Carries the pending token so the
  // code-entry screen can finish via Flow B instead of dead-ending the user.
  const [pendingVerify, setPendingVerify] = useState<{
    email: string;
    token: string;
  } | null>(null);
  const emailRef = useRef<HTMLInputElement>(null);

  // Where to go after a successful sign-in. Validated to be same-origin
  // by safeInternalRedirect; falls back to "/" so RootRedirect can pick
  // the right destination (workspace setup / mode picker / home).
  const redirectTo = useMemo(
    () => safeInternalRedirect(params.get("redirect")) ?? "/",
    [params],
  );

  // Auto-focus the email field on mount — every keystroke saved matters
  // on a login page.
  useEffect(() => {
    emailRef.current?.focus();
  }, []);

  // If the user is already signed in, skip the form entirely. This also
  // handles the case where someone hits /sign-in from a deep link with
  // a live session in another tab.
  if (!AUTH_ENABLED) return <Navigate to="/" replace />;
  if (isLoaded && user) return <Navigate to={redirectTo} replace />;

  const onPassword = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (submitting) return;
    setError(null);
    const badEmail = emailProblem(email);
    const badPassword = password ? null : "Enter your password.";
    setEmailError(badEmail);
    setPasswordError(badPassword);
    if (badEmail || badPassword) {
      if (badEmail) emailRef.current?.focus();
      return;
    }
    setSubmitting("password");
    try {
      const res = await fetch("/api/auth/password", {
        method: "POST",
        credentials: "same-origin",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
        },
        body: JSON.stringify({ email: email.trim(), password }),
      });
      // Detect "wrong dev server" first — plain `npm run dev` only mounts
      // /api/draft + /api/agent via the qwen-proxy plugin, so /api/auth/*
      // falls through to the SPA's HTML 404. JSON.parse on HTML would
      // throw a cryptic "Unexpected token" message; this guard makes the
      // failure actionable.
      const contentType = res.headers.get("content-type") ?? "";
      if (!contentType.toLowerCase().includes("application/json")) {
        throw new Error(
          "Sign-in API didn't respond with JSON. If you're running `npm run dev` " +
            "locally, switch to `vercel dev` so /api/auth/* is served. " +
            "If you're on production, please report this. It shouldn't happen.",
        );
      }
      const data = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        error?: string;
        status?: string;
        pendingAuthenticationToken?: string;
      };
      if (!res.ok) {
        throw new Error(data.error ?? "Sign-in didn't work. Check your email and password, then try again.");
      }
      // Credentials were correct but the inbox isn't verified yet — hand off to
      // the code-entry screen (Flow B) rather than treating it as a failure.
      if (
        data.status === "email_verification_required" &&
        data.pendingAuthenticationToken
      ) {
        setPendingVerify({
          email: email.trim(),
          token: data.pendingAuthenticationToken,
        });
        setSubmitting(null);
        return;
      }
      await refresh({ force: true });
      navigate(redirectTo, { replace: true });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Sign-in failed.");
      setSubmitting(null);
    }
  };

  const onSocial = async (
    provider: "GoogleOAuth" | "MicrosoftOAuth" | "LinkedInOAuth",
  ) => {
    if (submitting) return;
    setError(null);
    setSubmitting(
      provider === "GoogleOAuth"
        ? "google"
        : provider === "MicrosoftOAuth"
        ? "microsoft"
        : "linkedin",
    );
    try {
      const res = await fetch(`/api/auth/url?provider=${provider}`, {
        credentials: "same-origin",
        headers: { Accept: "application/json" },
      });
      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(data.error ?? "Couldn't start sign-in with that provider. Try again, or use your email.");
      }
      const { url } = (await res.json()) as { url: string };
      // Stash the post-callback redirect target so AuthCallback can pick
      // it up after the OAuth dance. sessionStorage is the same channel
      // JoinInvite already uses — keeps the redirect surface small.
      if (redirectTo && redirectTo !== "/") {
        try {
          sessionStorage.setItem("drafthr_post_signin_redirect", redirectTo);
        } catch {
          /* private mode etc — fall through, user just lands at / */
        }
      }
      window.location.assign(url);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not start sign-in.");
      setSubmitting(null);
    }
  };

  const isBusy = submitting !== null;

  // Unverified-account hand-off: same 6-digit code UI as sign-up, but finishing
  // via the pending-authentication token (Flow B) so the user lands signed in.
  if (pendingVerify) {
    return (
      <CheckYourEmail
        email={pendingVerify.email}
        userId={null}
        pendingAuthenticationToken={pendingVerify.token}
        heading="Confirm your email to continue."
        blurb="Your email isn't verified yet."
      />
    );
  }

  return (
    <AuthSplitShell>
      {/* Logo + card stacked together, centered on the page. On lg: and up
       * AuthSplitShell renders the slideshow in the left column; the logo
       * still appears above the card on the right side for brand continuity
       * with the transactional pages. Below lg: the page reverts to the
       * single-column centered layout that's been in place since launch. */}
      <div className="flex-1 grid place-items-center px-4 py-10 sm:py-14">
        <div className="flex w-full max-w-[440px] flex-col items-center gap-6 sm:gap-7">
          {/* Right-column logo. Hidden on lg: because the slideshow on
           * the left already carries the brand — having it twice on the
           * same screen is visual noise. Mobile/tablet (slideshow off)
           * still shows it above the card. */}
          <Link to="/" aria-label="DraftHR home" className="inline-flex items-center gap-2.5 lg:hidden">
            <Wordmark size={36} />
          </Link>
          <section
            aria-labelledby="signin-heading"
            className="w-full rounded-[var(--ds-r-xl)] border border-[var(--ds-line)] bg-[var(--ds-surface)] shadow-[var(--ds-shadow-m)] lg:border-transparent lg:shadow-none"
        >
          <div className="px-7 pt-8 pb-6 sm:px-9">
            <p className="text-[13px] text-[var(--ds-muted)]">
              Sign in
            </p>
            <h1
              id="signin-heading"
              className={AUTH_HEADING_CLASS}
            >
              Sign in to draft tribunal-grade HR letters.
            </h1>
            <p className="mt-2 text-[13.5px] leading-relaxed text-[var(--ds-body)]">
              Pick up where you left off. Your drafts, matters and audit
              chain are waiting.
            </p>
          </div>

          <div className="px-7 sm:px-9 pb-7 sm:pb-8">
            {/* Social providers — same OAuth shim as the legacy hosted
             * page, just with the provider preselected so the user
             * skips the WorkOS picker. 3-up grid keeps them compact;
             * full "Continue with X" label lives in aria-label / title
             * for screen readers + hover tooltips. */}
            <div className="grid grid-cols-3 gap-2">
              <SocialButton
                provider="google"
                onClick={() => void onSocial("GoogleOAuth")}
                busy={submitting === "google"}
                disabled={isBusy}
              />
              <SocialButton
                provider="microsoft"
                onClick={() => void onSocial("MicrosoftOAuth")}
                busy={submitting === "microsoft"}
                disabled={isBusy}
              />
              <SocialButton
                provider="linkedin"
                onClick={() => void onSocial("LinkedInOAuth")}
                busy={submitting === "linkedin"}
                disabled={isBusy}
              />
            </div>

            <Divider label="or continue with email" />

            <form noValidate onSubmit={onPassword} className="space-y-3.5">
              <TextField
                id="email"
                label="Email"
                type="email"
                autoComplete="email"
                inputMode="email"
                value={email}
                onChange={(v) => {
                  setEmail(v);
                  // Clear the error as soon as the address is fixed.
                  if (emailError && !emailProblem(v)) setEmailError(null);
                }}
                onBlur={() => {
                  if (email.trim()) setEmailError(emailProblem(email));
                }}
                ref={emailRef}
                required
                disabled={isBusy}
                error={emailError}
              />
              <PasswordField
                id="password"
                label="Password"
                autoComplete="current-password"
                value={password}
                onChange={(v) => {
                  setPassword(v);
                  if (v) setPasswordError(null);
                }}
                disabled={isBusy}
                error={passwordError}
                aside={
                  <Link
                    to="/sign-in/forgot-password"
                    className="text-[12.5px] text-[var(--ds-muted)] underline-offset-2 hover:text-[var(--ds-ink)] hover:underline transition"
                  >
                    Forgot password?
                  </Link>
                }
              />

              {error && <ErrorAlert title="Couldn't sign you in" message={error} />}

              <button
                type="submit"
                disabled={isBusy}
                className="w-full inline-flex items-center justify-center gap-2 h-[42px] rounded-[var(--ds-r-m)] bg-[var(--ds-accent)] text-[var(--ds-on-accent)] font-medium text-[14px] hover:bg-[var(--ds-accent-hover)] transition disabled:opacity-60 disabled:hover:bg-[var(--ds-accent)]"
              >
                {submitting === "password" ? (
                  <>
                    <Loader2 className="size-4 animate-spin" aria-hidden />
                    Signing in…
                  </>
                ) : (
                  "Sign in"
                )}
              </button>
            </form>

            <p className="mt-5 text-center text-[12.5px] text-[var(--ds-body)]">
              New to DraftHR?{" "}
              <Link
                to="/sign-in/signup"
                className="font-semibold text-[var(--ds-ink)] hover:underline"
              >
                Create an account
              </Link>
            </p>
          </div>
        </section>
          <AuthSecurityNote />
        </div>
      </div>

      <AuthFooter />
    </AuthSplitShell>
  );
}

/* ─── Form primitives ─────────────────────────────────────────────────── */

function Divider({ label }: { label: string }) {
  return (
    <div className="my-5 flex items-center gap-3" aria-hidden>
      <span className="flex-1 h-px bg-[var(--ds-line)]" />
      <span className="text-[12px] text-[var(--ds-muted)]">
        {label}
      </span>
      <span className="flex-1 h-px bg-[var(--ds-line)]" />
    </div>
  );
}

function SocialButton({
  provider,
  onClick,
  busy,
  disabled,
}: {
  provider: "google" | "microsoft" | "linkedin";
  onClick: () => void;
  busy: boolean;
  disabled: boolean;
}) {
  // Visible short label keeps brand recognisable in the 3-column layout;
  // aria-label + title retain the full "Continue with X" intent for screen
  // readers and hover tooltips.
  const ariaLabel =
    provider === "google"
      ? "Continue with Google"
      : provider === "microsoft"
      ? "Continue with Microsoft"
      : "Continue with LinkedIn";
  const shortLabel =
    provider === "google" ? "Google" : provider === "microsoft" ? "Microsoft" : "LinkedIn";
  const Glyph =
    provider === "google" ? GoogleGlyph : provider === "microsoft" ? MicrosoftGlyph : LinkedInGlyph;
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={ariaLabel}
      title={ariaLabel}
      className="w-full inline-flex items-center justify-center gap-1.5 h-[40px] rounded-[var(--ds-r-m)] border border-[var(--ds-line-strong)] bg-[var(--ds-surface)] text-[var(--ds-ink)] font-medium text-[12.5px] hover:border-[var(--ds-subtle)] hover:bg-[var(--ds-surface-2)] transition disabled:opacity-60 disabled:hover:bg-[var(--ds-surface)] disabled:hover:border-[var(--ds-line)]"
    >
      {busy ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <Glyph />}
      <span className="truncate">{shortLabel}</span>
    </button>
  );
}

function GoogleGlyph() {
  // Official-style multi-color "G" — small enough to render crisply at
  // 16px without taxing the bundle (inline SVG, no asset round-trip).
  return (
    <svg width="16" height="16" viewBox="0 0 18 18" aria-hidden focusable="false">
      <path
        fill="#4285F4"
        d="M17.64 9.2c0-.637-.057-1.251-.164-1.84H9v3.481h4.844a4.14 4.14 0 0 1-1.796 2.717v2.258h2.908c1.702-1.567 2.684-3.874 2.684-6.615Z"
      />
      <path
        fill="#34A853"
        d="M9 18c2.43 0 4.467-.806 5.956-2.184l-2.908-2.258c-.806.54-1.837.86-3.048.86-2.344 0-4.328-1.584-5.036-3.711H.957v2.332A8.997 8.997 0 0 0 9 18Z"
      />
      <path
        fill="#FBBC05"
        d="M3.964 10.707A5.41 5.41 0 0 1 3.682 9c0-.593.102-1.17.282-1.707V4.961H.957A8.997 8.997 0 0 0 0 9c0 1.452.348 2.827.957 4.039l3.007-2.332Z"
      />
      <path
        fill="#EA4335"
        d="M9 3.58c1.321 0 2.508.455 3.44 1.346l2.582-2.58C13.463.891 11.426 0 9 0A8.997 8.997 0 0 0 .957 4.961l3.007 2.332C4.672 5.166 6.656 3.58 9 3.58Z"
      />
    </svg>
  );
}

function MicrosoftGlyph() {
  // The four-square Microsoft mark. Same rationale as Google: inline,
  // 16px, zero bundle hit.
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden focusable="false">
      <rect x="0" y="0" width="7.5" height="7.5" fill="#F25022" />
      <rect x="8.5" y="0" width="7.5" height="7.5" fill="#7FBA00" />
      <rect x="0" y="8.5" width="7.5" height="7.5" fill="#00A4EF" />
      <rect x="8.5" y="8.5" width="7.5" height="7.5" fill="#FFB900" />
    </svg>
  );
}

function LinkedInGlyph() {
  // LinkedIn "in" mark on the brand blue. Inline, 16px, zero bundle hit.
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" aria-hidden focusable="false">
      <rect width="24" height="24" rx="3" fill="#0A66C2" />
      <path
        fill="#fff"
        d="M7.06 9.5h2.84v9H7.06v-9Zm1.42-4.04a1.65 1.65 0 1 1 0 3.3 1.65 1.65 0 0 1 0-3.3ZM11.6 9.5h2.72v1.23h.04c.38-.72 1.31-1.48 2.7-1.48 2.88 0 3.41 1.9 3.41 4.36V18.5h-2.84v-4.4c0-1.05-.02-2.4-1.46-2.4-1.47 0-1.7 1.15-1.7 2.33V18.5H11.6v-9Z"
      />
    </svg>
  );
}
