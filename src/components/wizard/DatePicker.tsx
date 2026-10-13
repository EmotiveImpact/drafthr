import { useMemo, useRef, useState, type KeyboardEvent } from "react";
import {
  addDays,
  addMonths,
  endOfMonth,
  endOfWeek,
  format,
  isSameDay,
  isSameMonth,
  isValid,
  parseISO,
  startOfMonth,
  startOfWeek,
} from "date-fns";
import { enGB } from "date-fns/locale";
import { CalendarDays, ChevronDown, ChevronLeft, ChevronRight } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";

/** "2026-10-08" → Date, or null when empty or malformed. */
export function parseIsoDate(value: unknown): Date | null {
  if (typeof value !== "string" || !value) return null;
  const d = parseISO(value);
  return isValid(d) ? d : null;
}

/** "Thu 8 Oct 2026" (en-GB), or "" when the value is not a date. */
export function formatDateShort(value: unknown): string {
  const d = parseIsoDate(value);
  return d ? format(d, "EEE d MMM yyyy", { locale: enGB }) : "";
}

const WEEKDAYS = ["Mo", "Tu", "We", "Th", "Fr", "Sa", "Su"];

/**
 * Kit date picker (kit 11): a field with a calendar icon that opens a month
 * grid (Mo to Su), today outlined, the chosen day filled ink, days outside
 * the month muted. Stores ISO dates ("2026-10-08"), as the questions expect.
 * Arrow keys move the focused day, Page Up / Page Down change month.
 */
