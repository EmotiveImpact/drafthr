/**
 * Client dual-write: tap every draft mutation and POST a shaped payload to
 * /api/store/drafts, debounced per-draft. Failures degrade defensively —
 * the local write already succeeded; the next mutation retries.
 *
 * Wiring: useDraftStore subscribes to its own state and call enqueueSync(id)
 * after every mutation that touched a draft. The store calls the no-op
 * variant when the flag is off (the function returns immediately).
 *
 * The flag lives in VITE_DRAFTHR_DUAL_WRITE — Vite inlines it at build, so
 * a misconfigured client can't dual-write without an explicit build env var.
 * The server returns 503 if its sibling DRAFTHR_DUAL_WRITE is off, so the
 * server is the authoritative gate.
 */
import { toast } from "sonner";
import type { Draft, Matter } from "./letters/types";
import { serverUuidOrNull, toServerUuid } from "./remote-ids";
import { extractExtras } from "./remote-pull";

const DEBOUNCE_MS = 400;
const ENABLED = readFlag();
const pendingDraftIds = new Set<string>();
const timers = new Map<string, ReturnType<typeof setTimeout>>();
const syncedAt = new Map<string, number>();
const staleRevisionByDraftId = new Map<string, number>();
// Tombstones: ids deleted locally. A debounced upsert POST already on the wire
// must NOT resurrect a draft the user just deleted — if the DELETE commits
// first server-side, the POST's create branch would blindly re-INSERT it
// (bug #6). We check this set both before sending and after the response so a
// raced POST is dropped / re-deleted instead of recreating the row.
const deletedDraftIds = new Set<string>();
// Same tombstone idea for matters: a matter delete that races an in-flight
// pushMatter (fired by enqueueMatterSync OR by any syncDraft for a filed draft)
// would otherwise re-INSERT a ghost matter + spurious matter.created audit.
// (Senior sweep B7 — the unfixed matters analog of bug #6.)
const deletedMatterIds = new Set<string>();
let consecutiveDeleteFailures = 0;
let deleteFailureToastShown = false;
let consecutiveStaleConflicts = 0;
let staleConflictToastShown = false;

export function isDualWriteEnabled(): boolean {
  return ENABLED;
}

/** Snapshot a draft from the live Zustand state. Kept in this module so tests
 * can inject a different getter without importing the store. */
let snapshotGetter: ((draftId: string) => Draft | null) | null = null;

export function setDualWriteSnapshotGetter(getter: (draftId: string) => Draft | null): void {
  snapshotGetter = getter;
}

/** Snapshot a matter from the live Zustand state. Injected like the draft
 * getter so the draft sync can mirror a draft's matter before linking it. */
let matterSnapshotGetter: ((matterId: string) => Matter | null) | null = null;

export function setDualWriteMatterGetter(getter: (matterId: string) => Matter | null): void {
  matterSnapshotGetter = getter;
}

/**
 * Mirror one matter to the server. Resolves to the server-side UUID on
 * success, or null on any failure (so the draft sync falls back to writing
 * matterId:null — exactly today's safe behaviour, never a 409 regression).
 * Soft-fails: a missing matter or network error just yields null.
 */
export async function pushMatter(matterId: string): Promise<string | null> {
  if (!ENABLED) return null;
  // Don't resurrect a matter deleted locally while this push was queued (B7).
  if (deletedMatterIds.has(matterId)) return null;
  const matter = matterSnapshotGetter?.(matterId);
  if (!matter) return null;
  try {
    const res = await fetch("/api/store/matters", {
      method: "POST",
      credentials: "same-origin",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({
        id: matter.id,
        name: matter.name,
        mode: matter.mode,
        type: matter.type ?? null,
        status: matter.status,
        color: matter.color ?? null,
        riskBand: matter.riskBand ?? null,
        description: matter.description ?? null,
        primaryName: matter.parties?.primaryName ?? null,
        primaryContext: matter.parties?.primaryContext ?? null,
        deadlineISO: matter.deadlineISO ?? null,
        deadlineLabel: matter.deadlineLabel ?? null,
        counselReviewed: Boolean(matter.counselReviewed),
        nextAction: matter.nextAction ?? null,
        exposureGBP: matter.exposureGBP ?? null,
        archivedAt: matter.archivedAt ?? null,
      }),
    });
    if (res.ok) {
      // The matter was deleted WHILE this push was in flight — the POST just
      // (re)created the row, so re-issue the DELETE to converge (B7).
      if (deletedMatterIds.has(matterId)) {
        void deleteMatterRemotely(matterId);
        return null;
      }
      const data = (await res.json().catch(() => ({}))) as { id?: string };
      return data.id ?? toServerUuid(matter.id);
    }
    console.warn("[dual-write] matter sync failed", matterId, res.status);
    return null;
  } catch (err) {
    console.warn("[dual-write] matter sync threw", matterId, err);
    return null;
  }
}

