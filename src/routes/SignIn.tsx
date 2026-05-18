import { useEffect, useMemo, useRef, useState } from "react";
import { Link, Navigate, useNavigate, useSearchParams } from "react-router-dom";
import { Eye, EyeOff, Loader2, ShieldCheck } from "lucide-react";
import { AUTH_ENABLED, useAuth } from "@/lib/auth";
import { Wordmark } from "@/components/ds/Wordmark";
import { safeInternalRedirect } from "@/routes/AuthCallback";

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
  const [showPassword, setShowPassword] = useState(false);
  const [submitting, setSubmitting] = useState<
    null | "password" | "google" | "microsoft" | "linkedin"
  >(null);
  const [error, setError] = useState<string | null>(null);
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
      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(data.error ?? `Sign-in failed (HTTP ${res.status})`);
      }
      await refresh();
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
        throw new Error(data.error ?? `Could not start sign-in (HTTP ${res.status})`);
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

  return (
    <main
      className="min-h-screen flex flex-col bg-[var(--ds-canvas)] text-[var(--ds-ink)]"
      style={{
        // Subtle off-white wash + a very faint radial highlight in the
        // top-right — keeps the page feeling alive without competing
        // with the card. DraftHR is serious-tone; no gradient drama.
        background:
          "radial-gradient(60% 50% at 88% 0%, rgba(10,11,13,0.035), transparent 70%), linear-gradient(180deg, var(--ds-canvas) 0%, #ffffff 60%, var(--ds-canvas) 100%)",
      }}
    >
      <header className="px-6 pt-6 sm:px-10 sm:pt-8">
        <Link to="/" aria-label="DraftHR home" className="inline-flex items-center gap-2">
          <Wordmark size={22} />
        </Link>
      </header>

      <div className="flex-1 grid place-items-center px-4 py-10 sm:py-14">
        <section
          aria-labelledby="signin-heading"
          className="w-full max-w-[440px] rounded-[14px] border border-[var(--ds-line)] bg-[var(--ds-surface)] shadow-[0_1px_2px_rgba(10,11,13,0.04),0_24px_60px_-30px_rgba(10,11,13,0.18)]"
        >
          <div className="px-7 pt-8 pb-6 sm:px-9">
            <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[var(--ds-muted)]">
              Sign in
            </p>
            <h1
              id="signin-heading"
              className="mt-2 text-[var(--ds-ink)] font-semibold"
              style={{
                fontSize: "clamp(22px, 3vw, 26px)",
                lineHeight: 1.15,
                letterSpacing: "-0.018em",
              }}
            >
              Sign in to draft tribunal-grade HR letters.
            </h1>
            <p className="mt-2 text-[13.5px] leading-relaxed text-[var(--ds-body)]">
              Pick up where you left off — your drafts, matters, and audit
              chain are waiting.
            </p>
          </div>

          <div className="px-7 sm:px-9 pb-7 sm:pb-8">
            {/* Social providers — same OAuth shim as the legacy hosted
             * page, just with the provider preselected so the user
             * skips the WorkOS picker. */}
            <div className="grid grid-cols-1 gap-2">
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
              <Field
                id="email"
                label="Email"
                type="email"
                autoComplete="email"
                inputMode="email"
                value={email}
                onChange={setEmail}
                ref={emailRef}
                required
                disabled={isBusy}
              />
              <div>
                <div className="flex items-baseline justify-between mb-1.5">
                  <label
                    htmlFor="password"
                    className="block text-[12px] font-semibold tracking-[0.01em] text-[var(--ds-ink)]"
                  >
                    Password
                  </label>
                  <Link
                    to="/sign-in/forgot-password"
                    className="text-[11.5px] font-semibold text-[var(--ds-muted)] hover:text-[var(--ds-ink)] transition"
                  >
                    Forgot password?
                  </Link>
                </div>
                <div className="relative">
                  <input
                    id="password"
                    type={showPassword ? "text" : "password"}
                    autoComplete="current-password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                    disabled={isBusy}
                    className="w-full h-[40px] rounded-[8px] border border-[var(--ds-line)] bg-white pl-3 pr-10 text-[14px] text-[var(--ds-ink)] placeholder:text-[var(--ds-subtle)] focus:border-[var(--ds-ink)] focus:outline-none focus:ring-2 focus:ring-[var(--ds-ink)]/10 disabled:opacity-60"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword((v) => !v)}
                    tabIndex={-1}
                    aria-label={showPassword ? "Hide password" : "Show password"}
                    aria-pressed={showPassword}
                    className="absolute right-1.5 top-1/2 -translate-y-1/2 inline-grid place-items-center w-8 h-8 rounded-[6px] text-[var(--ds-muted)] hover:text-[var(--ds-ink)] hover:bg-[var(--ds-surface-2)] transition"
                  >
                    {showPassword ? (
                      <EyeOff className="size-[15px]" aria-hidden />
                    ) : (
                      <Eye className="size-[15px]" aria-hidden />
                    )}
                  </button>
                </div>
              </div>

              {error && (
                <div
                  role="alert"
                  aria-live="polite"
                  className="rounded-[8px] border border-[var(--ds-red-bg)] bg-[var(--ds-red-bg)]/40 px-3 py-2.5 text-[12.5px] leading-snug text-[var(--ds-red-fg)]"
                >
                  {error}
                </div>
              )}

              <button
                type="submit"
                disabled={isBusy}
                className="w-full inline-flex items-center justify-center gap-2 h-[42px] rounded-[9px] bg-[var(--ds-ink)] text-white font-semibold text-[13.5px] shadow-sm hover:-translate-y-px hover:shadow-md transition disabled:opacity-60 disabled:hover:translate-y-0 disabled:hover:shadow-sm"
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
      </div>

      <footer className="px-6 sm:px-10 pb-6 sm:pb-8 text-[11.5px] text-[var(--ds-muted)] flex flex-wrap items-center gap-x-4 gap-y-1.5">
        <span className="inline-flex items-center gap-1.5">
          <ShieldCheck className="size-3.5" aria-hidden />
          Authentication by WorkOS — SSO, MFA, and SAML ready
        </span>
        <span className="opacity-60">·</span>
        <Link to="/privacy" className="hover:text-[var(--ds-ink)] transition">
          Privacy
        </Link>
      </footer>
    </main>
  );
}

