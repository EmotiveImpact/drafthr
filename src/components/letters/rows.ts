/**
 * Row data for every letters list (the Letters page, the matter page, the
 * employee page and Home): one place that turns a draft into what a row shows,
 * with its journey (src/lib/journey/stage.ts) worked out for the person
 * looking. Read-only: nothing here changes a draft.
 */
import { useMemo } from "react";
import type { Draft, ExportEvent, Matter } from "@/lib/letters/types";
import { runHealthChecks } from "@/lib/finalize/healthChecks";
import { getJourney, type JourneyInfo } from "@/lib/journey/stage";
import { firstName, latestReviewIn, useReviewStore, type ReviewKind } from "@/lib/journey/reviews";
import { useDraftStore } from "@/lib/store";
import { useProfileStore } from "@/lib/profile";
import { canApprove } from "@/lib/permissions";
import { letterHealth, letterLabel, shortTypeLabel, tintForLetterType, type Tint } from "./letterView";
import { useLetterArchive } from "./archive";

export const FORMAT_LABEL: Record<ExportEvent["format"], string> = {
  pdf: "PDF",
  docx: "Word",
  txt: "Plain text",
  pack: "Evidence pack",
  "marked-sent": "Marked as sent",
};

export type Person = { name: string; email?: string; seed: string };

export type LetterRowData = {
  id: string;
  draft: Draft;
  journey: JourneyInfo;
  label: string;
  /** Short type word ("Conduct", "Hiring"). */
  typeLabel: string;
  tint: Tint;
  /** Recipient (HR letters) or the employer ("to Harbour Foods Ltd"). */
  recipient: string | null;
  recipientRole?: string;
  matter?: Matter;
  owner: Person;
  health: number | null;
  /** "Conduct · 2 checks to fix". */
  subLine: string;
  /** Formats it was downloaded in (PDF, Word...), without "marked as sent". */
  formats: string[];
  /** Counsel reviewer recorded on an export. */
  reviewedBy?: string;
  sentAt?: number;
  archived: boolean;
  updatedAt: number;
};

/** The person using the app, as a list owner. */
export function useMe(): Person {
  const personal = useProfileStore((s) => s.profile.personal);
  return useMemo(() => {
    const name = personal.preferredName?.trim() || personal.legalName?.trim() || "You";
    const email = personal.email?.trim().toLowerCase() || undefined;
    return { name, email, seed: email ?? name };
  }, [personal]);
}

const sameName = (a?: string, b?: string) =>
  !!a && !!b && a.trim().toLowerCase() === b.trim().toLowerCase();

/** Is the viewer the approver this letter was sent to? */
export function viewerIsNamedApprover(d: Draft, me: Person, legalName?: string): boolean {
  const entries = (d.approvals ?? []).filter((a) => a.decision === "submitted");
  const name = entries[entries.length - 1]?.reviewerName?.trim();
  if (!name || /^workspace reviewer$/i.test(name)) return true;
  return sameName(name, me.name) || sameName(name, legalName) || sameName(name, me.email);
}

/** The letter's owner: the collaborator marked owner, else whoever created it (you). */
export function letterOwner(d: Draft, me: Person): Person {
  const owner = (d.collaborators ?? []).find((c) => c.role === "owner");
  if (owner) {
    const name = owner.name?.trim() || owner.email;
    return { name, email: owner.email, seed: owner.email || name };
  }
  return me;
}

function latestReviewer(d: Draft): string | undefined {
  return [...(d.exports ?? [])].sort((a, b) => b.exportedAt - a.exportedAt).find((e) => e.reviewedBy)?.reviewedBy;
}

function joinList(parts: string[]): string {
  return parts.join(", ");
}

const KIND_SHORT: Record<ReviewKind, string> = {
  team: "team review",
  trusted: "trusted review",
  expert: "expert review",
};

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

