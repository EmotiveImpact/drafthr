/**
 * /api/marketplace/billing-status — the caller's resolved billing entitlements
 * (plan, status, credit balance). Drives the client paywall/plan UX. GET only.
 */
import { requireSessionAndTenant } from "../../_utils/session-with-tenant.js";
import { stripeConfigured } from "../../_utils/stripe.js";
import { resolveEntitlements, assertCanCreateLetter } from "../../_utils/entitlements.js";

export const config = { runtime: "nodejs" };

export async function GET(req: Request): Promise<Response> {
  const auth = await requireSessionAndTenant(req);
  if (!auth.ok) return auth.response;

  const tenantId = auth.activeTenant?.id ?? null;
  const ent = await resolveEntitlements(tenantId, auth.userRow.id);
  // Mirror the server-side create gate so the client can render an airtight
  // paywall (block the new-letter UI) — and tell it whether enforcement is on
  // at all, so it never gates when the paywall is off. assertCanCreateLetter
  // does NOT consume anything (that only happens on the actual draft insert).
  const gate = await assertCanCreateLetter(tenantId, auth.userRow.id);
  return new Response(
    JSON.stringify({
      configured: stripeConfigured(),
      enforced: process.env.DRAFTHR_ENFORCE_PAYWALL === "1",
      canCreateLetter: gate.ok,
      ...ent,
    }),
    {
      status: 200,
      headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
    },
  );
}
