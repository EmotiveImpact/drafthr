/**
 * Opt-in database-authoritative draft client. The old localStorage store is a
 * temporary recovery buffer while we migrate the rest of the workspace.
 * This module never enables itself from the server flag alone.
 */
import { create } from "zustand";
import type { Draft } from "./letters/types";
import { useDraftStore } from "./store";
import { mergeRemoteDrafts, type RemoteDraft } from "./remote-pull";
import { serverUuidOrNull, toServerUuid } from "./remote-ids";
import { isDatabaseWorkspaceEnabled } from "./workspace-flags";

type Document = { id: string; revision: number; snapshot: Draft | null; legacy?: RemoteDraft };
type Phase = "off" | "loading" | "needs-import" | "ready" | "error";
type Status = { phase: Phase; tenantId?: string; importCount: number; saving: number; failed: number; conflicts: number; message?: string };

export const useDatabaseDraftStatus = create<Status>(() => ({
  phase: "off", importCount: 0, saving: 0, failed: 0, conflicts: 0,
}));

export function isDatabaseDraftsEnabled(): boolean {
  return !isDatabaseWorkspaceEnabled() && import.meta.env?.VITE_DRAFTHR_DATABASE_DRAFTS === "true";
}

let activeTenant: string | null = null;
let unsubscribe: (() => void) | null = null;
let importCandidates: Draft[] = [];
const revisions = new Map<string, number>();
const legacyUpdatedAtById = new Map<string, number>();
const pending = new Set<string>();
const failed = new Set<string>();
const conflicts = new Set<string>();
const inFlight = new Map<string, Promise<void>>();
const timers = new Map<string, ReturnType<typeof setTimeout>>();
let baselines: Record<string, string> = {};

function baselineKey(tenantId: string): string {
  return `drafthr.db-draft-baselines.v1:${tenantId}`;
}
function deleteKey(tenantId: string): string {
  return `drafthr.db-draft-deletes.v1:${tenantId}`;
}
function readJson<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) as T : fallback;
  } catch {
    return fallback;
  }
}
function writeJson(key: string, value: unknown): void {
  try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* recovery copy remains in Zustand storage */ }
}
function deletionIds(): string[] {
  if (!activeTenant) return [];
  const saved = readJson<unknown>(deleteKey(activeTenant), []);
  return Array.isArray(saved) ? saved.filter((id): id is string => typeof id === "string" && Boolean(serverUuidOrNull(id))) : [];
}
function markDelete(id: string): void {
  if (!activeTenant) return;
  writeJson(deleteKey(activeTenant), [...new Set([...deletionIds(), id])]);
}
function clearDelete(id: string): void {
  if (!activeTenant) return;
  writeJson(deleteKey(activeTenant), deletionIds().filter((value) => value !== id));
}
async function fingerprint(draft: Draft): Promise<string | null> {
  // If Web Crypto is unavailable, treat the browser copy as unverified and
  // ask for explicit import. Never assume it matches a server copy.
  if (!globalThis.crypto?.subtle) return null;
  try {
    const bytes = new TextEncoder().encode(JSON.stringify(draft));
    const digest = await crypto.subtle.digest("SHA-256", bytes);
    return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
  } catch {
    return null; // an acknowledged database write remains successful
  }
}
function saveBaselines(): void {
  if (activeTenant) writeJson(baselineKey(activeTenant), baselines);
}
function updateStatus(patch: Partial<Status> = {}): void {
  useDatabaseDraftStatus.setState({
    saving: pending.size + inFlight.size,
    failed: failed.size,
    conflicts: conflicts.size,
    ...patch,
  });
}