/** Fire-and-forget remote matter delete. The caller owns local removal. */
export async function deleteMatterRemotely(matterId: string): Promise<void> {
  if (!ENABLED || !matterId) return;
  // Tombstone + cancel any pending debounced pushMatter so it can't recreate
  // the row after we delete it (B7).
  deletedMatterIds.add(matterId);
  const pendingTimer = matterTimers.get(matterId);
  if (pendingTimer) {
    clearTimeout(pendingTimer);
    matterTimers.delete(matterId);
  }
  try {
    await fetch("/api/store/matters", {
      method: "DELETE",
      credentials: "same-origin",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({ id: toServerUuid(matterId) }),
    });
  } catch (err) {
    console.warn("[dual-write] matter delete threw", matterId, err);
  }
}

// Debounced matter-sync timers (mirrors the per-draft timer pattern).
const matterTimers = new Map<string, ReturnType<typeof setTimeout>>();

/**
 * Schedule a debounced mirror of one matter. Needed because matter-only edits
 * (rename / close / archive / counsel-reviewed) never touch a draft, so they
 * weren't syncing — the server row stayed stale until an incidental draft edit
 * re-ran pushMatter (bug #16). Collapses rapid edits into one POST.
 */
export function enqueueMatterSync(matterId: string): void {
  if (!ENABLED || !matterId) return;
  const existing = matterTimers.get(matterId);
  if (existing) clearTimeout(existing);
  const t = setTimeout(() => {
    matterTimers.delete(matterId);
    void pushMatter(matterId).catch((err) => void err);
  }, DEBOUNCE_MS);
  matterTimers.set(matterId, t);
}

/** Schedule a debounced sync for one draft. Multiple calls in a short window
 * collapse into a single POST. */
export function enqueueSync(draftId: string): void {
  if (!ENABLED) return;
  if (!draftId) return;
  const draft = snapshotGetter?.(draftId);
  if (draft && isStaleSnapshot(draft)) return;
  pendingDraftIds.add(draftId);
  const existing = timers.get(draftId);
  if (existing) clearTimeout(existing);
  const t = setTimeout(() => {
    timers.delete(draftId);
    pendingDraftIds.delete(draftId);
    void syncDraft(draftId).catch((err) => {
      // Already logged inside syncDraft; swallow so unhandledRejection stays quiet.
      void err;
    });
  }, DEBOUNCE_MS);
  timers.set(draftId, t);
}

/** Force-sync a single draft. Resolves once the POST round-trips (or fails).
 * Safe to call when dual-write is off — resolves to a no-op. */
export async function syncDraft(draftId: string): Promise<void> {
  if (!ENABLED) return;
  // Don't sync a draft that's been deleted locally — a stale debounced POST
  // would resurrect it server-side (bug #6).
  if (deletedDraftIds.has(draftId)) return;
  const draft = snapshotGetter?.(draftId);
  if (!draft) return;
  if (isStaleSnapshot(draft)) return;
  // Mirror the draft's matter FIRST so the FK resolves. On any failure
  // resolvedMatterId stays null — the draft still syncs, just unfiled
  // server-side (today's behaviour, never a 409 regression).
  const resolvedMatterId = draft.matterId ? await pushMatter(draft.matterId) : null;
  const payload = toServerPayload(draft, resolvedMatterId);
  try {
    const res = await fetch("/api/store/drafts", {
      method: "POST",
      credentials: "same-origin",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify(payload),
    });
    if (res.ok) {
      staleRevisionByDraftId.delete(draftId);
      syncedAt.set(draftId, Date.now());
      consecutiveStaleConflicts = 0;
      // Best-effort: mirror the draft's collaboration data (comments / timeline
      // / approvals) to the decoupled extras endpoint. Failure here never
      // affects the draft sync (the draft is already saved).
      void pushDraftExtras(draft);
      // The user deleted this draft WHILE the POST was on the wire — the POST
      // just (re)created/updated the row, so re-issue the DELETE to converge
      // (bug #6: delete-during-sync left a ghost row in the server mirror).
      if (deletedDraftIds.has(draftId)) {
        void deleteDraftRemotely(draftId);
      }
    } else if (res.status === 409) {
      markSnapshotStale(draftId, payload.clientRevision);
      console.warn("[dual-write] stale snapshot skipped", draftId, res.status);
      recordStaleConflict();
    } else if (res.status === 503) {
      // Server flag off — silently stop until the next refresh.
      return;
    } else {
      console.warn("[dual-write] sync failed", draftId, res.status);
    }
  } catch (err) {
    console.warn("[dual-write] sync threw", draftId, err);
  }
}

