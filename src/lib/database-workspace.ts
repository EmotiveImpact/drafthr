import { create } from "zustand";
import { recordsEqual } from "./record-equality";
import { useDraftStore } from "./store";
import { useProfileStore, type Profile } from "./profile";
import { preferencesFromProfile, workspacePreferencesSchema, type WorkspacePreferences } from "./workspace-preferences";
import { toServerUuid } from "./remote-ids";
import { isDatabaseWorkspaceEnabled } from "./workspace-flags";
import { emptyWorkspaceBundle, mapWorkspaceEntity, planWorkspaceImport, WORKSPACE_SAVE_ORDER, type WorkspaceBundle, type WorkspaceEntity, type WorkspaceKind } from "./workspace-documents";
import { createWorkspaceTransport, type WorkspaceServerDocument } from "./workspace-transport";
import { WorkspaceSyncEngine, type SyncOperation, type SyncStatus } from "./workspace-sync-engine";
import { claimWorkspaceTab, withClosedWorkspaceTabs, type WorkspaceTabLease } from "./workspace-tab-lease";
import { readImportDocuments, saveWorkspaceImport } from "./workspace-import";
import { useSessionTransition } from "./session/transition";
import { workspaceRecoveryCopy } from "./workspace-recovery-copy";
import { applyRecoveryLinks, missingRecoveryLinks, recoveryLinks, type RecoveryLinkChoices, type RecoveryLinkIssue } from "./workspace-recovery-links";
import { chooseRecoveryOperations, reviewRecoverySources, type ClosedTabRecoveryReview } from "./workspace-recovery-review";

type Phase = "off" | "loading" | "needs-import" | "ready" | "error";
type Status = SyncStatus & { phase: Phase; identity?: string; importCount: number; message?: string; recoverySafe: boolean; otherRecoveryCount: number };
export const useDatabaseWorkspaceStatus = create<Status>(() => ({ phase: "off", importCount: 0, pending: 0, saving: 0, failed: 0, conflicts: 0, recoverySafe: true, otherRecoveryCount: 0 }));
type Engine = WorkspaceSyncEngine<WorkspaceKind, WorkspaceEntity>;
type Operation = SyncOperation<WorkspaceKind, WorkspaceEntity>;
const legacyKey = "scribehr-store-v1";
const prefix = "drafthr.workspace-pending.v1:";
let generation = 0;
let tabLease: WorkspaceTabLease | null = null;
let pendingTabRelease: Promise<void> = Promise.resolve();
let current: { identity: string; tenantId: string; userId: string; engine: Engine; recoveryKey: string; transport: ReturnType<typeof createWorkspaceTransport> } | null = null;
let unsubscribe: (() => void) | undefined;
let unsubscribeProfile: (() => void) | undefined;
let preferencesId: string | null = null;
let legacyProfile: { raw: string; profile: Profile } | null = null;
let timer: ReturnType<typeof setTimeout> | undefined;
let legacySource: { raw: string; bundle: WorkspaceBundle } | null = null;

