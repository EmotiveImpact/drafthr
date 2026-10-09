/**
 * Per-draft sync bookkeeping for dual-write: the server revision this device
 * last saw and a content key of what it last pushed.
 *
 * Two jobs:
 *   1. Change detection. A draft is only re-sent when its synced content
 *      actually changed since the last successful push, so a page load or a
 *      cross-tab rehydrate no longer re-posts every draft (and trips the
 *      120/min rate limit).
 *   2. Revisions. Each write sends the revision it was built on; the server
 *      rejects anything older with 409 so devices can't overwrite each other.
 *
 * Persisted to localStorage so it survives reloads; the key is tenant-scoped
 * (stashed with the rest of the workspace's data on a switch).
 */
import type { Draft } from "./letters/types";
import type { DraftExtras, RemoteDraft } from "./remote-pull";
import { serverUuidOrNull, toServerUuid } from "./remote-ids";

export const SYNC_META_STORAGE_KEY = "drafthr.sync-meta.v1";

export type SyncMeta = {
  /** Server revision the local copy is based on. */
  rev: number;
  /** Content key (including reviewStatus) last pushed or adopted. */
  key: string;
  /** Content key excluding reviewStatus, used to rebase status-only changes. */
  ckey: string;
  /** Extras key last pushed. */
  ekey?: string;
  /** When the last successful sync happened. */
  at: number;
};

let cache: Record<string, SyncMeta> | null = null;

function load(): Record<string, SyncMeta> {
  if (cache) return cache;
  try {
    const raw = localStorage.getItem(SYNC_META_STORAGE_KEY);
    const parsed = raw ? (JSON.parse(raw) as unknown) : {};
    cache = parsed && typeof parsed === "object" ? (parsed as Record<string, SyncMeta>) : {};
  } catch {
    cache = {};
  }
  return cache;
}

function save(): void {
  try {
    localStorage.setItem(SYNC_META_STORAGE_KEY, JSON.stringify(cache ?? {}));
  } catch {
    /* storage full or unavailable: the in-memory copy still covers the session */
  }
}

export function getSyncMeta(localId: string): SyncMeta | undefined {
  return load()[localId];
}

export function setSyncMeta(localId: string, meta: SyncMeta): void {
  load()[localId] = meta;
  save();
}

export function patchSyncMeta(localId: string, patch: Partial<SyncMeta>): void {
  const prev = load()[localId] ?? { rev: 0, key: "", ckey: "", at: 0 };
  load()[localId] = { ...prev, ...patch };
  save();
}

export function clearSyncMeta(localId: string): void {
  const all = load();
  if (!(localId in all)) return;
  delete all[localId];
  save();
}

/** Drop the in-memory cache (tests, and after local data is swapped). */
export function resetSyncMetaCache(): void {
  cache = null;
}

/** cyrb53: a fast 53-bit string hash, plenty for change detection. */
export function hashString(input: string): string {
  let h1 = 0xdeadbeef;
  let h2 = 0x41c6ce57;
  for (let i = 0; i < input.length; i += 1) {
    const ch = input.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 2654435761);
    h2 = Math.imul(h2 ^ ch, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return (4294967296 * (2097151 & h2) + (h1 >>> 0)).toString(36) + ":" + input.length.toString(36);
}

type ContentShape = {
  letterType: string;
  mode: string;
  title: string | null;
  context: unknown;
  employer: unknown;
  employee: unknown;
  answers: unknown;
  isTemplateSource: boolean;
  sections: { sectionId: string; title: string; html: string; status: string }[];
};

/**
 * JSON with every object's keys sorted. The server keeps context, parties and
 * answers in jsonb columns, which return keys in their own order, so plain
 * JSON.stringify gave the same letter a different key on each side and every
 * 409 looked like a real conflict.
 */
function canonicalJson(value: unknown): string {
  return JSON.stringify(value, (_key, v: unknown) =>
    v && typeof v === "object" && !Array.isArray(v)
      ? Object.fromEntries(Object.entries(v as Record<string, unknown>).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)))
      : v,
  );
}

function contentKeyOf(c: ContentShape): string {
  return hashString(
    canonicalJson([
      c.letterType,
      c.mode,
      c.title ?? null,
      c.context ?? null,
      c.employer ?? null,
      c.employee ?? null,
      c.answers ?? null,
      Boolean(c.isTemplateSource),
      c.sections.map((s) => [s.sectionId, s.title, s.html, s.status]),
    ]),
  );
}

/** Letter content as the server stores it, excluding the review status. */
export function draftContentKey(d: Draft): string {
  return contentKeyOf({
    letterType: d.letterType,
    mode: d.mode,
    title: d.title ?? null,
    context: d.context,
    employer: d.employer,
    employee: d.employee,
    answers: d.answers,
    isTemplateSource: Boolean(d.isTemplateSource),
    sections: d.sections,
  });
}

export function remoteContentKey(r: RemoteDraft): string {
  return contentKeyOf({
    letterType: r.letterType,
    mode: r.mode,
    title: r.title ?? null,
    context: r.context,
    employer: r.employer,
    employee: r.employee,
    answers: r.answers,
    isTemplateSource: Boolean(r.isTemplateSource),
    sections: [...r.sections].sort((a, b) => a.position - b.position),
  });
}

/** Everything the drafts upsert carries: content, review status and the
 *  matter / template references (in the uuid form the server stores). */
export function draftSyncKey(d: Draft): string {
  const matter = d.matterId ? toServerUuid(d.matterId) : "";
  const template = serverUuidOrNull(d.templateSourceId) ?? "";
  return `${draftContentKey(d)}|${d.reviewStatus ?? "draft"}|${matter}|${template}`;
}

export function remoteSyncKey(r: RemoteDraft): string {
  return `${remoteContentKey(r)}|${r.reviewStatus ?? "draft"}|${r.matterId ?? ""}|${r.templateSourceId ?? ""}`;
}

export function extrasKey(extras: DraftExtras | null): string {
  return extras ? hashString(JSON.stringify(extras)) : "";
}

/** True when this draft has content the server has not accepted yet. */
export function hasUnsyncedChanges(d: Draft): boolean {
  const meta = getSyncMeta(d.id);
  return !meta || meta.key !== draftSyncKey(d);
}
