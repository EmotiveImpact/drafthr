import type {
  AIChatMessage,
  Comment,
  Draft,
  DraftTimelineEvent,
  DraftTimelineEventKind,
  ExportEvent,
  Section,
  SectionVersion,
} from "@/lib/letters/types";
import { formatDateOnly } from "@/lib/date-only";

export type TimelineCategory =
  | "changes"
  | "ai"
  | "comments"
  | "exports"
  | "reviews"
  | "people";

export type DraftTimelineItem = DraftTimelineEvent & {
  category: TimelineCategory;
  source: "stored" | "derived";
};

export function buildDraftTimeline(draft: Draft): DraftTimelineItem[] {
  const items: DraftTimelineItem[] = (draft.timeline ?? []).map((event) =>
    normalize(plainExportEvent(event), "stored")
  );

  if (!items.some((item) => item.kind === "created")) {
    items.push(
      normalize(
        {
          id: `created:${draft.id}`,
          kind: "created",
          createdAt: draft.createdAt,
          title: "Created draft",
          detail: `${draft.mode === "employer" ? "HR" : "Employee"} letter`,
        },
        "derived"
      )
    );
  }

  for (const section of draft.sections) {
    section.versions.forEach((version, index) => {
      if (hasMeta(items, "section_generated", "versionId", version.id)) return;
      items.push(versionEvent(section, version, index));
    });
  }

  for (const comment of draft.comments ?? []) {
    if (hasMeta(items, "comment_added", "commentId", comment.id)) continue;
    const section = draft.sections.find((candidate) => candidate.id === comment.sectionId);
    items.push(commentEvent(comment, section));
  }

  for (const exportEvent of draft.exports ?? []) {
    if (!hasMeta(items, "exported", "exportId", exportEvent.id)) {
      items.push(exportTimelineEvent(exportEvent));
    }
    if (
      exportEvent.reviewedBy &&
      !hasMeta(items, "counsel_review", "exportId", exportEvent.id) &&
      // One sign-off carried on several files (the PDF, the pack and the
      // send) is one counsel review, listed with the first (HOME-X50).
      !hasCounselReview(items, exportEvent.reviewedBy, exportEvent.reviewedOn)
    ) {
      // Listed beside its export's entry: a back-dated send's export is
      // timed at the date given, but its entry (and so this) at the time it
      // was recorded (SEND-X35).
      const entry = items.find((item) => item.kind === "exported" && item.meta?.exportId === exportEvent.id);
      items.push(
        normalize(
          {
            id: `review:${exportEvent.id}`,
            kind: "counsel_review",
            createdAt: entry?.createdAt ?? exportEvent.exportedAt,
            title: `Counsel review by ${exportEvent.reviewedBy}`,
            detail: reviewedOnDetail(draft, exportEvent.reviewedOn),
            meta: {
              exportId: exportEvent.id,
              reviewedBy: exportEvent.reviewedBy,
              reviewedOn: exportEvent.reviewedOn,
            },
          },
          "derived"
        )
      );
    }
  }

  const manualReview = (draft.answers as Record<string, unknown>)._counselReview as
    | { reviewedBy?: string; reviewedOn?: string }
    | undefined;
  if (
    manualReview?.reviewedBy &&
    manualReview.reviewedOn &&
    !hasCounselReview(items, manualReview.reviewedBy, manualReview.reviewedOn)
  ) {
    items.push(
      normalize(
        {
          id: `manual-review:${manualReview.reviewedBy}:${manualReview.reviewedOn}`,
          kind: "counsel_review",
          createdAt: Date.parse(`${manualReview.reviewedOn}T12:00:00`) || draft.updatedAt,
          title: `Counsel review by ${manualReview.reviewedBy}`,
          detail: reviewedOnDetail(draft, manualReview.reviewedOn),
          meta: {
            reviewedBy: manualReview.reviewedBy,
            reviewedOn: manualReview.reviewedOn,
          },
        },
        "derived"
      )
    );
  }

  for (const message of draft.aiChat ?? []) {
    if (hasMeta(items, "ai_message", "messageId", message.id)) continue;
    items.push(aiMessageEvent(message));
  }

  return items.sort((a, b) => b.createdAt - a.createdAt);
}

export function timelineCategoryFor(kind: DraftTimelineEventKind): TimelineCategory {
  if (kind.startsWith("comment_")) return "comments";
  if (kind.startsWith("collaborator_")) return "people";
  if (kind.startsWith("ai_") || kind === "section_generated") return "ai";
  if (kind === "exported") return "exports";
  if (kind === "counsel_review") return "reviews";
  return "changes";
}

function normalize(
  event: DraftTimelineEvent,
  source: DraftTimelineItem["source"]
): DraftTimelineItem {
  return {
    ...event,
    category: timelineCategoryFor(event.kind),
    source,
  };
}

