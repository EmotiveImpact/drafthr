/**
 * The letters a booking can carry: the facts the booking sheet and the
 * "Booking a review for" strip show (title, journey status, health, evidence)
 * and the list the letter picker offers. Reads the real drafts and review
 * requests; no invented values.
 */
import { useMemo } from "react";
import type { Draft } from "@/lib/letters/types";
import { useDraftStore } from "@/lib/store";
import { displayTitleFor } from "@/lib/letters/display";
import { computeHealthScore, runHealthChecks } from "@/lib/finalize/healthChecks";
import { getJourney } from "@/lib/journey/stage";
import { activeReviewIn, latestReviewIn, useReviewStore, type ReviewRequest } from "@/lib/journey/reviews";
import { shareableEvidence } from "@/components/journey/review/model";

export type LetterFacts = {
  id: string;
  title: string;
  /** Journey status ("Ready for review", "Draft", "With Claire Booth"). */
  status: string;
  health: number;
  evidence: number;
  sent: boolean;
  updatedAt: number;
  employee: string;
  /** The open review on it, if any (would be replaced by a new booking). */
  activeReview: ReviewRequest | null;
};

export function letterFacts(draft: Draft, requests: Record<string, ReviewRequest>): LetterFacts {
  const checks = runHealthChecks(draft);
  const j = getJourney(draft, latestReviewIn(requests, draft.id), { checks });
  return {
    id: draft.id,
    title: displayTitleFor(draft),
    status: j.statusLabel,
    health: computeHealthScore(checks).score,
    // The files a booking shares (hearing notes stay with you unless you
    // share them), so the sheet and the review dialog give the same count.
    evidence: shareableEvidence(draft.evidence).files.length,
    sent: j.stage === "sent",
    updatedAt: draft.updatedAt,
    employee: draft.employee?.legalName?.trim() ?? "",
    activeReview: activeReviewIn(requests, draft.id),
  };
}

/** The workspace's HR letters a booking can carry, newest first. Sent letters
 *  and templates are left out. */
export function useBookableLetters(): LetterFacts[] {
  const drafts = useDraftStore((s) => s.drafts);
  const requests = useReviewStore((s) => s.requests);
  return useMemo(
    () =>
      Object.values(drafts)
        .filter((d) => !d.isTemplateSource && d.mode === "employer")
        .map((d) => letterFacts(d, requests))
        .filter((l) => !l.sent)
        .sort((a, b) => b.updatedAt - a.updatedAt),
    [drafts, requests],
  );
}

/** Facts for one letter, or null when the id is unknown or deleted. */
export function useLetterFacts(draftId: string | null | undefined): LetterFacts | null {
  const draft = useDraftStore((s) => (draftId ? s.drafts[draftId] : undefined));
  const requests = useReviewStore((s) => s.requests);
  return useMemo(() => (draft ? letterFacts(draft, requests) : null), [draft, requests]);
}

/** "Ready for review · Health 94 · 4 evidence files" */
export function letterMeta(l: LetterFacts): string {
  const ev = l.evidence === 0 ? "No evidence files" : `${l.evidence} evidence file${l.evidence === 1 ? "" : "s"}`;
  return `${l.status} · Health ${l.health} · ${ev}`;
}
