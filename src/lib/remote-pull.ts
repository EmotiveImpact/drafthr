/**
 * Cross-device READ path — the pull half of dual-write.
 *
 * dual-write.ts pushes drafts to Postgres (write-only). This module pulls them
 * back so a teammate or a second device sees the same letters. It is the
 * counterpart to marketplaceSync's pullProfile.
 *
 * SAFETY — the merge is NON-DESTRUCTIVE by construction:
 *   • For a draft that exists both locally and on the server, we SPREAD the
 *     local object first and overlay ONLY the server-synced fields. Every
 *     local-only field (comments, evidence, timeline, approvals, aiChat,
 *     exports, collaborators, per-section versions/pendingChange) is preserved
 *     automatically — including fields added in the future — because we never
 *     enumerate them to drop.
 *   • Revision-aware: when this device knows the server revision its copy is
 *     based on (sync-meta), a local copy with unsynced edits is kept untouched
 *     and the next push resolves any conflict (409 → keep both). A local copy
 *     with no unsynced edits takes the newer server version. Without sync
 *     metadata (older callers, tests) the legacy newer-updatedAt rule applies.
 *   • A draft present only on the server is adopted (created on another device).
 *   • A draft present only locally is kept (created offline / not yet pushed).
 *
 * Gated by the same VITE_DRAFTHR_DUAL_WRITE flag as the write path, so read and
 * write are always consistent and the default (flag off) behaviour is unchanged.
 *
 *   • Deletes propagate: the server returns tombstones for deleted drafts and
 *     the merge drops the local copy.
 *
 * Known limitations (documented, none are data-loss):
 *   • A pulled draft's matterId is the SERVER matter UUID. Matters are still
 *     push-only (no matters GET yet), so on the pulling device that id won't
 *     resolve to a local matter and the draft↔matter link is hidden in the UI.
 *     The UUID is preserved (every dereference is null-safe) so the link is
 *     restored once a symmetric matters-pull lands; it's never written wrong.
 * That is a later feature (matters pull).
 */
import type {
  Draft,
  EmployeeDetails,
  EmployerDetails,
  LetterAnswers,
  LetterContext,
  LetterTypeId,
  Mode,
  ReviewStatus,
  Section,
  SectionId,
} from "@/lib/letters/types";
import type { Comment, CommentTombstone } from "@/lib/letters/types";
import { toServerUuid } from "@/lib/remote-ids";
import { uid } from "@/lib/utils";
import { mergeCommentLists, type SyncedComment } from "@/lib/comments/merge";
import type { SyncMeta } from "@/lib/sync-meta";

/** One section as returned by GET /api/store/drafts. */
export type RemoteSection = {
  sectionId: string;
  title: string;
  html: string;
  status: Section["status"];
  position: number;
};

/** One draft as returned by GET /api/store/drafts (mirrors toServerPayload). */
export type RemoteDraft = {
  id: string;
  letterType: string;
  mode: string;
  title: string | null;
  jurisdiction: string | null;
  matterId: string | null;
  reviewStatus: string | null;
  isTemplateSource: boolean;
  templateSourceId: string | null;
  context: Record<string, unknown>;
  employer: Record<string, unknown> | null;
  employee: Record<string, unknown> | null;
  answers: Record<string, unknown> | null;
  createdAt: number;
  updatedAt: number;
  /** Server write revision (absent from servers older than migration 0020). */
  revision?: number;
  sections: RemoteSection[];
};

/** A deleted draft as returned by GET /api/store/drafts. */
export type RemoteTombstone = { id: string; deletedAt: number };

/** Read/write access to sync bookkeeping, injected so the merge stays pure. */
export type SyncMetaAccess = {
  get: (localId: string) => SyncMeta | undefined;
  /** Record that the local copy now matches this server revision. */
  adopted: (localId: string, revision: number, draft: Draft) => void;
  /** Record the server revision under a local copy that has its own edits. */
  rebased: (localId: string, revision: number) => void;
  clear: (localId: string) => void;
};

/** Overlay a server version onto a local draft, keeping every local-only
 *  field (comments, evidence, AI chat, section versions …). */