function bundleFromState(state: ReturnType<typeof useDraftStore.getState>): WorkspaceBundle {
  return { preferences: {}, employees: state.employees, templates: state.customTemplates, matters: state.matters, tasks: state.tasks, events: state.events, drafts: state.drafts };
}
function applyBundle(bundle: WorkspaceBundle) {
  const preferences = Object.values(bundle.preferences)[0] as WorkspacePreferences | undefined;
  if (!preferences) throw new Error("Workspace settings are missing from the database response.");
  const { id, ...profile } = preferences;
  preferencesId = id;
  useProfileStore.setState(s => ({ profile: { ...s.profile, ...profile } }));
  useDraftStore.setState({ employees: bundle.employees, customTemplates: bundle.templates, matters: bundle.matters,
    tasks: bundle.tasks, events: bundle.events, drafts: bundle.drafts } as Pick<ReturnType<typeof useDraftStore.getState>, "employees" | "customTemplates" | "matters" | "tasks" | "events" | "drafts">);
}
function readLegacy(): typeof legacySource {
  const raw = localStorage.getItem(legacyKey);
  if (!raw) return null;
  const parsed = JSON.parse(raw);
  if (!parsed?.state || typeof parsed.state !== "object") throw new Error("The browser recovery file is invalid. It has not been changed.");
  const bundle = emptyWorkspaceBundle();
  for (const kind of WORKSPACE_SAVE_ORDER) {
    const values = parsed.state[kind === "templates" ? "customTemplates" : kind] ?? {};
    if (!values || typeof values !== "object" || Array.isArray(values) || Object.values(values).some(v => !v || typeof v !== "object" || typeof (v as { id?: unknown }).id !== "string")) throw new Error("The browser recovery file contains invalid records. It has not been changed.");
    bundle[kind] = values;
  }
  return WORKSPACE_SAVE_ORDER.some(k => Object.keys(bundle[k]).length) ? { raw, bundle } : null;
}
function persistRecovery(engine: Engine, key: string) {
  try {
    const pending = engine.recoveryOperations();
    if (pending.length) localStorage.setItem(key, JSON.stringify(pending));
    else localStorage.removeItem(key);
    useDatabaseWorkspaceStatus.setState({ recoverySafe: true });
  } catch {
    useDatabaseWorkspaceStatus.setState({ recoverySafe: false, message: "This browser cannot retain unsaved changes. Keep this tab open until the database confirms every save." });
  }
}
function warnBeforeUnload(event: BeforeUnloadEvent) {
  if (current?.engine.status.pending) { event.preventDefault(); event.returnValue = ""; }
}
function watch(engine: Engine, recoveryKey: string) {
  unsubscribe?.();
  unsubscribe = useDraftStore.subscribe((next, previous) => {
    const after = bundleFromState(next), before = bundleFromState(previous);
    for (const kind of WORKSPACE_SAVE_ORDER) {
      if (after[kind] === before[kind]) continue;
      for (const [id, value] of Object.entries(after[kind])) if (value !== before[kind][id]) engine.enqueue(kind, id, value);
      for (const id of Object.keys(before[kind])) if (!after[kind][id]) engine.enqueue(kind, id, null);
    }
    persistRecovery(engine, recoveryKey);
    clearTimeout(timer); timer = setTimeout(() => { void engine.flush(); }, 400);
  });
  unsubscribeProfile?.();
  unsubscribeProfile = useProfileStore.subscribe((next, previous) => {
    if (!preferencesId) return;
    const before = preferencesFromProfile(preferencesId, previous.profile), after = preferencesFromProfile(preferencesId, next.profile);
    if (recordsEqual(before, after)) return;
    engine.enqueue("preferences", preferencesId, after);
    persistRecovery(engine, recoveryKey);
    clearTimeout(timer); timer = setTimeout(() => { void engine.flush(); }, 400);
  });
}
export function stopDatabaseWorkspace() {
  generation++;
  if (current) persistRecovery(current.engine, current.recoveryKey);
  current?.engine.stop(); current = null;
  if (tabLease) pendingTabRelease = tabLease.release().catch(() => {});
  tabLease = null;
  unsubscribe?.(); unsubscribe = undefined; clearTimeout(timer);
  unsubscribeProfile?.(); unsubscribeProfile = undefined; preferencesId = null;
  if (typeof window !== "undefined") window.removeEventListener("beforeunload", warnBeforeUnload);
}

