import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import { BrandMark, Wordmark } from "@/components/ds";

/**
 * Chromeless wrapper used by public legal pages (/privacy, /terms). Mirrors
 * the visual register of the auth-shell pages: same BrandMark + Wordmark
 * lockup as /sign-in, same DraftHR token palette.
 *
 * Auth chrome (sidebar, topbar) is suppressed for the matching prefixes in
 * Layout.tsx (CHROMELESS_PREFIXES) so this component is responsible for the
 * entire visual shell of the page: top header bar, page content, and footer.
 */
export function PublicLegalShell({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle?: ReactNode;
  children: ReactNode;
}) {
  const year = new Date().getFullYear();

  return (
    <div className="min-h-screen flex flex-col bg-[var(--ds-canvas)]">
      {/* Top bar: real brand lockup on the left, sign-in escape on the
       * right. Border-bottom separates it from the long-form content
       * below without being visually noisy. */}
      <header>
        <div className="mx-auto flex max-w-[1080px] items-center justify-between gap-4 px-4 py-5 sm:px-8">
          <Link
            to="/"
            aria-label="DraftHR home"
            className="inline-flex items-center gap-2.5 hover:opacity-80 transition-opacity"
          >
            <BrandMark size={30} />
            <Wordmark size={20} />
          </Link>
          {/* Proper button (outlined, padded) rather than a text link.
           * Sign-in is the secondary action on this page (visitors came
           * to read the policy, not to authenticate) so we keep the
           * outlined variant rather than the heavy black primary CTA. */}
          <Link
            to="/sign-in"
            className="inline-flex h-9 items-center rounded-[var(--ds-r-m)] border border-[var(--ds-line-strong)] bg-[var(--ds-surface)] px-3.5 text-[13px] font-medium text-[var(--ds-ink)] transition hover:bg-[var(--ds-surface-2)]"
          >
            Sign in
          </Link>
        </div>
      </header>

      {/* Narrow reading column on the cool grey ground, 10A serif title. */}
      <div className="mx-auto w-full max-w-[720px] flex-1 px-4 pb-8 pt-8 sm:px-8 sm:pt-14">
        <h1 className="ds-title m-0 text-[clamp(34px,5vw,46px)] leading-[1.08]">{title}</h1>
        {subtitle ? (
          <p className="m-0 mb-10 mt-3 text-[14.5px] leading-relaxed text-[var(--ds-muted)]">
            {subtitle}
          </p>
        ) : null}
        {children}
      </div>

      {/* Polished two-row footer:
       *  Row 1: brand lockup + tagline on the left, link nav on the right.
       *  Row 2: copyright line, separated by a hairline rule.
       * Stacks on mobile (single column, left-aligned) and lays out
       * horizontally on sm+. */}
      <footer className="mt-12 border-t border-[var(--ds-line)]">
        <div className="mx-auto max-w-[1080px] px-4 py-8 sm:px-8">
          <div className="flex flex-col gap-6 sm:flex-row sm:items-start sm:justify-between sm:gap-10">
            <div className="flex flex-col gap-2">
              <Link
                to="/"
                aria-label="DraftHR home"
                className="inline-flex items-center gap-2.5 self-start hover:opacity-80 transition-opacity"
              >
                <BrandMark size={28} />
                <Wordmark size={18} />
              </Link>
              <p className="text-[12px] leading-relaxed text-[var(--ds-muted)] max-w-[260px]">
                AI-assisted HR letter drafting for the UK and US.
                Tribunal-grade, legally aware and audit-defensible.
              </p>
            </div>

            <nav
              aria-label="Footer"
              className="grid grid-cols-2 gap-x-10 gap-y-2 text-[12.5px] sm:flex sm:items-start sm:gap-x-8"
            >
              <Link
                to="/privacy"
                className="text-[var(--ds-body)] hover:text-[var(--ds-ink)] transition-colors"
              >
                Privacy
              </Link>
              <Link
                to="/terms"
                className="text-[var(--ds-body)] hover:text-[var(--ds-ink)] transition-colors"
              >
                Terms
              </Link>
              <Link
                to="/sign-in"
                className="text-[var(--ds-body)] hover:text-[var(--ds-ink)] transition-colors"
              >
                Sign in
              </Link>
              <a
                href="mailto:privacy@drafthr.io"
                className="text-[var(--ds-body)] hover:text-[var(--ds-ink)] transition-colors"
              >
                privacy@drafthr.io
              </a>
            </nav>
          </div>

          <div className="mt-8 border-t border-[var(--ds-line)] pt-4 text-[11.5px] text-[var(--ds-muted)]">
            © {year} DraftHR. All rights reserved.
          </div>
        </div>
      </footer>
    </div>
  );
}
