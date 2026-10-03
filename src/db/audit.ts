// Append a hash-chained audit event. Per-tenant chain.
//
// row_hash = sha256(prev_hash || ':' || canonicalJson(payload) || ':' || kind
//                   || ':' || subject_id || ':' || created_at_epoch_ms)
//
// Genesis prev_hash for a tenant is 64 zeros. The whole select-then-insert
// runs in a single transaction to keep concurrent appends serialised.
//
// AFTER the transaction commits we fire-and-forget the WorkOS Audit Logs
// sink (`sendToWorkOSAuditLogs`). That sink is a best-effort downstream
// mirror — the local chain remains the source of truth. We deliberately do
// not await the mirror call: WorkOS being down must never break HR flows.
// The mirror is also gated by env (`WORKOS_AUDIT_LOGS_ENABLED`) and by the
// tenant's `workos_org_id` (null = skip).
import { createHash } from "node:crypto";
import { desc, eq, sql } from "drizzle-orm";
import { auditEvents, tenants, users } from "./schema.js";
import { getDb } from "./index.js";
import { canonicalJson } from "./canonical-json.js";
import { sendToWorkOSAuditLogs } from "../lib/audit/workos-sink.js";

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
      .select({ rowHash: auditEvents.rowHash })
      .from(auditEvents)
      .where(eq(auditEvents.tenantId, input.tenantId))
      .orderBy(desc(auditEvents.createdAt), desc(auditEvents.id))
      .limit(1);

    const prevHash = prev?.rowHash ?? GENESIS_PREV_HASH;
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
        createdAt,
      })
      .returning({
        id: auditEvents.id,
        rowHash: auditEvents.rowHash,
        prevHash: auditEvents.prevHash,
        createdAt: auditEvents.createdAt,
      });

    return insertedRow;
  };
  const row = transaction ? await write(transaction) : await db.transaction(write);

  // Transaction has committed. Fire the WorkOS mirror fire-and-forget — we
  // deliberately do not await so callers never block on WorkOS latency, and
  // never see a WorkOS-side failure bubble up. The sink itself swallows
  // exceptions and returns a typed result.
  // Callers composing an atomic business transaction must not send an external
  // event before commit. Their authoritative local chain is written atomically.
  if (!transaction) void mirrorToWorkOS({
    tenantId: input.tenantId,
    actorUserId: input.actorUserId ?? null,
    action: input.kind,
    targetType: input.subjectType,
    targetId: input.subjectId,
    occurredAt: row.createdAt,
    metadata: input.payload,
    auditEventId: row.id,
  });

  return row;
}

type MirrorInput = {
  tenantId: string;
  actorUserId: string | null;
  action: string;
  targetType: string;
  targetId: string;
  occurredAt: Date;
  metadata: Record<string, unknown>;
  auditEventId: string;
};

/**
 * Resolve tenant `workos_org_id` + the actor's email/name, then forward to
 * the sink. Kept here (not in the sink module) because it's the join point
 * between DraftHR's row shape and the WorkOS event shape — the sink stays
 * provider-shaped, this function stays DraftHR-shaped.
 */
async function mirrorToWorkOS(input: MirrorInput): Promise<void> {
  try {
    const db = getDb();
    const [tenant] = await db
      .select({
        workosOrgId: tenants.workosOrgId,
      })
      .from(tenants)
      .where(eq(tenants.id, input.tenantId))
      .limit(1);

    let actorEmail: string | null = null;
    let actorName: string | null = null;
    if (input.actorUserId) {
      const [u] = await db
        .select({ email: users.email, legalName: users.legalName })
        .from(users)
        .where(eq(users.id, input.actorUserId))
        .limit(1);
      actorEmail = u?.email ?? null;
      actorName = u?.legalName ?? null;
    }

    await sendToWorkOSAuditLogs({
      tenantId: input.tenantId,
      workosOrgId: tenant?.workosOrgId ?? null,
      actorId: input.actorUserId,
      actorEmail,
      actorName,
      action: input.action,
      targetType: input.targetType,
      targetId: input.targetId,
      occurredAt: input.occurredAt,
      metadata: input.metadata,
      idempotencyKey: input.auditEventId,
    });
  } catch (err) {
    // Best-effort — never let mirror failures escape.
    console.warn("[audit] mirrorToWorkOS failed", err);
  }
}