export async function initializeDatabaseWorkspace(tenantId: string, userId: string): Promise<void> {
  if (!isDatabaseWorkspaceEnabled()) return;
  const identity = `${userId}:${tenantId}`;
  if (current?.identity === identity && ["ready", "needs-import", "loading"].includes(useDatabaseWorkspaceStatus.getState().phase)) return;
  stopDatabaseWorkspace();
  const epoch = generation;
  useDatabaseWorkspaceStatus.setState({ phase: "loading", identity, importCount: 0, message: undefined, pending: 0, failed: 0, saving: 0, conflicts: 0, otherRecoveryCount: 0 });
  try {
    await pendingTabRelease;
    if (epoch !== generation) return;
    const lease = await claimWorkspaceTab(sessionStorage, navigator.locks);
    if (epoch !== generation) { await lease.release(); return; }
    tabLease = lease;
    const recoveryKey = `${prefix}${identity}:${lease.id}`;
    const rawRecovery = localStorage.getItem(recoveryKey);
    const recovery: Operation[] = rawRecovery ? JSON.parse(rawRecovery) : [];
    if (!Array.isArray(recovery) || recovery.some(op => !op || !WORKSPACE_SAVE_ORDER.includes(op.kind) || typeof op.id !== "string" || !Number.isSafeInteger(op.baseRevision) || op.baseRevision < 0 || (op.snapshot !== null && (typeof op.snapshot !== "object" || op.snapshot.id !== op.id)))) throw new Error("The pending-change recovery file is invalid. It has been preserved.");
    legacySource = readLegacy();
    const profileRaw = localStorage.getItem("scribehr-profile-v1");
    legacyProfile = profileRaw ? { raw: profileRaw, profile: JSON.parse(profileRaw).state?.profile } : null;
    if (legacyProfile && (!legacyProfile.profile || typeof legacyProfile.profile !== "object")) throw new Error("The browser settings recovery file is invalid. It has been preserved.");
    const transport = createWorkspaceTransport(tenantId);
    const entries = await Promise.all(WORKSPACE_SAVE_ORDER.map(async kind => [kind, await transport.read(kind)] as const));
    if (epoch !== generation) return;
    let restoring = true;
    const engine = new WorkspaceSyncEngine<WorkspaceKind, WorkspaceEntity>({ order: WORKSPACE_SAVE_ORDER, key: toServerUuid, write: transport.write,
      onChange: status => { if (epoch !== generation) return; useDatabaseWorkspaceStatus.setState(status); if (!restoring) persistRecovery(engine, recoveryKey); } });
    current = { identity, tenantId, userId, engine, recoveryKey, transport };
    useDatabaseWorkspaceStatus.setState({ otherRecoveryCount: otherRecoveryFiles().length });
    const bundle = emptyWorkspaceBundle();
    for (const [kind, documents] of entries) {
      engine.seed(kind, documents);
      for (const document of documents) if (document.snapshot) bundle[kind][document.snapshot.id] = document.snapshot;
    }
    for (const operation of recovery) {
      engine.restore(operation);
      const id = toServerUuid(operation.id);
      if (operation.snapshot) bundle[operation.kind][id] = mapWorkspaceEntity(operation.kind, operation.snapshot);
      else delete bundle[operation.kind][id];
    }
    restoring = false;
    applyBundle(bundle);
    window.addEventListener("beforeunload", warnBeforeUnload);
    if (legacySource || legacyProfile) {
      useDatabaseWorkspaceStatus.setState({ phase: "needs-import", importCount: (legacySource ? WORKSPACE_SAVE_ORDER.reduce((n, k) => n + Object.keys(legacySource!.bundle[k]).length, 0) : 0) + (legacyProfile ? 1 : 0) });
      return;
    }
    watch(engine, recoveryKey);
    useDatabaseWorkspaceStatus.setState({ phase: "ready" });
    await engine.flush();
  } catch (error) {
    if (epoch === generation) useDatabaseWorkspaceStatus.setState({ phase: "error", message: error instanceof Error ? error.message : "Could not load this workspace. No browser data was discarded." });
  }
}

