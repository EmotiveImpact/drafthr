/**
 * Who may call the AI generation endpoints (/api/draft, /api/agent), and with
 * which model. Replaces the bare session check those endpoints used, which let
 * any signed-in user, viewers included, run unlimited Opus generations.
 *
 *  - Viewers are read-only, so they cannot generate.
 *  - Claude Opus needs a usable paid plan. Without one the request gets a 402
 *    and the client can retry on the default model.
 *  - When the paywall is enforced (DRAFTHR_ENFORCE_PAYWALL=1, the same switch
 *    as letter creation), generating needs a usable plan or a letter/pack
 *    bought in the last PURCHASE_WINDOW_DAYS. Off by default, so flipping it on
 *    stays a deliberate rollout step.
 *
 * Section generations do not spend AI credits: a plan includes 10 to 20
 * credits a month and a letter is many sections, so a per-section charge
 * would use a month's credits on one or two letters. Credits stay for the
 * specialist critique.
 */
import { and, eq, gte, isNull, or, like } from "drizzle-orm";
import { getDb } from "../../src/db/index.js";
import { entitlementPurchases } from "../../src/db/schema.js";
import { resolveEntitlements } from "./entitlements.js";
import { jsonError } from "./request.js";
import { requireSessionAndTenant } from "./session-with-tenant.js";
import { rejectReadOnlyMember } from "./workspace-role.js";

const PURCHASE_WINDOW_DAYS = 30;

export function isPremiumModel(modelName: string | undefined): boolean {
  return typeof modelName === "string" && /^claude-opus-/.test(modelName);
}

function paymentRequired(error: string, extra: Record<string, unknown>): Response {
  return new Response(JSON.stringify({ error, ...extra }), {
    status: 402,
    headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
  });
}

async function hasRecentLetterPurchase(userId: string, now: number): Promise<boolean> {
  const since = new Date(now - PURCHASE_WINDOW_DAYS * 24 * 60 * 60 * 1000);
  const [row] = await getDb()
    .select({ id: entitlementPurchases.id })
    .from(entitlementPurchases)
    .where(
      and(
        eq(entitlementPurchases.userId, userId),
        gte(entitlementPurchases.createdAt, since),
        // A refunded purchase authorises nothing, here as at letter creation.
        isNull(entitlementPurchases.refundedAt),
        or(like(entitlementPurchases.kind, "letter_%"), like(entitlementPurchases.kind, "pack_%")),
      ),
    )
    .limit(1);
  return Boolean(row);
}

/**
 * Null when the caller may run this generation, otherwise the response to
 * return. `resolvedModel` is the model the endpoint will actually call, so a
 * fallback through LLM_MODEL to Opus is gated too.
 */
export async function rejectAiGeneration(req: Request, resolvedModel: string): Promise<Response | null> {
  // Local dev only, opted into explicitly (see production-auth.ts).
  if (process.env.DRAFTHR_DEV_NO_AUTH === "1") return null;

  const auth = await requireSessionAndTenant(req);
  if (!auth.ok) return auth.response;
  if (!auth.activeTenant) return jsonError("No active workspace", 400);
  const readOnly = rejectReadOnlyMember(auth);
  if (readOnly) return readOnly;

  const premium = isPremiumModel(resolvedModel);
  const enforce = process.env.DRAFTHR_ENFORCE_PAYWALL === "1";
  if (!premium && !enforce) return null;

  const ent = await resolveEntitlements(auth.activeTenant.id, auth.userRow.id);
  if (premium && !ent.active) {
    return paymentRequired("Claude Opus is included with a paid plan. Choose a plan, or switch to the standard model.", {
      needPlan: true,
      premiumModel: true,
    });
  }
  if (enforce && !ent.active && !(await hasRecentLetterPurchase(auth.userRow.id, Date.now()))) {
    return paymentRequired("Choose a plan or buy a letter to keep drafting.", { needPlan: true });
  }
  return null;
}
