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
import type { Draft } from "./letters/types";

const DEBOUNCE_MS = 400;
const ENABLED = readFlag();
const pendingDraftIds = new Set<string>();
const timers = new Map<string, ReturnType<typeof setTimeout>>();
const syncedAt = new Map<string, number>();

export function isDualWriteEnabled(): boolean {
  return ENABLED;
}

/** Snapshot a draft from the live Zustand state. Kept in this module so tests
 * can inject a different getter without importing the store. */
let snapshotGetter: ((draftId: string) => Draft | null) | null = null;

export function setDualWriteSnapshotGetter(getter: (draftId: string) => Draft | null): void {
  snapshotGetter = getter;
}

/** Schedule a debounced sync for one draft. Multiple calls in a short window
 * collapse into a single POST. */
export function enqueueSync(draftId: string): void {
  if (!ENABLED) return;
  if (!draftId) return;
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
  try {
    const res = await fetch("/api/store/drafts", {
      method: "POST",
      credentials: "same-origin",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify(toServerPayload(draft)),
    });
    if (res.ok) {
      syncedAt.set(draftId, Date.now());
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
      const res = await fetch("/api/store/drafts", {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify(toServerPayload(d)),
      });
      if (res.ok) {
        syncedAt.set(d.id, Date.now());
        ok += 1;
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
}

/** Visible for tests only. */
export function _isPending(draftId: string): boolean {
  return pendingDraftIds.has(draftId);
}

/** Visible for tests only. */
export function _hasSynced(draftId: string): boolean {
  return syncedAt.has(draftId);
}

function readFlag(): boolean {
  try {
    return (import.meta.env?.VITE_DRAFTHR_DUAL_WRITE as string | undefined) === "true";
  } catch {
    return false;
  }
}

function toServerPayload(draft: Draft) {
  return {
    id: draft.id,
    letterType: draft.letterType,
    mode: draft.mode,
    title: draft.title ?? null,
    jurisdiction: draft.context?.jurisdiction ?? null,
    matterId: draft.matterId ?? null,
    reviewStatus: draft.reviewStatus ?? "draft",
    isTemplateSource: Boolean(draft.isTemplateSource),
    templateSourceId: draft.templateSourceId ?? null,
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
