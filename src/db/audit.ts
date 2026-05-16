// Append a hash-chained audit event. Per-tenant chain.
//
// row_hash = sha256(prev_hash || ':' || canonicalJson(payload) || ':' || kind
//                   || ':' || subject_id || ':' || created_at_epoch_ms)
//
// Genesis prev_hash for a tenant is 64 zeros. The whole select-then-insert
// runs in a single transaction to keep concurrent appends serialised.
import { createHash } from "node:crypto";
import { desc, eq } from "drizzle-orm";
import { auditEvents } from "./schema.js";
import { getDb } from "./index.js";
import { canonicalJson } from "./canonical-json.js";

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
): Promise<AppendAuditEventResult> {
  const db = getDb();
  return db.transaction(async (tx) => {
    const [prev] = await tx
      .select({ rowHash: auditEvents.rowHash })
      .from(auditEvents)
      .where(eq(auditEvents.tenantId, input.tenantId))
      .orderBy(desc(auditEvents.createdAt))
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

    const [row] = await tx
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

    return row;
  });
}
