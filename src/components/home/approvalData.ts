/**
 * The Needs approval tab's data (mock approvals), worked out from the
 * letters: who asked, who it is waiting for, their note, the letter's
 * health and what to fix first, and what this person approved lately.
 * Pure functions; tested in approvalData.test.ts.
 */
import type { ApprovalEntry, Draft, LetterTypeId, Matter, Mode } from "@/lib/letters/types";
import {
  computeHealthScore,
  runHealthChecks,
  type HealthActionRoute,
  type HealthCheck,
  type HealthDimension,
} from "@/lib/finalize/healthChecks";
import { letterName, personFor } from "./homeData";

export type ApprovalFix = {
  id: string;
  label: string;
  level: "required" | "advised";
  href: string;
};

export type ApprovalRow = {
  draft: Draft;
  id: string;
  title: string;
  person: string;
  mode: Mode;
  letterType: LetterTypeId;
  matterName?: string;
  /** Who sent it for sign-off (the letter's owner, else you). */
  requester: string;
  /** Who it is waiting for, from the submission. */
  approver: string;
  /** The requester's note on the submission. */
  note?: string;
  askedAt: number;
  /** Health; null when the checks cannot run on this letter. */
  score: number | null;
  dims: Array<{ dimension: HealthDimension; score: number }>;
  failing: number;
  totalChecks: number;
  fixes: ApprovalFix[];
  /** Approvals already given in this round (multi-approver letters). */
  approvedBy: string[];
};

export function fixHref(draftId: string, route: HealthActionRoute | undefined): string {
  if (route === "evidence") return `/editor/${draftId}/evidence`;
  if (route === "settings") return "/settings";
  return `/editor/${draftId}`;
}

function lastSubmission(d: Draft): { entry?: ApprovalEntry; index: number } {
  const list = d.approvals ?? [];
  for (let i = list.length - 1; i >= 0; i -= 1) {
    if (list[i].decision === "submitted") return { entry: list[i], index: i };
  }
  return { index: -1 };
}

export function approvalRow(d: Draft, matters: Record<string, Matter>, me: string): ApprovalRow {
  const { entry, index } = lastSubmission(d);
  const owner = d.collaborators?.find((c) => c.role === "owner");
  let checks: HealthCheck[] | null = null;
  try {
    checks = runHealthChecks(d);
  } catch {
    checks = null;
  }
  const health = checks ? computeHealthScore(checks) : null;
  const fixes: ApprovalFix[] = (checks ?? [])
    .filter((c) => c.severity !== "pass")
    .sort((a, b) => (a.severity === b.severity ? 0 : a.severity === "fail" ? -1 : 1))
    .map((c) => ({
      id: c.id,
      label: c.label,
      level: c.severity === "fail" ? "required" : "advised",
      href: fixHref(d.id, c.actionRoute),
    }));
  const later = index >= 0 ? (d.approvals ?? []).slice(index + 1) : [];
  return {
    draft: d,
    id: d.id,
    title: letterName(d),
    person: personFor(d),
    mode: d.mode,
    letterType: d.letterType,
    matterName: d.matterId ? matters[d.matterId]?.name : undefined,
    requester: owner?.name?.trim() || me || "You",
    approver: entry?.reviewerName?.trim() || "Workspace reviewer",
    note: entry?.body?.trim() || undefined,
    askedAt: d.submittedForReviewAt ?? entry?.createdAt ?? d.updatedAt,
    score: health ? health.score : null,
    dims: health ? health.dimensions.map((x) => ({ dimension: x.dimension, score: x.score })) : [],
    failing: health ? health.failCount : 0,
    totalChecks: health ? health.totalCount : 0,
    fixes,
    approvedBy: later.filter((a) => a.decision === "approved").map((a) => a.reviewerName),
  };
}

/** Letters in review across both modes. */
export function waitingLetters(drafts: Record<string, Draft>): Draft[] {
  return Object.values(drafts).filter((d) => d.reviewStatus === "in_review" && !d.isTemplateSource);
}

/** True when this letter is waiting on the signed-in person. */
export function isForMe(row: Pick<ApprovalRow, "approver">, me: string): boolean {
  const a = row.approver.trim().toLowerCase();
  return a === "workspace reviewer" || (!!me && a === me.trim().toLowerCase());
}

/** "2 days ago", "Yesterday", "5h ago", "20m ago", "Just now". */
export function askedAgo(ts: number, now = Date.now()): string {
  const m = Math.floor((now - ts) / 60000);
  if (m < 1) return "Just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  if (d === 1) return "Yesterday";
  return `${d} days ago`;
}

export type RecentApproval = { id: string; draftId: string; title: string; person: string; at: number };

/** Letters this person approved, newest first. */
export function recentlyApprovedBy(drafts: Record<string, Draft>, me: string, limit = 5): RecentApproval[] {
  const name = me.trim().toLowerCase();
  if (!name) return [];
  const out: RecentApproval[] = [];
  for (const d of Object.values(drafts)) {
    if (d.isTemplateSource) continue;
    for (const a of d.approvals ?? []) {
      if (a.decision !== "approved" || a.reviewerName.trim().toLowerCase() !== name) continue;
      out.push({ id: a.id, draftId: d.id, title: letterName(d), person: personFor(d), at: a.createdAt });
    }
  }
  return out.sort((a, b) => b.at - a.at).slice(0, limit);
}

/** The band's line on the Needs approval tab. */
export function approvalsLedeParts(waiting: Draft[], approver: boolean, now = Date.now()) {
  if (waiting.length === 0) return null;
  const oldest = Math.min(...waiting.map((d) => d.submittedForReviewAt ?? d.updatedAt));
  return {
    count: waiting.length,
    whose: approver ? "your sign-off" : "sign-off",
    age: ageForLede(now - oldest),
  };
}

/** "2 days", "5 hours", "20 minutes", "a minute". */
function ageForLede(ms: number): string {
  const m = Math.max(1, Math.floor(ms / 60000));
  if (m < 60) return m === 1 ? "a minute" : `${m} minutes`;
  const h = Math.floor(m / 60);
  if (h < 24) return h === 1 ? "an hour" : `${h} hours`;
  const d = Math.floor(h / 24);
  return d === 1 ? "a day" : `${d} days`;
}