/** The short detail after the type in a row's sub line. */
function detailFor(d: Draft, j: JourneyInfo, formats: string[], reviewedBy?: string): string | undefined {
  const c = j.counts;
  switch (j.stage) {
    case "sent": {
      const how = formats.length ? joinList(formats) : "marked as sent";
      return `${how} · ${reviewedBy ? `reviewed by ${reviewedBy}` : "not reviewed"}`;
    }
    case "send": {
      const approved = [...(d.approvals ?? [])].reverse().find((a) => a.decision === "approved");
      const by = approved?.reviewerName && !/^workspace reviewer$/i.test(approved.reviewerName) ? approved.reviewerName : undefined;
      const parts = [by ? `approved by ${by}` : "approved"];
      if (formats.length) parts.push(joinList(formats));
      return parts.join(" · ");
    }
    case "approve":
      if (j.review && j.review.status === "finished") return `reviewed by ${j.review.reviewer.name}`;
      return formats.length ? joinList(formats) : undefined;
    case "review": {
      const r = j.review;
      if (r && r.status === "back") {
        const who = firstName(r.reviewer.name) || "The reviewer";
        return c.pendingSuggestions > 0 ? `${who}'s changes to decide` : `${who} sent it back`;
      }
      if (r && r.status === "out") return KIND_SHORT[r.kind] ?? "out for review";
      return formats.length ? joinList(formats) : undefined;
    }
    default: {
      if (c.streaming) return "drafting";
      if (d.reviewStatus === "changes_requested") return "changes requested";
      if (c.failingRequired > 0) return `${plural(c.failingRequired, "check")} to fix`;
      if (c.pendingSuggestions > 0) return `${plural(c.pendingSuggestions, "edit")} to decide`;
      if (c.sectionsDrafted === 0) return "not started";
      if (c.requiredSectionsEmpty > 0) return `${plural(c.requiredSectionsEmpty, "section")} to write`;
      return formats.length ? joinList(formats) : undefined;
    }
  }
}

export function buildLetterRow(
  d: Draft,
  ctx: {
    review: ReturnType<typeof latestReviewIn>;
    me: Person;
    legalName?: string;
    viewerCanApprove: boolean;
    matters: Record<string, Matter>;
    archived: boolean;
  }
): LetterRowData {
  const checks = (() => {
    try {
      return runHealthChecks(d);
    } catch {
      return [];
    }
  })();
  const journey = getJourney(d, ctx.review, {
    checks,
    viewerIsApprover: ctx.viewerCanApprove && viewerIsNamedApprover(d, ctx.me, ctx.legalName),
  });
  const exports = d.exports ?? [];
  const formats = Array.from(new Set(exports.filter((e) => e.format !== "marked-sent").map((e) => FORMAT_LABEL[e.format])));
  const reviewedBy = latestReviewer(d);
  const typeLabel = shortTypeLabel(d.letterType);
  const detail = detailFor(d, journey, formats, reviewedBy);
  const recipient =
    d.mode === "employer"
      ? d.employee.legalName?.trim() || null
      : d.employer.legalName?.trim()
        ? `to ${d.employer.legalName.trim()}`
        : null;
  return {
    id: d.id,
    draft: d,
    journey,
    label: letterLabel(d),
    typeLabel,
    tint: tintForLetterType(d.letterType),
    recipient,
    recipientRole: d.mode === "employer" ? d.employee.jobTitle?.trim() || undefined : undefined,
    matter: d.matterId ? ctx.matters[d.matterId] : undefined,
    owner: letterOwner(d, ctx.me),
    health: letterHealth(d, checks),
    subLine: detail ? `${typeLabel} · ${detail}` : typeLabel,
    formats,
    reviewedBy,
    sentAt: journey.sentAt,
    archived: ctx.archived,
    updatedAt: d.updatedAt,
  };
}

/**
 * Rows for the given drafts (default: every letter in the current mode,
 * template drafts left out), newest first. Archived letters are included and
 * flagged; callers decide whether to show them.
 */
export function useLetterRows(drafts?: Draft[]): LetterRowData[] {
  const all = useDraftStore((s) => s.drafts);
  const matters = useDraftStore((s) => s.matters);
  const requests = useReviewStore((s) => s.requests);
  const role = useProfileStore((s) => s.profile.role);
  const workspaceRole = useProfileStore((s) => s.profile.workspaceRole);
  const legalName = useProfileStore((s) => s.profile.personal.legalName);
  const archived = useLetterArchive((s) => s.archived);
  const me = useMe();
  const viewerCanApprove = canApprove(workspaceRole);

  const source = useMemo(
    () =>
      drafts ??
      Object.values(all)
        .filter((d) => !d.isTemplateSource)
        .filter((d) => (role ? d.mode === role : true)),
    [drafts, all, role]
  );

  return useMemo(
    () =>
      source
        .map((d) =>
          buildLetterRow(d, {
            review: latestReviewIn(requests, d.id),
            me,
            legalName,
            viewerCanApprove,
            matters,
            archived: !!archived[d.id],
          })
        )
        .sort((a, b) => b.updatedAt - a.updatedAt),
    [source, requests, me, legalName, viewerCanApprove, matters, archived]
  );
}
