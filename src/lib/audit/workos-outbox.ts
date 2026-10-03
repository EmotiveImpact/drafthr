import { randomUUID } from "node:crypto";
import { and, asc, count, eq, lte, or } from "drizzle-orm";
import { getDb } from "../../db/index.js";
import { auditLogDeliveries, tenants } from "../../db/schema.js";
import { isWorkOSAuditLogsReady, sendWorkOSAuditSnapshot } from "./workos-sink.js";

// Stay below WorkOS' documented 24-hour idempotency lifetime, even after a
// crash between provider acceptance and our DB acknowledgement. Beyond this
// window, retain the job for reconciliation instead of blindly duplicating it.
export const AUDIT_RETRY_WINDOW_MS = 23 * 60 * 60 * 1000;
export const AUDIT_MAX_ATTEMPTS = 8;
export const AUDIT_LEASE_MS = 60_000;

export function auditRetryDelayMs(attempts: number): number {
  return Math.min(15 * 60_000, 60_000 * 2 ** Math.max(0, attempts - 1));
}

export type AuditDispatchResult = {
  ready: boolean;
  processed: number;
  delivered: number;
  retried: number;
  failed: number;
};

/**
 * Bounded, awaited worker. Row locks + expiring leases permit overlapping
 * cron invocations without racing; compare-and-set acknowledgements prevent
 * a stale worker from replacing the result of a newer lease holder.
 * No provider calls happen while holding a DB transaction open.
 */
export async function dispatchWorkOSAuditOutbox(options: {
  tenantId?: string;
  auditEventId?: string;
  maxJobs?: number;
  budgetMs?: number;
} = {}): Promise<AuditDispatchResult> {
  const result: AuditDispatchResult = { ready: await isWorkOSAuditLogsReady(), processed: 0, delivered: 0, retried: 0, failed: 0 };
  if (!result.ready) return result;
  const db = getDb();
  const startedAt = Date.now();
  const maxJobs = Math.max(1, Math.min(50, Math.floor(options.maxJobs ?? 20)));
  const budgetMs = Math.max(1, Math.min(20_000, options.budgetMs ?? 20_000));

  while (result.processed < maxJobs && Date.now() - startedAt < budgetMs) {
    const job = await db.transaction(async (tx) => {
      const now = new Date();
      const [candidate] = await tx.select().from(auditLogDeliveries).where(and(
        or(
          and(eq(auditLogDeliveries.status, "pending"), lte(auditLogDeliveries.nextAttemptAt, now)),
          and(eq(auditLogDeliveries.status, "delivering"), lte(auditLogDeliveries.leaseExpiresAt, now)),
        ),
        options.tenantId ? eq(auditLogDeliveries.tenantId, options.tenantId) : undefined,
        options.auditEventId ? eq(auditLogDeliveries.auditEventId, options.auditEventId) : undefined,
      )).orderBy(asc(auditLogDeliveries.nextAttemptAt), asc(auditLogDeliveries.auditEventId))
        .limit(1).for("update", { skipLocked: true });
      if (!candidate) return null;

      const [tenant] = await tx.select({ orgId: tenants.workosOrgId }).from(tenants)
        .where(eq(tenants.id, candidate.tenantId)).limit(1);
      const reason = tenant?.orgId !== candidate.workosOrgId ? "workos_org_changed"
        : candidate.firstAttemptAt && now.getTime() - candidate.firstAttemptAt.getTime() >= AUDIT_RETRY_WINDOW_MS ? "idempotency_window_expired"
        : candidate.attempts >= AUDIT_MAX_ATTEMPTS ? "retry_exhausted" : null;
      if (reason) {
        await tx.update(auditLogDeliveries).set({ status: "failed", lastError: reason, leaseToken: null, leaseExpiresAt: null })
          .where(eq(auditLogDeliveries.auditEventId, candidate.auditEventId));
        return { ...candidate, status: "failed" };
      }
      const [claimed] = await tx.update(auditLogDeliveries).set({
        status: "delivering",
        attempts: candidate.attempts + 1,
        firstAttemptAt: candidate.firstAttemptAt ?? now,
        lastAttemptAt: now,
        leaseToken: randomUUID(),
        leaseExpiresAt: new Date(now.getTime() + AUDIT_LEASE_MS),
      }).where(eq(auditLogDeliveries.auditEventId, candidate.auditEventId)).returning();
      return claimed;
    });
    if (!job) break;
    result.processed++;
    if (job.status === "failed") { result.failed++; continue; }

    const delivery = await sendWorkOSAuditSnapshot(job.workosOrgId, job.eventJson, job.auditEventId);
    const now = new Date();
    const leaseCondition = and(eq(auditLogDeliveries.auditEventId, job.auditEventId),
      eq(auditLogDeliveries.status, "delivering"), eq(auditLogDeliveries.leaseToken, job.leaseToken!));
    if (delivery.ok) {
      await db.transaction(async (tx) => {
        const updated = await tx.update(auditLogDeliveries).set({
          status: "delivered", deliveredAt: now, lastError: null, leaseToken: null, leaseExpiresAt: null,
        }).where(leaseCondition).returning({ id: auditLogDeliveries.auditEventId });
        if (updated.length) {
          await tx.update(tenants).set({ workosAuditLogsLastSentAt: now }).where(eq(tenants.id, job.tenantId));
          result.delivered++;
        }
      });
    } else {
      const delay = Math.max(auditRetryDelayMs(job.attempts), delivery.retryAfterMs ?? 0);
      const retry = delivery.retryable !== false && job.attempts < AUDIT_MAX_ATTEMPTS
        && now.getTime() + delay - job.firstAttemptAt!.getTime() < AUDIT_RETRY_WINDOW_MS;
      const updated = await db.update(auditLogDeliveries).set({
        status: retry ? "pending" : "failed",
        nextAttemptAt: new Date(now.getTime() + delay),
        lastError: delivery.reason,
        leaseToken: null,
        leaseExpiresAt: null,
      }).where(leaseCondition).returning({ id: auditLogDeliveries.auditEventId });
      if (updated.length) { if (retry) result.retried++; else result.failed++; }
    }
  }
  return result;
}

export async function getAuditDeliveryState(tenantId: string, auditEventId: string) {
  const [row] = await getDb().select({ status: auditLogDeliveries.status, lastError: auditLogDeliveries.lastError })
    .from(auditLogDeliveries).where(and(eq(auditLogDeliveries.tenantId, tenantId), eq(auditLogDeliveries.auditEventId, auditEventId))).limit(1);
  return row ?? null;
}

export async function getAuditDeliveryCounts(tenantId: string) {
  const rows = await getDb().select({ status: auditLogDeliveries.status, count: count() })
    .from(auditLogDeliveries).where(eq(auditLogDeliveries.tenantId, tenantId)).groupBy(auditLogDeliveries.status);
  const counts = { pending: 0, delivering: 0, delivered: 0, failed: 0 };
  for (const row of rows) if (row.status in counts) counts[row.status as keyof typeof counts] = row.count;
  return counts;
}
