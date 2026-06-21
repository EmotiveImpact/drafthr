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
 *   • Newer-wins: if the LOCAL copy has a newer updatedAt than the server, we
 *     keep local untouched (an unsynced local edit is never clobbered).
 *   • A draft present only on the server is adopted (created on another device).
 *   • A draft present only locally is kept (created offline / not yet pushed).
 *
 * Gated by the same VITE_DRAFTHR_DUAL_WRITE flag as the write path, so read and
 * write are always consistent and the default (flag off) behaviour is unchanged.
 *
 * Known limitation (documented, not a data-loss risk): a delete performed on
 * another device does not propagate on pull (the row is simply absent from the
 * server response, and we keep local-only drafts). Deletes still apply on the
 * device that issued them. Full delete reconciliation is a later feature.
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
import { toServerUuid } from "@/lib/remote-ids";
import { uid } from "@/lib/utils";

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
  sections: RemoteSection[];
};

/** Rebuild the sections array, preserving local section id/required/versions/
 *  pendingChange when a section with the same sectionId already exists. */
function mergeSections(remote: RemoteSection[], local?: Draft): Section[] {
  const localBySectionId = new Map<string, Section>();
  for (const s of local?.sections ?? []) localBySectionId.set(s.sectionId, s);
  return [...remote]
    .sort((a, b) => a.position - b.position)
    .map((rs) => {
      const ls = localBySectionId.get(rs.sectionId);
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

/** Server-synced fields applied over a (possibly existing) local draft. */
function syncedFields(r: RemoteDraft, local?: Draft) {
  return {
    mode: r.mode as Mode,
    letterType: r.letterType as LetterTypeId,
    context: r.context as unknown as LetterContext,
    employer: (r.employer ?? local?.employer ?? {}) as unknown as EmployerDetails,
    employee: (r.employee ?? local?.employee ?? {}) as unknown as EmployeeDetails,
    answers: (r.answers ?? {}) as unknown as LetterAnswers,
    sections: mergeSections(r.sections, local),
    title: r.title ?? undefined,
    matterId: r.matterId ?? undefined,
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
): Record<string, Draft> {
  // Index local drafts by their server-uuid so we can match against remote.
  const localByServerId = new Map<string, Draft>();
  for (const d of Object.values(local)) localByServerId.set(toServerUuid(d.id), d);

  const merged: Record<string, Draft> = { ...local };

  for (const r of remote) {
    const existing = localByServerId.get(r.id);
    if (existing) {
      // Local edit strictly newer than server → keep local untouched.
      if (existing.updatedAt > r.updatedAt) continue;
      // Overlay synced fields; SPREAD local first so local-only fields survive.
      merged[existing.id] = {
        ...existing,
        ...syncedFields(r, existing),
        id: existing.id,
      } as Draft;
    } else {
      // Remote-only — adopt it under the server UUID as the local id.
      merged[r.id] = {
        id: r.id,
        ...syncedFields(r, undefined),
      } as Draft;
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
  applyMerge: (remote: RemoteDraft[]) => void,
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
    const data = (await res.json()) as { drafts?: RemoteDraft[] };
    const remote = Array.isArray(data.drafts) ? data.drafts : [];
    applyMerge(remote);
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
