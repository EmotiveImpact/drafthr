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
    <main className="min-h-screen lg:grid lg:grid-cols-2 text-[var(--ds-ink)]">
      {/* Left column — image slideshow. Hidden below lg: so phones don't
       * pay for the assets. Sticky to the viewport height so the form
       * column can scroll independently on tall content. */}
      <div className="hidden lg:block lg:sticky lg:top-0 lg:h-screen">
        <SignInSlideshow />
      </div>

      {/* Right column — the existing form. Keeps the soft canvas gradient
       * (so the visual register matches the rest of the auth surface)
       * and centers the card vertically inside its own column. */}
      <div
        className="min-h-screen flex flex-col"
        style={{
          background:
            "radial-gradient(60% 50% at 88% 0%, rgba(10,11,13,0.035), transparent 70%), linear-gradient(180deg, var(--ds-canvas) 0%, #ffffff 60%, var(--ds-canvas) 100%)",
        }}
      >
        {children}
      </div>
    </main>
  );
}
