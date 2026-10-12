import { useState } from "react";
import { motion } from "framer-motion";
import { CalendarDays, Plus, Trash2 } from "lucide-react";
import type { EventKind, MatterEvent } from "@/lib/letters/types";
import { useDraftStore } from "@/lib/store";
import { formatDateOnly, parseDateOnly } from "@/lib/date-only";
import { Button } from "@/components/ui/button";
import { StatusPill, type PillTone } from "@/components/reports/parts";

const EVENT_KIND_LABEL: Record<EventKind, string> = {
  meeting: "Meeting",
  hearing: "Hearing",
  deadline: "Deadline",
  review: "Review",
};

const EVENT_KIND_TONE: Record<EventKind, PillTone> = {
  meeting: "info",
  hearing: "warn",
  deadline: "danger",
  review: "ok",
};

/**
 * Render an ISO datetime as "18 May 10:00". Falls back to date-only when
 * the time component is missing.
 */
function formatEventWhen(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  const hasTime = iso.includes("T") || iso.includes(":");
  if (!hasTime) {
    // Bare "YYYY-MM-DD" parses as UTC midnight via new Date(), so
    // toLocaleDateString renders the prior day west of UTC. Use the
    // local-parse helper which constructs the date from local components.
    return formatDateOnly(iso, { day: "numeric", month: "short", year: "numeric" }, "en-GB");
  }
  return `${d.toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
  })}, ${d.toLocaleTimeString("en-GB", {
    hour: "2-digit",
    minute: "2-digit",
  })}`;
}

