/**
 * Server-authoritative entitlements resolver — the single source of truth for
 * "what may this subject do right now". HR plans live on the workspace
 * (tenant); Employee Plus + purchased credits live on the user. Credits are a
 * pooled tenant balance plus the user's own packs.
 */
import { and, desc, eq, gte, isNull, like, sql, type SQL } from "drizzle-orm";
import { getDb } from "../../src/db/index.js";
import { subscriptions, creditLedger, drafts, entitlementPurchases } from "../../src/db/schema.js";
import { pickUsablePack } from "../../src/lib/billing/catalog.js";

/** db or a transaction handle — both expose the query builder + execute(). */
type DbExecutor = {
  select: ReturnType<typeof getDb>["select"];
  execute: (query: SQL) => Promise<unknown>;
};

type LedgerRow = { delta: number; expiresAt: Date | null; createdAt?: Date | null };

/**
 * Spendable credits in ONE ledger pool (a tenant or a user).
 *
 * Grants become buckets (plan drip expires at period end, packs never do).
 * Replaying the ledger in order, each spend draws from the soonest-expiring
 * bucket that was still live at the time of the spend. Only what is left in
 * unexpired buckets counts. Summing raw deltas and dropping expired grants
 * (the old approach) kept the spends but lost the grants they drew from, so
 * using 30 of 50 drip credits in one period left 20 instead of 50 in the next.
 */
export function poolBalance(rows: LedgerRow[], now = Date.now()): number {
  const ordered = [...rows].sort(
    (a, b) => (a.createdAt?.getTime() ?? 0) - (b.createdAt?.getTime() ?? 0),
  );
  const buckets: { amount: number; expiresAt: number }[] = [];
  let debt = 0;
  for (const row of ordered) {
    if (row.delta > 0) {
      buckets.push({ amount: row.delta, expiresAt: row.expiresAt?.getTime() ?? Infinity });
      continue;
    }
    const at = row.createdAt?.getTime() ?? 0;
    let owed = -row.delta;
    const live = buckets
      .filter((b) => b.amount > 0 && b.expiresAt > at)
      .sort((a, b) => a.expiresAt - b.expiresAt);
    for (const bucket of live) {
      const take = Math.min(bucket.amount, owed);
      bucket.amount -= take;
      owed -= take;
      if (owed === 0) break;
    }
    debt += owed;
  }
  const remaining = buckets
    .filter((b) => b.expiresAt > now)
    .reduce((sum, b) => sum + b.amount, 0);
  return Math.max(0, remaining - debt);
}

async function poolRows(exec: DbExecutor, subjectType: "tenant" | "user", subjectId: string): Promise<LedgerRow[]> {
  return exec
    .select({ delta: creditLedger.delta, expiresAt: creditLedger.expiresAt, createdAt: creditLedger.createdAt })
    .from(creditLedger)
    .where(and(eq(creditLedger.subjectType, subjectType), eq(creditLedger.subjectId, subjectId)));
}

/**
 * Spendable credits for a caller, per pool: the tenant pool (when in a
 * workspace) and the user's own packs. Shared by resolveEntitlements (read)
 * and spendCredits (inside its locked transaction) so the two can never
 * disagree on what "balance" means.
 */
