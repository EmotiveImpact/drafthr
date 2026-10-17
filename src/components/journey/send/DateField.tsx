import { useMemo, useState } from "react";
import { Calendar, ChevronLeft, ChevronRight } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { parseDateOnly, toDateOnly, todayDateOnly } from "@/lib/date-only";
import { cn } from "@/lib/utils";

/**
 * A date field that opens a small month calendar (Radix popover: keyboard
 * reachable, Esc closes, focus returns to the field). Values are local
 * calendar dates (YYYY-MM-DD). `max` / `min` disable days outside the range.
 */
export function DateField({
  id,
  value,
  onChange,
  max,
  min,
  disabled,
  label,
  display,
  className,
  triggerClassName,
  children,
  align = "start",
}: {
  id?: string;
  value: string | null;
  onChange: (v: string) => void;
  max?: string;
  min?: string;
  disabled?: boolean;
  /** Accessible name of the trigger ("Date given, Wed 14 Oct"). */
  label: string;
  /** How the value reads in the field ("Wed 14 Oct"). */
  display?: string;
  className?: string;
  triggerClassName?: string;
  /** Replaces the default field look (e.g. a "Pick a date" button). */
  children?: React.ReactNode;
  align?: "start" | "end" | "center";
}) {
  const [open, setOpen] = useState(false);
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild disabled={disabled}>
        {children ? (
          (children as React.ReactElement)
        ) : (
          <button
            id={id}
            type="button"
            aria-label={label}
            disabled={disabled}
            className={cn(
              "flex h-[34px] w-full min-w-0 items-center gap-1.5 rounded-[8px] border border-[var(--ds-line)] bg-[var(--ds-surface)] px-2.5 text-left text-[13px] text-[var(--ds-ink)] outline-none transition-[border-color,box-shadow] duration-[120ms]",
              "hover:border-[var(--ds-line-hover)] focus-visible:border-[var(--ds-ink)] focus-visible:shadow-[var(--ds-focus-ring)] data-[state=open]:border-[var(--ds-ink)]",
              "disabled:pointer-events-none disabled:bg-[var(--ds-surface-2)] disabled:text-[var(--ds-muted)]",
              triggerClassName
            )}
          >
            <Calendar aria-hidden className="size-3.5 shrink-0 text-[var(--ds-subtle)]" />
            <span className="min-w-0 truncate">{display ?? value ?? "Pick a date"}</span>
          </button>
        )}
      </PopoverTrigger>
      <PopoverContent align={align} className={cn("w-[264px] p-3", className)}>
        <MonthGrid
          value={value}
          max={max}
          min={min}
          onPick={(v) => {
            onChange(v);
            setOpen(false);
          }}
        />
      </PopoverContent>
    </Popover>
  );
}

const WEEKDAYS = ["Mo", "Tu", "We", "Th", "Fr", "Sa", "Su"];

function MonthGrid({
  value,
  max,
  min,
  onPick,
}: {
  value: string | null;
  max?: string;
  min?: string;
  onPick: (v: string) => void;
}) {
  const today = todayDateOnly();
  const start = parseDateOnly(value ?? today) ?? new Date();
  const [cursor, setCursor] = useState(() => new Date(start.getFullYear(), start.getMonth(), 1));
  const days = useMemo(() => {
    const first = new Date(cursor.getFullYear(), cursor.getMonth(), 1);
    // Monday-first grid.
    const lead = (first.getDay() + 6) % 7;
    const count = new Date(cursor.getFullYear(), cursor.getMonth() + 1, 0).getDate();
    const out: Array<string | null> = Array.from({ length: lead }, () => null);
    for (let d = 1; d <= count; d++) out.push(toDateOnly(new Date(cursor.getFullYear(), cursor.getMonth(), d)));
    return out;
  }, [cursor]);
  const monthLabel = cursor.toLocaleDateString("en-GB", { month: "long", year: "numeric" });
  const step = (n: number) => setCursor((c) => new Date(c.getFullYear(), c.getMonth() + n, 1));
  const nextDisabled = !!max && toDateOnly(new Date(cursor.getFullYear(), cursor.getMonth() + 1, 1)) > max;
  const prevDisabled = !!min && toDateOnly(new Date(cursor.getFullYear(), cursor.getMonth(), 0)) < min;

  return (
    <div>
      <div className="mb-2 flex items-center justify-between">
        <button
          type="button"
          onClick={() => step(-1)}
          disabled={prevDisabled}
          aria-label="Previous month"
          className="grid size-7 place-items-center rounded-[7px] text-[var(--ds-muted)] outline-none transition-colors duration-[120ms] hover:bg-[var(--ds-surface-2)] focus-visible:shadow-[var(--ds-focus-ring)] disabled:pointer-events-none disabled:opacity-40"
        >
          <ChevronLeft className="size-4" />
        </button>
        <span className="text-[13px] font-medium text-[var(--ds-ink)]" aria-live="polite">
          {monthLabel}
        </span>
        <button
          type="button"
          onClick={() => step(1)}
          disabled={nextDisabled}
          aria-label="Next month"
          className="grid size-7 place-items-center rounded-[7px] text-[var(--ds-muted)] outline-none transition-colors duration-[120ms] hover:bg-[var(--ds-surface-2)] focus-visible:shadow-[var(--ds-focus-ring)] disabled:pointer-events-none disabled:opacity-40"
        >
          <ChevronRight className="size-4" />
        </button>
      </div>
      <div className="grid grid-cols-7 gap-0.5 text-center" role="grid" aria-label={monthLabel}>
        {WEEKDAYS.map((w) => (
          <span key={w} className="pb-1 text-[11px] text-[var(--ds-subtle)]" aria-hidden>
            {w}
          </span>
        ))}
        {days.map((d, i) =>
          d ? (
            <button
              key={d}
              type="button"
              onClick={() => onPick(d)}
              disabled={(!!max && d > max) || (!!min && d < min)}
              aria-pressed={d === value}
              aria-label={parseDateOnly(d)?.toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long", year: "numeric" })}
              className={cn(
                "grid h-8 place-items-center rounded-[7px] text-[12.5px] tabular-nums outline-none transition-colors duration-[120ms] focus-visible:shadow-[var(--ds-focus-ring)] disabled:pointer-events-none disabled:text-[var(--ds-faint)]",
                d === value
                  ? "bg-[var(--ds-ink)] font-medium text-[var(--ds-on-accent)]"
                  : d === today
                    ? "font-medium text-[var(--ds-ink)] ring-1 ring-[var(--ds-line-strong)] ring-inset hover:bg-[var(--ds-surface-2)]"
                    : "text-[var(--ds-body)] hover:bg-[var(--ds-surface-2)]"
              )}
            >
              {Number(d.slice(8))}
            </button>
          ) : (
            <span key={`b${i}`} aria-hidden />
          )
        )}
      </div>
    </div>
  );
}
