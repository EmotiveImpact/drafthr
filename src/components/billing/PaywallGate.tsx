import type { ReactNode } from "react";
import { Navigate } from "react-router-dom";
import { usePaywall } from "@/lib/billing/usePaywall";

/**
 * Wraps new-letter creation routes to make the hard paywall airtight in this
 * local-first app. When the paywall is enforced (DRAFTHR_ENFORCE_PAYWALL) and
 * the user isn't entitled, redirect to /pricing BEFORE any drafting happens —
 * the client counterpart to the server gate at draft-create.
 *
 * Fails OPEN: `blocked` is false while loading and on any status-fetch failure,
 * so the common case (paywall off) renders instantly with no delay, and a
 * billing outage can never lock people out of the editor. The server remains
 * the authority on the actual write.
 */
export function PaywallGate({ children }: { children: ReactNode }) {
  const { blocked } = usePaywall();
  if (blocked) return <Navigate to="/pricing?gate=1" replace />;
  return <>{children}</>;
}