/** Called only after the visible ownership-confirmation step. */
export async function importBrowserWorkspace(options: { keepDatabaseSettings?: boolean } = {}): Promise<void> {
  const session = current, source = legacySource;
  const profileSource = legacyProfile;
  if (!session || (!source && !profileSource)) return;
  const epoch = generation;
  try {
    if (!navigator.locks) throw new Error("Safe browser import needs Web Locks support. Use a current browser; your originals have not been changed.");
    await navigator.locks.request("drafthr-browser-import-v1", { ifAvailable: true }, async lock => {
      if (!lock) throw new Error("Another tab is importing this browser's work. Wait for it to finish before retrying.");
      const assertCurrent = () => {
        if (epoch !== generation || current !== session) throw new Error("Workspace changed. The original browser copy has been preserved.");
        if ((source && localStorage.getItem(legacyKey) !== source.raw) || (profileSource && localStorage.getItem("scribehr-profile-v1") !== profileSource.raw)) {
          throw new Error("The browser copy changed in another tab. Close the older tab and reload before importing. Its data has been preserved.");
        }
      };
      assertCurrent();
      const tokenKey = `drafthr.workspace-import.v1:${session.identity}`;
      let token = localStorage.getItem(tokenKey);
      if (!token) { token = crypto.randomUUID(); localStorage.setItem(tokenKey, token); }
      const imported = planWorkspaceImport(source?.bundle ?? emptyWorkspaceBundle(), session.tenantId, token);
      const documents = await readImportDocuments(session.transport, assertCurrent);
      const { importEmployerAssets, importTemplateAssets, legacyAssetUploader } = await import("./storage/legacy-asset-import");
      assertCurrent();
      const persistAsset = legacyAssetUploader({ tenantId: session.tenantId, isCurrent: () => { assertCurrent(); return true; } });
      if (profileSource && !options.keepDatabaseSettings) {
        const latest = documents.preferences[0];
        if (!latest?.snapshot) throw new Error("Workspace settings have not loaded.");
        const employer = await importEmployerAssets(profileSource.profile.employer, persistAsset);
        const preferences = workspacePreferencesSchema.parse(preferencesFromProfile(latest.id, { ...profileSource.profile, employer }));
        if (latest.revision > 0 && !recordsEqual(preferences, latest.snapshot)) throw new Error("Your database settings differ from this browser's settings. Neither version has been changed. Resolve the settings import before continuing.");
        imported.preferences[latest.id] = preferences;
      }
      for (const [id, template] of Object.entries(imported.templates)) {
        imported.templates[id] = await importTemplateAssets(template as import("./letters/types").CustomTemplate, persistAsset);
      }
      if (Object.keys(imported.drafts).length) {
        const { importLegacyDraftFiles, stagedFileUploader } = await import("./storage/legacy-file-import");
        assertCurrent();
        const upload = stagedFileUploader(session.tenantId, assertCurrent);
        for (const [id, draft] of Object.entries(imported.drafts)) {
          const sourceDraft = draft as import("./letters/types").Draft;
          const employer = await importEmployerAssets(sourceDraft.employer, persistAsset);
          imported.drafts[id] = await importLegacyDraftFiles({ ...sourceDraft, employer }, session.tenantId, token, upload, assertCurrent, persistAsset);
        }
      }
      // Older importer versions used the editing queue. Only retire operations
      // proven to be the same import; unrelated pending work is left untouched.
      const previousImportOperations = session.engine.recoveryOperations().filter(operation => {
        if (recordsEqual(operation.snapshot, imported[operation.kind][operation.id])) return true;
        return operation.kind === "preferences" && profileSource && options.keepDatabaseSettings &&
          recordsEqual(operation.snapshot, preferencesFromProfile(operation.id, profileSource.profile));
      });
      const fresh = await saveWorkspaceImport(imported, documents, session.transport, assertCurrent);
      assertCurrent();
      for (const operation of previousImportOperations) {
        const latest = fresh[operation.kind].find(row => row.id === operation.id);
        if (latest) session.engine.acceptServer(operation.kind, operation.id, latest);
      }
      persistRecovery(session.engine, session.recoveryKey);
      if (!useDatabaseWorkspaceStatus.getState().recoverySafe) throw new Error("Could not safely update pending recovery data. Your browser originals are preserved.");
      assertCurrent();
      if (source) localStorage.removeItem(legacyKey);
      if (profileSource) localStorage.removeItem("scribehr-profile-v1");
      localStorage.removeItem(tokenKey); legacySource = null; legacyProfile = null;
      stopDatabaseWorkspace();
      await initializeDatabaseWorkspace(session.tenantId, session.userId);
    });
  } catch (error) {
    if (epoch === generation) useDatabaseWorkspaceStatus.setState({ message: error instanceof Error ? error.message : "Import failed. Your browser copy is preserved." });
  }
}

export async function flushDatabaseWorkspace(): Promise<boolean> {
  if (!isDatabaseWorkspaceEnabled()) return true;
  if (!current || useDatabaseWorkspaceStatus.getState().phase !== "ready") return false;
  const otherRecoveryCount = otherRecoveryFiles().length;
  useDatabaseWorkspaceStatus.setState({ otherRecoveryCount });
  if (otherRecoveryCount) return false;
  clearTimeout(timer);
  const session = current;
  const saved = await session.engine.flush();
  return saved && current === session;
}

/** A release only resumes the same coordinator, never a new workspace. */
export async function suspendDatabaseWorkspaceForTransition(): Promise<() => void> {
  if (!isDatabaseWorkspaceEnabled()) return () => {};
  const session = current;
  if (!session || !await flushDatabaseWorkspace() || current !== session || !session.engine.pauseWrites()) {
    throw new Error("Some workspace changes are unsaved or awaiting import. Save or resolve them first.");
  }
  clearTimeout(timer);
  return () => {
    if (current !== session) return;
    session.engine.resumeWrites();
    void session.engine.flush();
  };
}
export async function retryDatabaseWorkspace() { if (current) await current.engine.retryFailures(); }
export function pendingWorkspaceChanges(): Operation[] { return current?.engine.recoveryOperations() ?? []; }

/** Capture the identity and the acknowledged revision of the exact draft being
 * rendered. A later edit cannot make an old file claim the newer revision. */
