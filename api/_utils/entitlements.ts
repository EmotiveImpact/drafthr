/**
 * Server-authoritative entitlements resolver — the single source of truth for
 * "what may this subject do right now". HR plans live on the workspace
 * (tenant); Employee Plus + purchased credits live on the user. Credits are a
 * pooled tenant balance plus the user's own packs.
 */
import { and, desc, eq, gte, isNull, like, sql, type SQL } from "drizzle-orm";
import { getDb } from "../../src/db/index.js";
import { subscriptions, creditLedger, drafts, entitlementPurchases } from "../../src/db/schema.js";
import {
  pickUsablePack,
  creditsPerCycleForPlan,
  planForStripePriceId,
  billingIntervalForStripePriceId,
} from "../../src/lib/billing/catalog.js";
import { pickLetterPurchase } from "../../src/lib/billing/letter-tiers.js";

/** db or a transaction handle — both expose the query builder + execute(). */
type DbExecutor = {
  select: ReturnType<typeof getDb>["select"];
  execute: (query: SQL) => Promise<unknown>;
};

type LedgerRow = {
  id?: string;
  delta: number;
  expiresAt: Date | null;
  createdAt?: Date | null;
  grantKey?: string | null;
};

/** A grant's remaining credits during a ledger replay. */
type Bucket = { id: string | undefined; amount: number; expiresAt: number };

/** Prefix of the grant key on a clawback row that targets one specific grant. */
export const REVOKE_PREFIX = "revoke:";

/**
 * Replay ONE pool's ledger in order. Grants become buckets (plan drip expires
 * at the end of its month, packs never do). Each spend draws from the
 * soonest-expiring bucket that was still live at the time of the spend. A
 * revocation (grant key `revoke:<grantId>`, written when a credit purchase is
 * refunded) draws only from that grant, and never more than is left in it.
 */
function replayPool(rows: LedgerRow[]): { buckets: Bucket[]; debt: number } {
  const ordered = [...rows].sort(
    (a, b) => (a.createdAt?.getTime() ?? 0) - (b.createdAt?.getTime() ?? 0),
  );
  const buckets: Bucket[] = [];
  let debt = 0;
  for (const row of ordered) {
    if (row.delta > 0) {
      buckets.push({ id: row.id, amount: row.delta, expiresAt: row.expiresAt?.getTime() ?? Infinity });
      continue;
    }
    if (row.grantKey?.startsWith(REVOKE_PREFIX)) {
      const target = buckets.find((b) => b.id !== undefined && b.id === row.grantKey!.slice(REVOKE_PREFIX.length));
      if (target) target.amount -= Math.min(target.amount, -row.delta);
      continue;
    }
    const at = row.createdAt?.getTime() ?? 0;
    let owed = -row.delta;
    for (const bucket of liveBuckets(buckets, at)) {
      const take = Math.min(bucket.amount, owed);
      bucket.amount -= take;
      owed -= take;
      if (owed === 0) break;
    }
    debt += owed;
  }
  return { buckets, debt };
}

function liveBuckets(buckets: Bucket[], at: number): Bucket[] {
  return buckets.filter((b) => b.amount > 0 && b.expiresAt > at).sort((a, b) => a.expiresAt - b.expiresAt);
}

/**
 * Spendable credits in ONE ledger pool (a tenant or a user). Only what is left
 * in unexpired buckets counts. Summing raw deltas and dropping expired grants
 * (the old approach) kept the spends but lost the grants they drew from, so
 * using 30 of 50 drip credits in one period left 20 instead of 50 in the next.
 */
export function poolBalance(rows: LedgerRow[], now = Date.now()): number {
  const { buckets, debt } = replayPool(rows);
  const remaining = buckets
    .filter((b) => b.expiresAt > now)
    .reduce((sum, b) => sum + b.amount, 0);
  return Math.max(0, remaining - debt);
}

/** The grants a spend of `amount` made now would draw from, with each grant's expiry. */
export type SpendPart = { amount: number; expiresAt: Date | null };

/**
 * Which grants a spend of `amount` from this pool draws on, soonest-expiring
 * first (the same order the replay uses). Recorded with the debit so a refund
 * can give the credits back with the expiry they had, rather than as
 * permanent credits.
 */
export function allocateSpend(rows: LedgerRow[], amount: number, now = Date.now()): SpendPart[] {
  const { buckets, debt } = replayPool(rows);
  // Outstanding debt is settled by the earliest live credits first, exactly as
  // the balance calculation treats it.
  let skip = debt;
  const parts: SpendPart[] = [];
  let owed = amount;
  for (const bucket of liveBuckets(buckets, now)) {
    let available = bucket.amount;
    const settled = Math.min(available, skip);
    available -= settled;
    skip -= settled;
    if (available <= 0) continue;
    const take = Math.min(available, owed);
    parts.push({ amount: take, expiresAt: Number.isFinite(bucket.expiresAt) ? new Date(bucket.expiresAt) : null });
    owed -= take;
    if (owed === 0) break;
  }
  return parts;
}

