/**
 * Client dual-write: tap every draft mutation and POST a shaped payload to
 * /api/store/drafts, debounced per-draft. Failures degrade defensively —
 * the local write already succeeded and is retried.
 *
 * Wiring: useDraftStore subscribes to its own state and calls enqueueSync(id)
 * after every mutation that touched a draft's synced fields. Remote deletes
 * are issued only by the explicit delete actions, never inferred from a draft
 * disappearing from state (a cross-tab rehydrate while storage is full used
 * to look like a mass delete).
 *
 * Sync rules:
 *   • Only changed drafts are sent. sync-meta keeps a content key of what the
 *     server last accepted, so a page load or rehydrate doesn't re-post every
 *     draft (which tripped the 120/min rate limit).
 *   • Every write names the server revision it was built on. A 409 carries the
 *     current server row; we adopt it when the content matches, re-apply our
 *     content on top when only the review status moved, and otherwise keep
 *     both (the server version under the original id, ours as a local
 *     "conflicted copy"). A stale write can never revert an approval.
 *   • 410 means the draft was deleted on another device: the local copy is
 *     removed, or kept as a local-only copy when it holds unsynced edits.
 *   • 429 is retried with backoff honouring Retry-After. 403 and repeated
 *     failures surface a toast instead of failing silently.
 *
 * The flag lives in VITE_DRAFTHR_DUAL_WRITE — Vite inlines it at build, so
 * a misconfigured client can't dual-write without an explicit build env var.
 * The server returns 503 if its sibling DRAFTHR_DUAL_WRITE is off, so the
 * server is the authoritative gate.
 */
import { toast } from "sonner";
import type { Draft, Matter, ReviewStatus } from "./letters/types";
import { serverUuidOrNull, toServerUuid } from "./remote-ids";
import { extractExtras, type DraftExtras, type RemoteDraft } from "./remote-pull";
import { isPersistenceSuspended } from "./storage/quota-safe-storage";
import {
  clearSyncMeta,
  draftContentKey,
  draftSyncKey,
  extrasKey,
  getSyncMeta,
  patchSyncMeta,
  remoteContentKey,
  setSyncMeta,
} from "./sync-meta";

const DEBOUNCE_MS = 400;
const ENABLED = readFlag();
const pendingDraftIds = new Set<string>();
const timers = new Map<string, ReturnType<typeof setTimeout>>();
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
// Ids the sidebar's Undo restored: the next upsert asks the server to lift
// its tombstone (honoured for a short window after the delete).
const restoreRequested = new Set<string>();
// One sync per draft at a time, so two quick edits can't both be sent on the
// same base revision (the second would 409 against the first).
const inFlightSyncs = new Map<string, Promise<void>>();
const retryTimers = new Map<string, ReturnType<typeof setTimeout>>();
let consecutiveDeleteFailures = 0;
let deleteFailureToastShown = false;
// Per draft, so one healthy draft's success can't mask another's failures
// (FQ-02). The toast flag is cleared on that draft's success, so a recovery
// followed by a new run of failures re-notifies.
const failuresByDraftId = new Map<string, number>();
const failureToastShownFor = new Set<string>();
const paymentToastShownFor = new Set<string>();
let forbiddenToastShown = false;

const MAX_429_RETRIES = 4;
const MAX_RETRY_DELAY_MS = 60_000;
let sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

/** Tests only: replace the backoff sleep. */
export function _setSleepForTests(fn: (ms: number) => Promise<void>): void {
  sleep = fn;
}

export function isDualWriteEnabled(): boolean {
  return ENABLED;
}

let paused = false;

/** Stop pushing for the rest of this page load: the local data in memory
 *  belongs to another workspace (or user) than the signed-in one. */
export function pauseDualWrite(): void {
  paused = true;
}

/** No pushes while this tab's in-memory data isn't the active workspace's:
 *  paused above, or persistence suspended mid-switch / after a wipe. */
function pushesBlocked(): boolean {
  return paused || isPersistenceSuspended();
}

/** Store operations dual-write needs to resolve conflicts and remote deletes.
 *  Injected by the store so this module never imports it (circular import). */