export function DatePicker({
  id,
  value,
  onChange,
  required,
  placeholder = "Pick a date",
  labelledBy,
  ariaLabel,
  min,
  className,
}: {
  id?: string;
  value: unknown;
  onChange: (v: string | undefined) => void;
  required?: boolean;
  placeholder?: string;
  labelledBy?: string;
  /** Accessible name when there is no visible label to point at. */
  ariaLabel?: string;
  /** Earliest pickable day ("2026-10-13"); earlier days are disabled. */
  min?: string;
  /** Extra classes for the field (for example a shorter height). */
  className?: string;
}) {
  const selected = parseIsoDate(value);
  const [open, setOpen] = useState(false);
  const [month, setMonth] = useState<Date>(() => startOfMonth(selected ?? new Date()));
  const [focusDay, setFocusDay] = useState<Date>(() => selected ?? new Date());
  const gridRef = useRef<HTMLDivElement>(null);
  const today = new Date();

  const days = useMemo(() => {
    const start = startOfWeek(startOfMonth(month), { weekStartsOn: 1 });
    const end = endOfWeek(endOfMonth(month), { weekStartsOn: 1 });
    const out: Date[] = [];
    for (let d = start; d <= end; d = addDays(d, 1)) out.push(d);
    return out;
  }, [month]);

  const openChange = (next: boolean) => {
    setOpen(next);
    if (next) {
      const base = selected ?? new Date();
      setMonth(startOfMonth(base));
      setFocusDay(base);
    }
  };

  const pick = (d: Date) => {
    onChange(format(d, "yyyy-MM-dd"));
    setOpen(false);
  };

  const moveFocus = (d: Date) => {
    setFocusDay(d);
    if (!isSameMonth(d, month)) setMonth(startOfMonth(d));
    requestAnimationFrame(() => {
      gridRef.current
        ?.querySelector<HTMLButtonElement>(`[data-day="${format(d, "yyyy-MM-dd")}"]`)
        ?.focus();
    });
  };

  const onGridKey = (e: KeyboardEvent<HTMLDivElement>) => {
    const step: Record<string, number> = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -7, ArrowDown: 7 };
    if (e.key in step) {
      e.preventDefault();
      moveFocus(addDays(focusDay, step[e.key]));
    } else if (e.key === "PageUp" || e.key === "PageDown") {
      e.preventDefault();
      moveFocus(addMonths(focusDay, e.key === "PageUp" ? -1 : 1));
    }
  };

  return (
    <Popover open={open} onOpenChange={openChange}>
      <PopoverTrigger asChild>
        <button
          id={id}
          type="button"
          aria-required={required}
          aria-labelledby={labelledBy ? `${labelledBy} ${id}` : undefined}
          aria-label={ariaLabel ? `${ariaLabel}${selected ? `, ${formatDateShort(value)}` : ""}` : undefined}
          aria-haspopup="dialog"
          className={cn(
            "flex h-10 w-full min-w-0 items-center gap-2 rounded-[10px] border border-[var(--ds-line)] bg-[var(--ds-surface)] px-3 text-left text-[14px] outline-none transition-colors duration-[120ms] hover:border-[var(--ds-line-strong)] focus-visible:border-[var(--ds-ink)] focus-visible:shadow-[var(--ds-focus-ring)] data-[state=open]:border-[var(--ds-ink)]",
            selected ? "text-[var(--ds-ink)]" : "text-[var(--ds-subtle)]",
            className
          )}
        >
          <CalendarDays aria-hidden className="size-[15px] shrink-0 text-[var(--ds-subtle)]" />
          <span className="min-w-0 flex-1 truncate">{selected ? formatDateShort(value) : placeholder}</span>
          <ChevronDown aria-hidden className="size-[15px] shrink-0 text-[var(--ds-faint)]" />
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-[288px] p-3.5">
        <div role="dialog" aria-label="Choose a date">
          <div className="flex items-center justify-between">
            <button
              type="button"
              aria-label="Previous month"
              onClick={() => setMonth((m) => addMonths(m, -1))}
              className="grid size-8 place-items-center rounded-[8px] text-[var(--ds-muted)] transition-colors duration-[120ms] hover:bg-[var(--ds-surface-2)] hover:text-[var(--ds-ink)]"
            >
              <ChevronLeft className="size-4" />
            </button>
            <span aria-live="polite" className="text-[14px] font-medium text-[var(--ds-ink)]">
              {format(month, "MMMM yyyy", { locale: enGB })}
            </span>
            <button
              type="button"
              aria-label="Next month"
              onClick={() => setMonth((m) => addMonths(m, 1))}
              className="grid size-8 place-items-center rounded-[8px] text-[var(--ds-muted)] transition-colors duration-[120ms] hover:bg-[var(--ds-surface-2)] hover:text-[var(--ds-ink)]"
            >
              <ChevronRight className="size-4" />
            </button>
          </div>
          <div className="mt-2 grid grid-cols-7 text-center text-[11.5px] font-medium text-[var(--ds-subtle)]">
            {WEEKDAYS.map((d) => (
              <span key={d} className="py-1.5">
                {d}
              </span>
            ))}
          </div>
          <div ref={gridRef} role="grid" onKeyDown={onGridKey} className="grid grid-cols-7 gap-y-0.5">
            {days.map((d) => {
              const key = format(d, "yyyy-MM-dd");
              const isSel = selected ? isSameDay(d, selected) : false;
              const isToday = isSameDay(d, today);
              const inMonth = isSameMonth(d, month);
              const beforeMin = !!min && key < min;
              return (
                <button
                  key={key}
                  type="button"
                  data-day={key}
                  tabIndex={isSameDay(d, focusDay) ? 0 : -1}
                  aria-pressed={isSel}
                  aria-label={format(d, "EEEE d MMMM yyyy", { locale: enGB })}
                  onClick={() => pick(d)}
                  disabled={beforeMin}
                  className={cn(
                    "mx-auto grid size-9 place-items-center rounded-[9px] text-[13px] tabular-nums outline-none transition-colors duration-[120ms] focus-visible:shadow-[var(--ds-focus-ring)] disabled:pointer-events-none disabled:text-[var(--ds-faint)]",
                    isSel
                      ? "bg-[var(--ds-ink)] font-medium text-[var(--ds-on-accent)]"
                      : cn(
                          "hover:bg-[var(--ds-surface-2)]",
                          inMonth ? "text-[var(--ds-ink)]" : "text-[var(--ds-faint)]",
                          isToday && "border border-[var(--ds-ink)]"
                        )
                  )}
                >
                  {format(d, "d")}
                </button>
              );
            })}
          </div>
          <div className="mt-2.5 flex items-center justify-between border-t border-[var(--ds-line-2)] pt-2.5 text-[13px]">
            <button
              type="button"
              onClick={() => pick(new Date())}
              className="rounded-[6px] px-1.5 py-1 font-medium text-[var(--ds-ink)] hover:bg-[var(--ds-surface-2)]"
            >
              Today
            </button>
            {selected && !required && (
              <button
                type="button"
                onClick={() => {
                  onChange(undefined);
                  setOpen(false);
                }}
                className="rounded-[6px] px-1.5 py-1 text-[var(--ds-muted)] hover:bg-[var(--ds-surface-2)] hover:text-[var(--ds-ink)]"
              >
                Clear
              </button>
            )}
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}
