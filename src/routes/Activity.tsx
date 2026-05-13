import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Badge, Box, Card, Flex, Text } from "@radix-ui/themes";
import {
  Bot,
  ChevronLeft,
  ChevronRight,
  FilePlus2,
  FileEdit,
  RotateCw,
  ShieldCheck,
  FileDown,
  Activity as ActivityIcon,
  MessageSquare,
  UserPlus,
} from "lucide-react";
import { PageHeader, EmptyState } from "@/components/ds";
import { useDraftStore } from "@/lib/store";
import { useProfileStore } from "@/lib/profile";
import { getLetterMeta } from "@/lib/letters/catalog";
import type { Draft } from "@/lib/letters/types";
import { buildDraftTimeline, type DraftTimelineItem } from "@/lib/timeline";

type Event = DraftTimelineItem & {
  draftId: string;
  draftLabel: string;
  mode: "employer" | "employee";
};

/* ----------------------------------------------------------------------------
 * Activity is a day-pinned audit trail. The page shows one day at a time
 * with prev/next nav and a native date picker so users can scrub to any
 * day. A horizontal strip of "days with activity" gives one-click access
 * to the most recent active days without hunting.
 *
 * Why pin to a day rather than show all-at-once:
 *   - The legacy view scrolled forever for long-lived projects.
 *   - When reviewing with a lawyer / HR partner, you're usually
 *     looking at "what happened on the day this letter went out" —
 *     a day view is the right unit of analysis.
 *   - Calendar + Notifications + Exported all key off dates; Activity
 *     becomes the matching surface.
 * --------------------------------------------------------------------------*/
