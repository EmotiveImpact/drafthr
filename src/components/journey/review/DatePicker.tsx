import { useMemo, useState, type KeyboardEvent } from "react";
import { CalendarDays, ChevronLeft, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { fmtDayDateTime } from "./model";

/**
 * "Back by": a date and time field that opens the kit date picker (a 300px
 * calendar with 34px days, the chosen day in near-black) and a row of times.
 * Days and times before `minMs` cannot be chosen.
 */
const TIMES = ["09:00", "12:00", "15:00", "17:00"];
const DOW = ["Mo", "Tu", "We", "Th", "Fr", "Sa", "Su"];

function startOfDay(ms: number): number {
  const d = new Date(ms);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

function withTime(dayMs: number, hhmm: string): number {
  const [h, m] = hhmm.split(":").map(Number);
  const d = new Date(dayMs);
  d.setHours(h, m, 0, 0);
  return d.getTime();
}

function hhmmOf(ms: number): string {
  const d = new Date(ms);
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

export function BackByField({
  id,
  value,
  onChange,
  minMs,
  className,
}: {
  id?: string;
  /** ISO 8601. */
  value: string;
  onChange: (iso: string) => void;
  /** Nothing earlier than this can be picked. */
  minMs: number;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const valueMs = Date.parse(value);
  const valid = Number.isFinite(valueMs);
  const [month, setMonth] = useState(() => {
    const d = new Date(valid ? valueMs : Date.now());
    return new Date(d.getFullYear(), d.getMonth(), 1).getTime();
  });

  const days = useMemo(() => {
    const first = new Date(month);
    const lead = (first.getDay() + 6) % 7; // Monday first
    const start = new Date(first.getFullYear(), first.getMonth(), 1 - lead);
    return Array.from({ length: 42 }, (_, i) => {
      const d = new Date(start.getFullYear(), start.getMonth(), start.getDate() + i);
      return d.getTime();
    });
  }, [month]);

  const minDay = startOfDay(minMs);
  const today = startOfDay(Date.now());
  const chosenDay = valid ? startOfDay(valueMs) : null;
  const chosenTime = valid ? hhmmOf(valueMs) : "12:00";
  const monthDate = new Date(month);
  const monthLabel = monthDate.toLocaleDateString("en-GB", { month: "long", year: "numeric" });
  const tooEarly = valid && valueMs < minMs;

  const pickDay = (dayMs: number) => {
    if (dayMs < minDay) return;
    // Keep the time; move it on to the first allowed time on the earliest day.
    let next = withTime(dayMs, chosenTime);
    if (next < minMs) {
      const later = TIMES.map((t) => withTime(dayMs, t)).find((t) => t >= minMs);
      next = later ?? withTime(dayMs + 86400000, TIMES[1]);
    }
    onChange(new Date(next).toISOString());
  };

  const pickTime = (t: string) => {
    const day = chosenDay ?? Math.max(today, minDay);
    const next = withTime(day, t);
    if (next < minMs) return;
    onChange(new Date(next).toISOString());
  };

  const onGridKey = (e: KeyboardEvent<HTMLDivElement>) => {
    if (!chosenDay) return;
    const step = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -7, ArrowDown: 7 }[e.key];
    if (!step) return;
    e.preventDefault();
    const d = new Date(chosenDay);
    d.setDate(d.getDate() + step);
    const ms = d.getTime();
    if (ms < minDay) return;
    pickDay(ms);
    if (new Date(ms).getMonth() !== monthDate.getMonth()) {
      setMonth(new Date(new Date(ms).getFullYear(), new Date(ms).getMonth(), 1).getTime());
    }
    requestAnimationFrame(() => {
      document.querySelector<HTMLButtonElement>(`[data-cal-day="${ms}"]`)?.focus();
    });
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          id={id}
          type="button"
          aria-invalid={tooEarly || undefined}
          className={cn(
            "flex h-10 w-full items-center gap-2 rounded-[10px] border border-[var(--ds-line)] bg-[var(--ds-surface)] px-3 text-left text-[14.5px] text-[var(--ds-ink)] transition-colors duration-[120ms] outline-none hover:border-[var(--ds-line-strong)] focus-visible:shadow-[var(--ds-focus-ring)] aria-invalid:border-[var(--ds-red-line)]",
            className
          )}
        >
          <CalendarDays aria-hidden className="size-4 shrink-0 text-[var(--ds-muted)]" strokeWidth={1.6} />
          <span className="truncate">{valid ? fmtDayDateTime(valueMs) : "Choose a date"}</span>
        </button>
      </PopoverTrigger>
      <PopoverContent
        align="end"
        className="w-[300px] rounded-[14px] p-3.5"
        onOpenAutoFocus={(e) => {
          e.preventDefault();
          const el = document.querySelector<HTMLButtonElement>(
            chosenDay ? `[data-cal-day="${chosenDay}"]` : "[data-cal-day]:not(:disabled)"
          );
          el?.focus();
        }}
      >
        <div className="mb-2.5 flex items-center justify-between text-[14px] font-medium text-[var(--ds-ink)]">
          <span aria-live="polite">{monthLabel}</span>
          <span className="flex gap-1 text-[var(--ds-subtle)]">
            <button
              type="button"
              aria-label="Previous month"
              disabled={new Date(month).getTime() <= new Date(new Date(minMs).getFullYear(), new Date(minMs).getMonth(), 1).getTime()}
              onClick={() => setMonth(new Date(monthDate.getFullYear(), monthDate.getMonth() - 1, 1).getTime())}
              className="grid size-7 place-items-center rounded-[7px] transition-colors duration-[120ms] hover:bg-[var(--ds-surface-2)] hover:text-[var(--ds-ink)] disabled:opacity-35"
            >
              <ChevronLeft className="size-4" strokeWidth={1.6} />
            </button>
            <button
              type="button"
              aria-label="Next month"
              onClick={() => setMonth(new Date(monthDate.getFullYear(), monthDate.getMonth() + 1, 1).getTime())}
              className="grid size-7 place-items-center rounded-[7px] transition-colors duration-[120ms] hover:bg-[var(--ds-surface-2)] hover:text-[var(--ds-ink)]"
            >
              <ChevronRight className="size-4" strokeWidth={1.6} />
            </button>
          </span>
        </div>
        <div role="grid" aria-label={monthLabel} onKeyDown={onGridKey} className="grid grid-cols-7 gap-0.5 text-center text-[13px]">
          {DOW.map((d) => (
            <b key={d} role="columnheader" className="py-1 text-[11.5px] font-medium text-[var(--ds-subtle)]">
              {d}
            </b>
          ))}
          {days.map((ms) => {
            const d = new Date(ms);
            const outside = d.getMonth() !== monthDate.getMonth();
            const past = ms < minDay;
            const on = chosenDay === ms;
            return (
              <button
                key={ms}
                type="button"
                role="gridcell"
                data-cal-day={ms}
                aria-selected={on}
                aria-label={d.toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long" })}
                tabIndex={on ? 0 : -1}
                disabled={past}
                onClick={() => pickDay(ms)}
                className={cn(
                  "grid h-[34px] place-items-center rounded-[8px] text-[var(--ds-body)] outline-none transition-colors duration-[120ms] hover:bg-[var(--ds-surface-2)] focus-visible:shadow-[var(--ds-focus-ring)] disabled:cursor-default disabled:text-[var(--ds-faint)] disabled:hover:bg-transparent",
                  outside && "text-[var(--ds-faint)]",
                  ms === today && !on && "shadow-[inset_0_0_0_1px_var(--ds-line)]",
                  on && "bg-[var(--ds-ink)] text-[var(--ds-on-accent)] hover:bg-[var(--ds-ink)]"
                )}
              >
                {d.getDate()}
              </button>
            );
          })}
        </div>
        <div className="mt-2.5 flex flex-wrap items-center gap-1.5 border-t border-[var(--ds-line-2)] pt-2.5" role="radiogroup" aria-label="Time">
          {TIMES.map((t) => {
            const day = chosenDay ?? Math.max(today, minDay);
            const disabled = withTime(day, t) < minMs;
            const on = valid && chosenTime === t;
            return (
              <button
                key={t}
                type="button"
                role="radio"
                aria-checked={on}
                disabled={disabled}
                onClick={() => pickTime(t)}
                className={cn(
                  "h-8 rounded-[8px] border px-2.5 text-[13px] tabular-nums transition-colors duration-[120ms] outline-none focus-visible:shadow-[var(--ds-focus-ring)] disabled:opacity-35",
                  on
                    ? "border-[var(--ds-ink)] bg-[var(--ds-ink)] text-[var(--ds-on-accent)]"
                    : "border-[var(--ds-line)] text-[var(--ds-body)] hover:bg-[var(--ds-surface-2)]"
                )}
              >
                {t}
              </button>
            );
          })}
          <button
            type="button"
            onClick={() => setOpen(false)}
            className="ml-auto h-8 rounded-[8px] px-2.5 text-[13px] font-medium text-[var(--ds-ink)] transition-colors duration-[120ms] hover:bg-[var(--ds-surface-2)]"
          >
            Done
          </button>
        </div>
      </PopoverContent>
    </Popover>
  );
}
