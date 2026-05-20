/**
 * Shared visual shell for the /sign-in/* family of pages.
 *
 * Pulls out the chrome (canvas, header wordmark, card, footer) so SignIn,
 * SignUp, ForgotPassword, ResetPassword, and VerifyEmail all render with
 * the same visual register without duplicating 60 lines of markup five
 * times. The form primitives live here too so the typography + spacing
 * stay locked across the family.
 *
 * The SignIn.tsx page predates this shell and inlines its own copies of
 * Field / Divider / SocialButton — we deliberately don't migrate that
 * page right now to avoid spreading the wave's blast radius. The look
 * matches because the same Tailwind classes / DS tokens are used in both.
 */

import { forwardRef, type ReactNode } from "react";
import { Link } from "react-router-dom";
import { ShieldCheck } from "lucide-react";
import { BrandMark, Wordmark } from "@/components/ds";
import { AuthSplitShell } from "./AuthSplitShell";

type AuthShellProps = {
  /** Tiny uppercase eyebrow above the heading ("Sign up", "Reset password"). */
  eyebrow: string;
  /** Main h1 — should fit ~one line on mobile. */
  heading: string;
  /** One-paragraph supporting copy. */
  subheading?: string;
  /**
   * Wrap the page in the two-column AuthSplitShell on lg: and up (with the
   * brand slideshow in the left column). Off by default — only `/sign-in`
   * and `/sign-in/signup` use it. Transactional auth pages
   * (forgot-password, reset-password, verify-email) stay on the single-
   * column centered layout.
   */
  withSlideshow?: boolean;
  children: ReactNode;
};

export function AuthShell({
  eyebrow,
  heading,
  subheading,
  withSlideshow = false,
  children,
}: AuthShellProps) {
  const inner = (
    <>
      {/* Logo + card grouped vertically, centered on the page. The logo
       * sits directly above the card so the brand is visually attached
       * to the form rather than floating up at the top of the viewport. */}
      <div className="flex-1 grid place-items-center px-4 py-10 sm:py-14">
        <div className="flex w-full max-w-[440px] flex-col items-center gap-6 sm:gap-7">
          <Link to="/" aria-label="DraftHR home" className="inline-flex items-center gap-2.5">
            <BrandMark size={48} />
            <Wordmark size={28} />
          </Link>
          <section
            aria-labelledby="auth-heading"
            className="w-full rounded-[14px] border border-[var(--ds-line)] bg-[var(--ds-surface)] shadow-[0_1px_2px_rgba(10,11,13,0.04),0_24px_60px_-30px_rgba(10,11,13,0.18)]"
          >
          <div className="px-7 pt-8 pb-6 sm:px-9">
            <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[var(--ds-muted)]">
              {eyebrow}
            </p>
            <h1
              id="auth-heading"
              className="mt-2 text-[var(--ds-ink)] font-semibold"
              style={{
                fontSize: "clamp(22px, 3vw, 26px)",
                lineHeight: 1.15,
                letterSpacing: 0,
              }}
            >
              {heading}
            </h1>
            {subheading && (
              <p className="mt-2 text-[13.5px] leading-relaxed text-[var(--ds-body)]">
                {subheading}
              </p>
            )}
          </div>

          <div className="px-7 sm:px-9 pb-7 sm:pb-8">{children}</div>
        </section>
        </div>
      </div>

      <AuthFooter />
    </>
  );

  if (withSlideshow) {
    return <AuthSplitShell>{inner}</AuthSplitShell>;
  }
  return (
    <main
      className="min-h-screen flex flex-col bg-[var(--ds-canvas)] text-[var(--ds-ink)]"
      style={{
        background:
          "radial-gradient(60% 50% at 88% 0%, rgba(10,11,13,0.035), transparent 70%), linear-gradient(180deg, var(--ds-canvas) 0%, #ffffff 60%, var(--ds-canvas) 100%)",
      }}
    >
      {inner}
    </main>
  );
}

export function AuthFooter() {
  return (
    <footer className="px-6 pb-6 sm:px-10 sm:pb-8">
      <div className="mx-auto flex max-w-[760px] flex-col items-center justify-center gap-1.5 text-center text-[11.5px] text-[var(--ds-muted)] sm:flex-row sm:flex-wrap sm:gap-x-3">
        <span className="inline-flex items-center gap-1.5">
          <ShieldCheck className="size-3.5" aria-hidden />
          Authentication by WorkOS — SSO, MFA, and SAML ready
        </span>
        <span className="hidden opacity-60 sm:inline">·</span>
        <Link to="/privacy" className="hover:text-[var(--ds-ink)] transition">
          Privacy
        </Link>
        <span className="hidden opacity-60 sm:inline">·</span>
        <span>&copy; {new Date().getFullYear()} DraftHR. All rights reserved.</span>
      </div>
    </footer>
  );
}

/* ─── Form primitives ─────────────────────────────────────────────────── */

type TextFieldProps = {
  id: string;
  label: string;
  type?: string;
  value: string;
  onChange: (v: string) => void;
  required?: boolean;
  disabled?: boolean;
  autoComplete?: string;
  inputMode?: React.HTMLAttributes<HTMLInputElement>["inputMode"];
  hint?: string;
};

export const TextField = forwardRef<HTMLInputElement, TextFieldProps>(function TextField(
  props,
  ref,
) {
  return (
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
      {props.hint && (
        <p className="mt-1 text-[11.5px] text-[var(--ds-muted)] leading-snug">{props.hint}</p>
      )}
    </div>
  );
});

export function ErrorAlert({ message }: { message: string }) {
  return (
    <div
      role="alert"
      aria-live="polite"
      className="rounded-[8px] border border-[var(--ds-red-bg)] bg-[var(--ds-red-bg)]/40 px-3 py-2.5 text-[12.5px] leading-snug text-[var(--ds-red-fg)]"
    >
      {message}
    </div>
  );
}

export function PrimaryButton({
  children,
  disabled,
  type = "submit",
  onClick,
}: {
  children: ReactNode;
  disabled?: boolean;
  type?: "submit" | "button";
  onClick?: () => void;
}) {
  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      className="w-full inline-flex items-center justify-center gap-2 h-[42px] rounded-[9px] bg-[var(--ds-ink)] text-white font-semibold text-[13.5px] shadow-sm hover:-translate-y-px hover:shadow-md transition disabled:opacity-60 disabled:hover:translate-y-0 disabled:hover:shadow-sm"
    >
      {children}
    </button>
  );
}