export type DualWriteStoreBridge = {
  /** Overlay a server version onto the local draft; returns the result. */
  applyServerDraft: (localId: string, remote: RemoteDraft) => Draft | null;
  setReviewStatus: (localId: string, status: ReviewStatus) => void;
  /** Drop "approved" entries recorded at or after `since` (never synced). */
  withdrawApproval: (localId: string, since: number) => void;
  /** Add a local-only copy of this draft (a new id); returns the new id. */
  addConflictCopy: (draft: Draft) => string | null;
  /** Keep the draft on this device only (deleted elsewhere, unsynced edits). */
  keepLocalOnly: (localId: string) => void;
  /** Drop the draft locally without issuing a remote delete. */
  removeLocally: (localId: string) => void;
  applyExtras: (localId: string, extras: DraftExtras) => void;
};

let bridge: DualWriteStoreBridge | null = null;

export function setDualWriteStoreBridge(next: DualWriteStoreBridge | null): void {
  bridge = next;
}

/** How long to wait before retrying a 429: the server's Retry-After (seconds
 *  or an HTTP date) when present, else exponential backoff. */
export function retryDelayMs(res: Pick<Response, "headers">, attempt: number): number {
  const header = res.headers.get("Retry-After");
  if (header) {
    const secs = Number(header);
    if (Number.isFinite(secs) && secs >= 0) return Math.min(secs * 1000, MAX_RETRY_DELAY_MS);
    const at = Date.parse(header);
    if (!Number.isNaN(at)) return Math.min(Math.max(at - Date.now(), 0), MAX_RETRY_DELAY_MS);
  }
  return Math.min(1000 * 2 ** attempt, 30_000);
}

/** fetch that retries 429 responses with backoff. Other statuses return as-is. */
async function fetchWithRetry(url: string, init: RequestInit): Promise<Response> {
  for (let attempt = 0; ; attempt += 1) {
    const res = await fetch(url, init);
    if (res.status !== 429 || attempt >= MAX_429_RETRIES) return res;
    await sleep(retryDelayMs(res, attempt));
  }
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
  if (!ENABLED || pushesBlocked()) return null;
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
      // Survive tab close — a matter delete fired on the way out otherwise
      // never reaches the server and the row resurrects on next pull (BUG-05).
      keepalive: true,
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
  if (!ENABLED || !matterId || pushesBlocked()) return;
  const existing = matterTimers.get(matterId);
  if (existing) clearTimeout(existing);
  const t = setTimeout(() => {
    matterTimers.delete(matterId);
    void pushMatter(matterId).catch((err) => void err);
  }, DEBOUNCE_MS);
  matterTimers.set(matterId, t);
}

/** Schedule a debounced sync for one draft. Multiple calls in a short window

/** Schedule a debounced sync for one draft. Multiple calls in a short window
 * collapse into a single POST. */