export function Activity() {
  const nav = useNavigate();
  const drafts = useDraftStore((s) => s.drafts);
  const role = useProfileStore((s) => s.profile.role);

  /* Flatten every draft's timeline into a single chronological list once. */
  const events = useMemo(() => {
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
        });
      }
    }
    out.sort((a, b) => b.createdAt - a.createdAt);
    return out;
  }, [drafts, role]);

  /* Set of YYYY-MM-DD keys that have at least one event. Used for the
   * "recent days" strip and to disable the picker on empty days. */
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

  /* Active day. Default to the most recent day that has activity; falls
   * back to today when the audit trail is empty. */
  const today = isoDay(Date.now());
  const mostRecentDay = events.length > 0 ? isoDay(events[0].createdAt) : today;
  const [selectedDay, setSelectedDay] = useState(mostRecentDay);

  /* When the activity set changes (different mode / new event), retarget
   * the picker to the most recent active day so the user lands on the
   * thing that just happened rather than an empty day. */
  useEffect(() => {
    setSelectedDay(mostRecentDay);
  }, [mostRecentDay]);

  const dayEvents = eventsByDay.get(selectedDay) ?? [];

  /* List of distinct active days, newest first, used by the strip. */
  const recentDays = useMemo(() => {
    return [...eventsByDay.keys()].sort((a, b) => (a < b ? 1 : -1));
  }, [eventsByDay]);

  /* Prev/Next step through days that have activity. If none on either
   * side, the button is disabled. Stepping respects the active filter
   * (HR vs Employee) since `events` is already filtered. */
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

  return (
    <Box className="max-w-5xl px-4 py-6 sm:px-6 sm:py-8">
      <PageHeader
        crumbs={[{ label: "Activity" }]}
        title="Audit trail"
        lede="Every draft you've created, regenerated, exported, and attested. Pinned to one day — use the picker, the prev/next arrows, or jump straight to a recent day."
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
          {/* Day picker row: prev / picker + label / next / Today */}
          <div className="flex items-center gap-2 mb-3">
            <button
              type="button"
              onClick={goPrev}
              disabled={!canPrev}
              className="inline-flex items-center justify-center size-9 rounded-md border border-[var(--ds-line)] bg-[var(--ds-surface)] text-[var(--ds-ink)] disabled:opacity-40 disabled:cursor-not-allowed hover:bg-[var(--ds-line-2)]/60 transition"
              aria-label="Previous active day"
              title="Previous active day"
            >
              <ChevronLeft className="size-4" />
            </button>

            <label className="relative flex-1 min-w-0">
              <span className="sr-only">Pick a day</span>
              <input
                type="date"
                value={selectedDay}
                max={today}
                onChange={(e) => setSelectedDay(e.target.value || today)}
                className="w-full h-9 px-3 rounded-md border border-[var(--ds-line)] bg-[var(--ds-surface)] text-[13px] outline-none focus:border-[var(--ds-ink)] tabular-nums"
              />
              <span className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none text-[12px] text-[var(--ds-muted)] hidden sm:inline">
                {prettyDay(selectedDay)}
              </span>
            </label>

            <button
              type="button"
              onClick={goNext}
              disabled={!canNext}
              className="inline-flex items-center justify-center size-9 rounded-md border border-[var(--ds-line)] bg-[var(--ds-surface)] text-[var(--ds-ink)] disabled:opacity-40 disabled:cursor-not-allowed hover:bg-[var(--ds-line-2)]/60 transition"
              aria-label="Next active day"
              title="Next active day"
            >
              <ChevronRight className="size-4" />
            </button>

            <button
              type="button"
              onClick={() => setSelectedDay(today)}
              className="hidden sm:inline-flex h-9 px-3 rounded-md border border-[var(--ds-line)] bg-[var(--ds-surface)] text-[12px] font-medium hover:bg-[var(--ds-line-2)]/60 transition"
            >
              Today
            </button>
          </div>

          {/* Strip of recent active days. Limit to 7 newest to keep the
           * row tight; pressing prev/next or scrubbing the picker reaches
           * older ones. */}
          {recentDays.length > 1 && (
            <div className="flex items-center gap-1.5 mb-5 overflow-x-auto pb-1 -mx-1 px-1">
              {recentDays.slice(0, 7).map((day) => {
                const active = day === selectedDay;
                const count = eventsByDay.get(day)?.length ?? 0;
                return (
                  <button
                    key={day}
                    type="button"
                    onClick={() => setSelectedDay(day)}
                    className={
                      "shrink-0 inline-flex flex-col items-start gap-0.5 rounded-md border px-2.5 py-1.5 transition " +
                      (active
                        ? "border-[var(--ds-ink)] bg-[var(--ds-line-2)]"
                        : "border-[var(--ds-line)] hover:bg-[var(--ds-line-2)]/40")
                    }
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

          {/* Events for the selected day */}
          {dayEvents.length === 0 ? (
            <Card size="2">
              <div className="py-10 text-center">
                <ActivityIcon className="size-6 mx-auto text-[var(--ds-muted)] mb-2" />
                <Text size="2" color="gray">
                  Nothing logged on {prettyDay(selectedDay)}.
                </Text>
              </div>
            </Card>
          ) : (
            <Card size="2">
              <div className="flex items-baseline justify-between pb-2 mb-1 border-b border-[var(--gray-4)]">
                <span className="text-[13px] font-semibold text-[var(--ds-ink)]">
                  {prettyDay(selectedDay)}
                </span>
                <span className="text-[11px] tabular-nums text-[var(--ds-muted)]">
                  {dayEvents.length} {dayEvents.length === 1 ? "event" : "events"}
                </span>
              </div>
              <Flex direction="column">
                {dayEvents.map((e, i) => (
                  <button
                    key={i}
                    onClick={() => nav(`/editor/${e.draftId}`)}
                    className="text-left"
                  >
                    <Flex
                      px="4"
                      py="2"
                      align="start"
                      gap="3"
                      className="hover:bg-[var(--gray-2)] cursor-pointer border-b border-[var(--gray-5)] last:border-b-0"
                    >
                      <Box mt="1">{iconFor(e.kind)}</Box>
                      <Box className="flex-1 min-w-0">
                        <Text size="2" as="div">
                          {e.title} <Text color="gray">· {e.draftLabel}</Text>
                        </Text>
                        <Flex align="center" gap="2" mt="1">
                          <Badge color="gray" variant="soft">
                            {e.mode === "employer" ? "HR" : "employee"}
                          </Badge>
                          {e.detail && (
                            <Text size="1" color="gray">
                              · {e.detail}
                            </Text>
                          )}
                        </Flex>
                      </Box>
                      <Text size="1" color="gray" className="tabular-nums shrink-0">
                        {formatTime(e.createdAt)}
                      </Text>
                    </Flex>
                  </button>
                ))}
              </Flex>
            </Card>
          )}
        </>
      )}
    </Box>
  );
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

/** YYYY-MM-DD in the local timezone — keyspace for grouping. */
function isoDay(ts: number): string {
  const d = new Date(ts);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/** "Today" / "Yesterday" / "Wed 12 Mar" / "Wednesday, 12 March 2026" */
function prettyDay(iso: string): string {
  const d = parseLocalIso(iso);
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const target = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const diffDays = Math.floor((today.getTime() - target.getTime()) / 86400000);
  if (diffDays === 0) return "Today";
  if (diffDays === 1) return "Yesterday";
  return d.toLocaleDateString(undefined, {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

/** Short label for the chip strip: "Today" / "Yest" / "Mon" / "12 Mar". */
function relDayLabel(iso: string, todayIso: string): string {
  const d = parseLocalIso(iso);
  const today = parseLocalIso(todayIso);
  const diffDays = Math.floor((today.getTime() - d.getTime()) / 86400000);
  if (diffDays === 0) return "Today";
  if (diffDays === 1) return "Yest";
  if (diffDays < 7) return d.toLocaleDateString(undefined, { weekday: "short" });
  return d.toLocaleDateString(undefined, { day: "numeric", month: "short" });
}

/** "12 Mar" / "12 Mar '25" if past year. */
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
  // Build a local-time Date from YYYY-MM-DD to avoid UTC drift on
  // timezones west of UTC (where `new Date("2025-01-01")` resolves to
  // 2024-12-31 in local time).
  const [y, m, d] = iso.split("-").map((n) => Number(n));
  return new Date(y, (m ?? 1) - 1, d ?? 1);
}

export type { Draft as _Draft };