export async function savedWorkspaceDraft(draft: import("./letters/types").Draft) {
  const session = current;
  if (!session || !await flushDatabaseWorkspace() || current !== session) throw new Error("Save all workspace changes before uploading or exporting.");
  const revision = session.engine.acknowledgedRevision("drafts", draft.id, draft);
  if (!revision) throw new Error("This draft changed. Wait for it to save and try again.");
  return { tenantId: session.tenantId, identity: session.identity, revision };
}
export function workspaceIdentityMatches(identity: string) { return current?.identity === identity; }

export async function confirmSavedWorkspaceTemplate(template: import("./letters/types").CustomTemplate): Promise<void> {
  const session = current;
  if (!session || !await flushDatabaseWorkspace() || current !== session || !session.engine.acknowledgedRevision("templates", template.id, template)) {
    throw new Error("Template save is not confirmed. Your changes remain pending; resolve the workspace save warning before retrying.");
  }
}

/** A session-object guard also rejects switching away and back to the same
 * workspace while a file operation is pending. */
export function workspaceFileContext() {
  const session = current;
  const transition = useSessionTransition.getState();
  if (!session || transition.label || useDatabaseWorkspaceStatus.getState().phase !== "ready") throw new Error("Wait for your workspace to finish loading or switching.");
  return { tenantId: session.tenantId, isCurrent: () => current === session && useDatabaseWorkspaceStatus.getState().phase === "ready" &&
    !useSessionTransition.getState().label && useSessionTransition.getState().epoch === transition.epoch };
}

export type WorkspaceConflict = { identity: string; operation: Operation; latest: WorkspaceServerDocument; message: string };
export async function loadWorkspaceConflicts(): Promise<WorkspaceConflict[]> {
  const session = current;
  if (!session) return [];
  const operations = session.engine.recoveryOperations().filter(op => session.engine.getFailure(op.kind, op.id));
  const kinds = [...new Set(operations.map(op => op.kind))];
  const pages = new Map(await Promise.all(kinds.map(async kind => [kind, await session.transport.read(kind)] as const)));
  if (current !== session) throw new Error("Workspace changed. Reload before resolving changes.");
  return operations.map(operation => ({ identity: session.identity, operation,
    latest: pages.get(operation.kind)?.find(doc => doc.id === toServerUuid(operation.id)) ?? { id: operation.id, revision: 0, snapshot: null },
    message: session.engine.getFailure(operation.kind, operation.id)?.message ?? "Save failed" }));
}
/** Both choices are explicit in the conflict dialog; a newer intervening write
 * still fails CAS. Never overwrite against a revision the user has not seen. */