export function enqueueSync(draftId: string): void {
  if (!ENABLED || pushesBlocked()) return;
  if (!draftId) return;
  const draft = snapshotGetter?.(draftId);
  if (draft?.localOnly) return;
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

/** Sync a single draft if (and only if) it changed since the server last
 * accepted it. Resolves once the round-trip settles. Safe to call when
 * dual-write is off — resolves to a no-op. */
export async function syncDraft(draftId: string, fallback?: Draft): Promise<void> {
  if (!ENABLED) return;
  const previous = inFlightSyncs.get(draftId) ?? Promise.resolve();
  const run = previous.catch(() => undefined).then(() => syncDraftNow(draftId, fallback));
  inFlightSyncs.set(draftId, run);
  try {
    await run;
  } finally {
    if (inFlightSyncs.get(draftId) === run) inFlightSyncs.delete(draftId);
  }
}

async function syncDraftNow(draftId: string, fallback?: Draft): Promise<void> {
  if (pushesBlocked()) return;
  // Don't sync a draft that's been deleted locally — a stale debounced POST
  // would resurrect it server-side (bug #6).
  if (deletedDraftIds.has(draftId)) return;
  const draft = snapshotGetter?.(draftId) ?? fallback ?? null;
  if (!draft || draft.localOnly) return;
  const meta = getSyncMeta(draftId);
  const key = draftSyncKey(draft);
  if (!meta || meta.key !== key || restoreRequested.has(draftId)) {
    const outcome = await pushDraft(draft, key);
    if (outcome !== "ok") return;
  }
  // Collaboration data (comments / timeline / approvals) syncs separately and
  // only once the draft exists server-side. It changes without touching the
  // letter content, so it has its own change key.
  const current = snapshotGetter?.(draftId) ?? draft;
  const synced = getSyncMeta(draftId);
  if (!synced) return;
  const extras = extractExtras(current);
  const ekey = extrasKey(extras);
  if (extras && ekey !== synced.ekey) await pushDraftExtras(current, extras, ekey);
}

type PushOutcome = "ok" | "conflict" | "gone" | "failed";

async function pushDraft(draft: Draft, key: string): Promise<PushOutcome> {
  const draftId = draft.id;
  const meta = getSyncMeta(draftId);
  const restoring = restoreRequested.has(draftId);
  // Mirror the draft's matter FIRST so the FK resolves. On any failure
  // resolvedMatterId stays null — the draft still syncs, just unfiled
  // server-side (never a 409 regression).
  const resolvedMatterId = draft.matterId ? await pushMatter(draft.matterId) : null;
  const payload = toServerPayload(draft, resolvedMatterId, meta?.rev ?? null, restoring);
  let res: Response;
  try {
    res = await fetchWithRetry("/api/store/drafts", {
      method: "POST",
      credentials: "same-origin",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify(payload),
    });
  } catch (err) {
    recordSyncFailure(draftId, err, true);
    return "failed";
  }

  if (res.ok) {
    const data = (await res.json().catch(() => ({}))) as { revision?: number };
    setSyncMeta(draftId, {
      rev: typeof data.revision === "number" ? data.revision : (meta?.rev ?? 0) + 1,
      key,
      ckey: draftContentKey(draft),
      ekey: restoring ? undefined : meta?.ekey,
      at: Date.now(),
    });
    restoreRequested.delete(draftId);
    clearFailures(draftId);
    // The user deleted this draft WHILE the POST was on the wire — the POST
    // just (re)created/updated the row, so re-issue the DELETE to converge
    // (bug #6: delete-during-sync left a ghost row in the server mirror).
    if (deletedDraftIds.has(draftId)) {
      void deleteDraftRemotely(draftId);
      return "gone";
    }
    return "ok";
  }

  switch (res.status) {
    case 409: {
      const body = (await res.json().catch(() => ({}))) as ConflictBody;
      resolveConflict(draftId, draft, body);
      return "conflict";
    }
    case 410:
      handleRemoteDelete(draftId);
      return "gone";
    case 503:
      // Server flag off — silently stop until the next refresh.
      return "failed";
    case 401:
      // Session expired: the next mutation after sign-in retries.
      return "failed";
    case 403:
      notifyForbidden(draftId);
      return "failed";
    case 402: {
      const body = (await res.json().catch(() => ({}))) as { error?: string };
      notifyPaymentRequired(draftId, body.error);
      return "failed";
    }
    default:
      // 429 (retries exhausted) and 5xx are transient; other 4xx are not.
      recordSyncFailure(draftId, res.status, res.status === 429 || res.status >= 500);
      return "failed";
  }
}

type ConflictBody = { current?: RemoteDraft | null; locked?: boolean; error?: string };

/**
 * A 409: the server moved on since this device's base revision (or the letter
 * is approved and locked). Never drop either side:
 *   1. same letter content on both sides → adopt the server copy (its review
 *      status wins, so an approval is never reverted);
 *   2. only the review status / references moved on the server, our content
 *      is new → take their status and re-send our content on their revision;
 *   3. our content is unchanged since our base → adopt the server copy, then
 *      re-apply our own status change if the server didn't touch the status
 *      (except an approval: that was a decision about the text this device
 *      showed, which has since changed);
 *   4. both changed → the server copy takes the original id and our version
 *      is kept as a local-only "conflicted copy".
 */
function resolveConflict(draftId: string, sent: Draft, body: ConflictBody): void {
  const current = body.current;
  if (!current) {
    // The row vanished, or a server without revision support: nothing to
    // merge against. Keep the local copy and tell the user after a few tries.
    recordSyncFailure(draftId, 409, false);
    return;
  }
  const live = snapshotGetter?.(draftId) ?? sent;
  const meta = getSyncMeta(draftId);
  const rev = typeof current.revision === "number" ? current.revision : 0;
  const serverContent = remoteContentKey(current);
  const localContent = draftContentKey(live);
  const serverStatus = (current.reviewStatus ?? "draft") as ReviewStatus;
  const localStatus = live.reviewStatus ?? "draft";

  if (serverContent === localContent) {
    markAdopted(draftId, rev, bridge?.applyServerDraft(draftId, current) ?? live);
    clearFailures(draftId);
    return;
  }
  if (!body.locked && meta?.ckey && serverContent === meta.ckey) {
    if (serverStatus !== localStatus) bridge?.setReviewStatus(draftId, serverStatus);
    patchSyncMeta(draftId, { rev, ckey: serverContent, key: "" });
    enqueueSync(draftId);
    return;
  }
  if (meta?.ckey && localContent === meta.ckey) {
    const baseStatus = meta.key.split("|")[1] ?? "draft";
    markAdopted(draftId, rev, bridge?.applyServerDraft(draftId, current) ?? live);
    if (localStatus !== baseStatus && serverStatus === baseStatus && !body.locked) {
      if (localStatus === "approved") {
        // The letter changed on another device before this approval landed.
        // Carrying it over would approve text the reviewer never saw.
        bridge?.withdrawApproval(draftId, meta.at);
        toast.warning("This letter changed before your approval was saved", {
          description: "The latest version is shown. Review it and approve again if it's still right.",
        });
      } else {
        bridge?.setReviewStatus(draftId, localStatus);
      }
    }
    clearFailures(draftId);
    return;
  }
  const copyId = bridge?.addConflictCopy(live) ?? null;
  markAdopted(draftId, rev, bridge?.applyServerDraft(draftId, current) ?? live);
  clearFailures(draftId);
  toast.warning("This letter was changed on another device", {
    description: copyId
      ? "The latest saved version is shown. Your version is kept on this device as a conflicted copy."
      : "The latest saved version is shown.",
  });
}

function markAdopted(draftId: string, rev: number, draft: Draft): void {
  const prev = getSyncMeta(draftId);
  setSyncMeta(draftId, {
    rev,
    key: draftSyncKey(draft),
    ckey: draftContentKey(draft),
    ekey: prev?.ekey,
    at: Date.now(),
  });
}

/** 410: deleted on another device. Drop the local copy, or keep it on this
 *  device only when it holds edits the server never received. */
function handleRemoteDelete(draftId: string): void {
  const draft = snapshotGetter?.(draftId);
  const meta = getSyncMeta(draftId);
  const unsynced = Boolean(draft) && (!meta || meta.key !== draftSyncKey(draft!));
  clearSyncMeta(draftId);
  restoreRequested.delete(draftId);
  clearFailures(draftId);
  if (unsynced) {
    bridge?.keepLocalOnly(draftId);
    toast.warning("This letter was deleted on another device", {
      description: "Your unsaved changes are kept on this device only.",
    });
  } else {
    bridge?.removeLocally(draftId);
    toast("A letter was deleted on another device", {
      description: "It has been removed from this device too.",
    });
  }
}

/** Push every locally-known draft that changed since its last successful
 * sync. Run at app mount; unchanged drafts are skipped, so a reload doesn't
 * re-post the whole workspace. `ok` counts drafts actually pushed. */
export async function syncAllPending(
  getAll: () => Draft[],
): Promise<{ ok: number; failed: number }> {
  if (!ENABLED || pushesBlocked()) return { ok: 0, failed: 0 };
  let ok = 0;
  let failed = 0;
  for (const d of getAll()) {
    if (d.localOnly || deletedDraftIds.has(d.id)) continue;
    const meta = getSyncMeta(d.id);
    const key = draftSyncKey(d);
    const extras = extractExtras(d);
    const needsDraft = !meta || meta.key !== key;
    const needsExtras = Boolean(extras) && extrasKey(extras) !== meta?.ekey;
    if (!needsDraft && !needsExtras) continue;
    try {
      await syncDraft(d.id, d);
    } catch {
      /* logged inside */
    }
    const after = getSyncMeta(d.id);
    if (!needsDraft || (after && after.key === key)) ok += 1;
    else failed += 1;
  }
  return { ok, failed };
}

/** Tear down all pending timers — used in tests + dev hot-reload. */
export function resetDualWriteTimers(): void {
  for (const t of timers.values()) clearTimeout(t);
  timers.clear();
  for (const t of matterTimers.values()) clearTimeout(t);
  matterTimers.clear();
  for (const t of retryTimers.values()) clearTimeout(t);
  retryTimers.clear();
  deletedMatterIds.clear();
  pendingDraftIds.clear();
  deletedDraftIds.clear();
  restoreRequested.clear();
  inFlightSyncs.clear();
  consecutiveDeleteFailures = 0;
  deleteFailureToastShown = false;
  failuresByDraftId.clear();
  failureToastShownFor.clear();
  paymentToastShownFor.clear();
  forbiddenToastShown = false;
  paused = false;
  try {
    localStorage.removeItem(TOMBSTONE_STORAGE_KEY);
  } catch {
    /* storage unavailable */
  }
}

/** Visible for tests only. */
export function _isPending(draftId: string): boolean {
  return pendingDraftIds.has(draftId);
}

/** Visible for tests only. */
export function _hasSynced(draftId: string): boolean {
  return Boolean(getSyncMeta(draftId));
}

/** In-flight DELETE round-trips, keyed by draft id. undeleteDraft() awaits the
 *  entry so an Undo's restore POST can never race ahead of the DELETE it is
 *  reversing (POST lands first → DELETE lands last → restored row wiped). */
const inFlightDeletes = new Map<string, Promise<void>>();

/* ── Persisted tombstones (BUG-05) ─────────────────────────────────────────
 * The in-memory tombstone dies with the page: delete a draft and close the
 * tab (or lose network) and the DELETE never lands, the local copy is gone,
 * and the next mount's pullRemoteDrafts re-adopts the server row — deleted
 * PII resurrects and re-entrenches itself server-side. So each delete also
 * writes the SERVER uuid to localStorage before the fetch fires; the entry is
 * cleared only on a confirmed 2xx. The merge (mergeRemoteDrafts) skips
 * adoption of tombstoned uuids and reissuePendingDeletes() retries them at
 * mount. */
const TOMBSTONE_STORAGE_KEY = "drafthr.deleted-draft-uuids.v1";

function readPersistedTombstones(): Set<string> {
  try {
    const raw = localStorage.getItem(TOMBSTONE_STORAGE_KEY);
    const parsed = raw ? (JSON.parse(raw) as unknown) : [];
    return new Set(Array.isArray(parsed) ? parsed.filter((v) => typeof v === "string") : []);
  } catch {
    return new Set();
  }
}

function writePersistedTombstones(uuids: Set<string>): void {
  try {
    localStorage.setItem(TOMBSTONE_STORAGE_KEY, JSON.stringify([...uuids]));
  } catch {
    /* storage unavailable/full — in-memory tombstone still covers the session */
  }
}

function persistTombstone(serverUuid: string): void {
  const set = readPersistedTombstones();
  if (set.has(serverUuid)) return;
  set.add(serverUuid);
  writePersistedTombstones(set);
}

function unpersistTombstone(serverUuid: string): void {
  const set = readPersistedTombstones();
  if (!set.delete(serverUuid)) return;
  writePersistedTombstones(set);
}

/** Server uuids of drafts deleted locally whose DELETE has not been confirmed.
 *  Consulted by the remote-pull merge so it never re-adopts a deleted draft. */
export function persistedDraftTombstones(): Set<string> {
  return readPersistedTombstones();
}

/** Retry unconfirmed deletes from previous sessions. Called once at mount
 *  (mirrors syncAllPending for creates). A 2xx OR a 404-class response clears
 *  the entry; network failures keep it for the next mount. */
export async function reissuePendingDeletes(): Promise<void> {
  if (!ENABLED) return;
  for (const serverUuid of readPersistedTombstones()) {
    try {
      const res = await fetch("/api/store/drafts", {
        method: "DELETE",
        credentials: "same-origin",
        keepalive: true,
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify({ id: serverUuid }),
      });
      // DELETE is idempotent server-side (unknown id → 200 idempotent:true),
      // so any 2xx confirms the row is gone. 400 (malformed id) will never
      // succeed — drop it. 401/403 are RECOVERABLE (session expired, or the
      // draft belongs to a tenant that isn't active right now — this runs on
      // every activeTenant change): keep the tombstone so the delete retries
      // once the right session/tenant is back, instead of resurrecting the row.
      if (res.ok || res.status === 400) {
        unpersistTombstone(serverUuid);
      }
    } catch {
      /* offline — keep the tombstone for the next mount */
    }
  }
}


/** Fire-and-forget remote delete. The caller owns local state removal. */
export async function deleteDraftRemotely(draftId: string): Promise<void> {
  if (!ENABLED) return;
  if (!draftId) return;
  // Tombstone the id and cancel any debounced upsert so an in-flight / pending
  // POST can't recreate the row after we delete it (bug #6).
  deletedDraftIds.add(draftId);
  restoreRequested.delete(draftId);
  // The meta describes a server row that is about to be a tombstone; drop it
  // so an Undo re-sends the draft instead of treating it as already synced.
  clearSyncMeta(draftId);
  // Persist BEFORE the fetch so a tab close mid-flight can't lose the intent.
  persistTombstone(toServerUuid(draftId));
  const pendingTimer = timers.get(draftId);
  if (pendingTimer) {
    clearTimeout(pendingTimer);
    timers.delete(draftId);
  }
  pendingDraftIds.delete(draftId);
  const run = (async () => {
    try {
      const res = await fetch("/api/store/drafts", {
        method: "DELETE",
        credentials: "same-origin",
        // Survive tab close — the body is tiny (one uuid), well under the
        // 64KB keepalive cap.
        keepalive: true,
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify({ id: toServerUuid(draftId) }),
      });
      if (res.ok) {
        consecutiveDeleteFailures = 0;
        unpersistTombstone(toServerUuid(draftId));
        // Undo is handled explicitly: the sidebar's Undo re-inserts the draft
        // and calls undeleteDraft(), which clears the tombstone and re-mirrors
        // AFTER this round-trip settles (inFlightDeletes). We deliberately do
        // NOT infer an undo from the store snapshot here — local removal can
        // lag the DELETE round-trip, and a stale snapshot would un-tombstone
        // (and recreate) a row the user genuinely deleted.
        return;
      }
      recordDeleteFailure(draftId, res.status);
    } catch (err) {
      recordDeleteFailure(draftId, err);
    }
  })();
  inFlightDeletes.set(draftId, run);
  try {
    await run;
  } finally {
    if (inFlightDeletes.get(draftId) === run) inFlightDeletes.delete(draftId);
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
  // The server now holds a tombstone for this id; the restore flag asks it to
  // lift it (honoured for a short window after the delete).
  restoreRequested.add(draftId);
  // Also clear the persisted tombstone so the restored draft survives the
  // next mount's merge + reissuePendingDeletes.
  unpersistTombstone(toServerUuid(draftId));
  // Order the restore POST after any DELETE still on the wire for this id —
  // otherwise the POST can reach the server first and the trailing DELETE
  // wipes the just-restored row with nothing left to re-sync it.
  const pendingDelete = inFlightDeletes.get(draftId) ?? Promise.resolve();
  void pendingDelete
    .catch(() => undefined)
    .then(() => syncDraft(draftId))
    .catch((err) => void err);
}

function readFlag(): boolean {
  try {
    return (import.meta.env?.VITE_DRAFTHR_DUAL_WRITE as string | undefined) === "true";
  } catch {
    return false;
  }
}

/** Mirror a draft's collaboration data to the decoupled extras endpoint. The
 *  server merges per item and returns the merged result, which we fold back
 *  in so this device picks up teammates' comments and resolves. A failure is
 *  swallowed (the draft itself is already saved) and retried on the next
 *  change, since the extras key is only recorded on success. */
async function pushDraftExtras(draft: Draft, extras: DraftExtras, ekey: string): Promise<void> {
  try {
    const res = await fetchWithRetry("/api/store/draft-extras", {
      method: "POST",
      credentials: "same-origin",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({ id: toServerUuid(draft.id), extras }),
    });
    if (res.status === 410) {
      handleRemoteDelete(draft.id);
      return;
    }
    if (res.status === 403) {
      notifyForbidden(draft.id);
      return;
    }
    if (!res.ok) return;
    patchSyncMeta(draft.id, { ekey });
    const data = (await res.json().catch(() => ({}))) as { extras?: DraftExtras };
    if (data.extras && typeof data.extras === "object") {
      bridge?.applyExtras(draft.id, data.extras);
      // Record the key of what we now hold, so adopting the server's merge
      // doesn't trigger another push of the same data.
      const after = snapshotGetter?.(draft.id);
      if (after) patchSyncMeta(draft.id, { ekey: extrasKey(extractExtras(after)) });
    }
  } catch {
    /* best-effort — collaboration data re-syncs on the next change */
  }
}

function toServerPayload(
  draft: Draft,
  resolvedMatterId: string | null = null,
  baseRevision: number | null = null,
  restore = false,
) {
  return {
    id: toServerUuid(draft.id),
    clientRevision: draft.updatedAt,
    // The server revision this write is built on; the server 409s anything
    // older so a stale device can't overwrite newer edits.
    baseRevision,
    ...(restore ? { restore: true } : {}),
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

/**
 * Count a failed sync. After three in a row for one draft, tell the user once
 * (the edits are safe on this device). Transient failures (network, 5xx, 429
 * after its retries) are retried automatically with growing gaps, so a draft
 * nobody touches again still gets there.
 */
function recordSyncFailure(draftId: string, reason: unknown, transient: boolean): void {
  const count = (failuresByDraftId.get(draftId) ?? 0) + 1;
  failuresByDraftId.set(draftId, count);
  console.warn("[dual-write] sync failed", draftId, reason);
  if (count >= 3 && !failureToastShownFor.has(draftId)) {
    failureToastShownFor.add(draftId);
    toast.error("Your changes aren't syncing to your workspace", {
      description:
        "They're saved on this device and we'll keep trying. Check your connection, or reload if this carries on.",
    });
  }
  if (transient && !retryTimers.has(draftId)) {
    const delay = Math.min(30_000 * 2 ** (count - 1), 5 * 60_000);
    retryTimers.set(
      draftId,
      setTimeout(() => {
        retryTimers.delete(draftId);
        enqueueSync(draftId);
      }, delay),
    );
  }
}

function clearFailures(draftId: string): void {
  failuresByDraftId.delete(draftId);
  failureToastShownFor.delete(draftId);
  paymentToastShownFor.delete(draftId);
  const t = retryTimers.get(draftId);
  if (t) clearTimeout(t);
  retryTimers.delete(draftId);
}

/** 403: read-only role, or the draft belongs to a workspace that isn't the
 *  active one. Retrying won't help, so say so (once per session). */
function notifyForbidden(draftId: string): void {
  console.warn("[dual-write] sync forbidden", draftId);
  if (forbiddenToastShown) return;
  forbiddenToastShown = true;
  toast.error("Your changes can't be saved to this workspace", {
    description:
      "You may have read-only access, or this letter belongs to another workspace. Your edits are kept on this device.",
  });
}

function notifyPaymentRequired(draftId: string, message: string | undefined): void {
  console.warn("[dual-write] sync needs a plan or letter credit", draftId);
  if (paymentToastShownFor.has(draftId)) return;
  paymentToastShownFor.add(draftId);
  toast.error("This letter isn't saved to your workspace yet", {
    description: message || "Choose a plan or letter to save it. It's kept on this device in the meantime.",
  });
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
