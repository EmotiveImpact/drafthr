// Append a hash-chained audit event. Per-tenant chain.
//
// row_hash = sha256(prev_hash || ':' || canonicalJson(payload) || ':' || kind
//                   || ':' || subject_id || ':' || created_at_epoch_ms)
//
// Genesis prev_hash for a tenant is 64 zeros. The whole select-then-insert
// runs in a single transaction to keep concurrent appends serialised.
//
// WorkOS delivery jobs are written in the SAME transaction, never sent from
// the write path. A committed outbox job survives process exit/provider
// failure; a rolled-back business action cannot escape to the provider.
import { createHash } from "node:crypto";
import { desc, eq, sql } from "drizzle-orm";
import { auditEvents, auditLogDeliveries, tenants, users } from "./schema.js";
import { getDb } from "./index.js";
import { canonicalJson } from "./canonical-json.js";
import { buildWorkOSAuditSnapshot, isWorkOSAuditLogsEnabled } from "../lib/audit/workos-sink.js";

export const GENESIS_PREV_HASH = "0".repeat(64);

export type AppendAuditEventInput = {
  tenantId: string;
  kind: string;
  subjectType: string;
  subjectId: string;
  actorUserId?: string | null;
  payload: Record<string, unknown>;
};

export type AppendAuditEventResult = {
  id: string;
  rowHash: string;
  prevHash: string;
  createdAt: Date;
  sequence: number;
};

export function computeRowHash(opts: {
  prevHash: string;
  payload: Record<string, unknown>;
  kind: string;
  subjectId: string;
  createdAtEpochMs: number;
}): string {
  const input = [
    opts.prevHash,
    canonicalJson(opts.payload),
    opts.kind,
    opts.subjectId,
    String(opts.createdAtEpochMs),
  ].join(":");
  return createHash("sha256").update(input).digest("hex");
}

export async function appendAuditEvent(
  input: AppendAuditEventInput,
  transaction?: Parameters<Parameters<ReturnType<typeof getDb>["transaction"]>[0]>[0],
): Promise<AppendAuditEventResult> {
  const db = getDb();
  const write = async (tx: Parameters<Parameters<typeof db.transaction>[0]>[0]) => {
    // Serialize each tenant's chain head. Without this lock, concurrent appends
    // can read the same tail row and both insert events with the same prev_hash.
    await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtextextended(${input.tenantId}, 0))`);

    const [prev] = await tx
      .select({ rowHash: auditEvents.rowHash, sequence: auditEvents.sequence })
      .from(auditEvents)
      .where(eq(auditEvents.tenantId, input.tenantId))
      .orderBy(desc(auditEvents.sequence))
      .limit(1);

    const prevHash = prev?.rowHash ?? GENESIS_PREV_HASH;
    const sequence = (prev?.sequence ?? 0) + 1;
    if (!Number.isSafeInteger(sequence)) throw new Error("Audit sequence exhausted; administrator review required");
    const createdAt = new Date();
    const rowHash = computeRowHash({
      prevHash,
      payload: input.payload,
      kind: input.kind,
      subjectId: input.subjectId,
      createdAtEpochMs: createdAt.getTime(),
    });

    const [insertedRow] = await tx
      .insert(auditEvents)
      .values({
        tenantId: input.tenantId,
        kind: input.kind,
        subjectType: input.subjectType,
        subjectId: input.subjectId,
        actorUserId: input.actorUserId ?? null,
        payloadJson: input.payload,
        prevHash,
        rowHash,
        sequence,
        createdAt,
      })
      .returning({
        id: auditEvents.id,
        rowHash: auditEvents.rowHash,
        prevHash: auditEvents.prevHash,
        createdAt: auditEvents.createdAt,
        sequence: auditEvents.sequence,
      });

    if (isWorkOSAuditLogsEnabled()) {
      const [tenant] = await tx.select({ workosOrgId: tenants.workosOrgId })
        .from(tenants).where(eq(tenants.id, input.tenantId)).limit(1);
      if (tenant?.workosOrgId) {
        const [actor] = input.actorUserId
          ? await tx.select({ email: users.email, legalName: users.legalName }).from(users)
            .where(eq(users.id, input.actorUserId)).limit(1)
          : [];
        await tx.insert(auditLogDeliveries).values({
          auditEventId: insertedRow.id,
          tenantId: input.tenantId,
          workosOrgId: tenant.workosOrgId,
          eventJson: buildWorkOSAuditSnapshot({
            tenantId: input.tenantId,
            workosOrgId: tenant.workosOrgId,
            actorId: input.actorUserId ?? null,
            actorEmail: actor?.email ?? null,
            actorName: actor?.legalName ?? null,
            action: input.kind,
            targetType: input.subjectType,
            targetId: input.subjectId,
            occurredAt: createdAt,
            metadata: input.payload,
            idempotencyKey: insertedRow.id,
          }),
        });
      }
    }
    return insertedRow;
  };
  return transaction ? write(transaction) : db.transaction(write);
}