export function applyRemoteDraft(existing: Draft, r: RemoteDraft): Draft {
  return {
    ...existing,
    ...syncedFields(r, existing),
    id: existing.id,
    createdAt: existing.createdAt,
  } as Draft;
}

/** Rebuild the sections array, preserving local section id/required/versions/
 *  pendingChange when a section with the same sectionId already exists.
 *
 *  Local-id reuse is ONE-SHOT: the server's sections table has no unique
 *  constraint on (draftId, sectionId), so a draft can have two rows with the
 *  same sectionId. We consume each local match once, so a second duplicate
 *  falls through to a fresh uid() — never two Sections sharing one id (which
 *  would collide React keys and misroute every edit to the first match). */
function mergeSections(remote: RemoteSection[], local?: Draft): Section[] {
  const localBySectionId = new Map<string, Section>();
  for (const s of local?.sections ?? []) localBySectionId.set(s.sectionId, s);
  return [...remote]
    .sort((a, b) => a.position - b.position)
    .map((rs) => {
      const ls = localBySectionId.get(rs.sectionId);
      if (ls) localBySectionId.delete(rs.sectionId); // consume once
      return {
        id: ls?.id ?? uid("sec"),
        sectionId: rs.sectionId as SectionId,
        title: rs.title,
        html: rs.html,
        status: rs.status,
        // `required` isn't server-synced; preserve local, else default to
        // required (conservative — surfaces the section in validation rather
        // than silently treating it as optional).
        required: ls?.required ?? true,
        versions: ls?.versions ?? [],
        pendingChange: ls?.pendingChange,
      } satisfies Section;
    });
}

/** Fill a (possibly null) server party block out to a schema-valid object, so
 *  an adopted remote-only draft is never structurally incomplete. */
function withEmployerDefaults(e: Record<string, unknown> | null | undefined): EmployerDetails {
  return {
    legalName: "",
    address: "",
    hasLetterhead: false,
    signatoryName: "",
    signatoryTitle: "",
    ...(e ?? {}),
  } as unknown as EmployerDetails;
}
function withEmployeeDefaults(e: Record<string, unknown> | null | undefined): EmployeeDetails {
  return {
    legalName: "",
    jobTitle: "",
    address: "",
    startDate: "",
    serviceMonths: 0,
    ...(e ?? {}),
  } as unknown as EmployeeDetails;
}

/** Server-synced fields applied over a (possibly existing) local draft. */
function syncedFields(r: RemoteDraft, local?: Draft) {
  return {
    mode: r.mode as Mode,
    letterType: r.letterType as LetterTypeId,
    context: r.context as unknown as LetterContext,
    // Null server party/answers blobs fall back to the local copy (a draft
    // first synced while empty stores null), then to schema-valid defaults —
    // never erasing populated local data.
    employer: withEmployerDefaults(r.employer ?? (local?.employer as Record<string, unknown> | undefined)),
    employee: withEmployeeDefaults(r.employee ?? (local?.employee as Record<string, unknown> | undefined)),
    answers: (r.answers ?? local?.answers ?? {}) as unknown as LetterAnswers,
    sections: mergeSections(r.sections, local),
    title: r.title ?? undefined,
    // The server stores the hashed uuid of a local `matter_…` id. Keep the
    // local id when they refer to the same matter, or the draft would drop
    // out of its matter on the device that filed it.
    matterId:
      local?.matterId && r.matterId && toServerUuid(local.matterId) === r.matterId
        ? local.matterId
        : r.matterId ?? undefined,
    reviewStatus: (r.reviewStatus ?? undefined) as ReviewStatus | undefined,
    isTemplateSource: r.isTemplateSource,
    templateSourceId: r.templateSourceId ?? undefined,
    createdAt: r.createdAt,
    updatedAt: r.updatedAt,
  };
}

/**
 * Merge server drafts into the local draft map. Pure + non-destructive.
 * `local` is keyed by the LOCAL draft id; the return value is a new map, also
 * keyed by local id (existing) or the server UUID (remote-only adoptions).
 */
