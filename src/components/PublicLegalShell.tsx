import type { ReactNode } from "react";
import { Box, Heading, Text } from "@radix-ui/themes";
import { Link } from "react-router-dom";

/**
 * Chromeless wrapper used by public legal pages (/privacy, /terms). Mirrors
 * the shell that was previously inlined in Privacy.tsx so the two pages stay
 * visually identical and share a single header / footer.
 *
 * Auth chrome (sidebar, topbar) is suppressed for the matching prefixes in
 * Layout.tsx (CHROMELESS_PREFIXES) so this component is responsible for the
 * entire visual shell of the page.
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
  return (
    <div className="min-h-screen flex flex-col bg-[var(--ds-canvas)]">
      <header className="border-b border-[var(--ds-line)] bg-[var(--ds-surface)]">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 py-3 flex items-center justify-between">
          <Link
            to="/"
            className="flex items-center gap-2 text-[var(--ds-ink)] hover:opacity-80 transition-opacity"
          >
            <span className="flex h-8 w-8 items-center justify-center rounded bg-[var(--ds-ink)] text-[var(--ds-surface)] text-sm font-bold">
              D
            </span>
            <span className="text-sm font-semibold tracking-tight">DraftHR</span>
          </Link>
          <Link
            to="/sign-in"
            className="text-xs font-medium text-[var(--ds-muted)] hover:text-[var(--ds-ink)] transition-colors"
          >
            Sign in →
          </Link>
        </div>
      </header>

      <Box className="max-w-5xl w-full mx-auto px-4 py-6 sm:px-6 sm:py-8 flex-1">
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

      <footer className="border-t border-[var(--ds-line)] bg-[var(--ds-surface)] mt-8">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 py-4 flex items-center justify-between text-xs text-[var(--ds-muted)]">
          <span>© DraftHR</span>
          <Link
            to="/sign-in"
            className="hover:text-[var(--ds-ink)] transition-colors"
          >
            Back to sign in
          </Link>
        </div>
      </footer>
    </div>
  );
}
