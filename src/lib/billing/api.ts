/** Client helpers for the billing endpoints (same-origin fetch). */
import type { PriceKey } from "./catalog";

export type BillingStatus = {
  configured: boolean;
  /** Whether the hard paywall is enforced server-side (DRAFTHR_ENFORCE_PAYWALL). */
  enforced: boolean;
  /** Whether the caller may create a new letter right now (mirrors the server gate). */
  canCreateLetter: boolean;
  plan: string | null;
  status: string | null;
  active: boolean;
  credits: number;
  currentPeriodStart: number | null;
  currentPeriodEnd: number | null;
  /** The current monthly allowance window (one month of the year on an annual plan). */
  allowanceStart?: number | null;
  allowanceEnd?: number | null;
  cancelAtPeriodEnd: boolean;
};

/**
 * Open the Stripe Billing Portal for the caller's subscription (change plan,
 * update the card, invoices, cancel). Returns the redirect URL. Workspace plans
 * can only be managed by owners and admins; the server enforces that.
 */
export async function openBillingPortal(
  returnTo: "/settings" | "/pricing" = "/settings",
): Promise<{ ok: true; url: string } | { ok: false; error: string }> {
  try {
    const res = await fetch("/api/marketplace/billing-portal", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ returnTo }),
    });
    const data = (await res.json().catch(() => ({}))) as { url?: string; error?: string };
    if (!res.ok || !data.url) {
      return { ok: false, error: data.error || "Billing isn't available right now. Try again in a minute." };
    }
    return { ok: true, url: data.url };
  } catch {
    return { ok: false, error: "Network error. Please try again." };
  }
}

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
      return {
        ok: false,
        error: data.error || "Checkout isn't available right now, and no payment was taken. Try again in a minute.",
      };
    }
    return { ok: true, url: data.url };
  } catch {
    return { ok: false, error: "Network error. Please try again." };
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