export async function resolveWorkspaceConflict(conflict: WorkspaceConflict, choice: "server" | "mine", resolution?: WorkspaceRecoveryLinkResolution) {
  const session = current;
  if (!session) throw new Error("Workspace changed. Reopen the comparison.");
  const scope = workspaceFileContext();
  if (conflict.identity !== session.identity) throw new Error("Workspace changed. Reopen the comparison.");
  const { operation, latest } = conflict;
  const pending = session.engine.recoveryOperations().find(op => op.kind === operation.kind && op.id === operation.id);
  if (!pending || !recordsEqual(pending, operation)) throw new Error("Your pending edit changed. Reopen the comparison first.");
  if (choice === "mine") {
    if (latest.deletedAt) throw new Error("This record was deleted. Download your pending changes before discarding them; do not overwrite a deleted record.");
    if (operation.snapshot) {
      const assertCurrent = () => {
        if (!scope.isCurrent()) throw new Error("Workspace changed. Your pending edit is preserved.");
        if (!recordsEqual(session.engine.recoveryOperations().find(op => op.kind === operation.kind && op.id === operation.id), operation)) {
          throw new Error("Your pending edit changed. Reopen the comparison; your latest edits are preserved.");
        }
      };
      if (resolution && !recordsEqual(resolution.review.conflict, conflict)) throw new Error("Your comparison changed. Check linked records again.");
      const parents = await readRecoveryParents(session, conflict); assertCurrent();
      const chosen = applyRecoveryLinks(operation.kind, operation.snapshot, parents, resolution && { issues: resolution.review.issues, choices: resolution.choices });
      // A different employee/matter invalidates the current approval, not the
      // immutable historical exports or audit/timeline history.
      if (operation.kind === "drafts" && !recordsEqual(chosen, operation.snapshot)) {
        const draft = chosen as import("./letters/types").Draft;
        draft.reviewStatus = "draft"; draft.approvals = [];
        delete draft.submittedForReviewAt; delete draft.reviewDecidedAt;
      }
      let saved = (await session.transport.read(operation.kind)).find(row => row.id === toServerUuid(operation.id)); assertCurrent();
      if (saved && saved.revision < latest.revision) throw new Error("The database revision changed unexpectedly. Reopen the comparison.");
      if (!saved || saved.deletedAt || !recordsEqual(saved.snapshot, chosen)) {
        if (!recordsEqual(saved ?? { id: operation.id, revision: 0, snapshot: null }, latest)) {
          throw new Error("The database version changed. Reopen the comparison before saving your version.");
        }
        await session.transport.write({ ...operation, snapshot: chosen, baseRevision: latest.revision, legacyUpdatedAt: latest.legacyUpdatedAt });
        assertCurrent();
        saved = (await session.transport.read(operation.kind)).find(row => row.id === toServerUuid(operation.id)); assertCurrent();
      }
      if (!saved || saved.deletedAt || saved.revision < latest.revision || !recordsEqual(saved.snapshot, chosen)) throw new Error("Save verification failed. Your pending edit is preserved.");
      unsubscribe?.(); unsubscribeProfile?.();
      try {
        session.engine.acceptServer(operation.kind, operation.id, saved);
        if (operation.kind === "preferences") {
          const { id: _id, ...profile } = chosen as WorkspacePreferences;
          useProfileStore.setState(s => ({ profile: { ...s.profile, ...profile } }));
        } else {
          const field = operation.kind === "templates" ? "customTemplates" : operation.kind;
          useDraftStore.setState({ [field]: { ...bundleFromState(useDraftStore.getState())[operation.kind], [operation.id]: chosen } });
        }
        persistRecovery(session.engine, session.recoveryKey);
      } finally { watch(session.engine, session.recoveryKey); }
      return;
    }
    session.engine.resolve(operation.kind, operation.id, latest, operation.snapshot);
    await session.engine.flush();
    if (!scope.isCurrent()) throw new Error("Workspace changed. Reopen the comparison.");
    if (session.engine.recoveryOperations().some(op => op.kind === operation.kind && op.id === operation.id)) throw new Error("This change has not saved. Review the pending edit before retrying.");
    return;
  }
  if (operation.kind === "preferences" && !latest.snapshot) throw new Error("Server settings are unavailable. Your pending settings have not been discarded.");
  unsubscribe?.(); unsubscribeProfile?.();
  session.engine.acceptServer(operation.kind, operation.id, latest);
  if (operation.kind === "preferences") {
    if (!latest.snapshot) throw new Error("Server settings are unavailable.");
    const { id: _id, ...profile } = latest.snapshot as WorkspacePreferences;
    useProfileStore.setState(s => ({ profile: { ...s.profile, ...profile } }));
  } else {
    const bundle = bundleFromState(useDraftStore.getState());
    bundle[operation.kind] = { ...bundle[operation.kind] };
    delete bundle[operation.kind][operation.id];
    if (latest.snapshot) bundle[operation.kind][latest.snapshot.id] = latest.snapshot;
    const field = operation.kind === "templates" ? "customTemplates" : operation.kind;
    useDraftStore.setState({ [field]: bundle[operation.kind] });
  }
  watch(session.engine, session.recoveryKey);
}

export type WorkspaceRecoveryLinkReview = { conflict: WorkspaceConflict; issues: RecoveryLinkIssue[] };
export type WorkspaceRecoveryLinkResolution = { review: WorkspaceRecoveryLinkReview; choices: RecoveryLinkChoices };
async function readRecoveryParents(session: NonNullable<typeof current>, conflict: WorkspaceConflict) {
  const kinds = [...new Set(recoveryLinks(conflict.operation.kind, conflict.operation.snapshot!).map(link => link.kind))];
  return Object.fromEntries(await Promise.all(kinds.map(async kind => [kind, await session.transport.read(kind)])));
}
export async function reviewWorkspaceRecoveryLinks(conflict: WorkspaceConflict): Promise<WorkspaceRecoveryLinkReview> {
  const session = current, scope = workspaceFileContext();
  const check = () => {
    if (!session || !scope.isCurrent() || conflict.identity !== session.identity || !conflict.operation.snapshot ||
      !recordsEqual(session.engine.recoveryOperations().find(op => op.kind === conflict.operation.kind && op.id === conflict.operation.id), conflict.operation)) {
      throw new Error("The workspace or pending edit changed. Reopen the comparison.");
    }
  };
  check();
  const rows = await readRecoveryParents(session!, conflict); check();
  return { conflict, issues: missingRecoveryLinks(conflict.operation.kind, conflict.operation.snapshot!, rows) };
}
/** Create and read back the exact copy before retiring the original pending
 * edit. Never enqueue it for an automatic later overwrite. */