async function getDocuments(): Promise<Document[]> {
  const result: Document[] = [];
  let cursor: string | null = null;
  const seen = new Set<string>();
  do {
    const url = `/api/store/drafts?format=documents${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ""}`;
    const response = await fetch(url, { credentials: "same-origin", headers: { Accept: "application/json" } });
    if (!response.ok) throw new Error(`Draft load failed (${response.status})`);
    const page = await response.json() as { documents?: Document[]; nextCursor?: string | null };
    if (!Array.isArray(page.documents)) throw new Error("Invalid draft response");
    result.push(...page.documents);
    cursor = page.nextCursor ?? null;
    if (cursor && seen.has(cursor)) throw new Error("Draft pagination did not advance");
    if (cursor) seen.add(cursor);
  } while (cursor);
  return result;
}

function remoteMap(documents: Document[]): Record<string, Draft> {
  const map: Record<string, Draft> = {};
  for (const document of documents) {
    const draft = document.snapshot ?? (document.legacy ? mergeRemoteDrafts({}, [document.legacy])[document.id] : null);
    if (draft) map[draft.id] = draft;
  }
  return map;
}

async function postSnapshot(draft: Draft, baseRevision: number, legacyUpdatedAt?: number): Promise<number> {
  const response = await fetch("/api/store/drafts", {
    method: "POST", credentials: "same-origin",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify({
      id: toServerUuid(draft.id), snapshot: draft, baseRevision, legacyUpdatedAt,
      matterId: draft.matterId ? toServerUuid(draft.matterId) : null,
      templateSourceId: draft.templateSourceId ? toServerUuid(draft.templateSourceId) : null,
    }),
  });
  if (response.status === 409) throw new Error("conflict");
  if (!response.ok) throw new Error(`Draft save failed (${response.status})`);
  const result = await response.json() as { revision?: number };
  if (!Number.isSafeInteger(result.revision) || (result.revision ?? 0) < 1) throw new Error("Missing server revision");
  return result.revision!;
}

async function deleteSnapshot(id: string): Promise<void> {
  const response = await fetch("/api/store/drafts", {
    method: "DELETE", credentials: "same-origin", keepalive: true,
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify({ id }),
  });
  if (!response.ok) throw new Error(`Draft delete failed (${response.status})`);
}

function stopWatching(): void {
  unsubscribe?.();
  unsubscribe = null;
  if (typeof window !== "undefined") window.removeEventListener("beforeunload", warnBeforeUnload);
  for (const timer of timers.values()) clearTimeout(timer);
  timers.clear();
}

function startWatching(): void {
  if (typeof window !== "undefined") window.addEventListener("beforeunload", warnBeforeUnload);
  let previous = useDraftStore.getState().drafts;
  unsubscribe = useDraftStore.subscribe((state) => {
    if (state.drafts === previous) return;
    const next = state.drafts;
    for (const [id, draft] of Object.entries(next)) {
      if (previous[id] !== draft) queue(id);
    }
    for (const id of Object.keys(previous)) {
      if (!(id in next)) {
        markDelete(toServerUuid(id));
        queue(id);
      }
    }
    previous = next;
  });
}

function warnBeforeUnload(event: BeforeUnloadEvent): void {
  if (pending.size || inFlight.size || failed.size) event.preventDefault();
}

function queue(id: string): void {
  const exists = Boolean(useDraftStore.getState().drafts[id]);
  // The sidebar offers a 6-second Undo. Delay the remote DELETE beyond that
  // window; a quick Undo cancels it before any destructive request is sent.
  if (exists && !inFlight.has(id)) clearDelete(toServerUuid(id));
  pending.add(id);
  failed.delete(id);
  conflicts.delete(id);
  const timer = timers.get(id);
  if (timer) clearTimeout(timer);
  timers.set(id, setTimeout(() => {
    timers.delete(id);
    void drain(id);
  }, exists ? 400 : 6500));
  updateStatus();
}