/* ─── Form primitives ─────────────────────────────────────────────────── */

type FieldProps = {
  id: string;
  label: string;
  type?: string;
  value: string;
  onChange: (v: string) => void;
  required?: boolean;
  disabled?: boolean;
  autoComplete?: string;
  inputMode?: React.HTMLAttributes<HTMLInputElement>["inputMode"];
};

const Field = ({
  ref,
  ...props
}: FieldProps & { ref?: React.Ref<HTMLInputElement> }) => (
  <div>
    <label
      htmlFor={props.id}
      className="block text-[12px] font-semibold tracking-[0.01em] text-[var(--ds-ink)] mb-1.5"
    >
      {props.label}
    </label>
    <input
      ref={ref}
      id={props.id}
      type={props.type ?? "text"}
      autoComplete={props.autoComplete}
      inputMode={props.inputMode}
      value={props.value}
      onChange={(e) => props.onChange(e.target.value)}
      required={props.required}
      disabled={props.disabled}
      className="w-full h-[40px] rounded-[8px] border border-[var(--ds-line)] bg-white px-3 text-[14px] text-[var(--ds-ink)] placeholder:text-[var(--ds-subtle)] focus:border-[var(--ds-ink)] focus:outline-none focus:ring-2 focus:ring-[var(--ds-ink)]/10 disabled:opacity-60"
    />
  </div>
);

function Divider({ label }: { label: string }) {
  return (
    <div className="my-5 flex items-center gap-3" aria-hidden>
      <span className="flex-1 h-px bg-[var(--ds-line)]" />
      <span className="text-[10.5px] font-semibold uppercase tracking-[0.14em] text-[var(--ds-muted)]">
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
  const label =
    provider === "google"
      ? "Continue with Google"
      : provider === "microsoft"
      ? "Continue with Microsoft"
      : "Continue with LinkedIn";
  const Glyph =
    provider === "google" ? GoogleGlyph : provider === "microsoft" ? MicrosoftGlyph : LinkedInGlyph;
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      className="w-full inline-flex items-center justify-center gap-2.5 h-[42px] rounded-[9px] border border-[var(--ds-line)] bg-white text-[var(--ds-ink)] font-semibold text-[13px] hover:border-[var(--ds-subtle)] hover:bg-[var(--ds-surface-2)] transition disabled:opacity-60 disabled:hover:bg-white disabled:hover:border-[var(--ds-line)]"
    >
      {busy ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <Glyph />}
      {label}
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
