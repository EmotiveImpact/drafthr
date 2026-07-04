/**
 * /api/marketplace/billing-status — the caller's resolved billing entitlements
 * (plan, status, credit balance). Drives the client paywall/plan UX. GET only.
 */
import { requireSessionAndTenant } from "../../_utils/session-with-tenant.js";
import { stripeConfigured } from "../../_utils/stripe.js";
import { resolveEntitlements } from "../../_utils/entitlements.js";

export const config = { runtime: "nodejs" };

export async function GET(req: Request): Promise<Response> {
  const auth = await requireSessionAndTenant(req);
  if (!auth.ok) return auth.response;

  const ent = await resolveEntitlements(auth.activeTenant?.id ?? null, auth.userRow.id);
  return new Response(JSON.stringify({ configured: stripeConfigured(), ...ent }), {
    status: 200,
    headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
  });
}