/** Sync every locally-known draft that has no `_syncedAt`. Used once at app
 * mount as a backfill when dual-write was just enabled. */
export async function syncAllPending(
  getAll: () => Draft[],
): Promise<{ ok: number; failed: number }> {
  if (!ENABLED) return { ok: 0, failed: 0 };
  const drafts = getAll();
  let ok = 0;
  let failed = 0;
  for (const d of drafts) {
    if (syncedAt.has(d.id)) {
      ok += 1;
      continue;
    }
    try {
      if (isStaleSnapshot(d)) continue;
      const resolvedMatterId = d.matterId ? await pushMatter(d.matterId) : null;
      const payload = toServerPayload(d, resolvedMatterId);
      const res = await fetch("/api/store/drafts", {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify(payload),
      });
      if (res.ok) {
        staleRevisionByDraftId.delete(d.id);
        syncedAt.set(d.id, Date.now());
        consecutiveStaleConflicts = 0;
        ok += 1;
      } else if (res.status === 409) {
        markSnapshotStale(d.id, payload.clientRevision);
        console.warn("[dual-write] stale backfill skipped", d.id, res.status);
        recordStaleConflict();
      } else {
        failed += 1;
      }
    } catch {
      failed += 1;
    }
  }
  return { ok, failed };
}

/** Tear down all pending timers — used in tests + dev hot-reload. */
export function resetDualWriteTimers(): void {
  for (const t of timers.values()) clearTimeout(t);
  timers.clear();
  for (const t of matterTimers.values()) clearTimeout(t);
  matterTimers.clear();
  deletedMatterIds.clear();
  pendingDraftIds.clear();
  staleRevisionByDraftId.clear();
  deletedDraftIds.clear();
  consecutiveDeleteFailures = 0;
  deleteFailureToastShown = false;
  consecutiveStaleConflicts = 0;
  staleConflictToastShown = false;
}

/** Visible for tests only. */
export function _isPending(draftId: string): boolean {
  return pendingDraftIds.has(draftId);
}

/** Visible for tests only. */
export function _hasSynced(draftId: string): boolean {
  return syncedAt.has(draftId);
}

/** Fire-and-forget remote delete. The caller owns local state removal. */
export async function deleteDraftRemotely(draftId: string): Promise<void> {
  if (!ENABLED) return;
  if (!draftId) return;
  // Tombstone the id and cancel any debounced upsert so an in-flight / pending
  // POST can't recreate the row after we delete it (bug #6).
  deletedDraftIds.add(draftId);
  const pendingTimer = timers.get(draftId);
  if (pendingTimer) {
    clearTimeout(pendingTimer);
    timers.delete(draftId);
  }
  pendingDraftIds.delete(draftId);
  try {
    const res = await fetch("/api/store/drafts", {
      method: "DELETE",
      credentials: "same-origin",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({ id: toServerUuid(draftId) }),
    });
    if (res.ok) {
      consecutiveDeleteFailures = 0;
      // Undo is handled explicitly: the sidebar's Undo re-inserts the draft and
      // calls undeleteDraft(), which clears the tombstone and re-mirrors. We
      // deliberately do NOT infer an undo from the store snapshot here — local
      // removal can lag the DELETE round-trip, and a stale snapshot would
      // un-tombstone (and recreate) a row the user genuinely deleted.
      return;
    }
    recordDeleteFailure(draftId, res.status);
  } catch (err) {
    recordDeleteFailure(draftId, err);
  }
}

/**
 * Reverse a local delete's tombstone so future syncs of this id are no longer
 * dropped by syncDraft's `deletedDraftIds.has(draftId)` guard, then re-mirror
 * the (restored) draft to the server. Called by the sidebar's Undo action after
 * it re-inserts the draft into the store. Without this, every subsequent sync of
 * an undeleted draft was silently discarded for the rest of the session (the
 * tombstone was never cleared), so edits only reappeared after a full reload.
 */
