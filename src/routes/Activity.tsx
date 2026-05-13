import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Badge, Box, Flex, Text } from "@radix-ui/themes";
import {
  Bot,
  Calendar as CalendarIcon,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ChevronUp,
  FilePlus2,
  FileEdit,
  FileText,
  RotateCw,
  ShieldCheck,
  FileDown,
  Activity as ActivityIcon,
  MessageSquare,
  UserPlus,
  Users,
  Search,
  X,
} from "lucide-react";
import { PageHeader, EmptyState } from "@/components/ds";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { useDraftStore } from "@/lib/store";
import { useProfileStore } from "@/lib/profile";
import { getLetterMeta } from "@/lib/letters/catalog";
import type { Draft, Mode } from "@/lib/letters/types";
import {
  buildDraftTimeline,
  timelineCategoryFor,
  type DraftTimelineItem,
  type TimelineCategory,
} from "@/lib/timeline";
import { cn } from "@/lib/utils";

type Event = DraftTimelineItem & {
  draftId: string;
  draftLabel: string;
  mode: Mode;
  category: TimelineCategory;
};

type DraftGroup = {
  draftId: string;
  draftLabel: string;
  mode: Mode;
  events: Event[];
  firstEvent: Event;
  lastEvent: Event;
  counts: Record<TimelineCategory, number>;
};

/* ----------------------------------------------------------------------------
 * Activity v2 — day-pinned, draft-grouped, category-filtered audit trail.
 *
 * v1 problems we're fixing:
 *   - Every section generation was its own row, so creating a draft with
 *     8 sections produced 8 near-identical lines and drowned the page.
 *   - No way to see "what happened on draft X" without scanning the day.
 *   - The native date input was full-width and ugly.
 *
 * v2 model:
 *   - Group events by draft within each day. Each draft becomes ONE card
 *     with a category-summary (e.g. "Created · 7 AI sections · 2 comments
 *     · Exported"). Card expands to show the full event timeline.
 *   - Filter chips (All / Drafts / AI / Comments / Reviews / Exports /
 *     People) hide categories the user doesn't care about right now.
 *   - Compact date pill button opens a Popover with a custom month
 *     grid — narrow, styled to match the app, no native input ugliness.
 * --------------------------------------------------------------------------*/

const CATEGORY_FILTERS: { id: TimelineCategory | "all"; label: string }[] = [
  { id: "all", label: "All" },
  { id: "changes", label: "Drafts" },
  { id: "ai", label: "AI" },
  { id: "comments", label: "Comments" },
  { id: "reviews", label: "Reviews" },
  { id: "exports", label: "Exports" },
  { id: "people", label: "People" },
];

