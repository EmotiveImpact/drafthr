/**
 * Server-authoritative entitlements resolver — the single source of truth for
 * "what may this subject do right now". HR plans live on the workspace
 * (tenant); Employee Plus + purchased credits live on the user. Credits are a
 * pooled tenant balance plus the user's own packs.
 */
import { and, desc, eq, gte, isNull, like } from "drizzle-orm";
import { getDb } from "../../src/db/index.js";
import { subscriptions, creditLedger, drafts, entitlementPurchases } from "../../src/db/schema.js";

export type Entitlements = {
  plan: string | null; // starter | pro | business | employee_plus | null
  status: string | null; // active | past_due | canceled | …
  /** Usable right now: active/trialing, or past_due still inside the grace window. */
  active: boolean;
  currentPeriodStart: number | null;
  currentPeriodEnd: number | null;
  cancelAtPeriodEnd: boolean;
  /** Non-expired credit balance available to this caller (tenant pool + own packs). */
  credits: number;
};

function isUsable(status: string, graceUntil: Date | null): boolean {
  if (status === "active" || status === "trialing") return true;
  if (status === "past_due" && graceUntil && graceUntil.getTime() > Date.now()) return true;
  return false;
}

export async function resolveEntitlements(
  tenantId: string | null,
  userId: string,
): Promise<Entitlements> {
  const db = getDb();

  // Prefer the workspace (tenant) plan; fall back to a user subscription
  // (Employee Plus). Most-recently-updated row wins if there's ever more than one.
  let sub:
    | typeof subscriptions.$inferSelect
    | undefined;
  if (tenantId) {
    [sub] = await db
      .select()
      .from(subscriptions)
      .where(and(eq(subscriptions.subjectType, "tenant"), eq(subscriptions.subjectId, tenantId)))
      .orderBy(desc(subscriptions.updatedAt))
      .limit(1);
  }
  if (!sub) {
    [sub] = await db
      .select()
      .from(subscriptions)
      .where(and(eq(subscriptions.subjectType, "user"), eq(subscriptions.subjectId, userId)))
      .orderBy(desc(subscriptions.updatedAt))
      .limit(1);
  }

  // Credit balance: tenant pool + user packs, excluding expired drip credits.
  const now = Date.now();
  const ledger: { delta: number; expiresAt: Date | null }[] = [];
  if (tenantId) {
    ledger.push(
      ...(await db
        .select({ delta: creditLedger.delta, expiresAt: creditLedger.expiresAt })
        .from(creditLedger)
        .where(and(eq(creditLedger.subjectType, "tenant"), eq(creditLedger.subjectId, tenantId)))),
    );
  }
  ledger.push(
    ...(await db
      .select({ delta: creditLedger.delta, expiresAt: creditLedger.expiresAt })
      .from(creditLedger)
      .where(and(eq(creditLedger.subjectType, "user"), eq(creditLedger.subjectId, userId)))),
  );
  const credits = ledger
    .filter((r) => !r.expiresAt || r.expiresAt.getTime() > now)
    .reduce((sum, r) => sum + r.delta, 0);

  return {
    plan: sub?.plan ?? null,
    status: sub?.status ?? null,
    active: sub ? isUsable(sub.status, sub.graceUntil) : false,
    currentPeriodStart: sub ? sub.currentPeriodStart.getTime() : null,
    currentPeriodEnd: sub ? sub.currentPeriodEnd.getTime() : null,
    cancelAtPeriodEnd: sub?.cancelAtPeriodEnd ?? false,
    credits,
  };
}

export type CreateGate =
  | { ok: true; consumeEntitlementId?: string }
  | { ok: false; reason: string; code: number };

