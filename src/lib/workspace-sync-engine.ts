/**
 * Per-record write coordinator. No React, browser-storage or network assumptions:
 * adapters supply the transport and the UI supplies its in-memory editing buffer.
 * Successful writes advance only the exact record's acknowledged revision.
 */
import { recordsEqual } from "./record-equality";
export type SyncRecord = { id: string };
export type SyncDocument<T extends SyncRecord> = { id: string; revision: number; snapshot: T | null; deletedAt?: number | null; legacyUpdatedAt?: number };
export type SyncOperation<K extends string, T extends SyncRecord> = {
  kind: K; id: string; snapshot: T | null; baseRevision: number; legacyUpdatedAt?: number;
};
export type SyncFailure = { code: string; message: string };
export class SyncRequestError extends Error {
  readonly code: string;
  constructor(code: string, message: string) { super(message); this.code = code; }
}
export type SyncStatus = { pending: number; saving: number; failed: number; conflicts: number };

export class WorkspaceSyncEngine<K extends string, T extends SyncRecord> {
  private readonly acknowledged = new Map<string, SyncDocument<T>>();
  private readonly pending = new Map<string, { kind: K; id: string; snapshot: T | null }>();
  private readonly failures = new Map<string, SyncFailure>();
  private running: Promise<boolean> | null = null;
  private current: string | null = null;
  private stopped = false;
  private paused = false;
  constructor(privateOptions: {
    order: readonly K[];
    key: (id: string) => string;
    write: (operation: SyncOperation<K, T>) => Promise<{ revision: number; deletedAt?: number | null }>;
    onChange?: (status: SyncStatus) => void;
  }) { this.options = privateOptions; }
  private readonly options;
  private key(kind: K, id: string) { return `${kind}:${this.options.key(id)}`; }

  seed(kind: K, documents: SyncDocument<T>[]) {
    if (this.running || this.pending.size) throw new Error("Cannot replace revisions while edits are pending");
    for (const document of documents) this.acknowledged.set(this.key(kind, document.id), document);
  }
  enqueue(kind: K, id: string, snapshot: T | null) {
    if (this.stopped) throw new Error("Workspace coordinator was stopped");
    const key = this.key(kind, id);
    this.pending.set(key, { kind, id, snapshot });
    // Edits do not clear conflicts: otherwise typing after a 409 would silently
    // retry an unreviewed overwrite. Only an explicit resolution may advance it.
    this.emit();
  }
  get status(): SyncStatus {
    return { pending: this.pending.size, saving: this.current ? 1 : 0, failed: this.failures.size,
      conflicts: [...this.failures.values()].filter(f => f.code === "revision_conflict" || f.code === "record_deleted").length };
  }
  getFailure(kind: K, id: string) { return this.failures.get(this.key(kind, id)); }
  acknowledgedRevision(kind: K, id: string, snapshot: T): number | null {
    const key = this.key(kind, id), saved = this.acknowledged.get(key);
    return !this.pending.has(key) && saved && !saved.deletedAt && recordsEqual(saved.snapshot, snapshot) ? saved.revision : null;
  }
  /** Restore the revision captured before a crash, never the freshly fetched
   * revision: using the latter would silently overwrite another device's edit. */
  restore(operation: SyncOperation<K, T>) {
    const key = this.key(operation.kind, operation.id);
    const latest = this.acknowledged.get(key);
    if (latest?.deletedAt && operation.snapshot === null) return;
    if (latest && recordsEqual(latest.snapshot, operation.snapshot)) return;
    this.acknowledged.set(key, { id: operation.id, revision: operation.baseRevision,
      snapshot: latest?.snapshot ?? null, deletedAt: latest?.deletedAt, legacyUpdatedAt: operation.legacyUpdatedAt });
    this.enqueue(operation.kind, operation.id, operation.snapshot);
  }
  /** Explicitly selected recovery replaces this tab's competing pending edit,
   * including when the chosen snapshot is already acknowledged by the server. */
  replaceRecovery(operation: SyncOperation<K, T>) {
    const key = this.key(operation.kind, operation.id);
    if (this.current === key || this.stopped || this.paused) throw new Error("Wait for the workspace save or transition before recovering edits.");
    this.pending.delete(key); this.failures.delete(key);
    this.restore(operation);
    this.emit();
  }
  /** Temporary recovery contains only unacknowledged operations, not a workspace cache. */
  recoveryOperations(): SyncOperation<K, T>[] {
    return [...this.pending.entries()].map(([key, operation]) => ({ ...operation,
      baseRevision: this.acknowledged.get(key)?.revision ?? 0,
      legacyUpdatedAt: this.acknowledged.get(key)?.legacyUpdatedAt,
    }));
  }
  retryFailures() {
    for (const [key, failure] of this.failures) {
      if (!["revision_conflict", "record_deleted", "workspace_changed"].includes(failure.code)) this.failures.delete(key);
    }
    this.emit();
    return this.flush();
  }
  /** Explicit user resolution, against a freshly fetched server revision. */
  resolve(kind: K, id: string, latest: SyncDocument<T>, chosen: T | null) {
    const key = this.key(kind, id);
    if (this.current === key) throw new Error("Wait for the current save before resolving this record");
    this.acknowledged.set(key, latest);
    this.failures.delete(key);
    this.pending.set(key, { kind, id, snapshot: chosen });
    this.emit();
  }
  acceptServer(kind: K, id: string, latest: SyncDocument<T>) {
    const key = this.key(kind, id);
    if (this.current === key) throw new Error("Wait for the current save before resolving this record");
    this.acknowledged.set(key, latest); this.pending.delete(key); this.failures.delete(key); this.emit();
  }
  stop() { this.stopped = true; }
  /** Seal a drained queue before changing the authenticated workspace.
   * Late callbacks may still enqueue recoverable work, but cannot send it. */
  pauseWrites(): boolean {
    if (this.stopped || this.current || this.pending.size || this.failures.size) return false;
    this.paused = true;
    return true;
  }
  resumeWrites() { this.paused = false; }

