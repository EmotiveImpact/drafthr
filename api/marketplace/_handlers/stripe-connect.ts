/**
 * /api/marketplace/stripe-connect — consultant payout onboarding (Stripe
 * Connect Express).
 *
 *   GET  → { configured, hasProfile, payoutsEnabled, detailsSubmitted }
 *   POST → create/refresh the Connect onboarding Account Link → { url }
 *
 * Off when Stripe isn't configured (getStripe() === null) → 503, so the UI
 * shows "payouts coming once configured" rather than breaking. Decoupled table
 * (stripe_connect_accounts) so the live marketplace is unaffected.
 */
import { eq } from "drizzle-orm";
import { enforceSameOrigin, jsonError } from "../../_utils/request.js";
import { rateLimit } from "../../_utils/rate-limit.js";
import { requireMarketplaceSession as requireSessionAndTenant } from "../../_utils/marketplace-session.js";
import { getDb } from "../../../src/db/index.js";
import { consultantProfiles, stripeConnectAccounts } from "../../../src/db/schema.js";
import { getStripe, stripeConfigured, appBaseUrl } from "../../_utils/stripe.js";

export const config = { runtime: "nodejs" };

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
  });
}

export async function GET(req: Request): Promise<Response> {
  const auth = await requireSessionAndTenant(req);
  if (!auth.ok) return auth.response;

  const db = getDb();
  const [profile] = await db
    .select({ id: consultantProfiles.id })
    .from(consultantProfiles)
    .where(eq(consultantProfiles.userId, auth.userRow.id))
    .limit(1);

  if (!profile) {
    return json({ configured: stripeConfigured(), hasProfile: false, payoutsEnabled: false, detailsSubmitted: false });
  }
  const [acct] = await db
    .select()
    .from(stripeConnectAccounts)
    .where(eq(stripeConnectAccounts.profileId, profile.id))
    .limit(1);

  return json({
    configured: stripeConfigured(),
    hasProfile: true,
    payoutsEnabled: acct?.payoutsEnabled ?? false,
    detailsSubmitted: acct?.detailsSubmitted ?? false,
  });
}

export async function POST(req: Request): Promise<Response> {
  const sameOrigin = enforceSameOrigin(req);
  if (sameOrigin) return sameOrigin;
  const limited = await rateLimit(req, { name: "stripe-connect", max: 20, windowMs: 60_000 });
  if (limited) return limited;

  const stripe = getStripe();
  if (!stripe) return jsonError("Payments are not configured", 503);

  const auth = await requireSessionAndTenant(req);
  if (!auth.ok) return auth.response;

  const db = getDb();
  const [profile] = await db
    .select({ id: consultantProfiles.id })
    .from(consultantProfiles)
    .where(eq(consultantProfiles.userId, auth.userRow.id))
    .limit(1);
  if (!profile) return jsonError("Create your consultant profile first", 412);

  try {
    // Get-or-create the consultant's Express account.
    const [existing] = await db
      .select()
      .from(stripeConnectAccounts)
      .where(eq(stripeConnectAccounts.profileId, profile.id))
      .limit(1);

    let accountId = existing?.accountId;
    if (!accountId) {
      const account = await stripe.accounts.create({
        type: "express",
        email: auth.userRow.email ?? undefined,
        capabilities: { transfers: { requested: true } },
        metadata: { profileId: profile.id },
      });
      accountId = account.id;
      await db
        .insert(stripeConnectAccounts)
        .values({ profileId: profile.id, accountId, updatedAt: new Date() })
        .onConflictDoUpdate({
          target: stripeConnectAccounts.profileId,
          set: { accountId, updatedAt: new Date() },
        });
    }

    const base = appBaseUrl(req);
    const link = await stripe.accountLinks.create({
      account: accountId,
      refresh_url: `${base}/c/profile?stripe=refresh`,
      return_url: `${base}/c/profile?stripe=return`,
      type: "account_onboarding",
    });
    return json({ url: link.url });
  } catch (err) {
    console.error("[stripe-connect] failed", err);
    return jsonError("Could not start payout onboarding", 502);
  }
}
