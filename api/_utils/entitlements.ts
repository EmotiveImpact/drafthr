/**
 * Server-authoritative entitlements resolver — the single source of truth for
 * "what may this subject do right now". HR plans live on the workspace
 * (tenant); Employee Plus + purchased credits live on the user. Credits are a
 * pooled tenant balance plus the user's own packs.
 */
import { and, desc, eq, gte, isNull, like, sql, type SQL } from "drizzle-orm";
import { getDb } from "../../src/db/index.js";
import { subscriptions, creditLedger, drafts, entitlementPurchases } from "../../src/db/schema.js";

/** db or a transaction handle — both expose the query builder + execute(). */
type DbExecutor = {
  select: ReturnType<typeof getDb>["select"];
  execute: (query: SQL) => Promise<unknown>;
};

/**
 * Non-expired credit balance for a caller: the tenant pool (when in a
 * workspace) plus the user's own packs. Shared by resolveEntitlements (read)
 * and spendCredits (inside its locked transaction) so the two can never
 * disagree on what "balance" means.
 */
async function creditBalance(exec: DbExecutor, tenantId: string | null, userId: string): Promise<number> {
  const now = Date.now();
  const rows: { delta: number; expiresAt: Date | null }[] = [];
  if (tenantId) {
    rows.push(
      ...(await exec
        .select({ delta: creditLedger.delta, expiresAt: creditLedger.expiresAt })
        .from(creditLedger)
        .where(and(eq(creditLedger.subjectType, "tenant"), eq(creditLedger.subjectId, tenantId)))),
    );
  }
  rows.push(
    ...(await exec
      .select({ delta: creditLedger.delta, expiresAt: creditLedger.expiresAt })
      .from(creditLedger)
      .where(and(eq(creditLedger.subjectType, "user"), eq(creditLedger.subjectId, userId)))),
  );
  return rows
    .filter((r) => !r.expiresAt || r.expiresAt.getTime() > now)
    .reduce((sum, r) => sum + r.delta, 0);
}

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
  const credits = await creditBalance(db, tenantId, userId);

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

/**
 * Does THIS specific subject (tenant OR user) have a usable subscription right
 * now? Unlike resolveEntitlements (which falls back tenant→user to compute an
 * "effective plan"), this checks ONLY the exact subject — so a user's personal
 * Employee Plus can't be mistaken for their workspace having a plan. Used by the
 * double-subscribe guard in billing-checkout.
 */
export async function subjectHasActiveSubscription(
  subjectType: "tenant" | "user",
  subjectId: string,
): Promise<boolean> {
  const db = getDb();
  const [sub] = await db
    .select({ status: subscriptions.status, graceUntil: subscriptions.graceUntil })
    .from(subscriptions)
    .where(and(eq(subscriptions.subjectType, subjectType), eq(subscriptions.subjectId, subjectId)))
    .orderBy(desc(subscriptions.updatedAt))
    .limit(1);
  return sub ? isUsable(sub.status, sub.graceUntil) : false;
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
 * Atomic under concurrency: a per-pool advisory lock (keyed on the debited
 * subject) serializes the read-balance-then-insert so two concurrent spends
 * can't both observe a sufficient balance and overspend the shared pool. The
 * lock is transaction-scoped (auto-released on commit/rollback) and keyed per
 * pool, so unrelated subjects never contend. Used by the AI-critique endpoint.
 */
export async function spendCredits(
  tenantId: string | null,
  userId: string,
  amount: number,
  reason = "spend",
): Promise<{ ok: boolean; balance: number }> {
  const db = getDb();
  if (amount <= 0) return { ok: false, balance: 0 };
  const poolKey = `credits:${tenantId ?? userId}`;
  return db.transaction(async (tx) => {
    await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtextextended(${poolKey}, 0))`);
    const balance = await creditBalance(tx as unknown as DbExecutor, tenantId, userId);
    if (balance < amount) return { ok: false, balance };
    await tx.insert(creditLedger).values({
      subjectType: tenantId ? "tenant" : "user",
      subjectId: tenantId ?? userId,
      delta: -amount,
      reason,
    });
    return { ok: true, balance: balance - amount };
  });
}

/**
 * Refund `amount` credits to a subject (positive ledger entry). Used to make
 * the caller whole when a paid action fails after the debit — e.g. the model
 * call errors after an AI-critique credit was already spent. No lock needed: a
 * grant only ever increases the balance.
 */
export async function refundCredits(
  tenantId: string | null,
  userId: string,
  amount: number,
  reason = "refund",
): Promise<void> {
  if (amount <= 0) return;
  const db = getDb();
  await db.insert(creditLedger).values({
    subjectType: tenantId ? "tenant" : "user",
    subjectId: tenantId ?? userId,
    delta: amount,
    reason,
  });
}
