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
  /** Small eyebrow above the heading ("Sign up", "Reset password"). */
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
          {/* Right-column logo. When the page renders inside AuthSplitShell
           * (withSlideshow), the slideshow already carries the brand on the
           * left at lg:+ — so we hide this lockup there to avoid duplicating
           * it. Mobile/tablet (slideshow off) still gets it above the card. */}
          <Link
            to="/"
            aria-label="DraftHR home"
            className={`inline-flex items-center gap-2.5 ${withSlideshow ? "lg:hidden" : ""}`}
          >
            <BrandMark size={48} />
            <Wordmark size={28} />
          </Link>
          <section
            aria-labelledby="auth-heading"
            className={`w-full rounded-[var(--ds-r-xl)] border border-[var(--ds-line)] bg-[var(--ds-surface)] shadow-[var(--ds-shadow-m)] ${withSlideshow ? "lg:border-transparent lg:shadow-none" : ""}`}
          >
          <div className="px-7 pt-8 pb-6 sm:px-9">
            <p className="text-[13px] text-[var(--ds-muted)]">
              {eyebrow}
            </p>
            <h1
              id="auth-heading"
              className="ds-title mt-2 text-[clamp(28px,3.4vw,34px)] leading-[1.12]"
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
          <AuthSecurityNote />
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
    >
      {inner}
    </main>
  );
}

/**
 * Tiny "Authentication by WorkOS: SSO, MFA and SAML ready" line that
 * sits directly below the form card. Used by SignIn / SignUp / the
 * transactional auth pages to reassure users about identity-provider
 * security right next to where they're typing credentials.
 */
export function AuthSecurityNote() {
  return (
    <p className="mt-3 inline-flex items-center gap-1.5 text-[11.5px] text-[var(--ds-muted)]">
      <ShieldCheck className="size-3.5" aria-hidden />
      Authentication by WorkOS: SSO, MFA and SAML ready
    </p>
  );
}

/**
 * Page-bottom footer for the auth surface: legal links on the left,
 * copyright on the right. Stacks vertically on narrow screens.
 */
export function AuthFooter() {
  return (
    <footer className="px-6 pb-6 sm:px-10 sm:pb-8">
      <div className="mx-auto flex max-w-[760px] flex-col items-center justify-center gap-1.5 text-center text-[11.5px] text-[var(--ds-muted)] sm:flex-row sm:items-center sm:justify-between sm:text-left sm:max-w-none">
        <span>&copy; {new Date().getFullYear()} DraftHR. All rights reserved.</span>
        <div className="inline-flex items-center gap-x-3">
          <Link to="/privacy" className="hover:text-[var(--ds-ink)] transition">
            Privacy
          </Link>
          <span aria-hidden className="opacity-60">·</span>
          <Link to="/terms" className="hover:text-[var(--ds-ink)] transition">
            Terms
          </Link>
        </div>
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
        className="block text-[13px] font-medium text-[var(--ds-ink)] mb-1.5"
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
        className="w-full h-[42px] rounded-[var(--ds-r-m)] border border-[var(--ds-line-strong)] bg-[var(--ds-surface)] px-3 text-[14px] text-[var(--ds-ink)] placeholder:text-[var(--ds-subtle)] focus:border-[var(--ds-focus)] focus:outline-none focus:ring-2 focus:ring-[var(--ds-focus)]/15 disabled:opacity-60"
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
      className="w-full inline-flex items-center justify-center gap-2 h-[42px] rounded-[var(--ds-r-m)] bg-[var(--ds-accent)] text-[var(--ds-on-accent)] font-medium text-[14px] hover:bg-[var(--ds-accent-hover)] transition disabled:opacity-60 disabled:hover:bg-[var(--ds-accent)]"
    >
      {children}
    </button>
  );
}
