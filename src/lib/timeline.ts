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
    normalize(event, "stored")
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
      !hasMeta(items, "counsel_review", "exportId", exportEvent.id)
    ) {
      items.push(
        normalize(
          {
            id: `review:${exportEvent.id}`,
            kind: "counsel_review",
            createdAt: exportEvent.exportedAt,
            title: `Counsel review attested by ${exportEvent.reviewedBy}`,
            detail: exportEvent.reviewedOn,
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
    !items.some(
      (item) =>
        item.kind === "counsel_review" &&
        item.meta?.reviewedBy === manualReview.reviewedBy &&
        item.meta?.reviewedOn === manualReview.reviewedOn
    )
  ) {
    items.push(
      normalize(
        {
          id: `manual-review:${manualReview.reviewedBy}:${manualReview.reviewedOn}`,
          kind: "counsel_review",
          createdAt: Date.parse(`${manualReview.reviewedOn}T12:00:00`) || draft.updatedAt,
          title: `Counsel review attested by ${manualReview.reviewedBy}`,
          detail: manualReview.reviewedOn,
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
      title: `Exported as ${event.format.toUpperCase()}`,
      detail: event.reviewedBy ? `Attested by ${event.reviewedBy}` : undefined,
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

function compact(text: string, max = 140): string {
  const singleLine = text.replace(/\s+/g, " ").trim();
  if (singleLine.length <= max) return singleLine;
  return `${singleLine.slice(0, max - 1).trim()}...`;
}
