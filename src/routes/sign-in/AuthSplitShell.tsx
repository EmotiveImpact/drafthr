import type { ReactNode } from "react";
import { SignInSlideshow } from "./SignInSlideshow";

/**
 * Two-column shell for /sign-in and /sign-in/signup.
 *
 * On large screens (lg: ≥1024px) splits the viewport 50/50 — slideshow on
 * the left, form column on the right. Below lg: the slideshow column is
 * display:none and the form column renders full-width with the existing
 * single-column gradient (so phones see exactly the same layout they see
 * today).
 *
 * Consumers pass the existing logo + card + footer JSX as `children` and
 * this component handles the outer geometry. Form internals stay where
 * they live today.
 */
export function AuthSplitShell({ children }: { children: ReactNode }) {
  return (
    <div data-page-main className="min-h-screen lg:grid lg:grid-cols-2 text-[var(--ds-ink)]">
      {/* Left column: the photo slideshow (or the letter cards, see SignInSlideshow).
       * Hidden below lg:. Sticky to the viewport height so the form column
       * can scroll independently on tall content. */}
      <div className="hidden lg:block lg:sticky lg:top-0 lg:h-screen">
        <SignInSlideshow />
      </div>

      {/* Right column: the form. White on lg: (the card sits flat on it),
       * warm off-white with a white card on smaller screens. */}
      <div className="min-h-screen flex flex-col bg-[var(--ds-canvas)] lg:border-l lg:border-[var(--ds-line)] lg:bg-[var(--ds-surface)]">
        {children}
      </div>
    </div>
  );
}
