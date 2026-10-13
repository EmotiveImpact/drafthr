/**
 * The people the review dialog offers: teammates (workspace members plus
 * anyone already invited to this letter), the people you trusted before
 * (saved reviewers), and who to ask for approval when you skip review.
 * Everything comes from real data: the members endpoint, the draft's
 * collaborators, the review history in this browser, the drafts' approvals.
 */
import { useEffect, useMemo, useState } from "react";
import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import type { Draft } from "@/lib/letters/types";
import { canApprove } from "@/lib/permissions";
import type { WorkspaceRole } from "@/lib/profile";
import { useDraftStore } from "@/lib/store";
import { useReviewStore, type ReviewRequest } from "@/lib/journey/reviews";
import { fmtDuration } from "./model";

export type Teammate = {
  key: string;
  name: string;
  email?: string;
  userId?: string;
  role?: string;
  /** "Head of HR", or the workspace role in words. */
  line: string;
  canApprove: boolean;
  collaboratorId?: string;
};

type MemberRow = { userId: string; email: string; legalName: string | null; role: string };

const ROLE_WORDS: Record<string, string> = {
  owner: "Owner",
  admin: "Admin",
  drafter: "Drafter",
  reviewer: "Reviewer",
  viewer: "Viewer",
  editor: "Editor",
};

/** "loading" | "ready" | "failed" with the people. */
export type TeammatesState = { status: "loading" | "ready" | "failed"; people: Teammate[] };

/**
 * Teammates other than you: active workspace members, then people invited
 * to this letter who are not members (yet). Viewers are left out (they
 * cannot suggest changes).
 */
export function useTeammates(draft: Draft | undefined, myEmail: string | undefined, enabled: boolean): TeammatesState {
  const [members, setMembers] = useState<MemberRow[] | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    setFailed(false);
    void fetch("/api/workspace/members", { credentials: "same-origin" })
      .then(async (r) => {
        const ct = r.headers.get("content-type") ?? "";
        if (!r.ok || !ct.includes("application/json")) throw new Error("members");
        return (await r.json()) as { members?: MemberRow[] };
      })
      .then((data) => {
        if (cancelled) return;
        setMembers(data.members ?? []);
      })
      .catch(() => {
        if (cancelled) return;
        setMembers([]);
        setFailed(true);
      });
    return () => {
      cancelled = true;
    };
  }, [enabled]);

  return useMemo(() => {
    if (members === null) return { status: "loading", people: [] };
    const me = (myEmail ?? "").trim().toLowerCase();
    const out: Teammate[] = [];
    const seen = new Set<string>();
    for (const m of members) {
      const email = (m.email ?? "").toLowerCase();
      if (!email || email === me || m.role === "viewer") continue;
      seen.add(email);
      const name = m.legalName?.trim() || m.email;
      const approve = canApprove(m.role as WorkspaceRole);
      out.push({
        key: `m:${m.userId}`,
        name,
        email: m.email,
        userId: m.userId,
        role: m.role,
        line: `${ROLE_WORDS[m.role] ?? m.role}${approve ? " · can approve letters" : ""}`,
        canApprove: approve,
      });
    }
    for (const c of draft?.collaborators ?? []) {
      const email = (c.email ?? "").toLowerCase();
      if (!email || email === me || seen.has(email) || c.role === "viewer" || c.role === "owner") continue;
      seen.add(email);
      out.push({
        key: `c:${c.id}`,
        name: c.name?.trim() || c.email,
        email: c.email,
        role: c.role,
        line: `Invited to this letter · ${(ROLE_WORDS[c.role] ?? c.role).toLowerCase()}`,
        canApprove: false,
        collaboratorId: c.id,
      });
    }
    // People who can approve first, then by name.
    out.sort((a, b) => Number(b.canApprove) - Number(a.canApprove) || a.name.localeCompare(b.name));
    return { status: failed && out.length === 0 ? "failed" : "ready", people: out };
  }, [members, failed, draft?.collaborators, myEmail]);
}

