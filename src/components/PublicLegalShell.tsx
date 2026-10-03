import type { ReactNode } from "react";
import { Box, Heading, Text } from "@radix-ui/themes";
import { Link } from "react-router-dom";
import { BrandMark, Wordmark } from "@/components/ds";

/**
 * Chromeless wrapper used by public legal pages (/privacy, /terms). Mirrors
 * the visual register of the auth-shell pages — same BrandMark + Wordmark
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
      <header className="border-b border-[var(--ds-line)] bg-[var(--ds-surface)]">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-3.5 flex items-center justify-between gap-4">
          <Link
            to="/"
            aria-label="DraftHR home"
            className="inline-flex items-center gap-2.5 hover:opacity-80 transition-opacity"
          >
            <BrandMark size={36} />
            <Wordmark size={22} />
          </Link>
          {/* Proper button (outlined, padded) rather than a text link.
           * Sign-in is the secondary action on this page (visitors came
           * to read the policy, not to authenticate) so we keep the
           * outlined variant rather than the heavy black primary CTA. */}
          <Link
            to="/sign-in"
            className="inline-flex items-center gap-1.5 h-9 px-3.5 rounded-[8px] border border-[var(--ds-line)] bg-white text-[12.5px] font-semibold text-[var(--ds-ink)] shadow-[0_1px_2px_rgba(10,11,13,0.04)] hover:border-[var(--ds-subtle)] hover:bg-[var(--ds-surface-2)] transition"
          >
            Sign in
            <span aria-hidden className="text-[var(--ds-muted)]">→</span>
          </Link>
        </div>
      </header>

      <Box className="max-w-5xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-8 sm:py-10 lg:py-12 flex-1">
        <Heading size="7" mb="2">
          {title}
        </Heading>
        {subtitle ? (
          <Text size="2" color="gray" mb="6" as="p">
            {subtitle}
          </Text>
        ) : null}
        {children}
      </Box>

      {/* Polished two-row footer:
       *  Row 1 — brand lockup + tagline on the left, link nav on the right.
       *  Row 2 — copyright line, separated by a hairline rule.
       * Stacks on mobile (single column, left-aligned) and lays out
       * horizontally on sm+. */}
      <footer className="border-t border-[var(--ds-line)] bg-[var(--ds-surface)] mt-12">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
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
                Draft, review and keep a record of your correspondence.
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
                Contact
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