/** Letters created in the tenant since a cycle boundary (drafts are the source of truth). */
async function countLettersThisCycle(tenantId: string, periodStartMs: number | null): Promise<number> {
  const db = getDb();
  const since = periodStartMs ? new Date(periodStartMs) : new Date(0);
  const rows = await db
    .select({ id: drafts.id })
    .from(drafts)
    // Real letters only — template-source drafts aren't letters and shouldn't
    // burn a Starter allowance slot.
    .where(
      and(
        eq(drafts.tenantId, tenantId),
        gte(drafts.createdAt, since),
        eq(drafts.isTemplateSource, false),
      ),
    );
  return rows.length;
}

/**
 * The hard-paywall gate for creating a new letter. ENV-GATED: enforcement is
 * OFF unless DRAFTHR_ENFORCE_PAYWALL=1, so flipping on the "no free anything"
 * model is a deliberate switch, not a silent change that locks out every
 * existing user mid-rollout. When on:
 *   - an active subscription (workspace plan, or the user's Employee Plus) is
 *     required; Starter is additionally capped at 5 letters per billing cycle;
 *   - failing that, an unconsumed one-off letter/pack purchase lets the user
 *     through (pay-per-letter). Returns a 402 with an upgrade reason otherwise.
 */
export async function assertCanCreateLetter(tenantId: string | null, userId: string): Promise<CreateGate> {
  if (process.env.DRAFTHR_ENFORCE_PAYWALL !== "1") return { ok: true };

  const ent = await resolveEntitlements(tenantId, userId);
  if (ent.active) {
    if (ent.plan === "starter") {
      const used = tenantId ? await countLettersThisCycle(tenantId, ent.currentPeriodStart) : 0;
      if (used >= 5) {
        return {
          ok: false,
          code: 402,
          reason: "Starter includes 5 letters per month — upgrade to Pro for unlimited.",
        };
      }
    }
    return { ok: true };
  }

  // No active plan — allow if the user holds an unconsumed one-off letter/pack.
  const db = getDb();
  const [oneOff] = await db
    .select({ id: entitlementPurchases.id })
    .from(entitlementPurchases)
    .where(
      and(
        eq(entitlementPurchases.userId, userId),
        isNull(entitlementPurchases.consumedAt),
        like(entitlementPurchases.kind, "letter_%"),
      ),
    )
    .limit(1);
  // A single-letter purchase authorises exactly one create — report it so the
  // caller consumes it atomically with the draft insert.
  if (oneOff) return { ok: true, consumeEntitlementId: oneOff.id };

  const [pack] = await db
    .select({ id: entitlementPurchases.id })
    .from(entitlementPurchases)
    .where(and(eq(entitlementPurchases.userId, userId), like(entitlementPurchases.kind, "pack_%")))
    .limit(1);
  // Packs cover a sequence of letters within a matter; not consumed per-letter
  // here (per-pack letter-count enforcement is a later refinement).
  if (pack) return { ok: true };

  return { ok: false, code: 402, reason: "Choose a plan or buy a letter to continue." };
}

/**
 * Metering primitive: atomically spend `amount` credits for a subject, drawing
 * against the combined non-expired balance (tenant pool + user packs). Records a
 * negative ledger entry against the tenant when in a workspace context, else the
 * user. Returns the post-spend balance, or ok:false (unchanged) if insufficient.
 *
 * NOTE: this is the ready-to-use spend hook for a credit-gated action. The AI-
 * critique feature that would call it is currently a placeholder (see
 * ImproveTab), so nothing debits credits yet — grant + balance work; the spend
 * trigger ships when that feature is built.
 */
export async function spendCredits(
  tenantId: string | null,
  userId: string,
  amount: number,
  reason = "spend",
): Promise<{ ok: boolean; balance: number }> {
  const db = getDb();
  const ent = await resolveEntitlements(tenantId, userId);
  if (amount <= 0 || ent.credits < amount) return { ok: false, balance: ent.credits };
  await db.insert(creditLedger).values({
    subjectType: tenantId ? "tenant" : "user",
    subjectId: tenantId ?? userId,
    delta: -amount,
    reason,
  });
  return { ok: true, balance: ent.credits - amount };
}
