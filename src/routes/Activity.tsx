import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Box, Flex, Text } from "@radix-ui/themes";
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
import { PageShell, StatusPill } from "@/components/reports/parts";

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
    const list = Object.values(drafts)
      .filter((d) => !d.isTemplateSource)
      .filter((d) => (role ? d.mode === role : true));
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

  // Auto-follow the newest day (e.g. as drafts hydrate, or a new event arrives)
  // only while the user is still sitting on the previously-newest day. If they
  // have scrubbed back to an older day, an incoming event must not yank them
  // back to the top.
  const prevMostRecentDay = useRef(mostRecentDay);
  useEffect(() => {
    setSelectedDay((current) =>
      current === prevMostRecentDay.current ? mostRecentDay : current
    );
    prevMostRecentDay.current = mostRecentDay;
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
  // recentDays is newest-first. "Prev" navigates to an OLDER day, "Next" to a
  // NEWER day. selectedDay may not be in recentDays — the calendar popover lets
  // the user pick any day, including ones with zero activity — so resolve the
  // neighbours by date rather than assuming an in-list index (a -1 index made
  // "Previous" jump to the newest day and disabled "Next").
  const idxInRecent = recentDays.indexOf(selectedDay);
  const olderDay =
    idxInRecent >= 0
      ? recentDays[idxInRecent + 1]
      : recentDays.find((d) => d < selectedDay);
  const newerDay =
    idxInRecent >= 0
      ? recentDays[idxInRecent - 1]
      : [...recentDays].reverse().find((d) => d > selectedDay);
  const canPrev = !!olderDay;
  const canNext = !!newerDay;
  const goPrev = () => {
    if (olderDay) setSelectedDay(olderDay);
  };
  const goNext = () => {
    if (newerDay) setSelectedDay(newerDay);
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
    <PageShell width="medium" className="scroll-mt-4">
      <div data-activity-section>
      <PageHeader
        crumbs={[{ label: "Activity" }]}
        title="Audit trail"
        lede="Every draft, regeneration, comment, review and export, grouped by letter and pinned to one day. Use the date picker, previous and next, or the tabs to scrub."
        tabs={events.length === 0 ? undefined : CATEGORY_FILTERS.map((f) => ({ id: f.id, label: f.label }))}
        activeTab={filter}
        onTabChange={(id) => setFilter(id as TimelineCategory | "all")}
      />

      {events.length === 0 ? (
        <div className="rounded-[var(--ds-r-l)] border border-[var(--ds-line)]">
          <EmptyState
            icon={ActivityIcon}
            title="No activity yet"
            body="Start drafting a letter and the audit trail builds itself: every regenerate, export and attestation is logged here."
            primary={{ label: "Start a letter", to: "/" }}
          />
        </div>
      ) : (
        <>
          {/* Toolbar: search + day nav */}
          <div className="mb-3 flex flex-wrap items-center gap-2">
            <div className="relative min-w-0 flex-1 sm:max-w-[320px]">
              <Search className="pointer-events-none absolute left-3 top-1/2 size-3.5 -translate-y-1/2 text-[var(--ds-muted)]" />
              <input
                type="text"
                placeholder="Search drafts, people, events…"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="h-9 w-full rounded-[var(--ds-r-s)] bg-[var(--ds-surface-2)] pl-8 pr-8 text-[13px] text-[var(--ds-ink)] placeholder:text-[var(--ds-muted)] focus:outline-none focus:ring-2 focus:ring-[var(--ds-focus)]/30"
              />
              {searchTerm && (
                <button
                  type="button"
                  onClick={() => setSearchTerm("")}
                  className="absolute right-2 top-1/2 inline-flex size-6 -translate-y-1/2 items-center justify-center rounded text-[var(--ds-muted)] transition hover:bg-[var(--ds-surface-3)] hover:text-[var(--ds-ink)]"
                  aria-label="Clear search"
                >
                  <X className="size-3.5" />
                </button>
              )}
            </div>

            {/* Day navigation */}
            <div className="ml-auto flex shrink-0 items-center gap-1">
              <button
                type="button"
                onClick={goPrev}
                disabled={!canPrev}
                className="inline-flex size-8 items-center justify-center rounded-[var(--ds-r-s)] text-[var(--ds-muted)] transition hover:bg-[var(--ds-surface-2)] hover:text-[var(--ds-ink)] disabled:cursor-not-allowed disabled:opacity-30"
                aria-label="Previous active day"
              >
                <ChevronLeft className="size-4" />
              </button>

              <Popover open={pickerOpen} onOpenChange={setPickerOpen}>
                <PopoverTrigger asChild>
                  <button
                    type="button"
                    className="inline-flex h-8 items-center gap-1.5 rounded-full border border-[var(--ds-line-strong)] bg-[var(--ds-surface)] px-3 text-[12.5px] font-medium text-[var(--ds-ink)] transition hover:bg-[var(--ds-surface-2)]"
                  >
                    <CalendarIcon className="size-3.5 text-[var(--ds-muted)]" />
                    <span>{prettyDay(selectedDay)}</span>
                    <ChevronDown className="size-3.5 text-[var(--ds-muted)]" />
                  </button>
                </PopoverTrigger>
                <PopoverContent align="end" className="w-auto rounded-[var(--ds-r-m)] p-0 shadow-[var(--ds-shadow-l)]">
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
                className="inline-flex size-8 items-center justify-center rounded-[var(--ds-r-s)] text-[var(--ds-muted)] transition hover:bg-[var(--ds-surface-2)] hover:text-[var(--ds-ink)] disabled:cursor-not-allowed disabled:opacity-30"
                aria-label="Next active day"
              >
                <ChevronRight className="size-4" />
              </button>
            </div>
          </div>

          {/* Recent days strip */}
          <div className="mb-5 flex items-center gap-1.5">
            {recentDays.length > 1 && (
              <div className="flex min-w-0 items-center gap-1.5 overflow-x-auto">
                {recentDays.slice(0, 10).map((day) => {
                  const active = day === selectedDay;
                  const count = eventsByDay.get(day)?.length ?? 0;
                  return (
                    <button
                      key={day}
                      type="button"
                      onClick={() => setSelectedDay(day)}
                      className={cn(
                        "inline-flex h-7 shrink-0 items-center gap-1.5 rounded-full px-2.5 text-[12px] font-medium transition",
                        active
                          ? "bg-[var(--ds-accent)] text-[var(--ds-on-accent)]"
                          : "bg-[var(--ds-chip)] text-[var(--ds-muted)] hover:text-[var(--ds-ink)]",
                      )}
                    >
                      <span>{relDayLabel(day, today)}</span>
                      <span className={cn("ds-mono text-[11px] opacity-60", active && "opacity-80")}>{count}</span>
                    </button>
                  );
                })}
              </div>
            )}
            <span className="ml-auto shrink-0 pl-2 text-[12px] text-[var(--ds-muted)]">
              {draftGroups.length} {draftGroups.length === 1 ? "letter" : "letters"}
              {", "}
              {dayEvents.length} {dayEvents.length === 1 ? "event" : "events"}
            </span>
          </div>

          {/* Draft groups for the selected day */}
          {draftGroups.length === 0 ? (
            <div className="rounded-[var(--ds-r-l)] border border-[var(--ds-line)] bg-[var(--ds-surface)] py-10 text-center">
              <ActivityIcon className="size-6 mx-auto text-[var(--ds-muted)] mb-2" />
              <Text size="2" color="gray">
                {filter === "all"
                  ? `Nothing logged on ${prettyDay(selectedDay)}.`
                  : `No ${labelFor(filter)} on ${prettyDay(selectedDay)}.`}
              </Text>
            </div>
          ) : (
            <div className="space-y-2.5">
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
      </div>
    </PageShell>
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
    <div className="overflow-hidden rounded-[var(--ds-r-l)] border border-[var(--ds-line)] bg-[var(--ds-surface)]">
      {/* Card header: click to expand, separate button to open editor */}
      <div className="flex items-start gap-3 px-4 py-3.5">
        <div className="mt-0.5 grid size-8 shrink-0 place-items-center rounded-[var(--ds-r-s)] bg-[var(--ds-surface-2)] text-[var(--ds-body)]">
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
            <StatusPill tone="neutral" dot={false} size="sm">
              {group.mode === "employer" ? "HR" : "Employee"}
            </StatusPill>
          </div>
          {summaryParts.length > 0 && (
            <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-[12px] text-[var(--ds-muted)]">
              {summaryParts.map((p) => (
                <span key={p.key} className="inline-flex items-center gap-1">
                  {p.icon}
                  <span className="tabular-nums">{p.text}</span>
                </span>
              ))}
              <span className="ds-mono text-[11.5px]">{formatTime(group.lastEvent.createdAt)}</span>
            </div>
          )}
        </div>
        <button
          type="button"
          onClick={onToggle}
          className="inline-flex size-7 shrink-0 items-center justify-center rounded-[var(--ds-r-s)] text-[var(--ds-muted)] transition hover:bg-[var(--ds-surface-2)] hover:text-[var(--ds-ink)]"
          aria-label={expanded ? "Collapse events" : "Expand events"}
          aria-expanded={expanded}
        >
          {expanded ? <ChevronUp className="size-4" /> : <ChevronDown className="size-4" />}
        </button>
      </div>

      {/* Expanded event list */}
      {expanded && (
        <div className="border-t border-[var(--ds-line-2)] bg-[var(--ds-surface-2)]">
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
                <Text size="1" color="gray" className="ds-mono shrink-0">
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
                isSelected && "bg-[var(--ds-accent)] text-[var(--ds-on-accent)] font-semibold",
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
  if (kind === "counsel_review") return <ShieldCheck className="size-4 text-[var(--ds-green-fg)]" />;
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