export function MatterCalendar({
  matterId,
  events,
}: {
  matterId: string;
  events: MatterEvent[];
}) {
  const createEvent = useDraftStore((s) => s.createEvent);
  const deleteEvent = useDraftStore((s) => s.deleteEvent);

  const [adding, setAdding] = useState(false);
  const [label, setLabel] = useState("");
  const [kind, setKind] = useState<EventKind>("meeting");
  const [when, setWhen] = useState("");
  const [detail, setDetail] = useState("");

  const now = Date.now();
  const upcoming = events
    .filter((e) => {
      // A bare "YYYY-MM-DD" whenISO (allowed by MatterEvent) parses as UTC
      // midnight via new Date(), which is in the past all day west of UTC and
      // would wrongly hide today's all-day events. Parse date-only values in
      // local time (as formatEventWhen already does) and give them a full-day
      // lookback so an all-day event stays visible for its whole day.
      const isDateOnly = !e.whenISO.includes("T") && !e.whenISO.includes(":");
      const t = isDateOnly
        ? (parseDateOnly(e.whenISO)?.getTime() ?? NaN)
        : new Date(e.whenISO).getTime();
      const threshold = isDateOnly ? now - 24 * 60 * 60 * 1000 : now - 60 * 60 * 1000;
      return !Number.isNaN(t) && t >= threshold;
    })
    .sort((a, b) => a.whenISO.localeCompare(b.whenISO));

  const resetForm = () => {
    setLabel("");
    setKind("meeting");
    setWhen("");
    setDetail("");
    setAdding(false);
  };

  const onSave = () => {
    const trimmed = label.trim();
    if (!trimmed || !when) return;
    createEvent({
      matterId,
      kind,
      label: trimmed,
      whenISO: when,
      detail: detail.trim() || undefined,
    });
    resetForm();
  };

  return (
    <motion.section
      initial={{ opacity: 0, y: 4 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25, ease: "easeOut", delay: 0.15 }}
    >
      <div className="overflow-hidden rounded-[var(--ds-r-l)] border border-[var(--ds-line)] bg-[var(--ds-surface)] p-1.5">
        <div className="flex items-center justify-between px-2.5 pb-1.5 pt-1.5">
          <h2 className="m-0 flex items-center gap-2 text-[13.5px] font-semibold text-[var(--ds-ink)]">
            <CalendarDays className="size-3.5 text-[var(--ds-muted)]" aria-hidden /> Events
            <span className="text-[12px] font-normal text-[var(--ds-muted)]">
              {upcoming.length} upcoming
            </span>
          </h2>
          {!adding && (
            <button
              type="button"
              onClick={() => setAdding(true)}
              className="inline-flex items-center gap-1 text-[12.5px] text-[var(--ds-muted)] hover:text-[var(--ds-ink)]"
            >
              <Plus className="size-3.5" /> Add event
            </button>
          )}
        </div>

        {events.length === 0 && !adding ? (
          <div className="rounded-[calc(var(--ds-r-l)-5px)] bg-[var(--ds-surface-2)] px-4 py-6 text-center">
            <p className="m-0 mb-3 text-[13px] text-[var(--ds-muted)]">
              No upcoming events
            </p>
            <Button variant="outline" size="sm" onClick={() => setAdding(true)}>
              <Plus className="size-3.5" /> Add event
            </Button>
          </div>
        ) : upcoming.length === 0 && !adding ? (
          <div className="rounded-[calc(var(--ds-r-l)-5px)] bg-[var(--ds-surface-2)] px-4 py-6 text-center">
            <p className="m-0 mb-3 text-[13px] text-[var(--ds-muted)]">
              No upcoming events. Every event is in the past.
            </p>
            <Button variant="outline" size="sm" onClick={() => setAdding(true)}>
              <Plus className="size-3.5" /> Add event
            </Button>
          </div>
        ) : (
          <ul className="m-0 p-0 list-none">
            {upcoming.map((ev) => (
              <li
                key={ev.id}
                className="group flex items-center gap-3 rounded-[var(--ds-r-m)] px-2.5 py-2.5 hover:bg-[var(--ds-surface-2)]"
              >
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                    <span className="truncate text-[13.5px] font-medium text-[var(--ds-ink)]">
                      {ev.label}
                    </span>
                    <StatusPill tone={EVENT_KIND_TONE[ev.kind]} size="sm">
                      {EVENT_KIND_LABEL[ev.kind]}
                    </StatusPill>
                  </div>
                  <div className="mt-0.5 truncate text-[12.5px] text-[var(--ds-muted)]">
                    {formatEventWhen(ev.whenISO)}
                    {ev.detail && <>, {ev.detail}</>}
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => deleteEvent(ev.id)}
                  className="text-[var(--ds-muted)] hover:text-[var(--ds-red-fg)] opacity-0 group-hover:opacity-100 transition shrink-0"
                  title="Delete event"
                >
                  <Trash2 className="size-3.5" />
                </button>
              </li>
            ))}
          </ul>
        )}

        {adding && (
          <div className="mt-1 rounded-[calc(var(--ds-r-l)-5px)] bg-[var(--ds-surface-2)] px-3 py-3">
            <div className="grid grid-cols-1 sm:grid-cols-[1fr_auto_auto] gap-2">
              <input
                autoFocus
                type="text"
                value={label}
                onChange={(e) => setLabel(e.target.value)}
                placeholder="Event title (e.g. Witness interview)"
                className="text-[13px] px-2.5 py-1.5 rounded-[var(--ds-r-s)] border border-[var(--ds-line)] bg-[var(--ds-surface)] text-[var(--ds-ink)] outline-none focus:border-[var(--ds-focus)]"
                onKeyDown={(e) => {
                  if (e.key === "Escape") resetForm();
                }}
              />
              <select
                value={kind}
                onChange={(e) => setKind(e.target.value as EventKind)}
                className="text-[13px] px-2.5 py-1.5 rounded-[var(--ds-r-s)] border border-[var(--ds-line)] bg-[var(--ds-surface)] text-[var(--ds-ink)] outline-none"
              >
                <option value="meeting">Meeting</option>
                <option value="hearing">Hearing</option>
                <option value="deadline">Deadline</option>
                <option value="review">Review</option>
              </select>
              <input
                type="datetime-local"
                value={when}
                onChange={(e) => setWhen(e.target.value)}
                className="text-[13px] px-2.5 py-1.5 rounded-[var(--ds-r-s)] border border-[var(--ds-line)] bg-[var(--ds-surface)] text-[var(--ds-ink)] outline-none"
              />
            </div>
            <div className="mt-2 flex flex-col sm:flex-row gap-2">
              <input
                type="text"
                value={detail}
                onChange={(e) => setDetail(e.target.value)}
                placeholder="Optional detail (location, participants)"
                className="flex-1 text-[13px] px-2.5 py-1.5 rounded-[var(--ds-r-s)] border border-[var(--ds-line)] bg-[var(--ds-surface)] text-[var(--ds-ink)] outline-none focus:border-[var(--ds-focus)]"
              />
              <div className="flex gap-2">
                <Button size="sm" onClick={onSave} disabled={!label.trim() || !when}>
                  Save
                </Button>
                <Button variant="outline" size="sm" onClick={resetForm}>
                  Cancel
                </Button>
              </div>
            </div>
          </div>
        )}
      </div>
    </motion.section>
  );
}