function versionEvent(
  section: Section,
  version: SectionVersion,
  index: number
): DraftTimelineItem {
  return normalize(
    {
      id: `version:${version.id}`,
      kind: "section_generated",
      createdAt: version.createdAt,
      title: `${index > 0 ? "Regenerated" : "Generated"} ${section.title}`,
      sectionId: section.id,
      sectionTitle: section.title,
      meta: { versionId: version.id, versionNumber: index + 1 },
    },
    "derived"
  );
}

function commentEvent(comment: Comment, section?: Section): DraftTimelineItem {
  return normalize(
    {
      id: `comment:${comment.id}`,
      kind: "comment_added",
      createdAt: comment.createdAt,
      title: comment.parentId ? "Replied to comment" : "Added comment",
      detail: compact(comment.body),
      sectionId: comment.sectionId,
      sectionTitle: section?.title,
      actorName: comment.authorName,
      meta: {
        commentId: comment.id,
        parentId: comment.parentId,
        resolved: comment.resolved,
      },
    },
    "derived"
  );
}

function exportTimelineEvent(event: ExportEvent): DraftTimelineItem {
  return normalize(
    {
      id: `export:${event.id}`,
      kind: "exported",
      createdAt: event.exportedAt,
      title: exportTitleFor(event.format),
      detail: event.reviewedBy ? `Counsel review by ${event.reviewedBy}` : undefined,
      meta: {
        exportId: event.id,
        format: event.format,
        reviewedBy: event.reviewedBy,
        reviewedOn: event.reviewedOn,
      },
    },
    "derived"
  );
}

/** What a download or send is called on the timeline, in plain words. */
const EXPORT_TITLES: Record<string, string> = {
  pdf: "Downloaded as PDF",
  docx: "Downloaded as Word",
  txt: "Downloaded as plain text",
  pack: "Downloaded the evidence pack",
  audit: "Downloaded the audit record",
  "marked-sent": "Marked as sent",
};

export function exportTitleFor(format: string): string {
  const key = format.trim().toLowerCase();
  return EXPORT_TITLES[key] ?? `Downloaded as ${format.trim().toUpperCase()}`;
}

/**
 * The store records a download as "Exported as PDF" or "Exported as
 * MARKED-SENT" (format codes, SEND-X43); people read it in words. The
 * format stays on the event's meta for anything that needs the code.
 */
export function plainExportEvent(event: DraftTimelineEvent): DraftTimelineEvent {
  if (event.kind !== "exported") return event;
  const fromTitle = /^exported as (.+)$/i.exec(event.title.trim())?.[1];
  if (!fromTitle) return event;
  const format = typeof event.meta?.format === "string" ? event.meta.format : fromTitle.toLowerCase();
  // Its detail, "Counsel review attested by X", in the same plain words.
  const detail = event.detail?.replace(/^counsel review attested by /i, "Counsel review by ");
  return {
    ...event,
    title: exportTitleFor(format),
    detail,
    meta: { ...(event.meta ?? {}), format },
  };
}

function aiMessageEvent(message: AIChatMessage): DraftTimelineItem {
  return normalize(
    {
      id: `ai:${message.id}`,
      kind: "ai_message",
      createdAt: message.createdAt,
      title: message.role === "user" ? "Asked AI agent" : "AI agent responded",
      detail: compact(message.body),
      sectionId: message.sectionId,
      meta: {
        messageId: message.id,
        role: message.role,
        scope: message.scope,
      },
    },
    "derived"
  );
}

function hasMeta(
  items: DraftTimelineItem[],
  kind: DraftTimelineEventKind,
  key: string,
  value: string | number | boolean | null | undefined
): boolean {
  return items.some((item) => item.kind === kind && item.meta?.[key] === value);
}

/** The day a counsel review was done, in words ("Reviewed on 13 Oct 2026"), never a raw date. */
function reviewedOnDetail(draft: Draft, reviewedOn: string | undefined): string | undefined {
  if (!reviewedOn) return undefined;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(reviewedOn)) return reviewedOn;
  const locale = draft.context?.jurisdiction === "US" ? "en-US" : "en-GB";
  const day = formatDateOnly(reviewedOn, { day: "numeric", month: "short", year: "numeric" }, locale);
  return `Reviewed on ${day}`;
}

/** A counsel review by this person on this day is already listed. */
function hasCounselReview(
  items: DraftTimelineItem[],
  reviewedBy: string,
  reviewedOn: string | undefined
): boolean {
  return items.some(
    (item) =>
      item.kind === "counsel_review" &&
      item.meta?.reviewedBy === reviewedBy &&
      (item.meta?.reviewedOn ?? undefined) === (reviewedOn ?? undefined)
  );
}

function compact(text: string, max = 140): string {
  const singleLine = text.replace(/\s+/g, " ").trim();
  if (singleLine.length <= max) return singleLine;
  return `${singleLine.slice(0, max - 1).trim()}...`;
}