async function drain(id: string): Promise<void> {
  if (inFlight.has(id)) return inFlight.get(id);
  if (!pending.delete(id)) return;
  const captured = useDraftStore.getState().drafts[id];
  const task = (async () => {
    try {
      if (captured) {
        const revision = await postSnapshot(
          captured,
          revisions.get(toServerUuid(id)) ?? 0,
          legacyUpdatedAtById.get(toServerUuid(id)),
        );
        revisions.set(toServerUuid(id), revision);
        legacyUpdatedAtById.delete(toServerUuid(id));
        const hash = await fingerprint(captured);
        if (hash) { baselines[toServerUuid(id)] = hash; saveBaselines(); }
        clearDelete(toServerUuid(id)); // restore completed after any prior DELETE
        if (useDraftStore.getState().drafts[id] !== captured) pending.add(id);
      } else {
        await deleteSnapshot(toServerUuid(id));
        revisions.delete(toServerUuid(id));
        delete baselines[toServerUuid(id)];
        saveBaselines();
        if (!useDraftStore.getState().drafts[id]) clearDelete(toServerUuid(id));
      }
      failed.delete(id);
      conflicts.delete(id);
    } catch (error) {
      failed.add(id);
      if (error instanceof Error && error.message === "conflict") conflicts.add(id);
    } finally {
      inFlight.delete(id);
      updateStatus();
      if (pending.has(id)) queue(id);
    }
  })();
  inFlight.set(id, task);
  updateStatus();
  await task;
}

async function applyDocuments(documents: Document[]): Promise<void> {
  stopWatching();
  revisions.clear();
  legacyUpdatedAtById.clear();
  baselines = {};
  for (const document of documents) {
    revisions.set(document.id, document.revision);
    if (!document.snapshot && document.legacy) legacyUpdatedAtById.set(document.id, document.legacy.updatedAt);
  }
  const map = remoteMap(documents);
  useDraftStore.setState({ drafts: map });
  for (const draft of Object.values(map)) {
    const hash = await fingerprint(draft);
    if (hash) baselines[toServerUuid(draft.id)] = hash;
  }
  saveBaselines();
  startWatching();
  updateStatus({ phase: "ready", importCount: 0, message: undefined });
}

/** Fetch first, then decide whether a browser recovery copy needs consent.
 * No local data is overwritten until the server succeeds and the decision is
 * made. The UI must block workspace routes while phase is not ready. */
export async function initializeDatabaseDrafts(tenantId: string): Promise<void> {
  if (!isDatabaseDraftsEnabled()) return;
  if (activeTenant === tenantId && useDatabaseDraftStatus.getState().phase === "ready") return;
  stopWatching();
  activeTenant = tenantId;
  const savedBaselines = readJson<unknown>(baselineKey(tenantId), {});
  baselines = savedBaselines && typeof savedBaselines === "object" && !Array.isArray(savedBaselines)
    ? savedBaselines as Record<string, string>
    : {};
  updateStatus({ phase: "loading", tenantId, message: undefined });
  try {
    const localBeforeLoad = useDraftStore.getState().drafts;
    const presentLocalIds = new Set(Object.values(localBeforeLoad).map((draft) => toServerUuid(draft.id)));
    for (const id of deletionIds()) {
      // A recovered/undone browser copy is an import decision, not a delete
      // intent. Never replay a tombstone over a present local document.
      if (presentLocalIds.has(id)) { clearDelete(id); continue; }
      await deleteSnapshot(id).then(() => clearDelete(id));
    }
    const documents = await getDocuments();
    const byId = new Map(documents.map((document) => [document.id, document]));
    const local = Object.values(useDraftStore.getState().drafts);
    const candidates: Draft[] = [];
    for (const draft of local) {
      const id = toServerUuid(draft.id);
      const remote = byId.get(id)?.snapshot;
      if (remote && JSON.stringify(remote) === JSON.stringify(draft)) continue;
      if (!byId.has(id)) { candidates.push(draft); continue; }
      const hash = await fingerprint(draft);
      if (hash && baselines[id] === hash) continue; // confirmed local cache; server wins
      candidates.push(draft);
    }
    importCandidates = candidates;
    if (candidates.length) {
      updateStatus({ phase: "needs-import", importCount: candidates.length });
      return;
    }
    await applyDocuments(documents);
  } catch (error) {
    updateStatus({ phase: "error", message: error instanceof Error ? error.message : "Draft load failed" });
  }
}