export function mergeRemoteDrafts(
  local: Record<string, Draft>,
  remote: RemoteDraft[],
  /** Server uuids deleted locally whose DELETE hasn't been confirmed yet
   *  (dual-write persistedDraftTombstones). Without this, deleting a draft and
   *  closing the tab before the DELETE landed resurrected it on next mount:
   *  the merge adopted the server row, the store subscription re-POSTed it,
   *  and PII the user destroyed re-entrenched itself (BUG-05). */
  tombstonedServerIds: ReadonlySet<string> = new Set(),
  options: {
    /** Drafts deleted on the server (by any device). Their local copy is
     *  dropped, except a local-only conflict copy. */
    deleted?: RemoteTombstone[];
    /** Sync bookkeeping. When given, revisions decide newer-vs-older. */
    syncMeta?: SyncMetaAccess;
    /** Content key of a local draft (sync-meta draftSyncKey), injected so this
     *  module doesn't import the hashing helpers. */
    syncKey?: (d: Draft) => string;
    /** Told about a draft deleted elsewhere that was kept on this device only
     *  because it holds edits the server never received. */
    onKeptLocalOnly?: (localId: string) => void;
  } = {},
): Record<string, Draft> {
  // Index local drafts by their server-uuid so we can match against remote.
  const localByServerId = new Map<string, Draft>();
  for (const d of Object.values(local)) localByServerId.set(toServerUuid(d.id), d);

  const merged: Record<string, Draft> = { ...local };
  const { syncMeta, syncKey } = options;

  for (const t of options.deleted ?? []) {
    const existing = localByServerId.get(t.id);
    if (!existing || existing.localOnly) continue;
    // Same rule as a 410 on push: edits the server never received are kept
    // on this device only rather than dropped with the deleted draft.
    const meta = syncMeta?.get(existing.id);
    const unsynced =
      meta && syncKey ? meta.key !== syncKey(existing) : existing.updatedAt > t.deletedAt;
    localByServerId.delete(t.id);
    syncMeta?.clear(existing.id);
    if (unsynced) {
      merged[existing.id] = { ...existing, localOnly: true };
      options.onKeptLocalOnly?.(existing.id);
    } else {
      delete merged[existing.id];
    }
  }

  for (const r of remote) {
    // A tombstoned row is pending deletion — never adopt it. (If it ALSO
    // exists locally the user restored it via Undo, which clears the
    // tombstone, so this guard only ever suppresses remote-only ghosts.)
    if (tombstonedServerIds.has(r.id) && !localByServerId.has(r.id)) continue;
    const existing = localByServerId.get(r.id);
    if (existing && existing.localOnly) continue;
    if (existing && syncMeta && syncKey && typeof r.revision === "number") {
      const meta = syncMeta.get(existing.id);
      const unsynced = !meta || meta.key !== syncKey(existing);
      if (meta && meta.rev >= r.revision) continue; // server unchanged since our base
      if (unsynced) {
        if (!meta && existing.updatedAt >= r.updatedAt) {
          // First sync after the revision upgrade: the local copy was edited
          // after the server's, so treat it as built on this revision. Any
          // real conflict still surfaces as a 409 on the next push.
          syncMeta.rebased(existing.id, r.revision);
          continue;
        }
        if (meta) continue; // unsynced edits: the next push resolves (409 keeps both)
      }
      const next = applyRemoteDraft(existing, r);
      merged[existing.id] = next;
      syncMeta.adopted(existing.id, r.revision, next);
      continue;
    }
    if (existing) {
      // Keep local on newer-OR-EQUAL timestamp: a strict > would let a
      // same-millisecond server copy clobber an unsynced local edit.
      if (existing.updatedAt >= r.updatedAt) continue;
      // Overlay synced fields; SPREAD local first so local-only fields survive.
      // createdAt is an immutable creation fact — never let the server row's
      // (sync-time) createdAt overwrite the true local one.
      merged[existing.id] = {
        ...existing,
        ...syncedFields(r, existing),
        id: existing.id,
        createdAt: existing.createdAt,
      } as Draft;
    } else {
      // Remote-only — adopt it under the server UUID as the local id.
      const adopted = {
        id: r.id,
        ...syncedFields(r, undefined),
      } as Draft;
      merged[r.id] = adopted;
      if (syncMeta && typeof r.revision === "number") syncMeta.adopted(r.id, r.revision, adopted);
    }
  }

  return merged;
}

