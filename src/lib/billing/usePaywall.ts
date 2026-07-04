import { useEffect, useState } from "react";
import { getBillingStatus, type BillingStatus } from "./api";

export type PaywallState = {
  loading: boolean;
  status: BillingStatus | null;
  /**
   * True only once we KNOW the paywall is enforced AND the caller can't create a
   * letter. Starts false (during load / on fetch failure) so we fail OPEN — a
   * status-fetch hiccup never locks the UI, and the server-side gate at
   * draft-create stays the authority regardless.
   */
  blocked: boolean;
};

export function usePaywall(): PaywallState {
  const [status, setStatus] = useState<BillingStatus | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    void getBillingStatus().then((s) => {
      if (cancelled) return;
      setStatus(s);
      setLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const blocked = Boolean(status?.enforced && !status.canCreateLetter);
  return { loading, status, blocked };
}