/** Explicitly confirmed legacy import. A divergent server draft is never
 * overwritten: its browser version is saved under a new recovery-copy ID. */
export async function importBrowserDrafts(): Promise<void> {
  if (!activeTenant || useDatabaseDraftStatus.getState().phase !== "needs-import") return;
  updateStatus({ phase: "loading" });
  try {
    const byId = new Map((await getDocuments()).map((document) => [document.id, document]));
    for (const local of importCandidates) {
      const existing = byId.get(toServerUuid(local.id));
      if (existing?.snapshot && JSON.stringify(existing.snapshot) === JSON.stringify(local)) {
        clearDelete(toServerUuid(local.id));
        continue;
      }
      // A legacy server row is incomplete, but it may still contain newer
      // editor text. Never replace it with a browser copy just because it has
      // no snapshot yet — preserve both under distinct IDs.
      const fork = Boolean(existing);
      const draft: Draft = fork
        ? { ...local, id: recoveryId(local), title: `${local.title ?? local.letterType} (recovered browser copy)` }
        : local;
      if (byId.has(toServerUuid(draft.id))) {
        clearDelete(toServerUuid(local.id));
        continue; // previous partial import succeeded
      }
      await postSnapshot(draft, 0);
      clearDelete(toServerUuid(local.id));
      byId.set(toServerUuid(draft.id), { id: toServerUuid(draft.id), revision: 1, snapshot: draft });
    }
    importCandidates = [];
    await applyDocuments(await getDocuments());
  } catch (error) {
    // The original Zustand/localStorage copy is still untouched. Retain the
    // import decision, so retry cannot accidentally abandon browser data.
    updateStatus({ phase: "needs-import", message: error instanceof Error ? error.message : "Import failed" });
  }
}

/** Force pending debounces to the server before leaving this tenant. */
export async function flushDatabaseDrafts(): Promise<boolean> {
  if (!isDatabaseDraftsEnabled() || !activeTenant) return true;
  for (const timer of timers.values()) clearTimeout(timer);
  timers.clear();
  for (let pass = 0; pass < 10 && (pending.size || inFlight.size); pass++) {
    await Promise.all([...pending].map((id) => drain(id)));
    await Promise.all([...inFlight.values()]);
  }
  return useDatabaseDraftStatus.getState().phase === "ready" && pending.size === 0 && inFlight.size === 0 && failed.size === 0;
}

export function retryFailedDatabaseDrafts(): void {
  for (const id of failed) if (!conflicts.has(id)) queue(id);
}

export async function recoverConflictedDraftsAsCopies(): Promise<void> {
  if (!activeTenant || conflicts.size === 0) return;
  const originals = [...conflicts];
  const captured = new Map(originals.map((id) => [id, useDraftStore.getState().drafts[id]]));
  try {
    const byId = new Map((await getDocuments()).map((document) => [document.id, document]));
    for (const id of originals) {
      const local = captured.get(id);
      if (!local) continue;
      const copy: Draft = { ...local, id: recoveryId(local), title: `${local.title ?? local.letterType} (conflict recovery copy)` };
      if (byId.has(toServerUuid(copy.id))) continue;
      await postSnapshot(copy, 0);
      byId.set(toServerUuid(copy.id), { id: toServerUuid(copy.id), revision: 1, snapshot: copy });
    }
    if (originals.some((id) => useDraftStore.getState().drafts[id] !== captured.get(id))) {
      throw new Error("The draft changed during recovery. Your latest edits are still on this device; retry to save them as another copy.");
    }
    failed.clear();
    conflicts.clear();
    await applyDocuments(await getDocuments());
  } catch (error) {
    updateStatus({ message: error instanceof Error ? error.message : "Recovery failed" });
  }
}

function recoveryId(local: Draft): string {
  // Deterministic across retries and reloads: an interrupted import cannot
  // create an unbounded sequence of duplicate recovery copies.
  return toServerUuid(`recovery:${toServerUuid(local.id)}:${JSON.stringify(local)}`);
}
