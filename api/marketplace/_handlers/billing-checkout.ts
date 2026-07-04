/**
 * /api/marketplace/billing-checkout — start a Stripe-hosted Checkout for a
 * DraftHR SKU (subscription plan or one-off letter/pack/credits). DIRECT
 * charge (DraftHR is the merchant) — not the marketplace's Connect flow.
 *
 * POST { priceKey } → { url } to redirect the browser to.
 *
 * HR plans (starter/pro/business) bill the workspace; Employee Plus and all
 * one-offs bill the user. The session metadata carries {purpose:"billing", …}
 * so billing-webhook can mirror the result back without a lookup table.
 */
import { enforceSameOrigin, jsonError, readJsonRequest } from "../../_utils/request.js";
import { rateLimit } from "../../_utils/rate-limit.js";
import { requireSessionAndTenant } from "../../_utils/session-with-tenant.js";
import { getStripe, appBaseUrl } from "../../_utils/stripe.js";
import { getOrCreateCustomer } from "../../_utils/stripe-billing.js";
import { catalogFor, isPriceKey, stripePriceId, type PriceKey } from "../../../src/lib/billing/catalog.js";

export const config = { runtime: "nodejs" };

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
  });
}

/** HR plans bill the workspace; Employee Plus + one-offs bill the user. */
export function subjectTypeFor(priceKey: PriceKey): "tenant" | "user" {
  const e = catalogFor(priceKey);
  if (e.kind === "plan") return e.plan === "employee_plus" ? "user" : "tenant";
  return "user";
}

export async function POST(req: Request): Promise<Response> {
  const sameOrigin = enforceSameOrigin(req);
  if (sameOrigin) return sameOrigin;
  const limited = rateLimit(req, { name: "billing-checkout", max: 30, windowMs: 60_000 });
  if (limited) return limited;

  const stripe = getStripe();
  if (!stripe) return jsonError("Payments are not configured", 503);

  const auth = await requireSessionAndTenant(req);
  if (!auth.ok) return auth.response;

  const parsed = await readJsonRequest<{ priceKey?: string }>(req);
  if (!parsed.ok) return parsed.response;
  const priceKey = parsed.body.priceKey;
  if (!isPriceKey(priceKey)) return jsonError("Unknown priceKey", 400);

  const entry = catalogFor(priceKey);
  const priceId = stripePriceId(priceKey);
  if (!priceId) return jsonError("This item isn't available for purchase yet", 503);

  const subjectType = subjectTypeFor(priceKey);
  const subjectId = subjectType === "tenant" ? auth.activeTenant?.id : auth.userRow.id;
  if (!subjectId) return jsonError("No active workspace for this plan", 412);

  const meta = {
    purpose: "billing",
    priceKey,
    subjectType,
    subjectId,
    userId: auth.userRow.id,
    ...(entry.plan ? { plan: entry.plan } : {}),
  };

  try {
    const customerId = await getOrCreateCustomer(subjectType, subjectId, auth.userRow.email ?? null);
    const base = appBaseUrl(req);
    const session = await stripe.checkout.sessions.create({
      mode: entry.mode,
      customer: customerId,
      line_items: [{ price: priceId, quantity: 1 }],
      success_url: `${base}/billing?status=success&sku=${priceKey}`,
      cancel_url: `${base}/pricing?status=cancelled`,
      metadata: meta,
      ...(entry.mode === "subscription"
        ? { subscription_data: { metadata: meta } }
        : { payment_intent_data: { metadata: meta } }),
    });
    return json({ url: session.url });
  } catch (err) {
    console.error("[billing-checkout] failed", err);
    return jsonError("Could not start checkout", 502);
  }
}
