/** Client helpers for the billing endpoints (same-origin fetch). */
import type { PriceKey } from "./catalog";

export type BillingStatus = {
  configured: boolean;
  plan: string | null;
  status: string | null;
  active: boolean;
  credits: number;
  currentPeriodStart: number | null;
  currentPeriodEnd: number | null;
  cancelAtPeriodEnd: boolean;
};

/** Start a Stripe-hosted Checkout for a SKU. Returns the redirect URL. */
export async function startBillingCheckout(
  priceKey: PriceKey,
): Promise<{ ok: true; url: string } | { ok: false; error: string }> {
  try {
    const res = await fetch("/api/marketplace/billing-checkout", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ priceKey }),
    });
    const data = (await res.json().catch(() => ({}))) as { url?: string; error?: string };
    if (!res.ok || !data.url) {
      return { ok: false, error: data.error || `Checkout failed (${res.status})` };
    }
    return { ok: true, url: data.url };
  } catch {
    return { ok: false, error: "Network error — please try again." };
  }
}

/** The caller's current billing entitlements, or null on failure. */
export async function getBillingStatus(): Promise<BillingStatus | null> {
  try {
    const res = await fetch("/api/marketplace/billing-status");
    if (!res.ok) return null;
    return (await res.json()) as BillingStatus;
  } catch {
    return null;
  }
}
