import type { ReactNode } from "react";
import { SignedIn, SignedOut, SignIn } from "@clerk/clerk-react";
import { AUTH_ENABLED } from "./index";

/**
 * Gates a route. If auth is disabled (no Clerk key configured), passes through.
 * If auth is enabled, requires a signed-in user; otherwise shows the Clerk
 * sign-in component.
 */
export function Protected({ children }: { children: ReactNode }) {
  if (!AUTH_ENABLED) return <>{children}</>;
  return (
    <>
      <SignedIn>{children}</SignedIn>
      <SignedOut>
        <div className="mx-auto max-w-md py-16 px-6">
          <SignIn routing="virtual" />
        </div>
      </SignedOut>
    </>
  );
}
