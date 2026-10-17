/**
 * /api/marketplace/billing-portal — open a Stripe Billing Portal session for
 * the caller's subscription, where they can change plan, update the card,
 * see invoices or cancel. Changes made there come back through
 * billing-webhook, which mirrors the subscription from Stripe.
 *
 * POST { scope?: "workspace" | "personal", returnTo?: "/settings" | "/pricing" } → { url }
 *
 * A workspace plan sits on the shared workspace Stripe customer, so only
 * owners and admins may open it. A personal plan (Employee Plus) is the
 * user's own. Without a scope, the plan the app shows is chosen: a usable
 * workspace plan, then a usable personal plan, then whichever exists.
 */
import { and, eq } from "drizzle-orm";
import { enforceSameOrigin, jsonError, readJsonRequest } from "../../_utils/request.js";
import { rateLimit } from "../../_utils/rate-limit.js";
import { requireSessionAndTenant } from "../../_utils/session-with-tenant.js";
import { getStripe, appBaseUrl } from "../../_utils/stripe.js";
import { readStripeCustomerId } from "../../_utils/stripe-billing.js";
import { subjectHasActiveSubscription } from "../../_utils/entitlements.js";
import { rejectNonBillingManager } from "../../_utils/workspace-role.js";
import { getDb } from "../../../src/db/index.js";
import { subscriptions } from "../../../src/db/schema.js";

export const config = { runtime: "nodejs" };

const RETURN_PATHS = new Set(["/settings", "/pricing"]);

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
  });
}

async function hasSubscription(subjectType: "tenant" | "user", subjectId: string): Promise<boolean> {
  const db = getDb();
  const [row] = await db
    .select({ id: subscriptions.id })
    .from(subscriptions)
    .where(and(eq(subscriptions.subjectType, subjectType), eq(subscriptions.subjectId, subjectId)))
    .limit(1);
  return Boolean(row);
}

export async function POST(req: Request): Promise<Response> {
  const sameOrigin = enforceSameOrigin(req);
  if (sameOrigin) return sameOrigin;
  const limited = rateLimit(req, { name: "billing-portal", max: 20, windowMs: 60_000 });
  if (limited) return limited;

  const stripe = getStripe();
  if (!stripe) return jsonError("Payments are not configured", 503);

  const auth = await requireSessionAndTenant(req);
  if (!auth.ok) return auth.response;

  const parsed = await readJsonRequest<{ scope?: string; returnTo?: string }>(req);
  if (!parsed.ok) return parsed.response;
  const { scope, returnTo } = parsed.body ?? {};
  if (scope !== undefined && scope !== "workspace" && scope !== "personal") {
    return jsonError("Unknown scope", 400);
  }

  const tenantId = auth.activeTenant?.id ?? null;
  let subjectType: "tenant" | "user";
  if (scope === "workspace") {
    if (!tenantId) return jsonError("No active workspace", 412);
    subjectType = "tenant";
  } else if (scope === "personal") {
    subjectType = "user";
  } else if (tenantId && (await subjectHasActiveSubscription("tenant", tenantId))) {
    // The same choice as the plan the app shows (pickEffectiveSubscription):
    // a usable workspace plan, then a usable personal plan, then whichever
    // exists. Picking the workspace whenever it had any row opened a
    // cancelled workspace subscription while Settings showed Employee Plus.
    subjectType = "tenant";
  } else if (await subjectHasActiveSubscription("user", auth.userRow.id)) {
    subjectType = "user";
  } else {
    subjectType = tenantId && (await hasSubscription("tenant", tenantId)) ? "tenant" : "user";
  }
  if (subjectType === "tenant") {
    const denied = rejectNonBillingManager(auth);
    if (denied) return denied;
  }
  const subjectId = subjectType === "tenant" ? tenantId! : auth.userRow.id;

  if (!(await hasSubscription(subjectType, subjectId))) {
    return jsonError("There is no subscription to manage yet. Choose a plan first.", 404);
  }
  const customerId = await readStripeCustomerId(subjectType, subjectId);
  if (!customerId) return jsonError("No billing account found for this subscription", 404);

  const path = returnTo && RETURN_PATHS.has(returnTo) ? returnTo : "/settings";
  try {
    const configuration = process.env.STRIPE_BILLING_PORTAL_CONFIGURATION?.trim();
    const session = await stripe.billingPortal.sessions.create({
      customer: customerId,
      // Settings opens on its Billing tab so people land where they left.
      return_url: `${appBaseUrl(req)}${path === "/settings" ? "/settings?tab=billing" : path}`,
      ...(configuration ? { configuration } : {}),
    });
    return json({ url: session.url });
  } catch (err) {
    console.error("[billing-portal] failed", err);
    return jsonError("Could not open the billing portal", 502);
  }
}