export function Activity() {
  const nav = useNavigate();
  const drafts = useDraftStore((s) => s.drafts);
  const role = useProfileStore((s) => s.profile.role);

  /* Flatten every draft's timeline into a single chronological list. */
  const events = useMemo<Event[]>(() => {
    const out: Event[] = [];
    const list = Object.values(drafts).filter((d) => (role ? d.mode === role : true));
    for (const d of list) {
      const label = safeMeta(d.letterType)?.shortTitle ?? d.letterType.replace(/_/g, " ");
      for (const event of buildDraftTimeline(d)) {
        out.push({
          ...event,
          draftId: d.id,
          draftLabel: label,
          mode: d.mode,
          category: timelineCategoryFor(event.kind),
        });
      }
    }
    out.sort((a, b) => b.createdAt - a.createdAt);
    return out;
  }, [drafts, role]);

  const eventsByDay = useMemo(() => {
    const map = new Map<string, Event[]>();
    for (const e of events) {
      const key = isoDay(e.createdAt);
      const arr = map.get(key);
      if (arr) arr.push(e);
      else map.set(key, [e]);
    }
    return map;
  }, [events]);

  const today = isoDay(Date.now());
  const mostRecentDay = events.length > 0 ? isoDay(events[0].createdAt) : today;
  const [selectedDay, setSelectedDay] = useState(mostRecentDay);
  const [filter, setFilter] = useState<TimelineCategory | "all">("all");
  const [searchTerm, setSearchTerm] = useState("");
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [pickerOpen, setPickerOpen] = useState(false);

  useEffect(() => {
    setSelectedDay(mostRecentDay);
  }, [mostRecentDay]);

  /* Day-filtered + category-filtered events. */
  const dayEvents = useMemo(() => {
    const list = eventsByDay.get(selectedDay) ?? [];
    if (filter === "all") return list;
    return list.filter((e) => e.category === filter);
  }, [eventsByDay, selectedDay, filter]);

  /* Group the selected day's events by draft. */
  const draftGroups = useMemo<DraftGroup[]>(() => {
    const groups = new Map<string, DraftGroup>();
    for (const e of dayEvents) {
      const g = groups.get(e.draftId);
      if (g) {
        g.events.push(e);
        g.counts[e.category] = (g.counts[e.category] ?? 0) + 1;
        if (e.createdAt < g.firstEvent.createdAt) g.firstEvent = e;
        if (e.createdAt > g.lastEvent.createdAt) g.lastEvent = e;
      } else {
        groups.set(e.draftId, {
          draftId: e.draftId,
          draftLabel: e.draftLabel,
          mode: e.mode,
          events: [e],
          firstEvent: e,
          lastEvent: e,
          counts: {
            changes: 0,
            ai: 0,
            comments: 0,
            reviews: 0,
            exports: 0,
            people: 0,
            [e.category]: 1,
          } as Record<TimelineCategory, number>,
        });
      }
    }
    /* Sort drafts by most-recent activity in the day, then filter by search. */
    let sorted = [...groups.values()].sort((a, b) => b.lastEvent.createdAt - a.lastEvent.createdAt);
    if (searchTerm) {
      const q = searchTerm.toLowerCase();
      sorted = sorted.filter((g) => g.draftLabel.toLowerCase().includes(q));
    }
    return sorted;
  }, [dayEvents, searchTerm]);

  /* Active days (newest first) for the strip and prev/next navigation. */
  const recentDays = useMemo(
    () => [...eventsByDay.keys()].sort((a, b) => (a < b ? 1 : -1)),
    [eventsByDay],
  );
  const idxInRecent = recentDays.indexOf(selectedDay);
  const canPrev = idxInRecent >= 0 ? idxInRecent < recentDays.length - 1 : recentDays.length > 0;
  const canNext = idxInRecent > 0;
  const goPrev = () => {
    if (idxInRecent === -1 && recentDays.length > 0) {
      setSelectedDay(recentDays[0]);
      return;
    }
    if (canPrev) setSelectedDay(recentDays[idxInRecent + 1]);
  };
  const goNext = () => {
    if (canNext) setSelectedDay(recentDays[idxInRecent - 1]);
  };

  const toggleExpanded = (draftId: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(draftId)) next.delete(draftId);
      else next.add(draftId);
      return next;
    });
  };

  /* Smooth scroll to activity section when day changes */
  useEffect(() => {
    const el = document.querySelector('[data-activity-section]');
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  }, [selectedDay]);

  return (
    <Box className="max-w-5xl px-4 py-6 sm:px-6 sm:py-8" data-activity-section>
      <PageHeader
        crumbs={[{ label: "Activity" }]}
        title="Audit trail"
        lede="Every draft, regeneration, comment, review, and export — grouped by letter, pinned to one day. Use the picker, prev/next, or chips to scrub."
      />

      {events.length === 0 ? (
        <EmptyState
          icon={ActivityIcon}
          title="No activity yet"
          body="Start drafting a letter and the audit trail builds itself — every regenerate, export, and attestation is logged here."
          primary={{ label: "Start a letter", to: "/" }}
        />
      ) : (
        <>
          {/* Search box */}
          <div className="relative mb-4">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-[var(--ds-muted)] pointer-events-none" />
            <input
              type="text"
              placeholder="Search drafts, people, events…"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-9 pr-3 h-9 rounded-md border border-[var(--ds-line)] bg-[var(--ds-surface)] text-[13px] placeholder:text-[var(--ds-muted)] focus:outline-none focus:ring-1 focus:ring-[var(--ds-ink)] focus:border-transparent transition"
            />
            {searchTerm && (
              <button
                type="button"
                onClick={() => setSearchTerm("")}
                className="absolute right-2 top-1/2 -translate-y-1/2 inline-flex items-center justify-center size-6 rounded text-[var(--ds-muted)] hover:text-[var(--ds-ink)] hover:bg-[var(--ds-line-2)]/60 transition"
                aria-label="Clear search"
              >
                <X className="size-4" />
              </button>
            )}
          </div>

          {/* Filter chips */}
          <div className="flex items-center gap-1 mb-3 overflow-x-auto pb-0.5 -mx-1 px-1">
            {CATEGORY_FILTERS.map((f) => {
              const active = filter === f.id;
              return (
                <button
                  key={f.id}
                  type="button"
                  onClick={() => setFilter(f.id)}
                  className={cn(
                    "shrink-0 inline-flex items-center h-7 px-3 rounded-full text-[12px] font-medium transition border",
                    active
                      ? "bg-[var(--ds-ink)] text-white border-[var(--ds-ink)]"
                      : "bg-[var(--ds-surface)] text-[var(--ds-muted)] border-[var(--ds-line)] hover:text-[var(--ds-ink)] hover:bg-[var(--ds-line-2)]/60",
                  )}
                >
                  {f.label}
                </button>
              );
            })}
          </div>

          {/* Day picker row: prev / compact date pill / next / Today */}
          <div className="flex items-center gap-2 mb-3">
            <button
              type="button"
              onClick={goPrev}
              disabled={!canPrev}
              className="inline-flex items-center justify-center size-8 rounded-md border border-[var(--ds-line)] bg-[var(--ds-surface)] text-[var(--ds-ink)] disabled:opacity-40 disabled:cursor-not-allowed hover:bg-[var(--ds-line-2)]/60 transition"
              aria-label="Previous active day"
              title="Previous active day"
            >
              <ChevronLeft className="size-4" />
            </button>

            <Popover open={pickerOpen} onOpenChange={setPickerOpen}>
              <PopoverTrigger asChild>
                <button
                  type="button"
                  className="inline-flex items-center gap-2 h-8 px-3 rounded-md border border-[var(--ds-line)] bg-[var(--ds-surface)] text-[13px] font-medium tabular-nums hover:bg-[var(--ds-line-2)]/60 transition"
                >
                  <CalendarIcon className="size-3.5 text-[var(--ds-muted)]" />
                  <span>{prettyDay(selectedDay)}</span>
                  <ChevronDown className="size-3.5 text-[var(--ds-muted)]" />
                </button>
              </PopoverTrigger>
              <PopoverContent align="start" className="p-0 w-auto">
                <MonthGrid
                  selectedDay={selectedDay}
                  todayIso={today}
                  activeDays={eventsByDay}
                  onPick={(iso) => {
                    setSelectedDay(iso);
                    setPickerOpen(false);
                  }}
                />
              </PopoverContent>
            </Popover>

            <button
              type="button"
              onClick={goNext}
              disabled={!canNext}
              className="inline-flex items-center justify-center size-8 rounded-md border border-[var(--ds-line)] bg-[var(--ds-surface)] text-[var(--ds-ink)] disabled:opacity-40 disabled:cursor-not-allowed hover:bg-[var(--ds-line-2)]/60 transition"
              aria-label="Next active day"
              title="Next active day"
            >
              <ChevronRight className="size-4" />
            </button>

            <button
              type="button"
              onClick={() => setSelectedDay(today)}
              className="hidden sm:inline-flex items-center h-8 px-3 rounded-md border border-[var(--ds-line)] bg-[var(--ds-surface)] text-[12px] font-medium hover:bg-[var(--ds-line-2)]/60 transition"
            >
              Today
            </button>

            <span className="ml-auto text-[11px] tabular-nums text-[var(--ds-muted)]">
              {draftGroups.length} {draftGroups.length === 1 ? "letter" : "letters"}
              {" · "}
              {dayEvents.length} {dayEvents.length === 1 ? "event" : "events"}
            </span>
          </div>

          {/* Strip of recent active days */}
          {recentDays.length > 1 && (
            <div className="flex items-center gap-1.5 mb-5 overflow-x-auto pb-1 -mx-1 px-1">
              {recentDays.slice(0, 10).map((day) => {
                const active = day === selectedDay;
                const count = eventsByDay.get(day)?.length ?? 0;
                return (
                  <button
                    key={day}
                    type="button"
                    onClick={() => setSelectedDay(day)}
                    className={cn(
                      "shrink-0 inline-flex flex-col items-start gap-0.5 rounded-md border px-2.5 py-1.5 transition",
                      active
                        ? "border-[var(--ds-ink)] bg-[var(--ds-line-2)]"
                        : "border-[var(--ds-line)] hover:bg-[var(--ds-line-2)]/40",
                    )}
                  >
                    <span className="text-[10px] uppercase tracking-[0.06em] text-[var(--ds-muted)] font-medium">
                      {relDayLabel(day, today)}
                    </span>
                    <span className="text-[12px] tabular-nums font-medium">
                      {compactDay(day)} · {count}
                    </span>
                  </button>
                );
              })}
            </div>
          )}

          {/* Draft groups for the selected day */}
          {draftGroups.length === 0 ? (
            <div className="rounded-md border border-[var(--ds-line)] bg-[var(--ds-surface)] py-10 text-center">
              <ActivityIcon className="size-6 mx-auto text-[var(--ds-muted)] mb-2" />
              <Text size="2" color="gray">
                {filter === "all"
                  ? `Nothing logged on ${prettyDay(selectedDay)}.`
                  : `No ${labelFor(filter)} on ${prettyDay(selectedDay)}.`}
              </Text>
            </div>
          ) : (
            <div className="space-y-2">
              {draftGroups.map((g) => (
                <DraftGroupCard
                  key={g.draftId}
                  group={g}
                  expanded={expanded.has(g.draftId)}
                  onToggle={() => toggleExpanded(g.draftId)}
                  onOpen={() => nav(`/editor/${g.draftId}`)}
                />
              ))}
            </div>
          )}
        </>
      )}
    </Box>
  );
}

