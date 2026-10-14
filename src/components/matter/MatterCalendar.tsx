import { useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import type { EventKind, MatterEvent } from "@/lib/letters/types";
import { useDraftStore } from "@/lib/store";
import { formatDateOnly, parseDateOnly } from "@/lib/date-only";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Pill, type PillTone } from "@/components/ds";
import { CardLink, SectionCard } from "./cards";
import { KitSelect } from "./KitSelect";
import { DatePicker } from "@/components/wizard/DatePicker";

/** Quarter-hour times in 24-hour UK style, "00:00" to "23:45". */
const TIMES = Array.from({ length: 96 }, (_, i) => `${String(Math.floor(i / 4)).padStart(2, "0")}:${String((i % 4) * 15).padStart(2, "0")}`);

const EVENT_KIND_LABEL: Record<EventKind, string> = {
  meeting: "Meeting",
  hearing: "Hearing",
  deadline: "Deadline",
  review: "Review",
};

const EVENT_KINDS: EventKind[] = ["meeting", "hearing", "deadline", "review"];

const EVENT_KIND_TONE: Record<EventKind, PillTone> = {
  meeting: "blue",
  hearing: "amber",
  deadline: "red",
  review: "green",
};

/** "18 May 2026, 10:00", or the date alone when there is no time. */
function formatEventWhen(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  const hasTime = iso.includes("T") || iso.includes(":");
  if (!hasTime) {
    // A bare date parses as UTC midnight; format it from local parts.
    return formatDateOnly(iso, { day: "numeric", month: "short", year: "numeric" }, "en-GB");
  }
  return `${d.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}, ${d.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })}`;
}

/** Matter events (meetings, hearings, deadlines, reviews) with add and delete. */
export function MatterCalendar({ matterId, events }: { matterId: string; events: MatterEvent[] }) {
  const createEvent = useDraftStore((s) => s.createEvent);
  const deleteEvent = useDraftStore((s) => s.deleteEvent);

  const [adding, setAdding] = useState(false);
  const [label, setLabel] = useState("");
  const [kind, setKind] = useState<EventKind>("meeting");
  const [day, setDay] = useState("");
  const [time, setTime] = useState("");
  const [detail, setDetail] = useState("");

  const now = Date.now();
  const upcoming = events
    .filter((e) => {
      // A date-only value counts for its whole local day.
      const isDateOnly = !e.whenISO.includes("T") && !e.whenISO.includes(":");
      const t = isDateOnly ? (parseDateOnly(e.whenISO)?.getTime() ?? NaN) : new Date(e.whenISO).getTime();
      const threshold = isDateOnly ? now - 24 * 60 * 60 * 1000 : now - 60 * 60 * 1000;
      return !Number.isNaN(t) && t >= threshold;
    })
    .sort((a, b) => a.whenISO.localeCompare(b.whenISO));

  const resetForm = () => {
    setLabel("");
    setKind("meeting");
    setDay("");
    setTime("");
    setDetail("");
    setAdding(false);
  };
  const onSave = () => {
    const trimmed = label.trim();
    if (!trimmed || !day) return;
    // A date alone is a whole-day event; with a time it is "YYYY-MM-DDTHH:mm".
    const whenISO = time ? `${day}T${time}` : day;
    createEvent({ matterId, kind, label: trimmed, whenISO, detail: detail.trim() || undefined });
    resetForm();
  };

  return (
    <SectionCard
      title="Events"
      action={
        <span className="flex items-center gap-3">
          <span className="text-[12.5px] text-[var(--ds-subtle)]">{upcoming.length} upcoming</span>
          {!adding && <CardLink onClick={() => setAdding(true)}>Add event</CardLink>}
        </span>
      }
    >
      {events.length === 0 && !adding ? (
        <EmptyLine text="No upcoming events" onAdd={() => setAdding(true)} />
      ) : upcoming.length === 0 && !adding ? (
        <EmptyLine text="No upcoming events. Every event is in the past." onAdd={() => setAdding(true)} />
      ) : (
        <ul className="m-0 list-none p-0">
          {upcoming.map((ev) => (
            <li key={ev.id} className="flex min-h-[47px] items-center gap-3 border-t border-[var(--ds-line-2)] py-2.5 first:border-t-0">
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                  <span className="truncate text-[13.5px] font-medium text-[var(--ds-ink)]">{ev.label}</span>
                  <Pill tone={EVENT_KIND_TONE[ev.kind]}>{EVENT_KIND_LABEL[ev.kind]}</Pill>
                </div>
                <div className="mt-0.5 truncate text-[12.5px] text-[var(--ds-muted)]">
                  {formatEventWhen(ev.whenISO)}
                  {ev.detail && <>, {ev.detail}</>}
                </div>
              </div>
              <button
                type="button"
                onClick={() => deleteEvent(ev.id)}
                title="Delete event"
                aria-label={`Delete event ${ev.label}`}
                className="grid size-7 shrink-0 place-items-center rounded-[7px] text-[var(--ds-subtle)] outline-none transition-[color,background-color] duration-[120ms] hover:bg-[var(--ds-surface-2)] hover:text-[var(--ds-red-fg)] focus-visible:shadow-[var(--ds-focus-ring)]"
              >
                <Trash2 className="size-3.5" />
              </button>
            </li>
          ))}
        </ul>
      )}

      {adding && (
        <div className="mb-3.5 mt-1 grid gap-2 rounded-[10px] bg-[var(--ds-surface-2)] p-3">
          <Input
            autoFocus
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            placeholder="Event title, for example Witness interview"
            aria-label="Event title"
            className="h-9 text-[14px]"
            onKeyDown={(e) => {
              if (e.key === "Escape") resetForm();
            }}
          />
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-[minmax(0,0.8fr)_minmax(0,1.3fr)_minmax(0,0.8fr)]">
            <KitSelect
              compact
              ariaLabel="Kind"
              value={kind}
              onChange={(v) => setKind(v as EventKind)}
              options={EVENT_KINDS.map((k) => ({ value: k, label: EVENT_KIND_LABEL[k] }))}
            />
            <div className="min-w-0 max-sm:order-last max-sm:col-span-2">
              <DatePicker value={day} onChange={(v) => setDay(v ?? "")} required ariaLabel="Date" placeholder="Date" className="h-9" />
            </div>
            <KitSelect
              compact
              ariaLabel="Time"
              value={time}
              onChange={setTime}
              emptyLabel="No time"
              options={TIMES.map((t) => ({ value: t, label: t }))}
            />
          </div>
          <div className="flex flex-col gap-2 sm:flex-row">
            <Input
              value={detail}
              onChange={(e) => setDetail(e.target.value)}
              placeholder="Optional detail (location, participants)"
              aria-label="Detail"
              className="h-9 flex-1 text-[14px]"
            />
            <div className="flex gap-2">
              <Button size="sm" onClick={onSave} disabled={!label.trim() || !day}>
                Save
              </Button>
              <Button variant="outline" size="sm" onClick={resetForm}>
                Cancel
              </Button>
            </div>
          </div>
        </div>
      )}
    </SectionCard>
  );
}

function EmptyLine({ text, onAdd }: { text: string; onAdd: () => void }) {
  return (
    <div className="mb-3.5 rounded-[10px] bg-[var(--ds-surface-2)] px-4 py-5 text-center">
      <p className="m-0 mb-3 text-[13px] text-[var(--ds-muted)]">{text}</p>
      <Button variant="outline" size="sm" onClick={onAdd}>
        <Plus />
        Add event
      </Button>
    </div>
  );
}