async function poolRows(exec: DbExecutor, subjectType: "tenant" | "user", subjectId: string): Promise<LedgerRow[]> {
  return exec
    .select({
      id: creditLedger.id,
      delta: creditLedger.delta,
      expiresAt: creditLedger.expiresAt,
      createdAt: creditLedger.createdAt,
      grantKey: creditLedger.grantKey,
    })
    .from(creditLedger)
    .where(and(eq(creditLedger.subjectType, subjectType), eq(creditLedger.subjectId, subjectId)));
}

/**
 * The ledger of each pool a caller can draw on: the tenant pool (when in a
 * workspace) and the user's own packs. Shared by resolveEntitlements (read)
 * and spendCredits (inside its locked transaction) so the two can never
 * disagree on what "balance" means.
 */
async function creditPools(
  exec: DbExecutor,
  tenantId: string | null,
  userId: string,
): Promise<{ tenant: LedgerRow[]; user: LedgerRow[] }> {
  const tenant = tenantId ? await poolRows(exec, "tenant", tenantId) : [];
  const user = await poolRows(exec, "user", userId);
  return { tenant, user };
}

export type Entitlements = {
  plan: string | null; // starter | pro | business | employee_plus | null
  status: string | null; // active | past_due | canceled | …
  /** Usable right now: active/trialing, or past_due still inside the grace window. */
  active: boolean;
  currentPeriodStart: number | null;
  currentPeriodEnd: number | null;
  /**
   * The current monthly allowance window (credits, Starter letter cap). Equal
   * to the billing period on a monthly plan; one month of the year on an
   * annual plan.
   */
  allowanceStart: number | null;
  allowanceEnd: number | null;
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

/**
 * The plan a mirrored subscription is on. The live price decides (so a change
 * made in Stripe or the billing portal shows up even on a row written before
 * the webhook derived the plan from the price); the stored plan is the fallback
 * for a price this environment doesn't know.
 */
export function planOf(sub: Pick<SubRow, "stripePriceId" | "plan">): string {
  return planForStripePriceId(sub.stripePriceId) ?? sub.plan;
}

/** UTC date `months` months after `from`, clamped to the end of a shorter month. */
export function addMonthsUtc(from: Date, months: number): Date {
  const y = from.getUTCFullYear();
  const m = from.getUTCMonth() + months;
  const lastDay = new Date(Date.UTC(y, m + 1, 0)).getUTCDate();
  return new Date(
    Date.UTC(
      y,
      m,
      Math.min(from.getUTCDate(), lastDay),
      from.getUTCHours(),
      from.getUTCMinutes(),
      from.getUTCSeconds(),
      from.getUTCMilliseconds(),
    ),
  );
}

/**
 * Is this an annual subscription? Decided by the price (the `*_annual`
 * catalogue keys); for a price this environment doesn't know, by a billing
 * period clearly longer than a month.
 */
export function isAnnualSubscription(sub: {
  stripePriceId: string | null;
  currentPeriodStart: Date;
  currentPeriodEnd: Date;
}): boolean {
  const interval = billingIntervalForStripePriceId(sub.stripePriceId);
  if (interval) return interval === "year";
  return sub.currentPeriodEnd.getTime() - sub.currentPeriodStart.getTime() > 45 * 24 * 60 * 60 * 1000;
}

/**
 * The monthly allowance window that `now` falls in. A monthly plan's window is
 * its billing period. An annual period is split at each monthly anniversary of
 * its start (the last window ends at the period end), so the plan's credits
 * and the Starter letter cap reset every month rather than once a year.
 */
export function allowanceWindow(
  periodStart: Date,
  periodEnd: Date,
  annual: boolean,
  now = Date.now(),
): { start: Date; end: Date } {
  if (!annual) return { start: periodStart, end: periodEnd };
  for (let k = 0; k < 24; k++) {
    const start = addMonthsUtc(periodStart, k);
    const next = addMonthsUtc(periodStart, k + 1);
    const end = next.getTime() < periodEnd.getTime() ? next : periodEnd;
    if (now < end.getTime() || end.getTime() >= periodEnd.getTime()) return { start, end };
  }
  return { start: periodStart, end: periodEnd };
}

/**
 * How many plan-included credits to drip for a subscription in this state.
 * Non-zero only for a plan that includes a per-cycle drip AND a currently
 * usable status (active/trialing) — a past_due/incomplete/canceled period
 * grants nothing (a later .updated that flips it active grants then).
 */
export function dripPlanCredits(plan: string, status: string): number {
  const perCycle = creditsPerCycleForPlan(plan);
  if (perCycle > 0 && (status === "active" || status === "trialing")) return perCycle;
  return 0;
}

export type DripSubject = {
  subjectType: "tenant" | "user";
  subjectId: string;
  stripeSubscriptionId: string;
  stripePriceId: string | null;
  plan: string;
  status: string;
  currentPeriodStart: Date;
  currentPeriodEnd: Date;
};

/**
 * Grant the plan's monthly credits for the allowance window `now` falls in.
 * Keyed `drip:<subId>:<windowStartUnix>` so each window lands exactly once
 * however many times this runs (every webhook sync, and lazily whenever an
 * annual plan's entitlements are read, since Stripe sends no event at the
 * monthly boundaries inside an annual period). On a monthly plan the window
 * start is the period start, so the key matches grants made before annual
 * plans were split. Credits expire at the window's end (no rollover).
 */
export async function grantPlanDrip(
  db: Pick<ReturnType<typeof getDb>, "insert">,
  sub: DripSubject,
  now = Date.now(),
): Promise<void> {
  const amount = dripPlanCredits(sub.plan, sub.status);
  if (amount <= 0) return;
  const window = allowanceWindow(sub.currentPeriodStart, sub.currentPeriodEnd, isAnnualSubscription(sub), now);
  await db
    .insert(creditLedger)
    .values({
      subjectType: sub.subjectType,
      subjectId: sub.subjectId,
      delta: amount,
      reason: "plan_drip",
      expiresAt: window.end,
      grantKey: `drip:${sub.stripeSubscriptionId}:${Math.floor(window.start.getTime() / 1000)}`,
    })
    // The unique index is partial (grant_key IS NOT NULL); Postgres only
    // matches it for ON CONFLICT when the same predicate is given.
    .onConflictDoNothing({
      target: creditLedger.grantKey,
      where: sql`${creditLedger.grantKey} is not null`,
    });
}

async function loadSubscriptionRows(
  tenantId: string | null,
  userId: string,
): Promise<{ tenantRows: SubRow[]; userRows: SubRow[] }> {
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
  return { tenantRows, userRows };
}

/**
 * Lazily grant this month's credits on a usable annual plan. Best-effort: a
 * failure here must not break a read, and the next read (or webhook) retries.
 */
async function ensureMonthlyDrip(sub: SubRow | undefined): Promise<void> {
  if (!sub || !isUsable(sub.status, sub.graceUntil) || !isAnnualSubscription(sub)) return;
  try {
    await grantPlanDrip(getDb(), {
      subjectType: sub.subjectType === "user" ? "user" : "tenant",
      subjectId: sub.subjectId,
      stripeSubscriptionId: sub.stripeSubscriptionId,
      stripePriceId: sub.stripePriceId,
      plan: planOf(sub),
      status: sub.status,
      currentPeriodStart: sub.currentPeriodStart,
      currentPeriodEnd: sub.currentPeriodEnd,
    });
  } catch (err) {
    console.warn("[entitlements] monthly credit grant failed", err);
  }
}

export async function resolveEntitlements(
  tenantId: string | null,
  userId: string,
): Promise<Entitlements> {
  const db = getDb();
  const { tenantRows, userRows } = await loadSubscriptionRows(tenantId, userId);
  const sub = pickEffectiveSubscription(tenantRows, userRows);
  await ensureMonthlyDrip(sub);

  // Credit balance: tenant pool + user packs, excluding expired drip credits.
  const pools = await creditPools(db, tenantId, userId);
  const credits = poolBalance(pools.tenant) + poolBalance(pools.user);
  const window = sub
    ? allowanceWindow(sub.currentPeriodStart, sub.currentPeriodEnd, isAnnualSubscription(sub))
    : null;

  return {
    plan: sub ? planOf(sub) : null,
    status: sub?.status ?? null,
    active: sub ? isUsable(sub.status, sub.graceUntil) : false,
    currentPeriodStart: sub ? sub.currentPeriodStart.getTime() : null,
    currentPeriodEnd: sub ? sub.currentPeriodEnd.getTime() : null,
    allowanceStart: window ? window.start.getTime() : null,
    allowanceEnd: window ? window.end.getTime() : null,
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
 *     required; Starter is additionally capped at 5 letters a month (each
 *     month of an annual plan, too);
 *   - failing that, an unconsumed, unrefunded one-off letter of a tier that
 *     covers `letterType`, or a pack with letters left, lets the user through
 *     (pay-per-letter). Returns a 402 with an upgrade reason otherwise.
 *
 * `letterType` is the letter being created. Omitted (the billing-status
 * preview, which has no letter in hand), a letter purchase of any tier counts.
 */
export async function assertCanCreateLetter(
  tenantId: string | null,
  userId: string,
  letterType?: string | null,
): Promise<CreateGate> {
  if (process.env.DRAFTHR_ENFORCE_PAYWALL !== "1") return { ok: true };

  const ent = await resolveEntitlements(tenantId, userId);
  if (ent.active) {
    if (ent.plan === "starter") {
      const used = tenantId ? await countLettersThisCycle(tenantId, ent.allowanceStart) : 0;
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

  // No active plan — allow if the user holds an unconsumed one-off letter of a
  // tier that covers this letter. A routine purchase can't unlock a tribunal letter.
  const db = getDb();
  const oneOffs = await db
    .select({ id: entitlementPurchases.id, kind: entitlementPurchases.kind })
    .from(entitlementPurchases)
    .where(
      and(
        eq(entitlementPurchases.userId, userId),
        isNull(entitlementPurchases.consumedAt),
        isNull(entitlementPurchases.refundedAt),
        like(entitlementPurchases.kind, "letter_%"),
      ),
    );
  const oneOff = pickLetterPurchase(oneOffs, letterType);
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
    .where(
      and(
        eq(entitlementPurchases.userId, userId),
        isNull(entitlementPurchases.refundedAt),
        like(entitlementPurchases.kind, "pack_%"),
      ),
    );
  const usablePack = pickUsablePack(packs);
  if (usablePack) return { ok: true, consume: { entitlementId: usablePack.id, kind: "pack" } };
  if (oneOffs.length > 0) {
    return {
      ok: false,
      code: 402,
      reason:
        "Your letter purchase doesn't cover this type of letter. Buy the matching letter tier or choose a plan to continue.",
    };
  }
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

export type CreditDebit = {
  subjectType: "tenant" | "user";
  subjectId: string;
  amount: number;
  /**
   * The grants this debit drew on, with their expiry. refundCredits gives the
   * credits back with the same expiry, so refunding a spend of monthly plan
   * credits never turns them into permanent ones.
   */
  parts?: SpendPart[];
};

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
  // An annual plan's credits for this month may not have been granted yet.
  const { tenantRows, userRows } = await loadSubscriptionRows(tenantId, userId);
  await ensureMonthlyDrip(pickEffectiveSubscription(tenantRows, userRows));
  return db.transaction(async (tx) => {
    if (tenantId) {
      await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtextextended(${`credits:${tenantId}`}, 0))`);
    }
    await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtextextended(${`credits:${userId}`}, 0))`);
    const pools = await creditPools(tx as unknown as DbExecutor, tenantId, userId);
    const tenantBalance = poolBalance(pools.tenant);
    const balance = tenantBalance + poolBalance(pools.user);
    if (balance < amount) return { ok: false, balance, debits: [] };
    const fromTenant = tenantId ? Math.min(tenantBalance, amount) : 0;
    const debits: CreditDebit[] = [];
    if (fromTenant > 0) {
      debits.push({
        subjectType: "tenant",
        subjectId: tenantId!,
        amount: fromTenant,
        parts: allocateSpend(pools.tenant, fromTenant),
      });
    }
    if (amount - fromTenant > 0) {
      debits.push({
        subjectType: "user",
        subjectId: userId,
        amount: amount - fromTenant,
        parts: allocateSpend(pools.user, amount - fromTenant),
      });
    }
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
 * spent. Each refunded credit keeps the expiry of the grant it was spent from,
 * and credits whose grant has expired since are not given back, so a refund
 * can never turn monthly plan credits into permanent ones. No lock needed: a
 * grant only ever increases the balance.
 */
export async function refundCredits(debits: CreditDebit[], reason = "refund", now = Date.now()): Promise<void> {
  const rows: { subjectType: "tenant" | "user"; subjectId: string; delta: number; expiresAt: Date | null }[] = [];
  for (const d of debits) {
    if (d.amount <= 0) continue;
    // Debits from before parts were recorded have no breakdown; refund them as before.
    const parts = d.parts ?? [{ amount: d.amount, expiresAt: null }];
    for (const p of parts) {
      if (p.amount <= 0) continue;
      if (p.expiresAt && p.expiresAt.getTime() <= now) continue;
      rows.push({ subjectType: d.subjectType, subjectId: d.subjectId, delta: p.amount, expiresAt: p.expiresAt });
    }
  }
  if (rows.length === 0) return;
  const db = getDb();
  for (const r of rows) {
    await db.insert(creditLedger).values({ ...r, reason });
  }
}