/**
 * "Usually replies in 2 hours", from this person's real review history in
 * this browser (median time from sent to back). Null without history.
 */
export function usualReplyTime(requests: Record<string, ReviewRequest>, email: string | undefined): string | null {
  const e = (email ?? "").trim().toLowerCase();
  if (!e) return null;
  const spans: number[] = [];
  for (const r of Object.values(requests)) {
    if ((r.reviewer.email ?? "").toLowerCase() !== e) continue;
    for (const round of r.rounds) if (round.backAt) spans.push(round.backAt - round.sentAt);
  }
  if (spans.length === 0) return null;
  spans.sort((a, b) => a - b);
  return fmtDuration(spans[Math.floor(spans.length / 2)]);
}

/**
 * A conflict: the letter names this person as hearing the appeal, chairing
 * the hearing, investigating or as a witness. Returns the reason in words.
 */
export function conflictFor(draft: Draft | undefined, name: string): string | null {
  if (!draft || !name.trim()) return null;
  const n = name.trim().toLowerCase();
  const text = (html: string | undefined) => (html ?? "").replace(/<[^>]+>/g, " ").toLowerCase();
  const appeal = draft.sections.find((s) => s.sectionId === "appeal_rights");
  if (appeal && text(appeal.html).includes(n)) return "hears the appeal, so not suggested";
  const a = draft.answers as Record<string, unknown>;
  const str = (k: string) => (typeof a?.[k] === "string" ? (a[k] as string).toLowerCase() : "");
  if (str("appealHearerName").includes(n) || str("appealTo").includes(n)) return "hears the appeal, so not suggested";
  if (str("hearingChairName").includes(n)) return "chaired the hearing, so not suggested";
  if (str("investigatorName").includes(n) || str("investigatingOfficer").includes(n))
    return "investigated, so not suggested";
  if (str("hearingAttendees").includes(n)) return "was at the hearing, so not suggested";
  return null;
}

/* ------------------------------------------------------------------ */
/*  Saved trusted reviewers                                            */
/* ------------------------------------------------------------------ */

export type SavedReviewer = { name: string; email: string; org?: string; lastUsedAt: number };

type SavedStore = {
  people: SavedReviewer[];
  remember: (p: Omit<SavedReviewer, "lastUsedAt">) => void;
};

/** People you have sent a secure review link to, newest first (this browser). */
export const useSavedReviewers = create<SavedStore>()(
  persist(
    (set) => ({
      people: [],
      remember: (p) =>
        set((s) => {
          const email = p.email.trim().toLowerCase();
          const rest = s.people.filter((x) => x.email.toLowerCase() !== email);
          return { people: [{ ...p, email: p.email.trim(), lastUsedAt: Date.now() }, ...rest].slice(0, 8) };
        }),
    }),
    { name: "drafthr.trusted-reviewers.v1", storage: createJSONStorage(() => localStorage) }
  )
);

/* ------------------------------------------------------------------ */
/*  Who approves when you skip review                                  */
/* ------------------------------------------------------------------ */

/** The approver you asked most recently on any letter, if any. */
export function useDefaultApprover(): string | null {
  const drafts = useDraftStore((s) => s.drafts);
  return useMemo(() => {
    let best: { name: string; at: number } | null = null;
    for (const d of Object.values(drafts)) {
      for (const a of d.approvals ?? []) {
        const name = a.reviewerName?.trim();
        if (a.decision !== "submitted" || !name || /^workspace reviewer$/i.test(name)) continue;
        if (!best || a.createdAt > best.at) best = { name, at: a.createdAt };
      }
    }
    return best?.name ?? null;
  }, [drafts]);
}

/** All review requests (for reply-time history). */
export function useAllReviewRequests(): Record<string, ReviewRequest> {
  return useReviewStore((s) => s.requests);
}
