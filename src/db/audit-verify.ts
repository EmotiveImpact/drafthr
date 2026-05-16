// Walk every audit event for a tenant in insertion order and recompute the
// chain. Returns ok=true if every row's row_hash matches sha256(prev_hash ||
// ':' || canonical(payload) || ':' || kind || ':' || subject_id || ':' ||
// created_at_epoch_ms), or the first mismatch.
//
// This is the tribunal-defensibility demo: any retroactive edit breaks the
// chain at the edit point and every row after it.
import { asc, eq } from "drizzle-orm";
import { auditEvents } from "./schema.js";
import { getDb } from "./index.js";
import { computeRowHash, GENESIS_PREV_HASH } from "./audit.js";

export type VerifyAuditChainResult =
  | { ok: true; rowCount: number }
  | {
      ok: false;
      brokenAtId: string;
      expected: string;
      actual: string;
      reason: "row_hash_mismatch" | "prev_hash_mismatch";
    };

export async function verifyAuditChain(tenantId: string): Promise<VerifyAuditChainResult> {
  const db = getDb();
  const rows = await db
    .select()
    .from(auditEvents)
    .where(eq(auditEvents.tenantId, tenantId))
    .orderBy(asc(auditEvents.createdAt), asc(auditEvents.id));

  let expectedPrev = GENESIS_PREV_HASH;
  for (const row of rows) {
    if (row.prevHash !== expectedPrev) {
      return {
        ok: false,
        brokenAtId: row.id,
        expected: expectedPrev,
        actual: row.prevHash,
        reason: "prev_hash_mismatch",
      };
    }
    const recomputed = computeRowHash({
      prevHash: row.prevHash,
      payload: row.payloadJson as Record<string, unknown>,
      kind: row.kind,
      subjectId: row.subjectId,
      createdAtEpochMs: row.createdAt.getTime(),
    });
    if (recomputed !== row.rowHash) {
      return {
        ok: false,
        brokenAtId: row.id,
        expected: recomputed,
        actual: row.rowHash,
        reason: "row_hash_mismatch",
      };
    }
    expectedPrev = row.rowHash;
  }
  return { ok: true, rowCount: rows.length };
}