/* ============================================================================
 * Draft group card — collapsible summary of one draft's events on a day.
 * ==========================================================================*/
function DraftGroupCard({
  group,
  expanded,
  onToggle,
  onOpen,
}: {
  group: DraftGroup;
  expanded: boolean;
  onToggle: () => void;
  onOpen: () => void;
}) {
  const summaryParts = buildSummaryParts(group.counts);
  return (
    <div className="rounded-md border border-[var(--ds-line)] bg-[var(--ds-surface)] overflow-hidden">
      {/* Card header — click to expand, separate button to open editor */}
      <div className="flex items-start gap-3 p-3">
        <div className="mt-0.5 grid place-items-center size-8 rounded-md bg-[var(--ds-line-2)] text-[var(--ds-ink)] shrink-0">
          <FileText className="size-4" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onOpen}
              className="text-[14px] font-medium text-[var(--ds-ink)] truncate hover:underline text-left"
            >
              {group.draftLabel}
            </button>
            <Badge color="gray" variant="soft">
              {group.mode === "employer" ? "HR" : "employee"}
            </Badge>
          </div>
          {summaryParts.length > 0 && (
            <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-[12px] text-[var(--ds-muted)]">
              {summaryParts.map((p) => (
                <span key={p.key} className="inline-flex items-center gap-1">
                  {p.icon}
                  <span className="tabular-nums">{p.text}</span>
                </span>
              ))}
              <span className="text-[var(--ds-subtle)]">·</span>
              <span className="tabular-nums">{formatTime(group.lastEvent.createdAt)}</span>
            </div>
          )}
        </div>
        <button
          type="button"
          onClick={onToggle}
          className="shrink-0 inline-flex items-center justify-center size-7 rounded-md text-[var(--ds-muted)] hover:text-[var(--ds-ink)] hover:bg-[var(--ds-line-2)]/60 transition"
          aria-label={expanded ? "Collapse events" : "Expand events"}
          aria-expanded={expanded}
        >
          {expanded ? <ChevronUp className="size-4" /> : <ChevronDown className="size-4" />}
        </button>
      </div>

      {/* Expanded event list */}
      {expanded && (
        <div className="border-t border-[var(--ds-line-2)] bg-[var(--ds-line-2)]/30">
          {group.events
            .slice()
            .sort((a, b) => b.createdAt - a.createdAt)
            .map((e, i) => (
              <Flex
                key={i}
                px="4"
                py="2"
                align="start"
                gap="3"
                className="border-b border-[var(--ds-line-2)] last:border-b-0"
              >
                <Box mt="1">{iconFor(e.kind)}</Box>
                <Box className="flex-1 min-w-0">
                  <Text size="2" as="div" className="text-[var(--ds-ink)]">
                    {e.title}
                  </Text>
                  {e.detail && (
                    <Text size="1" color="gray" as="div" className="mt-0.5">
                      {e.detail}
                    </Text>
                  )}
                </Box>
                <Text size="1" color="gray" className="tabular-nums shrink-0">
                  {formatTime(e.createdAt)}
                </Text>
              </Flex>
            ))}
        </div>
      )}
    </div>
  );
}