/**
 * Fetch the tenant's drafts from the server and merge them into the local
 * store. No-op (returns null) when dual-write is off or the fetch fails — pull
 * is best-effort and must never break the local-first experience.
 */
export async function pullRemoteDrafts(
  applyMerge: (remote: RemoteDraft[], deleted: RemoteTombstone[]) => void,
): Promise<{ ok: boolean; count: number }> {
  if (!dualWriteEnabled()) return { ok: false, count: 0 };
  try {
    const res = await fetch("/api/store/drafts", {
      method: "GET",
      credentials: "same-origin",
      headers: { Accept: "application/json" },
    });
    if (!res.ok) return { ok: false, count: 0 };
    const ct = res.headers.get("content-type") ?? "";
    if (!ct.toLowerCase().includes("application/json")) return { ok: false, count: 0 };
    const data = (await res.json()) as { drafts?: RemoteDraft[]; deleted?: RemoteTombstone[] };
    const remote = Array.isArray(data.drafts) ? data.drafts : [];
    const deleted = Array.isArray(data.deleted) ? data.deleted : [];
    applyMerge(remote, deleted);
    return { ok: true, count: remote.length };
  } catch {
    return { ok: false, count: 0 };
  }
}

function dualWriteEnabled(): boolean {
  try {
    return (import.meta.env?.VITE_DRAFTHR_DUAL_WRITE as string | undefined) === "true";
  } catch {
    return false;
  }
}

/* ===========================================================================
 * Collaboration-data sync (comments / timeline / approvals / outcomeSought).
 * Decoupled from the draft sync above — a separate endpoint + merge so it can
 * never block base draft sync. Evidence file blobs are intentionally excluded
 * (base64 → object storage, not JSON).
 * ========================================================================= */

/** The collab subset of a Draft that syncs through /api/store/draft-extras. */
export type DraftExtras = {
  /** Live comments plus tombstones (`deleted: true`) of deleted ones. */
  comments?: SyncedComment[];
  timeline?: Draft["timeline"];
  approvals?: Draft["approvals"];
  outcomeSought?: Draft["outcomeSought"];
};

export type RemoteExtras = { id: string; extras: DraftExtras };

/** Pull the collab fields off a draft for pushing. Returns null when there's
 *  nothing to sync (so we don't write empty rows). */
export function extractExtras(draft: Draft): DraftExtras | null {
  const extras: DraftExtras = {};
  const tombstones: SyncedComment[] = (draft.commentTombstones ?? []).map((t) => ({
    id: t.id,
    deleted: true,
    deletedAt: t.deletedAt,
    updatedAt: t.deletedAt,
  }));
  if (draft.comments?.length || tombstones.length) {
    extras.comments = [...(draft.comments ?? []), ...tombstones];
  }
  if (draft.timeline?.length) extras.timeline = draft.timeline;
  if (draft.approvals?.length) extras.approvals = draft.approvals;
  if (draft.outcomeSought) extras.outcomeSought = draft.outcomeSought;
  return Object.keys(extras).length ? extras : null;
}

/** Union two id-keyed lists: keep the LOCAL copy on an id collision (local
 *  edits win), append remote-only items, then order by createdAt. Never drops
 *  a local OR a remote item — non-destructive both ways. */
function unionById<T extends { id: string; createdAt?: number }>(
  local: T[] | undefined,
  remote: T[] | undefined,
): T[] {
  const map = new Map<string, T>();
  for (const x of remote ?? []) map.set(x.id, x); // remote first…
  for (const x of local ?? []) map.set(x.id, x); // …local overwrites on collision
  return [...map.values()].sort((a, b) => (a.createdAt ?? 0) - (b.createdAt ?? 0));
}

