import { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import {
  Activity as ActivityIcon,
  Bot,
  Calendar as CalendarIcon,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ChevronUp,
  FileDown,
  FileEdit,
  FilePlus2,
  MessageSquare,
  RotateCw,
  Search,
  ShieldCheck,
  UserPlus,
  X,
} from "lucide-react";
import { EmptyState, Pill, PillTabs } from "@/components/ds";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { useDraftStore } from "@/lib/store";
import { useProfileStore } from "@/lib/profile";
import type { Mode } from "@/lib/letters/types";
import {
  buildDraftTimeline,
  timelineCategoryFor,
  type DraftTimelineItem,
  type TimelineCategory,
} from "@/lib/timeline";
import { cn } from "@/lib/utils";
import { Band, HomeBand, OverviewLede } from "@/components/home/HomeBand";
import { letterName, personFor, useHomeData } from "@/components/home/homeData";
import { PageThumb } from "@/components/home/letterArt";

type Event = DraftTimelineItem & {
  draftId: string;
  draftLabel: string;
  person: string;
  mode: Mode;
  category: TimelineCategory;
};

type DraftGroup = {
  draftId: string;
  draftLabel: string;
  person: string;
  mode: Mode;
  events: Event[];
  firstEvent: Event;
  lastEvent: Event;
  counts: Record<TimelineCategory, number>;
  created: boolean;
};

/* ----------------------------------------------------------------------------
 * Activity (a Home tab for HR): the audit trail, one day at a time and
 * grouped by letter. Category pills (All, Drafts, AI, Comments, Reviews,
 * Exports, People) hide what you do not need; search narrows by letter,
 * person or event; the date pill opens a month grid; previous and next
 * jump to the nearest day with activity. Each letter is one card with a
 * summary ("Created · 7 AI sections · 2 comments · Exported") that opens
 * to show every event with its time and who did it.
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

const DAY_BTN =
  "inline-flex size-8 items-center justify-center rounded-[8px] text-[var(--ds-muted)] transition-colors duration-[120ms] hover:bg-[var(--ds-hover)] hover:text-[var(--ds-ink)] active:bg-[var(--ds-surface-2)] focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-[var(--ds-focus)] disabled:cursor-not-allowed disabled:opacity-30";

export function Activity() {
  const drafts = useDraftStore((s) => s.drafts);
  const role = useProfileStore((s) => s.profile.role);
  const home = useHomeData("employer");
  const prefix = role === "employee" ? "/me" : "/hr";

  /* Flatten every draft's timeline into a single chronological list. */
  const events = useMemo<Event[]>(() => {
    const out: Event[] = [];
    const list = Object.values(drafts)
      .filter((d) => !d.isTemplateSource)
      .filter((d) => (role ? d.mode === role : true));
    for (const d of list) {
      const label = letterName(d);
      const person = personFor(d);
      for (const event of buildDraftTimeline(d)) {
        out.push({
          ...event,
          draftId: d.id,
          draftLabel: label,
          person,
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

  // Follow the newest day (as drafts hydrate, or a new event arrives) only
  // while the person is still on the previously newest day; an incoming
  // event must not pull them back from an older day.
  const prevMostRecentDay = useRef(mostRecentDay);
  useEffect(() => {
    setSelectedDay((current) =>
      current === prevMostRecentDay.current ? mostRecentDay : current,
    );
    prevMostRecentDay.current = mostRecentDay;
  }, [mostRecentDay]);

  /* Day-filtered + category-filtered events. */
  const dayEvents = useMemo(() => {
    const list = eventsByDay.get(selectedDay) ?? [];
    if (filter === "all") return list;
    return list.filter((e) => e.category === filter);
  }, [eventsByDay, selectedDay, filter]);

  /* Group the selected day's events by letter, then search. */
  const draftGroups = useMemo<DraftGroup[]>(() => {
    const groups = new Map<string, DraftGroup>();
    for (const e of dayEvents) {
      const g = groups.get(e.draftId);
      if (g) {
        g.events.push(e);
        g.counts[e.category] = (g.counts[e.category] ?? 0) + 1;
        if (e.kind === "created") g.created = true;
        if (e.createdAt < g.firstEvent.createdAt) g.firstEvent = e;
        if (e.createdAt > g.lastEvent.createdAt) g.lastEvent = e;
      } else {
        groups.set(e.draftId, {
          draftId: e.draftId,
          draftLabel: e.draftLabel,
          person: e.person,
          mode: e.mode,
          events: [e],
          firstEvent: e,
          lastEvent: e,
          created: e.kind === "created",
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
    let sorted = [...groups.values()].sort(
      (a, b) => b.lastEvent.createdAt - a.lastEvent.createdAt,
    );
    const q = searchTerm.trim().toLowerCase();
    if (q) {
      sorted = sorted.filter(
        (g) =>
          g.draftLabel.toLowerCase().includes(q) ||
          g.person.toLowerCase().includes(q) ||
          g.events.some(
            (e) =>
              e.title.toLowerCase().includes(q) ||
              (e.actorName ?? "").toLowerCase().includes(q),
          ),
      );
    }
    return sorted;
  }, [dayEvents, searchTerm]);

  /* Active days (newest first) for the strip and previous or next. */
  const recentDays = useMemo(
    () => [...eventsByDay.keys()].sort((a, b) => (a < b ? 1 : -1)),
    [eventsByDay],
  );
  // selectedDay may have no activity (the month grid can pick any day), so
  // find the neighbours by date rather than by index.
  const idxInRecent = recentDays.indexOf(selectedDay);
  const olderDay =
    idxInRecent >= 0
      ? recentDays[idxInRecent + 1]
      : recentDays.find((d) => d < selectedDay);
  const newerDay =
    idxInRecent >= 0
      ? recentDays[idxInRecent - 1]
      : [...recentDays].reverse().find((d) => d > selectedDay);

  const toggleExpanded = (draftId: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(draftId)) next.delete(draftId);
      else next.add(draftId);
      return next;
    });
  };

  const visibleEvents = draftGroups.reduce((n, g) => n + g.events.length, 0);

  const band =
    role === "employer" ? (
      <HomeBand
        active="activity"
        approvals={home.waiting.length}
        lede={
          <OverviewLede
            inProgress={home.summary.inProgress}
            needReview={home.summary.needReview}
          />
        }
      />
    ) : (
      <Band
        crumbs={[
          { label: "Home", href: role === "employee" ? "/me" : "/c" },
          { label: "Activity" },
        ]}
        title="Activity"
        lede="Every draft, regeneration, comment, review and export, grouped by letter and pinned to one day."
      />
    );

  return (
    <div className="min-w-0">
      {band}
      <div className="max-w-[1000px] px-4 pt-5 pb-12 md:px-12 md:pt-[26px]">
        {events.length === 0 ? (
          <div className="rounded-[16px] border border-[var(--ds-line)]">
            <EmptyState
              icon={ActivityIcon}
              title="No activity yet"
              body="Start drafting a letter and the audit trail builds itself: every regenerate, export and attestation is logged here."
              primary={
                role === "employer" || role === "employee"
                  ? { label: "Start a letter", to: `${prefix}/new` }
                  : undefined
              }
            />
          </div>
        ) : (
          <>
            {/* Filters, search and day navigation */}
            <div className="mb-3 flex flex-wrap items-center gap-x-3 gap-y-2.5">
              <PillTabs
                className="mt-0"
                tabs={CATEGORY_FILTERS.map((f) => ({
                  id: f.id,
                  label: f.label,
                }))}
                activeTab={filter}
                onTabChange={(id) => setFilter(id as TimelineCategory | "all")}
              />

              <div className="ml-auto flex shrink-0 items-center gap-1">
                <button
                  type="button"
                  onClick={() => olderDay && setSelectedDay(olderDay)}
                  disabled={!olderDay}
                  className={DAY_BTN}
                  aria-label="Previous active day"
                >
                  <ChevronLeft className="size-4" aria-hidden />
                </button>
                <Popover open={pickerOpen} onOpenChange={setPickerOpen}>
                  <PopoverTrigger asChild>
                    <button
                      type="button"
                      data-date-pill
                      className="inline-flex h-8 items-center gap-1.5 rounded-[9px] border border-[var(--ds-line)] bg-[var(--ds-surface)] px-3 text-[13px] font-medium text-[var(--ds-ink)] transition-colors duration-[120ms] hover:bg-[var(--ds-hover)] active:bg-[var(--ds-surface-2)]"
                    >
                      <CalendarIcon
                        className="size-3.5 text-[var(--ds-subtle)]"
                        aria-hidden
                      />
                      <span>{prettyDay(selectedDay)}</span>
                      <ChevronDown
                        className="size-3.5 text-[var(--ds-subtle)]"
                        aria-hidden
                      />
                    </button>
                  </PopoverTrigger>
                  <PopoverContent align="end" className="w-auto p-0">
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
                  onClick={() => newerDay && setSelectedDay(newerDay)}
                  disabled={!newerDay}
                  className={DAY_BTN}
                  aria-label="Next active day"
                >
                  <ChevronRight className="size-4" aria-hidden />
                </button>
              </div>
            </div>

            {/* Search and recent active days */}
            <div className="mb-5 flex min-w-0 flex-wrap items-center gap-x-3 gap-y-2.5 sm:flex-nowrap">
              <label className="relative flex h-9 w-full min-w-0 items-center sm:w-[300px] sm:shrink-0">
                <Search
                  className="pointer-events-none absolute left-3 size-4 text-[var(--ds-subtle)]"
                  aria-hidden
                />
                <input
                  type="text"
                  placeholder="Search drafts, people, events"
                  aria-label="Search activity"
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="h-9 w-full rounded-[9px] border border-[var(--ds-line)] bg-[var(--ds-surface)] pr-8 pl-[34px] text-[14px] text-[var(--ds-ink)] outline-none transition-colors duration-[120ms] placeholder:text-[var(--ds-subtle)] hover:border-[var(--ds-line-strong)] focus-visible:border-[var(--ds-ink)]"
                />
                {searchTerm && (
                  <button
                    type="button"
                    onClick={() => setSearchTerm("")}
                    className="absolute right-1.5 grid size-6 place-items-center rounded-[6px] text-[var(--ds-subtle)] hover:bg-[var(--ds-hover)] hover:text-[var(--ds-ink)]"
                    aria-label="Clear search"
                  >
                    <X className="size-3.5" aria-hidden />
                  </button>
                )}
              </label>
              <div className="flex min-w-0 flex-1 items-center gap-1.5">
                {recentDays.length > 1 && (
                  <div className="no-scrollbar flex min-w-0 items-center gap-1.5 overflow-x-auto">
                    {recentDays.slice(0, 10).map((day) => {
                      const active = day === selectedDay;
                      const count = eventsByDay.get(day)?.length ?? 0;
                      return (
                        <button
                          key={day}
                          type="button"
                          onClick={() => setSelectedDay(day)}
                          aria-pressed={active}
                          className={cn(
                            "inline-flex h-7 shrink-0 items-center gap-1.5 rounded-full px-2.5 text-[12px] font-medium transition-colors duration-[120ms]",
                            active
                              ? "bg-[var(--ds-accent)] text-[var(--ds-on-accent)]"
                              : "bg-[var(--ds-chip)] text-[var(--ds-muted)] hover:text-[var(--ds-ink)]",
                          )}
                        >
                          <span>{relDayLabel(day, today)}</span>
                          <span
                            className={cn(
                              "ds-mono text-[11px] opacity-70",
                              active && "opacity-80",
                            )}
                          >
                            {count}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                )}
                <span className="ml-auto shrink-0 pl-2 text-[12.5px] text-[var(--ds-muted)]">
                  {draftGroups.length}{" "}
                  {draftGroups.length === 1 ? "letter" : "letters"},{" "}
                  {visibleEvents} {visibleEvents === 1 ? "event" : "events"}
                </span>
              </div>
            </div>

            {draftGroups.length === 0 ? (
              <div className="rounded-[16px] border border-[var(--ds-line)] bg-[var(--ds-surface)] py-10 text-center">
                <ActivityIcon
                  className="mx-auto mb-2 size-5 text-[var(--ds-subtle)]"
                  aria-hidden
                />
                <p className="m-0 text-[13.5px] text-[var(--ds-muted)]">
                  {searchTerm.trim()
                    ? `Nothing matching "${searchTerm.trim()}" on ${prettyDay(selectedDay)}.`
                    : filter === "all"
                      ? `Nothing logged on ${prettyDay(selectedDay)}.`
                      : `No ${labelFor(filter)} on ${prettyDay(selectedDay)}.`}
                </p>
              </div>
            ) : (
              // Rows fade in together when the day or filter changes.
              <div
                key={`${selectedDay}:${filter}`}
                className="flex flex-col gap-2.5 animate-in fade-in-0 duration-200 motion-reduce:animate-none"
              >
                {draftGroups.map((g) => (
                  <DraftGroupCard
                    key={g.draftId}
                    group={g}
                    expanded={expanded.has(g.draftId)}
                    onToggle={() => toggleExpanded(g.draftId)}
                  />
                ))}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

/* ============================================================================
 * One letter's events on a day: a summary that opens to every event.
 * ==========================================================================*/
function DraftGroupCard({
  group,
  expanded,
  onToggle,
}: {
  group: DraftGroup;
  expanded: boolean;
  onToggle: () => void;
}) {
  const summary = summaryText(group);
  const first = formatTime(group.firstEvent.createdAt);
  const last = formatTime(group.lastEvent.createdAt);
  return (
    <div className="overflow-hidden rounded-[16px] border border-[var(--ds-line)] bg-[var(--ds-surface)]">
      <div className="flex items-start gap-3 px-4 py-3.5">
        <span className="mt-0.5 hidden shrink-0 sm:block">
          <PageThumb />
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
            <Link
              to={`/editor/${group.draftId}`}
              className="min-w-0 truncate rounded-[4px] text-[14.5px] font-medium text-[var(--ds-ink)] underline-offset-[3px] hover:underline"
            >
              {group.draftLabel}
              {group.person && (
                <span className="font-normal text-[var(--ds-muted)]">
                  {" "}
                  · {group.person}
                </span>
              )}
            </Link>
            <Pill tone="grey" dot={false}>
              {group.mode === "employer" ? "HR" : "Employee"}
            </Pill>
          </div>
          <p className="m-0 mt-1 text-[12.5px] leading-snug text-[var(--ds-muted)]">
            {summary}
            <span aria-hidden className="text-[var(--ds-faint)]">
              {" "}
              ·{" "}
            </span>
            <span className="ds-mono text-[12px]">
              {first === last ? last : `${first} to ${last}`}
            </span>
          </p>
        </div>
        <button
          type="button"
          onClick={onToggle}
          className="inline-flex size-8 shrink-0 items-center justify-center rounded-[8px] text-[var(--ds-muted)] transition-colors duration-[120ms] hover:bg-[var(--ds-hover)] hover:text-[var(--ds-ink)]"
          aria-label={expanded ? "Collapse events" : "Expand events"}
          aria-expanded={expanded}
        >
          {expanded ? (
            <ChevronUp className="size-4" aria-hidden />
          ) : (
            <ChevronDown className="size-4" aria-hidden />
          )}
        </button>
      </div>

      {expanded && (
        <ul className="m-0 list-none border-t border-[var(--ds-line-2)] bg-[var(--ds-surface-2)] p-0 animate-in fade-in-0 duration-150 motion-reduce:animate-none">
          {group.events
            .slice()
            .sort((a, b) => b.createdAt - a.createdAt)
            .map((e, i) => (
              <li
                key={i}
                className="flex items-start gap-3 border-b border-[var(--ds-line-2)] px-4 py-2.5 last:border-b-0"
              >
                <span className="mt-0.5">{iconFor(e.kind)}</span>
                <span className="min-w-0 flex-1">
                  <span className="block text-[13.5px] text-[var(--ds-ink)]">
                    {e.title}
                  </span>
                  {e.detail && (
                    <span className="mt-0.5 block text-[12.5px] text-[var(--ds-muted)]">
                      {e.detail}
                    </span>
                  )}
                </span>
                <span className="shrink-0 text-right text-[12px] text-[var(--ds-subtle)]">
                  <span className="ds-mono">{formatTime(e.createdAt)}</span>
                  {e.actorName && <span className="block">{e.actorName}</span>}
                </span>
              </li>
            ))}
        </ul>
      )}
    </div>
  );
}

/* ============================================================================
 * The date pill's month grid: days with activity carry a dot.
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

  const cells = useMemo(() => {
    const firstOfMonth = new Date(cursor.getFullYear(), cursor.getMonth(), 1);
    const dow = (firstOfMonth.getDay() + 6) % 7; // Monday first
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

  const monthLabel = cursor.toLocaleDateString("en-GB", {
    month: "long",
    year: "numeric",
  });
  const weekdays = ["M", "T", "W", "T", "F", "S", "S"];
  const stepMonth = (delta: number) => {
    const next = new Date(cursor);
    next.setDate(1);
    next.setMonth(cursor.getMonth() + delta);
    setCursor(next);
  };

  return (
    <div className="w-[260px] p-2.5">
      <div className="mb-2 flex items-center justify-between">
        <button
          type="button"
          onClick={() => stepMonth(-1)}
          className={cn(DAY_BTN, "size-7")}
          aria-label="Previous month"
        >
          <ChevronLeft className="size-4" aria-hidden />
        </button>
        <span className="text-[13px] font-semibold text-[var(--ds-ink)]">
          {monthLabel}
        </span>
        <button
          type="button"
          onClick={() => stepMonth(1)}
          className={cn(DAY_BTN, "size-7")}
          aria-label="Next month"
        >
          <ChevronRight className="size-4" aria-hidden />
        </button>
      </div>
      <div className="mb-1 grid grid-cols-7 gap-0.5">
        {weekdays.map((w, i) => (
          <div
            key={i}
            className="text-center text-[10px] tracking-wide text-[var(--ds-subtle)] uppercase"
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
              aria-label={`${parseLocalIso(c.iso).toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long" })}${hasActivity ? ", has activity" : ""}`}
              aria-pressed={isSelected}
              className={cn(
                "relative size-8 rounded-[7px] text-[12px] tabular-nums transition-colors duration-[120ms]",
                !c.inMonth && "text-[var(--ds-subtle)]",
                c.inMonth &&
                  !isSelected &&
                  "text-[var(--ds-ink)] hover:bg-[var(--ds-hover)]",
                isSelected &&
                  "bg-[var(--ds-accent)] font-semibold text-[var(--ds-on-accent)]",
                isToday &&
                  !isSelected &&
                  "ring-1 ring-[var(--ds-ink)] ring-inset",
              )}
            >
              {day}
              {hasActivity && !isSelected && (
                <span
                  className="absolute bottom-1 left-1/2 size-1 -translate-x-1/2 rounded-full bg-[var(--ds-ink)]"
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

/** "Created · 7 AI sections · 2 comments · Exported" */
function summaryText(g: DraftGroup): string {
  const parts: string[] = [];
  const n = (k: TimelineCategory) => g.counts[k] ?? 0;
  const plural = (c: number, one: string, many: string) =>
    `${c} ${c === 1 ? one : many}`;
  if (g.created) parts.push("Created");
  const changes = n("changes") - (g.created ? 1 : 0);
  if (changes > 0) parts.push(plural(changes, "change", "changes"));
  if (n("ai")) parts.push(plural(n("ai"), "AI section", "AI sections"));
  if (n("comments")) parts.push(plural(n("comments"), "comment", "comments"));
  if (n("reviews"))
    parts.push(plural(n("reviews"), "review event", "review events"));
  if (n("exports"))
    parts.push(
      n("exports") === 1 ? "Exported" : `Exported ${n("exports")} times`,
    );
  if (n("people"))
    parts.push(plural(n("people"), "collaborator", "collaborators"));
  return parts.join(" · ") || plural(g.events.length, "event", "events");
}

function iconFor(kind: Event["kind"]) {
  const cls = "size-4 text-[var(--ds-subtle)]";
  if (kind === "created") return <FilePlus2 className={cls} aria-hidden />;
  if (kind === "section_generated")
    return <RotateCw className={cls} aria-hidden />;
  if (kind === "exported") return <FileDown className={cls} aria-hidden />;
  if (kind === "counsel_review")
    return (
      <ShieldCheck className="size-4 text-[var(--ds-green-fg)]" aria-hidden />
    );
  if (kind.startsWith("comment_"))
    return <MessageSquare className={cls} aria-hidden />;
  if (kind.startsWith("ai_")) return <Bot className={cls} aria-hidden />;
  if (kind.startsWith("collaborator_"))
    return <UserPlus className={cls} aria-hidden />;
  if (kind.endsWith("_updated"))
    return <FileEdit className={cls} aria-hidden />;
  return <ActivityIcon className={cls} aria-hidden />;
}

function labelFor(c: TimelineCategory | "all"): string {
  if (c === "all") return "events";
  return (
    CATEGORY_FILTERS.find((f) => f.id === c)?.label.toLowerCase() ?? "events"
  );
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
  const diffDays = Math.round((today.getTime() - target.getTime()) / 86400000);
  if (diffDays === 0) return "Today";
  if (diffDays === 1) return "Yesterday";
  if (diffDays > 0 && diffDays < 7)
    return d.toLocaleDateString("en-GB", { weekday: "long" });
  const wd = d.toLocaleDateString("en-GB", { weekday: "short" });
  const mon = d.toLocaleDateString("en-GB", { month: "short" });
  return `${wd} ${d.getDate()} ${mon}${d.getFullYear() === today.getFullYear() ? "" : ` ${d.getFullYear()}`}`;
}

function relDayLabel(iso: string, todayIso: string): string {
  const d = parseLocalIso(iso);
  const today = parseLocalIso(todayIso);
  const diffDays = Math.round((today.getTime() - d.getTime()) / 86400000);
  if (diffDays === 0) return "Today";
  if (diffDays === 1) return "Yesterday";
  if (diffDays < 7) return d.toLocaleDateString("en-GB", { weekday: "short" });
  return `${d.getDate()} ${d.toLocaleDateString("en-GB", { month: "short" })}`;
}

function formatTime(ts: number): string {
  return new Date(ts).toLocaleTimeString("en-GB", {
    hour: "2-digit",
    minute: "2-digit",
  });
}

function parseLocalIso(iso: string): Date {
  const [y, m, d] = iso.split("-").map((n) => Number(n));
  return new Date(y, (m ?? 1) - 1, d ?? 1);
}