/* ============================================================================
 * MonthGrid — minimal calendar popover.
 *
 * One month at a time, navigable, with dots under days that have activity
 * so the user can jump straight to a productive day. Selected day gets the
 * --ds-ink chip. No external dep — keeps the app's design surface uniform.
 * ==========================================================================*/
function MonthGrid({
  selectedDay,
  todayIso,
  activeDays,
  onPick,
}: {
  selectedDay: string;
  todayIso: string;
  activeDays: Map<string, Event[]>;
  onPick: (iso: string) => void;
}) {
  const [cursor, setCursor] = useState(() => parseLocalIso(selectedDay));

  /* Build the 6×7 day cells for the cursor's month, starting Monday. */
  const cells = useMemo(() => {
    const firstOfMonth = new Date(cursor.getFullYear(), cursor.getMonth(), 1);
    // 0 = Mon, 6 = Sun (UK / European convention). JS getDay: 0 = Sun.
    const dow = (firstOfMonth.getDay() + 6) % 7;
    const start = new Date(firstOfMonth);
    start.setDate(firstOfMonth.getDate() - dow);
    const out: { iso: string; inMonth: boolean }[] = [];
    for (let i = 0; i < 42; i++) {
      const d = new Date(start);
      d.setDate(start.getDate() + i);
      out.push({
        iso: isoDayLocal(d),
        inMonth: d.getMonth() === cursor.getMonth(),
      });
    }
    return out;
  }, [cursor]);

  const monthLabel = cursor.toLocaleDateString(undefined, {
    month: "long",
    year: "numeric",
  });
  const weekdays = ["M", "T", "W", "T", "F", "S", "S"];

  const stepMonth = (delta: number) => {
    const next = new Date(cursor);
    next.setMonth(cursor.getMonth() + delta);
    setCursor(next);
  };

  return (
    <div className="w-[260px] p-2.5">
      <div className="flex items-center justify-between mb-2">
        <button
          type="button"
          onClick={() => stepMonth(-1)}
          className="inline-flex items-center justify-center size-7 rounded-md text-[var(--ds-muted)] hover:text-[var(--ds-ink)] hover:bg-[var(--ds-line-2)]/60 transition"
          aria-label="Previous month"
        >
          <ChevronLeft className="size-4" />
        </button>
        <span className="text-[13px] font-semibold text-[var(--ds-ink)]">{monthLabel}</span>
        <button
          type="button"
          onClick={() => stepMonth(1)}
          className="inline-flex items-center justify-center size-7 rounded-md text-[var(--ds-muted)] hover:text-[var(--ds-ink)] hover:bg-[var(--ds-line-2)]/60 transition"
          aria-label="Next month"
        >
          <ChevronRight className="size-4" />
        </button>
      </div>

      <div className="grid grid-cols-7 gap-0.5 mb-1">
        {weekdays.map((w, i) => (
          <div
            key={i}
            className="text-[10px] text-[var(--ds-muted)] text-center tabular-nums uppercase tracking-wide"
          >
            {w}
          </div>
        ))}
      </div>

      <div className="grid grid-cols-7 gap-0.5">
        {cells.map((c) => {
          const isSelected = c.iso === selectedDay;
          const isToday = c.iso === todayIso;
          const hasActivity = activeDays.has(c.iso);
          const day = Number(c.iso.split("-")[2]);
          return (
            <button
              key={c.iso}
              type="button"
              onClick={() => onPick(c.iso)}
              className={cn(
                "relative size-8 rounded-md text-[12px] tabular-nums transition",
                !c.inMonth && "text-[var(--ds-subtle)]",
                c.inMonth && !isSelected && "text-[var(--ds-ink)] hover:bg-[var(--ds-line-2)]/60",
                isSelected && "bg-[var(--ds-ink)] text-white font-semibold",
                isToday && !isSelected && "ring-1 ring-[var(--ds-ink)] ring-inset",
              )}
            >
              {day}
              {hasActivity && !isSelected && (
                <span
                  className="absolute left-1/2 -translate-x-1/2 bottom-1 size-1 rounded-full bg-[var(--ds-ink)]"
                  aria-hidden
                />
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}

/* ============================================================================
 * Helpers
 * ==========================================================================*/

function buildSummaryParts(counts: Record<TimelineCategory, number>) {
  const parts: { key: string; icon: React.ReactNode; text: string }[] = [];
  const push = (
    key: TimelineCategory,
    icon: React.ReactNode,
    singular: string,
    plural: string,
  ) => {
    const n = counts[key];
    if (!n) return;
    parts.push({
      key,
      icon,
      text: `${n} ${n === 1 ? singular : plural}`,
    });
  };
  push("changes", <FileEdit className="size-3" />, "change", "changes");
  push("ai", <Bot className="size-3" />, "AI section", "AI sections");
  push("comments", <MessageSquare className="size-3" />, "comment", "comments");
  push("reviews", <ShieldCheck className="size-3" />, "review", "reviews");
  push("exports", <FileDown className="size-3" />, "export", "exports");
  push("people", <Users className="size-3" />, "collaborator", "collaborators");
  return parts;
}

function iconFor(kind: Event["kind"]) {
  const cls = "size-4 text-[var(--gray-9)]";
  if (kind === "created") return <FilePlus2 className={cls} />;
  if (kind === "section_generated") return <RotateCw className={cls} />;
  if (kind === "exported") return <FileDown className={cls} />;
  if (kind === "counsel_review") return <ShieldCheck className="size-4 text-[var(--green-11)]" />;
  if (kind.startsWith("comment_")) return <MessageSquare className={cls} />;
  if (kind.startsWith("ai_")) return <Bot className={cls} />;
  if (kind.startsWith("collaborator_")) return <UserPlus className={cls} />;
  if (kind.endsWith("_updated")) return <FileEdit className={cls} />;
  return <ActivityIcon className={cls} />;
}

function safeMeta(id: string): { shortTitle: string } | null {
  try {
    return getLetterMeta(id as Parameters<typeof getLetterMeta>[0]);
  } catch {
    return null;
  }
}

function labelFor(c: TimelineCategory | "all"): string {
  if (c === "all") return "events";
  return CATEGORY_FILTERS.find((f) => f.id === c)?.label.toLowerCase() ?? "events";
}

function isoDay(ts: number): string {
  return isoDayLocal(new Date(ts));
}

function isoDayLocal(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function prettyDay(iso: string): string {
  const d = parseLocalIso(iso);
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const target = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const diffDays = Math.floor((today.getTime() - target.getTime()) / 86400000);
  if (diffDays === 0) return "Today";
  if (diffDays === 1) return "Yesterday";
  if (diffDays > 0 && diffDays < 7)
    return d.toLocaleDateString(undefined, { weekday: "long" });
  return d.toLocaleDateString(undefined, {
    weekday: "short",
    day: "numeric",
    month: "short",
    year: d.getFullYear() === today.getFullYear() ? undefined : "numeric",
  });
}

function relDayLabel(iso: string, todayIso: string): string {
  const d = parseLocalIso(iso);
  const today = parseLocalIso(todayIso);
  const diffDays = Math.floor((today.getTime() - d.getTime()) / 86400000);
  if (diffDays === 0) return "Today";
  if (diffDays === 1) return "Yest";
  if (diffDays < 7) return d.toLocaleDateString(undefined, { weekday: "short" });
  return d.toLocaleDateString(undefined, { day: "numeric", month: "short" });
}

function compactDay(iso: string): string {
  const d = parseLocalIso(iso);
  const sameYear = d.getFullYear() === new Date().getFullYear();
  return d.toLocaleDateString(undefined, {
    day: "numeric",
    month: "short",
    year: sameYear ? undefined : "2-digit",
  });
}

function formatTime(ts: number): string {
  return new Date(ts).toLocaleTimeString(undefined, {
    hour: "2-digit",
    minute: "2-digit",
  });
}

function parseLocalIso(iso: string): Date {
  const [y, m, d] = iso.split("-").map((n) => Number(n));
  return new Date(y, (m ?? 1) - 1, d ?? 1);
}

export type { Draft as _Draft };
