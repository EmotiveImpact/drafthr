/**
 * Stripe client factory. Returns null when STRIPE_SECRET_KEY is unset so the
 * marketplace degrades cleanly to "payments off" (request-based booking) — the
 * deployed app is unaffected until the owner configures keys. The secret key is
 * read ONLY here, server-side; it never reaches the client.
 *
 * Activation (owner): set STRIPE_SECRET_KEY (server) + VITE_STRIPE_PUBLISHABLE_KEY
 * (client) + STRIPE_WEBHOOK_SECRET, and apply migration 0012. See
 * docs/PRODUCTION-ACTIVATION.md.
 */
import Stripe from "stripe";

let cached: Stripe | null = null;

export function getStripe(): Stripe | null {
  const key = process.env.STRIPE_SECRET_KEY?.trim();
  if (!key) return null;
  // Reuse one client across warm invocations. The SDK pins its own API version.
  if (!cached) cached = new Stripe(key, { maxNetworkRetries: 2 });
  return cached;
}

export function stripeConfigured(): boolean {
  return Boolean(process.env.STRIPE_SECRET_KEY?.trim());
}

/** Optional platform fee in basis points (e.g. 1500 = 15%). Default 0 — the
 *  full booking amount goes to the consultant. Owner sets the business policy. */
export function platformFeeBps(): number {
  const raw = Number(process.env.STRIPE_PLATFORM_FEE_BPS ?? "0");
  return Number.isFinite(raw) && raw >= 0 && raw <= 10_000 ? Math.round(raw) : 0;
}

/** Where Stripe redirects back to after Checkout / Connect onboarding. */
export function appBaseUrl(req: Request): string {
  const env = process.env.APP_BASE_URL?.trim();
  if (env) return env.replace(/\/$/, "");
  // Fall back to the request origin (same-origin redirects only).
  try {
    return new URL(req.url).origin;
  } catch {
    return "https://app.drafthr.io";
  }
}