/** Merge local comments (+ tombstones) with a remote comment list per item:
 *  tombstones win, otherwise the newer updatedAt wins (resolve / reopen). */
export function mergeCommentsWithRemote(
  draft: Draft,
  remote: SyncedComment[] | undefined,
): { comments: Comment[]; commentTombstones: CommentTombstone[] } {
  const local: SyncedComment[] = [
    ...((draft.comments ?? []) as SyncedComment[]),
    ...(draft.commentTombstones ?? []).map((t) => ({ id: t.id, deleted: true, deletedAt: t.deletedAt, updatedAt: t.deletedAt })),
  ];
  const merged = mergeCommentLists(local, remote);
  const comments: Comment[] = [];
  const commentTombstones: CommentTombstone[] = [];
  for (const c of merged) {
    if (c.deleted) commentTombstones.push({ id: c.id, deletedAt: c.deletedAt ?? c.updatedAt ?? 0 });
    else comments.push(c as Comment);
  }
  return { comments, commentTombstones };
}

/**
 * Merge server collab-extras into the local draft map. Pure: comments merge
 * per item (tombstones, newer resolve state), timeline and approvals union by
 * id, outcomeSought fills only when local is empty. A draft whose extras don't
 * change keeps its object identity, so a pull doesn't trigger a re-sync.
 */
export function mergeRemoteExtras(
  local: Record<string, Draft>,
  remote: RemoteExtras[],
): Record<string, Draft> {
  const localByServerId = new Map<string, Draft>();
  for (const d of Object.values(local)) localByServerId.set(toServerUuid(d.id), d);

  let merged: Record<string, Draft> | null = null;
  for (const r of remote) {
    const existing = localByServerId.get(r.id);
    if (!existing) continue; // extras for a draft we don't have locally — skip
    const next = mergeExtrasIntoDraft(existing, r.extras ?? {});
    if (next === existing) continue;
    merged ??= { ...local };
    merged[existing.id] = next;
  }
  return merged ?? local;
}

/** Apply one draft's remote extras. Returns the same object when nothing changed. */
export function mergeExtrasIntoDraft(existing: Draft, e: DraftExtras): Draft {
  const { comments, commentTombstones } = mergeCommentsWithRemote(existing, e.comments);
  const next = {
    ...existing,
    comments,
    commentTombstones,
    timeline: unionById(existing.timeline, e.timeline),
    approvals: unionById(existing.approvals, e.approvals),
    outcomeSought: existing.outcomeSought || e.outcomeSought,
  } as Draft;
  const before = JSON.stringify([
    existing.comments ?? [],
    existing.commentTombstones ?? [],
    existing.timeline ?? [],
    existing.approvals ?? [],
    existing.outcomeSought ?? null,
  ]);
  const after = JSON.stringify([
    next.comments ?? [],
    next.commentTombstones ?? [],
    next.timeline ?? [],
    next.approvals ?? [],
    next.outcomeSought ?? null,
  ]);
  return before === after ? existing : next;
}

/** Fetch the tenant's draft-extras and merge them into the local store.
 *  Best-effort: any failure (incl. the table not existing yet) is swallowed so
 *  base draft sync is never affected. */
export async function pullRemoteExtras(
  applyMerge: (remote: RemoteExtras[]) => void,
): Promise<{ ok: boolean; count: number }> {
  if (!dualWriteEnabled()) return { ok: false, count: 0 };
  try {
    const res = await fetch("/api/store/draft-extras", {
      method: "GET",
      credentials: "same-origin",
      headers: { Accept: "application/json" },
    });
    if (!res.ok) return { ok: false, count: 0 };
    const ct = res.headers.get("content-type") ?? "";
    if (!ct.toLowerCase().includes("application/json")) return { ok: false, count: 0 };
    const data = (await res.json()) as { extras?: RemoteExtras[] };
    const remote = Array.isArray(data.extras) ? data.extras : [];
    applyMerge(remote);
    return { ok: true, count: remote.length };
  } catch {
    return { ok: false, count: 0 };
  }
}
