import { useState, type ReactNode } from "react";
import {
  Bot,
  CheckCircle2,
  Clock3,
  Download,
  FileEdit,
  FilePlus2,
  MessageSquare,
  RotateCw,
  ShieldCheck,
  UserPlus,
} from "lucide-react";
import type { Draft } from "@/lib/letters/types";
import {
  buildDraftTimeline,
  type DraftTimelineItem,
  type TimelineCategory,
} from "@/lib/timeline";
import { cn } from "@/lib/utils";
import { readableTimeline } from "./timeline-view";

type FilterId = "all" | TimelineCategory;

const FILTERS: { id: FilterId; label: string }[] = [
  { id: "all", label: "All" },
  { id: "changes", label: "Changes" },
  { id: "ai", label: "DraftHR" },
  { id: "comments", label: "Comments" },
  { id: "exports", label: "Downloads" },
  { id: "reviews", label: "Reviews" },
];

export function TimelinePanel({ draft }: { draft: Draft }) {
  const events = readableTimeline(buildDraftTimeline(draft));
  const [filter, setFilter] = useTimelineFilter();
  const visible = filter === "all" ? events : events.filter((event) => event.category === filter);
  const groups = groupByDay(visible);

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="shrink-0 border-b border-[var(--ds-line-2)] px-4 py-3">
        <div className="flex items-center gap-2">
          <Clock3 className="size-4 text-[var(--ds-muted)]" />
          <h3 className="m-0 text-[13px] font-medium text-[var(--ds-ink)]">Timeline</h3>
          <span className="ml-auto rounded-full bg-[var(--ds-line-2)] px-2 py-0.5 text-[10px] tabular-nums text-[var(--ds-muted)]">
            {events.length}
          </span>
        </div>
        <div className="mt-2 flex items-center gap-2 text-[11px] text-[var(--ds-muted)]">
          <span>{count(events, "ai")} from DraftHR</span>
          <span aria-hidden className="text-[var(--ds-subtle)]">·</span>
          <span>{plural(count(events, "comments"), "comment")}</span>
          <span aria-hidden className="text-[var(--ds-subtle)]">·</span>
          <span>{plural(count(events, "exports"), "download")}</span>
        </div>
      </div>

      <div className="shrink-0 border-b border-[var(--ds-line-2)] px-3 py-2">
        <div className="flex items-center gap-1 overflow-x-auto">
          {FILTERS.map((option) => (
            <button
              key={option.id}
              type="button"
              onClick={() => setFilter(option.id)}
              className={cn(
                "shrink-0 rounded-full border px-2 py-0.5 text-[10px] transition",
                filter === option.id
                  ? "border-[var(--ds-ink)] bg-[var(--ds-ink)] text-white"
                  : "border-[var(--ds-line)] bg-[var(--ds-surface)] text-[var(--ds-muted)] hover:text-[var(--ds-ink)]"
              )}
            >
              {option.label}
            </button>
          ))}
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-auto px-3 py-3">
        {groups.length === 0 ? (
          <div className="py-10 text-center">
            <Clock3 className="mx-auto mb-2 size-5 text-[var(--ds-muted)]" />
            <p className="m-0 text-[12px] font-medium text-[var(--ds-ink)]">
              No timeline events.
            </p>
          </div>
        ) : (
          <div className="space-y-4">
            {groups.map((group) => (
              <section key={group.day} aria-label={group.day}>
                <div className="sticky top-0 z-10 bg-[var(--ds-surface)] pb-1 text-[10px] font-semibold uppercase tracking-[0.12em] text-[var(--ds-muted)]">
                  {group.day}
                </div>
                <div className="relative ml-2 border-l border-[var(--ds-line)]">
                  {group.events.map((event) => (
                    <TimelineRow key={event.id} event={event} />
                  ))}
                </div>
              </section>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function plural(n: number, word: string): string {
  return `${n} ${word}${n === 1 ? "" : "s"}`;
}

function useTimelineFilter(): [FilterId, (value: FilterId) => void] {
  const [filter, setFilter] = useState<FilterId>("all");
  return [filter, setFilter];
}

function TimelineRow({ event }: { event: DraftTimelineItem }) {
  const canJump = Boolean(event.sectionId);
  const content = (
    <>
      <span className="absolute -left-[8.5px] top-3 grid size-4 place-items-center rounded-full border border-[var(--ds-line)] bg-[var(--ds-surface)]">
        {iconFor(event)}
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex items-start gap-2">
          <div className="min-w-0 flex-1">
            <p className="m-0 truncate text-[12px] font-medium text-[var(--ds-ink)]">
              {event.title}
            </p>
            <div className="mt-0.5 flex flex-wrap items-center gap-1.5 text-[10px] text-[var(--ds-muted)]">
              <time className="tabular-nums">{formatTime(event.createdAt)}</time>
              {event.actorName && <span>{event.actorName}</span>}
              {event.sectionTitle && <span className="truncate">{event.sectionTitle}</span>}
            </div>
          </div>
          {canJump && (
            <span className="shrink-0 rounded-md border border-[var(--ds-line)] px-1.5 py-0.5 text-[10px] text-[var(--ds-muted)]">
              Jump
            </span>
          )}
        </div>
        {event.detail && (
          <p className="mt-1 line-clamp-2 text-[11px] leading-relaxed text-[var(--ds-muted)]">
            {event.detail}
          </p>
        )}
      </div>
    </>
  );

  if (!canJump) {
    return <div className="relative flex gap-3 py-2 pl-4 pr-1">{content}</div>;
  }

  return (
    <button
      type="button"
      onClick={() => scrollToSection(event.sectionId)}
      className="relative flex w-full gap-3 py-2 pl-4 pr-1 text-left transition hover:bg-[var(--ds-line-2)]"
    >
      {content}
    </button>
  );
}

function iconFor(event: DraftTimelineItem): ReactNode {
  const cls = "size-2.5";
  switch (event.kind) {
    case "created":
      return <FilePlus2 className={cls} />;
    case "section_generated":
      return <RotateCw className={cls} />;
    case "comment_added":
    case "comment_resolved":
    case "comment_deleted":
      return <MessageSquare className={cls} />;
    case "exported":
      return <Download className={cls} />;
    case "counsel_review":
      return <ShieldCheck className={cls} />;
    case "collaborator_invited":
    case "collaborator_removed":
    case "collaborator_role_updated":
      return <UserPlus className={cls} />;
    case "ai_message":
    case "ai_applied":
    case "ai_cleared":
      return <Bot className={cls} />;
    case "without_prejudice_updated":
    case "evidence_updated":
    case "details_updated":
    case "sections_updated":
      return <FileEdit className={cls} />;
    default:
      return <CheckCircle2 className={cls} />;
  }
}

function scrollToSection(sectionId: string | undefined) {
  if (!sectionId) return;
  const el = document.querySelector(`[data-section-id="${sectionId}"]`);
  el?.scrollIntoView({ behavior: "smooth", block: "start" });
}

function count(events: DraftTimelineItem[], category: TimelineCategory): number {
  return events.filter((event) => event.category === category).length;
}

function groupByDay(events: DraftTimelineItem[]): { day: string; events: DraftTimelineItem[] }[] {
  const groups: { day: string; events: DraftTimelineItem[] }[] = [];
  for (const event of events) {
    const day = formatDay(event.createdAt);
    const existing = groups.find((group) => group.day === day);
    if (existing) existing.events.push(event);
    else groups.push({ day, events: [event] });
  }
  return groups;
}

function formatDay(ts: number): string {
  const d = new Date(ts);
  const now = new Date();
  const diffDays = Math.floor((startOfDay(now).getTime() - startOfDay(d).getTime()) / 86400000);
  if (diffDays === 0) return "Today";
  if (diffDays === 1) return "Yesterday";
  if (diffDays < 7) return d.toLocaleDateString(undefined, { weekday: "long" });
  return d.toLocaleDateString(undefined, { day: "numeric", month: "long", year: "numeric" });
}

function formatTime(ts: number): string {
  return new Date(ts).toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" });
}

function startOfDay(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}
