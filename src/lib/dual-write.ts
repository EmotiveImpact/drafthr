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

const DEBOUNCE_MS = 400;
const ENABLED = readFlag();
const pendingDraftIds = new Set<string>();
const timers = new Map<string, ReturnType<typeof setTimeout>>();
const syncedAt = new Map<string, number>();
const staleRevisionByDraftId = new Map<string, number>();
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
  pendingDraftIds.clear();
  staleRevisionByDraftId.clear();
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
  try {
    const res = await fetch("/api/store/drafts", {
      method: "DELETE",
      credentials: "same-origin",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({ id: toServerUuid(draftId) }),
    });
    if (res.ok) {
      consecutiveDeleteFailures = 0;
      return;
    }
    recordDeleteFailure(draftId, res.status);
  } catch (err) {
    recordDeleteFailure(draftId, err);
  }
}

function readFlag(): boolean {
  try {
    return (import.meta.env?.VITE_DRAFTHR_DUAL_WRITE as string | undefined) === "true";
  } catch {
    return false;
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