export async function recoverWorkspaceConflictAsCopy(conflict: WorkspaceConflict, resolution?: WorkspaceRecoveryLinkResolution): Promise<string> {
  const session = current;
  const { operation } = conflict;
  if (!session || conflict.identity !== session.identity || !conflict.latest.deletedAt || !operation.snapshot || operation.kind === "preferences") {
    throw new Error("Reopen a deleted record's pending-edit comparison before recovering a copy.");
  }
  const scope = workspaceFileContext();
  const assertCurrent = () => {
    if (current !== session || !scope.isCurrent()) throw new Error("Workspace changed. Your original pending edit is preserved.");
    const pending = session.engine.recoveryOperations().find(op => op.kind === operation.kind && op.id === operation.id);
    if (!recordsEqual(pending, operation)) throw new Error("Your pending edit changed. Reopen the comparison; your latest edits are preserved.");
  };
  assertCurrent();
  if (resolution && !recordsEqual(resolution.review.conflict, conflict)) throw new Error("Your comparison changed. Check linked records again.");
  const parents = await readRecoveryParents(session, conflict); assertCurrent();
  const source = applyRecoveryLinks(operation.kind, operation.snapshot, parents, resolution && { issues: resolution.review.issues, choices: resolution.choices });
  const copy = workspaceRecoveryCopy(session.identity, operation.kind, source);
  const rows = await session.transport.read(operation.kind); assertCurrent();
  const deleted = rows.find(row => row.id === toServerUuid(operation.id));
  if (!deleted?.deletedAt) throw new Error("The database record changed. Reopen the comparison before recovering it.");
  const existing = rows.find(row => row.id === copy.id);
  if (existing && (existing.deletedAt || !recordsEqual(existing.snapshot, copy))) throw new Error("The recovery copy was changed or deleted elsewhere. Your original pending edit is preserved.");
  if (!existing) {
    await session.transport.write({ kind: operation.kind, id: copy.id, snapshot: copy, baseRevision: 0 });
    assertCurrent();
  }
  const verified = (await session.transport.read(operation.kind)).find(row => row.id === copy.id);
  assertCurrent();
  if (!verified || verified.deletedAt || !recordsEqual(verified.snapshot, copy)) throw new Error("Recovery verification failed. Your original pending edit is preserved.");
  const localCopy = bundleFromState(useDraftStore.getState())[operation.kind][copy.id];
  const pendingCopy = session.engine.recoveryOperations().some(op => op.kind === operation.kind && op.id === copy.id);
  if (pendingCopy || (localCopy && !recordsEqual(localCopy, copy))) throw new Error("The recovery copy has newer local edits. Resolve them before retiring the original.");
  unsubscribe?.(); unsubscribeProfile?.();
  try {
    session.engine.acceptServer(operation.kind, copy.id, verified);
    session.engine.acceptServer(operation.kind, operation.id, deleted);
    const records = { ...bundleFromState(useDraftStore.getState())[operation.kind] };
    delete records[operation.id]; records[copy.id] = copy;
    useDraftStore.setState({ [operation.kind === "templates" ? "customTemplates" : operation.kind]: records });
    persistRecovery(session.engine, session.recoveryKey);
  } finally { watch(session.engine, session.recoveryKey); }
  return copy.id;
}

export function browserWorkspaceRecovery() {
  return { version: 1, workspace: legacySource ? JSON.parse(legacySource.raw) : null, settings: legacyProfile ? JSON.parse(legacyProfile.raw) : null };
}

