import { useState } from "react";
import { motion } from "framer-motion";
import { CalendarDays, Plus, Trash2 } from "lucide-react";
import type { EventKind, MatterEvent } from "@/lib/letters/types";
import { useDraftStore } from "@/lib/store";
import { formatDateOnly } from "@/lib/date-only";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const EVENT_KIND_LABEL: Record<EventKind, string> = {
  meeting: "Meeting",
  hearing: "Hearing",
  deadline: "Deadline",
  review: "Review",
};

const EVENT_KIND_TONE: Record<EventKind, string> = {
  meeting: "bg-[var(--ds-blue-bg)] text-[var(--ds-blue-fg)]",
  hearing: "bg-[var(--ds-amber-bg)] text-[var(--ds-amber-fg)]",
  deadline: "bg-[var(--ds-red-bg)] text-[var(--ds-red-fg)]",
  review: "bg-[var(--ds-green-bg)] text-[var(--ds-green-fg)]",
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
    return formatDateOnly(iso, { day: "2-digit", month: "short" });
  }
  return `${d.toLocaleDateString(undefined, {
    day: "2-digit",
    month: "short",
  })} ${d.toLocaleTimeString(undefined, {
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
      const t = new Date(e.whenISO).getTime();
      return !Number.isNaN(t) && t >= now - 60 * 60 * 1000; // include past hour
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
      className="mb-5"
    >
      <div className="rounded-lg border border-[var(--ds-line)] bg-[var(--ds-surface)] overflow-hidden">
        <div className="flex items-center justify-between px-4 py-2.5 border-b border-[var(--ds-line-2)]">
          <h2 className="text-[11px] font-semibold uppercase tracking-[0.08em] text-[var(--ds-muted)] m-0 flex items-center gap-1.5">
            <CalendarDays className="size-3" /> Calendar
            <span className="text-[var(--ds-muted)] font-mono ml-1">
              {upcoming.length} upcoming
            </span>
          </h2>
          {!adding && (
            <button
              type="button"
              onClick={() => setAdding(true)}
              className="text-[11px] text-[var(--ds-muted)] hover:text-[var(--ds-ink)] inline-flex items-center gap-1"
            >
              <Plus className="size-3" /> Add event
            </button>
          )}
        </div>

        {events.length === 0 && !adding ? (
          <div className="px-4 py-6 text-center">
            <p className="text-[13px] text-[var(--ds-muted)] m-0 mb-2">
              No upcoming events
            </p>
            <Button variant="outline" size="sm" onClick={() => setAdding(true)}>
              <Plus className="size-3.5" /> Add event
            </Button>
          </div>
        ) : upcoming.length === 0 && !adding ? (
          <div className="px-4 py-6 text-center">
            <p className="text-[13px] text-[var(--ds-muted)] m-0 mb-2">
              No upcoming events — all past
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
                className="flex items-center gap-3 px-4 py-2.5 border-t border-[var(--ds-line-2)] first:border-t-0 group"
              >
                <span
                  className={cn(
                    "text-[10px] px-1.5 py-[1px] rounded-full font-medium shrink-0",
                    EVENT_KIND_TONE[ev.kind]
                  )}
                >
                  {EVENT_KIND_LABEL[ev.kind]}
                </span>
                <span className="text-[11px] font-mono text-[var(--ds-muted)] tabular-nums shrink-0 min-w-[105px]">
                  {formatEventWhen(ev.whenISO)}
                </span>
                <div className="flex-1 min-w-0">
                  <div className="text-[13px] text-[var(--ds-ink)] truncate">
                    {ev.label}
                  </div>
                  {ev.detail && (
                    <div className="text-[11px] text-[var(--ds-muted)] truncate">
                      {ev.detail}
                    </div>
                  )}
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
          <div className="border-t border-[var(--ds-line-2)] px-4 py-3 bg-[var(--ds-surface-2)]">
            <div className="grid grid-cols-1 sm:grid-cols-[1fr_auto_auto] gap-2">
              <input
                autoFocus
                type="text"
                value={label}
                onChange={(e) => setLabel(e.target.value)}
                placeholder="Event title (e.g. Witness interview)"
                className="text-[13px] px-2.5 py-1.5 rounded-md border border-[var(--ds-line)] bg-[var(--ds-surface)] text-[var(--ds-ink)] outline-none focus:ring-2 focus:ring-[var(--ds-line)]"
                onKeyDown={(e) => {
                  if (e.key === "Escape") resetForm();
                }}
              />
              <select
                value={kind}
                onChange={(e) => setKind(e.target.value as EventKind)}
                className="text-[13px] px-2.5 py-1.5 rounded-md border border-[var(--ds-line)] bg-[var(--ds-surface)] text-[var(--ds-ink)] outline-none"
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
                className="text-[13px] px-2.5 py-1.5 rounded-md border border-[var(--ds-line)] bg-[var(--ds-surface)] text-[var(--ds-ink)] outline-none"
              />
            </div>
            <div className="mt-2 flex flex-col sm:flex-row gap-2">
              <input
                type="text"
                value={detail}
                onChange={(e) => setDetail(e.target.value)}
                placeholder="Optional detail (location, participants…)"
                className="flex-1 text-[13px] px-2.5 py-1.5 rounded-md border border-[var(--ds-line)] bg-[var(--ds-surface)] text-[var(--ds-ink)] outline-none focus:ring-2 focus:ring-[var(--ds-line)]"
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
