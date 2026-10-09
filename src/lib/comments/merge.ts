/**
 * Per-item merge rules for a draft's collaboration data, shared by the client
 * pull and the server's draft-extras write so both sides converge the same way.
 *
 * Comments are keyed by id. Each carries `updatedAt` (bumped on resolve /
 * reopen) and may be a tombstone (`deleted: true`). A tombstone always wins,
 * so a deleted comment can't be brought back by a device that still has it;
 * otherwise the copy with the newer `updatedAt` wins, which is how resolve and
 * reopen travel between devices. Comments are never dropped just because one
 * side doesn't have them, so a new comment can't be erased by a stale device.
 *
 * Timeline entries are append-only by id.
 */

/** A comment as it travels through sync (a Comment, or a tombstone of one). */
export type SyncedComment = {
  id: string;
  sectionId?: string;
  parentId?: string;
  authorId?: string;
  /** Workspace user id of the author, stamped by the server. */
  authorUserId?: string;
  authorName?: string;
  authorEmail?: string;
  body?: string;
  quote?: string;
  createdAt?: number;
  updatedAt?: number;
  resolved?: boolean;
  resolvedAt?: number;
  resolvedBy?: string;
  deleted?: boolean;
  deletedAt?: number;
};

export function commentVersion(c: SyncedComment): number {
  return typeof c.updatedAt === "number" ? c.updatedAt : typeof c.createdAt === "number" ? c.createdAt : 0;
}

/** Pick the winning copy of one comment. Ties keep `a`. */
export function pickComment<T extends SyncedComment>(a: T, b: T): T {
  if (a.deleted && !b.deleted) return a;
  if (b.deleted && !a.deleted) return b;
  return commentVersion(b) > commentVersion(a) ? b : a;
}

/** Merge two comment lists by id. Ties keep the copy from `a`. */
export function mergeCommentLists<T extends SyncedComment>(a: T[] | undefined, b: T[] | undefined): T[] {
  const map = new Map<string, T>();
  for (const c of a ?? []) {
    if (c && typeof c.id === "string") map.set(c.id, c);
  }
  for (const c of b ?? []) {
    if (!c || typeof c.id !== "string") continue;
    const prev = map.get(c.id);
    map.set(c.id, prev ? pickComment(prev, c) : c);
  }
  return [...map.values()].sort((x, y) => (x.createdAt ?? 0) - (y.createdAt ?? 0));
}

/** Append-only union by id. Existing entries in `a` are never replaced. */
export function unionAppendOnly<T extends { id: string; createdAt?: number }>(
  a: T[] | undefined,
  b: T[] | undefined,
  cap = 500,
): T[] {
  const map = new Map<string, T>();
  for (const x of a ?? []) {
    if (x && typeof x.id === "string") map.set(x.id, x);
  }
  for (const x of b ?? []) {
    if (x && typeof x.id === "string" && !map.has(x.id)) map.set(x.id, x);
  }
  return [...map.values()].sort((x, y) => (x.createdAt ?? 0) - (y.createdAt ?? 0)).slice(-cap);
}
