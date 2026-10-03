/** Read-only validation for both pre-0025 and sequenced audit histories. */
import { computeRowHash, GENESIS_PREV_HASH } from "./audit.js";

export type HistoricalAuditRow = {
  id: string;
  rowHash: string;
  prevHash: string;
  kind: string;
  subjectId: string;
  payload: Record<string, unknown>;
  createdAt: Date;
  sequence?: number;
};

type Result = { ok: true; rowCount: number } | {
  ok: false; rowId: string | null;
  reason: "duplicate_id" | "duplicate_hash" | "fork" | "invalid_genesis" | "disconnected" | "hash_mismatch" | "sequence_mismatch";
};

/** Input must contain one complete tenant history from a consistent snapshot.
 * Derive order from links, not clocks or UUIDs; never repair/rewrite a row. */
export function verifyHistoricalAuditRows(rows: HistoricalAuditRow[]): Result {
  const ids = new Set<string>();
  const hashes = new Set<string>();
  const successors = new Map<string, HistoricalAuditRow>();
  for (const row of rows) {
    if (ids.has(row.id)) return { ok: false, rowId: row.id, reason: "duplicate_id" };
    if (row.rowHash === GENESIS_PREV_HASH) return { ok: false, rowId: row.id, reason: "invalid_genesis" };
    if (hashes.has(row.rowHash)) return { ok: false, rowId: row.id, reason: "duplicate_hash" };
    if (successors.has(row.prevHash)) return { ok: false, rowId: row.id, reason: "fork" };
    ids.add(row.id); hashes.add(row.rowHash); successors.set(row.prevHash, row);
  }
  let previous = GENESIS_PREV_HASH;
  let count = 0;
  while (successors.has(previous)) {
    const row = successors.get(previous)!;
    const expected = computeRowHash({ prevHash: previous, payload: row.payload, kind: row.kind,
      subjectId: row.subjectId, createdAtEpochMs: row.createdAt.getTime() });
    if (expected !== row.rowHash) return { ok: false, rowId: row.id, reason: "hash_mismatch" };
    count++;
    if (row.sequence !== undefined && (!Number.isSafeInteger(row.sequence) || row.sequence !== count)) {
      return { ok: false, rowId: row.id, reason: "sequence_mismatch" };
    }
    // Delete visited links: bounded even for corrupt cyclic input.
    successors.delete(previous);
    previous = row.rowHash;
  }
  if (count !== rows.length) return { ok: false, rowId: successors.values().next().value?.id ?? null, reason: "disconnected" };
  return { ok: true, rowCount: count };
}