function otherRecoveryFiles(): Array<{ key: string; raw: string }> {
  if (!current) return [];
  const files: Array<{ key: string; raw: string }> = [];
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (key?.startsWith(`${prefix}${current.identity}:`) && key !== current.recoveryKey) {
      const raw = localStorage.getItem(key); if (raw) files.push({ key, raw });
    }
  }
  return files;
}
export function otherWorkspaceRecoveryCopies() { return otherRecoveryFiles(); }
export function reviewClosedWorkspaceTabs(): ClosedTabRecoveryReview {
  if (!current || useDatabaseWorkspaceStatus.getState().phase !== "ready") throw new Error("Wait for the workspace to load before reviewing recovery copies.");
  return reviewRecoverySources(current.identity, otherRecoveryFiles(), current.engine.recoveryOperations());
}
/** Explicit takeover after the user closes their older tabs. Each source is
 * retained until all its operations exist in this tab's durable recovery file. */
export async function recoverClosedWorkspaceTabs(selection?: { review: ClosedTabRecoveryReview; choices: Record<string, string> }): Promise<void> {
  const session = current;
  if (!session || useDatabaseWorkspaceStatus.getState().phase !== "ready") {
    if (selection) throw new Error("Workspace changed. Reopen the recovery comparison.");
    return;
  }
  // Reviewed choices must not be invalidated by silently flushing this tab's
  // competing version before we apply them.
  if (!selection) await session.engine.flush();
  if (current !== session) throw new Error("Workspace changed.");
  const files = otherRecoveryFiles();
  if (selection && (selection.review.identity !== session.identity || !recordsEqual(selection.review.files, files))) throw new Error("Recovery sources changed. Review them again; no source was removed.");
  if (!files.length) return;
  const sourcePrefix = `${prefix}${session.identity}:`;
  const tabIds = files.map(file => file.key.slice(sourcePrefix.length));
  if (tabIds.some(id => !id)) throw new Error("A recovery file has no tab identity. Download it for manual recovery; its source is unchanged.");
  await withClosedWorkspaceTabs(tabIds, navigator.locks, async () => {
    if (current !== session || useSessionTransition.getState().label) throw new Error("Workspace changed or is switching. Retry recovery in the original workspace.");
    for (const file of files) if (localStorage.getItem(file.key) !== file.raw) throw new Error("A recovery copy changed while taking ownership. Retry to review the latest version; no source was removed.");
    if (!recordsEqual(files, otherRecoveryFiles())) throw new Error("Recovery sources changed. Review the latest copies before taking ownership.");
    const review = reviewRecoverySources(session.identity, files, session.engine.recoveryOperations());
    if (selection && !recordsEqual(review, selection.review)) throw new Error("Pending versions changed after the comparison. Review them again; no source was removed.");
    if (session.engine.status.saving) throw new Error("Wait for the current save, then review recovery again.");
    const operations = chooseRecoveryOperations(review, selection?.choices);
    // Preflight durable storage before replacing this tab's unselected edits.
    // Other source files are still intact if this write cannot be verified.
    const raw = JSON.stringify(operations);
    const previousRaw = localStorage.getItem(session.recoveryKey);
    try {
      localStorage.setItem(session.recoveryKey, raw);
      if (localStorage.getItem(session.recoveryKey) !== raw) throw new Error("Recovery write mismatch");
    } catch {
      try {
        if (previousRaw === null) localStorage.removeItem(session.recoveryKey);
        else localStorage.setItem(session.recoveryKey, previousRaw);
      } catch { /* Previous edits are still in the current in-memory queue. */ }
      throw new Error("Could not verify storage for the chosen edits. The previous edits are still in this tab; keep it open and download a backup.");
    }
    unsubscribe?.(); unsubscribeProfile?.();
    try {
      const bundle = bundleFromState(useDraftStore.getState());
      bundle.preferences = preferencesId ? { [preferencesId]: preferencesFromProfile(preferencesId, useProfileStore.getState().profile) } : {};
      for (const op of operations) {
        session.engine.replaceRecovery(op);
        bundle[op.kind] = { ...bundle[op.kind] };
        if (op.snapshot) bundle[op.kind][toServerUuid(op.id)] = mapWorkspaceEntity(op.kind, op.snapshot);
        else delete bundle[op.kind][toServerUuid(op.id)];
      }
      applyBundle(bundle);
    } finally { watch(session.engine, session.recoveryKey); }
    persistRecovery(session.engine, session.recoveryKey);
    if (!useDatabaseWorkspaceStatus.getState().recoverySafe) throw new Error("Could not retain the recovered edits. The older recovery files have not been deleted.");
    for (const file of files) if (localStorage.getItem(file.key) === file.raw) localStorage.removeItem(file.key);
    useDatabaseWorkspaceStatus.setState({ otherRecoveryCount: otherRecoveryFiles().length });
    await session.engine.flush();
  });
}