export function undeleteDraft(draftId: string): void {
  if (!ENABLED || !draftId) return;
  deletedDraftIds.delete(draftId);
  void syncDraft(draftId).catch((err) => void err);
}

function readFlag(): boolean {
  try {
    return (import.meta.env?.VITE_DRAFTHR_DUAL_WRITE as string | undefined) === "true";
  } catch {
    return false;
  }
}

/** Best-effort mirror of a draft's collaboration data to the decoupled extras
 *  endpoint. Never throws — a missing table / 503 / network error is swallowed
 *  so it can't affect the (already-succeeded) draft sync. Skips drafts with no
 *  collab data so we don't write empty rows. */
async function pushDraftExtras(draft: Draft): Promise<void> {
  const extras = extractExtras(draft);
  if (!extras) return;
  try {
    await fetch("/api/store/draft-extras", {
      method: "POST",
      credentials: "same-origin",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({ id: toServerUuid(draft.id), extras }),
    });
  } catch {
    /* best-effort — collaboration data will re-sync on the next draft write */
  }
}

function toServerPayload(draft: Draft, resolvedMatterId: string | null = null) {
  return {
    id: toServerUuid(draft.id),
    clientRevision: draft.updatedAt,
    letterType: draft.letterType,
    mode: draft.mode,
    title: draft.title ?? null,
    jurisdiction: draft.context?.jurisdiction ?? null,
    // Prefer the matter UUID resolved by a successful matter sync; fall back
    // to serverUuidOrNull (null for a local matter_… id that wasn't mirrored).
    matterId: resolvedMatterId ?? serverUuidOrNull(draft.matterId),
    reviewStatus: draft.reviewStatus ?? "draft",
    isTemplateSource: Boolean(draft.isTemplateSource),
    templateSourceId: serverUuidOrNull(draft.templateSourceId),
    context: draft.context as Record<string, unknown>,
    employer: draft.employer as unknown as Record<string, unknown>,
    employee: draft.employee as unknown as Record<string, unknown>,
    answers: draft.answers as Record<string, unknown>,
    sections: draft.sections.map((s, idx) => ({
      sectionId: s.sectionId,
      title: s.title,
      html: s.html,
      status: s.status,
      position: idx,
    })),
  };
}

function isStaleSnapshot(draft: Draft): boolean {
  const staleRevision = staleRevisionByDraftId.get(draft.id);
  return staleRevision !== undefined && draft.updatedAt <= staleRevision;
}

function markSnapshotStale(draftId: string, clientRevision: number): void {
  const previous = staleRevisionByDraftId.get(draftId) ?? -Infinity;
  staleRevisionByDraftId.set(draftId, Math.max(previous, clientRevision));

  const currentDraft = snapshotGetter?.(draftId);
  if (currentDraft && currentDraft.updatedAt > clientRevision) return;

  const timer = timers.get(draftId);
  if (timer) clearTimeout(timer);
  timers.delete(draftId);
  pendingDraftIds.delete(draftId);
}

/**
 * A 409 means the server copy is NEWER than this client's revision — another
 * tab or device wrote a higher revision. Dual-write is write-only (no pull /
 * merge path yet), so this client's edits will keep failing the server's
 * revision guard and silently never land. We can't merge here, but we must
 * not let the user believe they're saved: surface ONE toast after repeated
 * conflicts. Mirrors recordDeleteFailure. (Full multi-device reconcile is a
 * separate feature — tracked in the bug log.)
 */
function recordStaleConflict(): void {
  consecutiveStaleConflicts += 1;
  if (consecutiveStaleConflicts > 3 && !staleConflictToastShown) {
    staleConflictToastShown = true;
    toast.error("Your changes aren't syncing to your workspace", {
      description:
        "A newer copy of this letter was saved elsewhere (another tab or device). Your edits are kept on this device — reload to pull the latest.",
    });
  }
}

function recordDeleteFailure(draftId: string, reason: unknown): void {
  consecutiveDeleteFailures += 1;
  console.warn("[dual-write] delete failed", draftId, reason);
  if (consecutiveDeleteFailures > 3 && !deleteFailureToastShown) {
    deleteFailureToastShown = true;
    toast.error("Draft deletes are not syncing", {
      description: "Local deletes still worked, but workspace sync may be down.",
    });
  }
}
