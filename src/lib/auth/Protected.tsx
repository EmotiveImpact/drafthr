import type { ReactNode } from "react";
import { SignedIn, SignedOut, SignIn } from "@clerk/clerk-react";
import { AUTH_ENABLED, AUTH_MISCONFIGURED } from "./index";

/**
 * Gates a route. Local dev can pass through without auth; production without
 * auth is blocked by AuthProvider before routes render.
 */
export function Protected({ children }: { children: ReactNode }) {
  if (AUTH_MISCONFIGURED) return null;
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
