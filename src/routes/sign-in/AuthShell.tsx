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

import { forwardRef, useState, type ReactNode } from "react";
import { Link } from "react-router-dom";
import { AlertCircle, Check, Eye, EyeOff, ShieldCheck, XCircle } from "lucide-react";
import { Wordmark } from "@/components/ds";
import { AuthSplitShell } from "./AuthSplitShell";
import { cn } from "@/lib/utils";
import { buttonVariants } from "@/components/ui/button";

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
            <Wordmark size={36} />
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
              className={AUTH_HEADING_CLASS}
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
    <div data-page-main
      className="min-h-screen flex flex-col bg-[var(--ds-canvas)] text-[var(--ds-ink)]"
    >
      {inner}
    </div>
  );
}

/**
 * Tiny "Secure sign-in, with single sign-on and two-step verification" line that
 * sits directly below the form card. Used by SignIn / SignUp / the
 * transactional auth pages to reassure users about identity-provider
 * security right next to where they're typing credentials.
 */
export function AuthSecurityNote() {
  return (
    <p className="mt-3 inline-flex items-center gap-1.5 text-[11.5px] text-[var(--ds-muted)]">
      <ShieldCheck className="size-3.5" aria-hidden />
      Secure sign-in, with single sign-on and two-step verification
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

/** Auth page headings: Newsreader, 28px on phones and 32px from tablets up
 * (kit page-title scale for a narrow card). */
export const AUTH_HEADING_CLASS = "ds-title mt-2 text-[28px] leading-[1.12] sm:text-[32px]";

/**
 * The kit text field (kit 04) for the auth pages: hairline border, a darker
 * border on hover, a black border on focus, a red border when invalid, grey
 * fill when disabled. Same look as `@/components/ui/input`, 42px tall.
 */
export const AUTH_INPUT_CLASS =
  "h-[42px] w-full rounded-[10px] border border-[var(--ds-line)] bg-[var(--ds-surface)] px-3 text-[14px] text-[var(--ds-ink)] outline-none transition-[border-color] duration-[120ms] placeholder:text-[var(--ds-subtle)] hover:border-[var(--ds-line-hover)] focus:border-[var(--ds-ink)] aria-invalid:border-[var(--ds-red-line)] aria-invalid:focus:border-[var(--ds-red-fg)] disabled:cursor-not-allowed disabled:bg-[var(--ds-surface-2)] disabled:text-[var(--ds-muted)]";

/** Help text below a field, or the error in red with an alert icon. */
export function FieldMessage({
  id,
  error,
  hint,
}: {
  id: string;
  error?: string | null;
  hint?: string;
}) {
  if (error) {
    return (
      <p id={id} className="mt-1.5 flex items-start gap-1.5 text-[12.5px] leading-snug text-[var(--ds-red-fg)]">
        <AlertCircle className="mt-px size-3.5 shrink-0" aria-hidden />
        {error}
      </p>
    );
  }
  if (hint) {
    return (
      <p id={id} className="mt-1.5 text-[12.5px] leading-snug text-[var(--ds-muted)]">
        {hint}
      </p>
    );
  }
  return null;
}

type TextFieldProps = {
  id: string;
  label: string;
  type?: string;
  value: string;
  onChange: (v: string) => void;
  onBlur?: () => void;
  required?: boolean;
  disabled?: boolean;
  autoComplete?: string;
  inputMode?: React.HTMLAttributes<HTMLInputElement>["inputMode"];
  hint?: string;
  /** Inline error (red border, alert icon, says what to do). */
  error?: string | null;
};

export const TextField = forwardRef<HTMLInputElement, TextFieldProps>(function TextField(
  props,
  ref,
) {
  const msgId = `${props.id}-msg`;
  const hasMsg = !!props.error || !!props.hint;
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
        onBlur={props.onBlur}
        required={props.required}
        disabled={props.disabled}
        aria-invalid={props.error ? true : undefined}
        aria-describedby={hasMsg ? msgId : undefined}
        className={AUTH_INPUT_CLASS}
      />
      <FieldMessage id={msgId} error={props.error} hint={props.hint} />
    </div>
  );
});

type PasswordFieldProps = {
  id: string;
  label: string;
  value: string;
  onChange: (v: string) => void;
  autoComplete?: string;
  disabled?: boolean;
  hint?: string;
  error?: string | null;
  /** Something to show on the right of the label row ("Forgot password?"). */
  aside?: ReactNode;
};

/**
 * Password field with the eye reveal toggle, used by sign in, sign up and
 * reset so every auth page reveals passwords the same way.
 */
export const PasswordField = forwardRef<HTMLInputElement, PasswordFieldProps>(
  function PasswordField(props, ref) {
    const [show, setShow] = useState(false);
    const msgId = `${props.id}-msg`;
    const hasMsg = !!props.error || !!props.hint;
    return (
      <div>
        <div className="mb-1.5 flex items-baseline justify-between gap-3">
          <label htmlFor={props.id} className="block text-[13px] font-medium text-[var(--ds-ink)]">
            {props.label}
          </label>
          {props.aside}
        </div>
        <div className="relative">
          <input
            ref={ref}
            id={props.id}
            type={show ? "text" : "password"}
            autoComplete={props.autoComplete}
            value={props.value}
            onChange={(e) => props.onChange(e.target.value)}
            required
            disabled={props.disabled}
            aria-invalid={props.error ? true : undefined}
            aria-describedby={hasMsg ? msgId : undefined}
            className={cn(AUTH_INPUT_CLASS, "pr-11")}
          />
          <button
            type="button"
            onClick={() => setShow((v) => !v)}
            tabIndex={-1}
            aria-label={show ? "Hide password" : "Show password"}
            aria-pressed={show}
            className="absolute right-1.5 top-1/2 inline-grid size-8 -translate-y-1/2 place-items-center rounded-[8px] text-[var(--ds-muted)] transition-colors duration-[120ms] hover:bg-[var(--ds-surface-2)] hover:text-[var(--ds-ink)]"
          >
            {show ? (
              <EyeOff className="size-[15px]" aria-hidden />
            ) : (
              <Eye className="size-[15px]" aria-hidden />
            )}
          </button>
        </div>
        <FieldMessage id={msgId} error={props.error} hint={props.hint} />
      </div>
    );
  },
);

/** The kit checkbox (kit 04): 18px, 5px corners, black with a white tick
 * when on, the kit focus ring from the keyboard. A real checkbox input. */
export function AuthCheckbox({
  checked,
  onChange,
  disabled,
  children,
  id,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  disabled?: boolean;
  children: ReactNode;
  id?: string;
}) {
  return (
    <label className="flex items-start gap-2.5 text-[12.5px] leading-snug text-[var(--ds-body)] select-none">
      <span className="relative mt-[-1px] inline-grid size-[18px] shrink-0 place-items-center">
        <input
          id={id}
          type="checkbox"
          checked={checked}
          onChange={(e) => onChange(e.target.checked)}
          disabled={disabled}
          className="peer size-[18px] cursor-pointer appearance-none rounded-[5px] border-[1.5px] border-[var(--ds-line-hover)] bg-[var(--ds-surface)] outline-none transition-colors duration-[120ms] hover:border-[var(--ds-faint)] checked:border-[var(--ds-ink)] checked:bg-[var(--ds-ink)] focus-visible:shadow-[var(--ds-focus-ring)] disabled:cursor-not-allowed disabled:opacity-60"
        />
        <Check
          className="pointer-events-none absolute size-3 text-[var(--ds-on-accent)] opacity-0 peer-checked:opacity-100"
          strokeWidth={2.6}
          aria-hidden
        />
      </span>
      <span className="min-w-0">{children}</span>
    </label>
  );
}

/**
 * The kit error alert (kit 09 `.alert.err`): soft red panel, circle-x icon,
 * a medium title saying what failed and a line saying what to do.
 */
export function ErrorAlert({ title = "Something went wrong", message }: { title?: string; message: string }) {
  return (
    <div
      role="alert"
      aria-live="polite"
      className="flex items-start gap-3 rounded-[12px] bg-[var(--ds-red-soft)] px-4 py-3 text-[13.5px] leading-snug"
    >
      <XCircle aria-hidden className="mt-[2px] size-4 shrink-0 text-[var(--ds-red-fg)]" />
      <div className="min-w-0 flex-1">
        <div className="font-medium text-[var(--ds-ink)]">{title}</div>
        <div className="mt-0.5 text-[var(--ds-body)]">{message}</div>
      </div>
    </div>
  );
}

/** A full email address: something@domain.tld. */
export const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** The inline error for an email field (kit 04: says what to do), or null
 * when it looks like a real address. */
export function emailProblem(email: string): string | null {
  const v = email.trim();
  if (!v) return "Enter your email address.";
  if (!EMAIL_RE.test(v)) return "Enter a full email address, like name@company.co.uk.";
  return null;
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
      className={cn(buttonVariants({ size: "lg" }), "w-full")}
    >
      {children}
    </button>
  );
}