async function creditPools(
  exec: DbExecutor,
  tenantId: string | null,
  userId: string,
): Promise<{ tenant: number; user: number }> {
  const tenant = tenantId ? poolBalance(await poolRows(exec, "tenant", tenantId)) : 0;
  const user = poolBalance(await poolRows(exec, "user", userId));
  return { tenant, user };
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

type SubRow = typeof subscriptions.$inferSelect;

/**
 * Choose the subscription that decides the caller's plan. A usable workspace
 * plan wins, then a usable personal plan (Employee Plus); only when neither is
 * usable do we fall back to the newest row so the UI can show why (canceled,
 * past_due). Picking purely by `updatedAt` let a dead subscription that merely
 * received a late event hide a live one. Rows must be newest-first.
 */
export function pickEffectiveSubscription(
  tenantRows: SubRow[],
  userRows: SubRow[],
): SubRow | undefined {
  const usable = (r: SubRow) => isUsable(r.status, r.graceUntil);
  return (
    tenantRows.find(usable) ??
    userRows.find(usable) ??
    tenantRows[0] ??
    userRows[0]
  );
}

export async function resolveEntitlements(
  tenantId: string | null,
  userId: string,
): Promise<Entitlements> {
  const db = getDb();

  const tenantRows: SubRow[] = tenantId
    ? await db
        .select()
        .from(subscriptions)
        .where(and(eq(subscriptions.subjectType, "tenant"), eq(subscriptions.subjectId, tenantId)))
        .orderBy(desc(subscriptions.updatedAt))
        .limit(10)
    : [];
  const userRows: SubRow[] = await db
    .select()
    .from(subscriptions)
    .where(and(eq(subscriptions.subjectType, "user"), eq(subscriptions.subjectId, userId)))
    .orderBy(desc(subscriptions.updatedAt))
    .limit(10);
  const sub = pickEffectiveSubscription(tenantRows, userRows);

  // Credit balance: tenant pool + user packs, excluding expired drip credits.
  const pools = await creditPools(db, tenantId, userId);
  const credits = pools.tenant + pools.user;

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
  const rows = await db
    .select({ status: subscriptions.status, graceUntil: subscriptions.graceUntil })
    .from(subscriptions)
    .where(and(eq(subscriptions.subjectType, subjectType), eq(subscriptions.subjectId, subjectId)));
  return rows.some((r) => isUsable(r.status, r.graceUntil));
}

/** What the draft-create must consume to honour this authorization, if anything. */
export type ConsumeTarget = { entitlementId: string; kind: "letter" | "pack" };
export type CreateGate =
  | { ok: true; consume?: ConsumeTarget }
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
  if (oneOff) return { ok: true, consume: { entitlementId: oneOff.id, kind: "letter" } };

  // Case packs authorise a fixed number of letters. Authorise if any pack still
  // has letters left, and report it so the create decrements it atomically.
  const packs = await db
    .select({
      id: entitlementPurchases.id,
      lettersTotal: entitlementPurchases.lettersTotal,
      lettersUsed: entitlementPurchases.lettersUsed,
    })
    .from(entitlementPurchases)
    .where(and(eq(entitlementPurchases.userId, userId), like(entitlementPurchases.kind, "pack_%")));
  const usablePack = pickUsablePack(packs);
  if (usablePack) return { ok: true, consume: { entitlementId: usablePack.id, kind: "pack" } };
  if (packs.length > 0) {
    // They own a pack but it's spent — say so, rather than the generic prompt.
    return {
      ok: false,
      code: 402,
      reason: "Your case pack is all used up — buy another pack, a single letter, or a plan to keep going.",
    };
  }

  return { ok: false, code: 402, reason: "Choose a plan or buy a letter to continue." };
}

export type CreditDebit = { subjectType: "tenant" | "user"; subjectId: string; amount: number };

/**
 * Metering primitive: atomically spend `amount` credits for a caller. Draws
 * from the workspace pool first, then the user's own packs, and writes each
 * debit against the pool it actually came from. (Debiting the tenant for
 * credits that were really the user's let a user re-spend the same pack in
 * every new workspace.) Returns the post-spend balance and the debits made,
 * or ok:false (unchanged) if insufficient.
 *
 * Atomic under concurrency: per-pool advisory locks (tenant then user, always
 * in that order) serialise the read-balance-then-insert so two concurrent
 * spends can't both observe a sufficient balance. The locks are
 * transaction-scoped. Used by the AI-critique endpoint.
 */
export async function spendCredits(
  tenantId: string | null,
  userId: string,
  amount: number,
  reason = "spend",
): Promise<{ ok: boolean; balance: number; debits: CreditDebit[] }> {
  const db = getDb();
  if (amount <= 0) return { ok: false, balance: 0, debits: [] };
  return db.transaction(async (tx) => {
    if (tenantId) {
      await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtextextended(${`credits:${tenantId}`}, 0))`);
    }
    await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtextextended(${`credits:${userId}`}, 0))`);
    const pools = await creditPools(tx as unknown as DbExecutor, tenantId, userId);
    const balance = pools.tenant + pools.user;
    if (balance < amount) return { ok: false, balance, debits: [] };
    const fromTenant = tenantId ? Math.min(pools.tenant, amount) : 0;
    const debits: CreditDebit[] = [];
    if (fromTenant > 0) debits.push({ subjectType: "tenant", subjectId: tenantId!, amount: fromTenant });
    if (amount - fromTenant > 0) debits.push({ subjectType: "user", subjectId: userId, amount: amount - fromTenant });
    for (const d of debits) {
      await tx.insert(creditLedger).values({
        subjectType: d.subjectType,
        subjectId: d.subjectId,
        delta: -d.amount,
        reason,
      });
    }
    return { ok: true, balance: balance - amount, debits };
  });
}

/**
 * Refund the debits a spendCredits call made (positive ledger entries against
 * the same pools). Used to make the caller whole when a paid action fails
 * after the debit, e.g. the model call errors after an AI-critique credit was
 * spent. No lock needed: a grant only ever increases the balance.
 */
export async function refundCredits(debits: CreditDebit[], reason = "refund"): Promise<void> {
  const rows = debits.filter((d) => d.amount > 0);
  if (rows.length === 0) return;
  const db = getDb();
  for (const d of rows) {
    await db.insert(creditLedger).values({
      subjectType: d.subjectType,
      subjectId: d.subjectId,
      delta: d.amount,
      reason,
    });
  }
}
