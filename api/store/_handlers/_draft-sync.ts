/**
 * Pure decision rules for the drafts upsert, kept out of the handler so the
 * tombstone and revision behaviour can be unit-tested without a database.
 *
 * - A tombstoned (soft-deleted) draft is never written to or re-created by an
 *   ordinary upsert: the caller gets 410 and no letter credit is spent. The
 *   only way back is an explicit `restore` (the Undo action) shortly after the
 *   delete.
 * - Every accepted write bumps `revision`. An update must name the revision it
 *   was built on (`baseRevision`); anything else is stale and gets a 409 with
 *   the current row, so one device can no longer overwrite another's edits or
 *   revert an approval it never saw.
 * - A client loaded before revisions existed (a tab left open across the
 *   deploy) sends no `baseRevision` at all. It gets the old edit-time check
 *   instead of a 409 on every write, so its edits keep reaching the server,
 *   except that it may not take a letter out of "approved" (it can't know the
 *   approval happened).
 */

/** How long after a delete the deleting device may still Undo it. */
export const RESTORE_WINDOW_MS = 15 * 60_000;

export type ExistingDraftState = {
  tenantId: string;
  revision: number;
  deletedAt: Date | null;
  /** Used only for writes from clients without revisions. */
  updatedAt?: Date | null;
  reviewStatus?: string | null;
};

export type DraftWriteDecision =
  | { kind: "create" }
  | { kind: "update"; expectedRevision: number; restore: boolean }
  | { kind: "forbidden" }
  | { kind: "gone"; deletedAt: Date }
  | { kind: "stale" };

export function parseBaseRevision(value: unknown): number | null {
  return typeof value === "number" && Number.isInteger(value) && value >= 0 ? value : null;
}

export function decideDraftWrite(
  existing: ExistingDraftState | null,
  tenantId: string,
  input: { baseRevision?: unknown; restore?: unknown; clientRevision?: unknown; reviewStatus?: unknown },
  nowMs: number,
): DraftWriteDecision {
  if (!existing) return { kind: "create" };
  if (existing.tenantId !== tenantId) return { kind: "forbidden" };
  if (existing.deletedAt) {
    const withinWindow = nowMs - existing.deletedAt.getTime() <= RESTORE_WINDOW_MS;
    if (input.restore === true && withinWindow) {
      return { kind: "update", expectedRevision: existing.revision, restore: true };
    }
    return { kind: "gone", deletedAt: existing.deletedAt };
  }
  // Current clients always send the field (null when they don't know the
  // revision). Its absence marks a client from before revisions.
  if (input.baseRevision === undefined) return decideLegacyWrite(existing, input);
  const base = parseBaseRevision(input.baseRevision);
  if (base === null || base !== existing.revision) return { kind: "stale" };
  return { kind: "update", expectedRevision: existing.revision, restore: false };
}

/** The pre-revision rule: the client's edit time must not be older than the
 *  stored one. The update still compare-and-swaps on the current revision. */
function decideLegacyWrite(
  existing: ExistingDraftState,
  input: { clientRevision?: unknown; reviewStatus?: unknown },
): DraftWriteDecision {
  const clientRevision =
    typeof input.clientRevision === "number" && Number.isFinite(input.clientRevision) && input.clientRevision >= 0
      ? input.clientRevision
      : null;
  if (clientRevision === null || !existing.updatedAt || clientRevision < existing.updatedAt.getTime()) {
    return { kind: "stale" };
  }
  if (existing.reviewStatus === "approved" && (input.reviewStatus ?? "draft") !== "approved") {
    return { kind: "stale" };
  }
  return { kind: "update", expectedRevision: existing.revision, restore: false };
}