  async flush(): Promise<boolean> {
    if (this.stopped || this.paused) return false;
    if (this.running) return this.running;
    const run = this.drain();
    this.running = run;
    try { return await run; }
    finally { if (this.running === run) this.running = null; }
  }
  private emit() { this.options.onChange?.(this.status); }
  private async drain(): Promise<boolean> {
    while (!this.stopped && !this.paused) {
      // Creates/updates before deletes; parents before dependent children.
      // Deletes run in reverse order so explicit unlink edits land first.
      const candidates = [...this.pending.entries()].filter(([key]) => !this.failures.has(key));
      candidates.sort(([, a], [, b]) => {
        if (Boolean(a.snapshot) !== Boolean(b.snapshot)) return a.snapshot ? -1 : 1;
        const order = this.options.order.indexOf(a.kind) - this.options.order.indexOf(b.kind);
        return a.snapshot ? order : -order;
      });
      const next = candidates[0];
      if (!next) break;
      const [key, captured] = next;
      const baseline = this.acknowledged.get(key);
      this.current = key; this.emit();
      try {
        if (!captured.snapshot && (!baseline || baseline.deletedAt)) {
          // Created then discarded before the first save, or an already
          // acknowledged deletion. No destructive request is necessary.
          if (this.pending.get(key) === captured) this.pending.delete(key);
          continue;
        }
        if (baseline?.deletedAt && captured.snapshot) throw new SyncRequestError("record_deleted", "This record was deleted. Recover it with a new ID.");
        const result = await this.options.write({ ...captured, baseRevision: baseline?.revision ?? 0, legacyUpdatedAt: baseline?.legacyUpdatedAt });
        if (!Number.isSafeInteger(result.revision) || result.revision < 1 || result.revision <= (baseline?.revision ?? 0)) {
          throw new SyncRequestError("invalid_response", "The server did not acknowledge a valid record revision.");
        }
        this.acknowledged.set(key, { id: captured.id, revision: result.revision, snapshot: captured.snapshot, deletedAt: result.deletedAt });
        if (this.pending.get(key) === captured) this.pending.delete(key);
        this.failures.delete(key);
      } catch (error) {
        this.failures.set(key, error instanceof SyncRequestError
          ? { code: error.code, message: error.message }
          : { code: "unavailable", message: "Could not save. Your changes are still pending." });
      } finally { this.current = null; this.emit(); }
    }
    return !this.stopped && this.pending.size === 0 && this.failures.size === 0;
  }
}
