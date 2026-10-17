import { useMemo, useRef, useState, type ReactNode } from "react";
import { Link, useNavigate } from "react-router-dom";
import {
  CalendarClock,
  CalendarDays,
  CalendarPlus,
  ChevronDown,
  FileText,
  ChevronLeft,
  ChevronRight,
  Folder,
  ListFilter,
  User,
} from "lucide-react";
import { useDraftStore } from "@/lib/store";
import { useProfileStore } from "@/lib/profile";
import { todayDateOnly } from "@/lib/date-only";
import { EmptyState, Pill } from "@/components/ds";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { BAND_BTN_GHOST, Band, HomeBand } from "@/components/home/HomeBand";
import { useHomeData } from "@/components/home/homeData";
import {
  EVENT_TONE,
  EVENT_TYPE_LABEL,
  EVENT_TYPES,
  allCalendarEvents,
  buildIcs,
  daysLeftLabel,
  daysLeftTone,
  type CalendarEvent,
  type CalendarEventType,
} from "@/components/home/calendarEvents";
import { FADE_IN_GROUP, ListPlaceholder } from "@/components/home/HomeParts";
import { useLettersLoading } from "@/components/home/loadState";
import { cn } from "@/lib/utils";

type View = "month" | "agenda";

const MONTHS_SHORT = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const TOOL_BTN = cn(BAND_BTN_GHOST, "h-[34px] px-3 text-[13.5px]");
const NAV_BTN =
  "grid size-8 shrink-0 place-items-center rounded-[8px] border border-[var(--ds-line)] bg-[var(--ds-surface)] text-[var(--ds-ink)] transition-colors duration-[120ms] hover:bg-[var(--ds-hover)] active:bg-[var(--ds-surface-2)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--ds-focus)]";

/** yyyy-mm-dd for a local date. */
function iso(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
function monthTitle(y: number, m: number): string {
  return new Date(y, m, 1).toLocaleDateString("en-GB", { month: "long", year: "numeric" });
}
function parts(isoDate: string) {
  const [y, m, d] = isoDate.split("-").map(Number);
  const date = new Date(y, m - 1, d);
  const now = new Date();
  const otherYear = y !== now.getFullYear();
  return {
    weekday: date.toLocaleDateString("en-GB", { weekday: "short" }),
    day: d,
    /** "Apr" under the day when the date is not in this month, so 11 Apr
     *  never reads as 11 Oct. Always three letters (en-GB writes "Sept"). */
    month: otherYear || m - 1 !== now.getMonth() ? MONTHS_SHORT[m - 1] : null,
    /** "2027" on its own line for a date in another year. */
    year: otherYear ? String(y) : null,
    long: date.toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long", ...(otherYear ? { year: "numeric" } : {}) }),
  };
}

/**
 * Calendar (a Home tab for HR, mock calendar): every dated thing on the
 * person's letters (hearings, appeal windows, probation reviews, tribunal
 * time limits, letter responses) and matters (key deadlines, hearings and
 * meetings, the tribunal limit) on a month grid or as an agenda, with
 * what is coming up and an .ics export. Employees and consultants get the
 * same page under their own band, with only their own letters.
 */
export function Calendar() {
  const nav = useNavigate();
  const drafts = useDraftStore((s) => s.drafts);
  const matters = useDraftStore((s) => s.matters);
  const matterEvents = useDraftStore((s) => s.events);
  const role = useProfileStore((s) => s.profile.role);
  const home = useHomeData("employer");
  const loading = useLettersLoading();
  const employer = role === "employer";
  const prefix = role === "employee" ? "/me" : "/hr";

  const all = useMemo(() => {
    const mine = Object.values(drafts).filter((d) => !d.isTemplateSource && (!role || d.mode === role));
    // Consultants have no matters of their own.
    const ownMatters = role === "employer" || role === "employee" ? matters : {};
    return allCalendarEvents(mine, ownMatters, matterEvents, { mode: role === "employee" ? "employee" : "employer" });
  }, [drafts, matters, matterEvents, role]);

  const [matterId, setMatterId] = useState("all");
  const pickedByPointer = useRef(false);
  const events = useMemo(() => (matterId === "all" ? all : all.filter((e) => e.matterId === matterId)), [all, matterId]);
  const matterChoices = useMemo(() => {
    const ids = new Set(all.map((e) => e.matterId).filter(Boolean) as string[]);
    return Object.values(matters)
      .filter((m) => ids.has(m.id) || (m.mode === (role ?? "employer") && m.status === "active"))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [all, matters, role]);
  const matterLabel = matterId === "all" ? "All matters" : (matters[matterId]?.name ?? "All matters");

  const today = new Date();
  const [cursor, setCursor] = useState(() => ({ y: today.getFullYear(), m: today.getMonth() }));
  const [view, setView] = useState<View>(() =>
    typeof window !== "undefined" && window.matchMedia?.("(max-width: 767px)").matches ? "agenda" : "month"
  );

  // The legend is a fixed key with the mock's labels: the five kinds of
  // date every letter can carry, then "Matter deadlines" when the workspace
  // has any (judged on every date, not the matter picked), so the items and
  // their wording never change as the filter or the month changes.
  const legendTypes = useMemo(
    () => EVENT_TYPES.filter((t) => t !== "deadline" || all.some((e) => e.type === "deadline")),
    [all]
  );

  const upcoming = events.filter((e) => e.daysAway >= 0);
  const comingUp = upcoming.slice(0, 4);

  const onExportIcs = () => {
    const blob = new Blob([buildIcs(all)], { type: "text/calendar" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `drafthr-deadlines-${todayDateOnly()}.ics`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  // Band line: deadlines left this month, and how many in the next week,
  // for the matter picked in the filter when there is one.
  const monthKey = iso(today).slice(0, 7);
  const leftThisMonth = events.filter((e) => e.daysAway >= 0 && e.iso.startsWith(monthKey)).length;
  const nextWeek = events.filter((e) => e.daysAway >= 0 && e.daysAway <= 7).length;
  const forMatter = matterId === "all" ? null : <>{matterLabel}: </>;
  const lede =
    leftThisMonth > 0 ? (
      <>
        {forMatter}
        <b>
          {leftThisMonth} {leftThisMonth === 1 ? "deadline" : "deadlines"}
        </b>{" "}
        left this month
        {nextWeek > 0 ? (
          <>
            , <b>{nextWeek}</b> in the next 7 days.
          </>
        ) : (
          "."
        )}
      </>
    ) : upcoming.length > 0 ? (
      <>
        {forMatter}
        No deadlines left this month. Next: <b>{parts(upcoming[0].iso).long}</b>.
      </>
    ) : (
      <>{forMatter}No deadlines coming up.</>
    );

  const shift = (n: number) =>
    setCursor(({ y, m }) => {
      const d = new Date(y, m + n, 1);
      return { y: d.getFullYear(), m: d.getMonth() };
    });

  return (
    <div className="min-w-0">
      {employer ? (
        <HomeBand active="calendar" approvals={home.waiting.length} lede={lede} />
      ) : (
        <Band crumbs={[{ label: "Home", href: role === "employee" ? "/me" : "/c" }, { label: "Calendar" }]} title="Calendar" lede={lede} />
      )}

      <div
        className={cn(
          "grid min-w-0 grid-cols-1 gap-8 px-4 pt-5 pb-12 md:px-12 md:pt-[26px]",
          all.length > 0 && "xl:grid-cols-[minmax(0,1fr)_300px]"
        )}
      >
        <div className="min-w-0">
          {/* Toolbar */}
          <div className="mb-3 flex flex-wrap items-center gap-2.5">
            {view === "month" ? (
              <>
                <h2 className="ds-title m-0 mr-1.5 text-[26px] leading-none tracking-[-0.018em] whitespace-nowrap">
                  {monthTitle(cursor.y, cursor.m)}
                </h2>
                <button type="button" aria-label="Previous month" className={NAV_BTN} onClick={() => shift(-1)}>
                  <ChevronLeft className="size-4" aria-hidden />
                </button>
                <button type="button" aria-label="Next month" className={NAV_BTN} onClick={() => shift(1)}>
                  <ChevronRight className="size-4" aria-hidden />
                </button>
                <button
                  type="button"
                  className={TOOL_BTN}
                  onClick={() => setCursor({ y: today.getFullYear(), m: today.getMonth() })}
                >
                  Today
                </button>
              </>
            ) : (
              <h2 className="ds-title m-0 mr-1.5 text-[26px] leading-none tracking-[-0.018em]">Agenda</h2>
            )}
            <span className="flex-1" />
            <div role="radiogroup" aria-label="View" className="inline-flex h-[34px] rounded-[9px] bg-[var(--ds-surface-2)] p-[3px]">
              {(["month", "agenda"] as View[]).map((v) => (
                <button
                  key={v}
                  type="button"
                  role="radio"
                  aria-checked={view === v}
                  onClick={() => setView(v)}
                  className={cn(
                    "rounded-[7px] px-3 text-[13.5px] transition-colors duration-[120ms] focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-[var(--ds-focus)]",
                    view === v
                      ? "bg-[var(--ds-surface)] font-medium text-[var(--ds-ink)] shadow-[var(--ds-shadow-s)]"
                      : "text-[var(--ds-muted)] hover:text-[var(--ds-ink)]"
                  )}
                >
                  {v === "month" ? "Month" : "Agenda"}
                </button>
              ))}
            </div>
            <button type="button" className={TOOL_BTN} onClick={onExportIcs} disabled={all.length === 0}>
              <CalendarPlus className="size-4" aria-hidden />
              Export to calendar
            </button>
          </div>

          {loading ? (
            <ListPlaceholder rows={4} label="Loading deadlines" />
          ) : all.length === 0 ? (
            <div className="rounded-[14px] border border-[var(--ds-line)]">
              <EmptyState
                icon={CalendarClock}
                title="No deadlines yet"
                body="Deadlines appear here when you start a tribunal-bound letter, or when you enter an acceptance, remedy or advisor date in a wizard. A deadline or hearing set on a matter shows here too."
                primary={{ label: "Start a letter", to: `${prefix}/new` }}
              />
            </div>
          ) : (
            <>
              {/* Legend and matter filter on one row (mock calendar `.lg`). */}
              <LegendRow types={legendTypes}>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <button
                      type="button"
                      aria-label={`Matter: ${matterLabel}`}
                      title={matterLabel}
                      className="ml-auto inline-flex max-w-[200px] min-w-0 shrink-0 items-center gap-[5px] rounded-[6px] px-1 py-0.5 text-[12.5px] text-[var(--ds-ink)] outline-none transition-colors duration-[120ms] hover:bg-[var(--ds-hover)] focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-[var(--ds-focus)] data-[state=open]:bg-[var(--ds-hover)]"
                    >
                      <ListFilter className="size-3.5 shrink-0" aria-hidden />
                      <span className="min-w-0 truncate">{matterLabel}</span>
                      <ChevronDown className="size-3.5 shrink-0" aria-hidden />
                    </button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent
                    align="end"
                    className="max-w-[280px] min-w-[220px]"
                    // Picked with the keyboard: focus goes back to the button.
                    // Picked with the pointer: no focus ring is left behind.
                    onPointerDown={() => (pickedByPointer.current = true)}
                    onKeyDown={() => (pickedByPointer.current = false)}
                    onCloseAutoFocus={(ev) => {
                      if (pickedByPointer.current) ev.preventDefault();
                      pickedByPointer.current = false;
                    }}
                  >
                    <DropdownMenuRadioGroup value={matterId} onValueChange={setMatterId}>
                      <DropdownMenuRadioItem value="all">All matters</DropdownMenuRadioItem>
                      {matterChoices.length > 0 && <DropdownMenuSeparator />}
                      {matterChoices.map((m) => (
                        <DropdownMenuRadioItem key={m.id} value={m.id}>
                          <span className="truncate">{m.name}</span>
                        </DropdownMenuRadioItem>
                      ))}
                    </DropdownMenuRadioGroup>
                  </DropdownMenuContent>
                </DropdownMenu>
              </LegendRow>

              <div key={`${view}:${matterId}`} className={FADE_IN_GROUP}>
                {view === "month" ? (
                  <MonthGrid y={cursor.y} m={cursor.m} events={events} onOpen={(href) => nav(href)} />
                ) : (
                  <Agenda events={events} />
                )}
              </div>
            </>
          )}
        </div>

        {all.length > 0 && (
          <aside className="min-w-0">
            <section
              aria-label="Coming up"
              className="rounded-[16px] border border-[var(--ds-line)] bg-[var(--ds-surface)] px-5 pt-5 pb-1.5"
            >
              <header className="mb-1.5 flex items-center justify-between">
                <h2 className="ds-title m-0 text-[22px] leading-tight tracking-[-0.015em]">Coming up</h2>
                {upcoming.length > 0 && (
                  <button
                    type="button"
                    onClick={() => setView("agenda")}
                    className="rounded-[4px] text-[13.5px] text-[var(--ds-ink)] underline-offset-[3px] hover:underline"
                  >
                    View all
                  </button>
                )}
              </header>
              {comingUp.length === 0 ? (
                <p className="m-0 pb-4 text-[13.5px] text-[var(--ds-muted)]">
                  Nothing coming up{matterId === "all" ? "" : " for this matter"}.
                </p>
              ) : (
                <ul className="m-0 list-none p-0">
                  {comingUp.map((e) => (
                    <EventRow key={e.id} e={e} />
                  ))}
                </ul>
              )}
            </section>
            <p className="m-0 mt-3.5 flex items-center gap-2.5 rounded-[12px] bg-[var(--ds-surface-2)] px-3 py-2.5 text-[12.5px] leading-snug text-[var(--ds-muted)]">
              <CalendarDays className="size-4 shrink-0" aria-hidden />
              <span>
                <b className="font-medium text-[var(--ds-ink)]">Export to calendar</b> adds these dates to Outlook, Google
                or Apple Calendar.
              </span>
            </p>
          </aside>
        )}
      </div>
    </div>
  );
}

/* ─── Legend row ───────────────────────────────────────────────────── */

/**
 * The legend and the matter filter on one row, as in the mock. The legend
 * always uses the full labels; when they do not all fit beside the filter
 * (a sixth kind, a long matter name) the legend wraps onto a second line
 * rather than switching to other words. The lines are balanced, so a wrap
 * splits the key evenly (three and three) and no label is left alone on
 * the second line (HOME-X38). The filter keeps its own width (up to
 * 200px); on a phone it drops below the legend.
 */
function LegendRow({ types, children }: { types: CalendarEventType[]; children: ReactNode }) {
  return (
    <div className="mb-3 flex min-w-0 flex-wrap items-start gap-x-3 gap-y-2">
      <div
        data-testid="calendar-legend"
        // A block of inline items (not a flex row) so `text-wrap: balance`
        // can even out the lines when the key wraps.
        className="min-w-[min(100%,340px)] flex-[1_1_0%] pt-px text-[12.5px] leading-[19px] text-[var(--ds-muted)] [text-wrap:balance]"
      >
        {types.map((t) => (
          <span key={t} className="mr-3.5 inline-flex items-center gap-1.5 whitespace-nowrap align-top last:mr-0">
            <i aria-hidden className="inline-block size-2 shrink-0 rounded-[3px]" style={{ background: EVENT_TONE[t].fg }} />
            {EVENT_TYPE_LABEL[t]}
          </span>
        ))}
      </div>
      {children}
    </div>
  );
}

/* ─── Month grid ───────────────────────────────────────────────────── */

function MonthGrid({
  y,
  m,
  events,
  onOpen,
}: {
  y: number;
  m: number;
  events: CalendarEvent[];
  onOpen: (href: string) => void;
}) {
  const todayIso = iso(new Date());
  const first = new Date(y, m, 1);
  const lead = (first.getDay() + 6) % 7; // Monday first
  const daysInMonth = new Date(y, m + 1, 0).getDate();
  const weeks = Math.ceil((lead + daysInMonth) / 7);
  const byDay = useMemo(() => {
    const map = new Map<string, CalendarEvent[]>();
    for (const e of events) {
      const list = map.get(e.iso) ?? [];
      list.push(e);
      map.set(e.iso, list);
    }
    return map;
  }, [events]);

  const cells = Array.from({ length: weeks * 7 }, (_, i) => new Date(y, m, 1 - lead + i));

  return (
    <div
      role="grid"
      aria-label={`${monthTitle(y, m)} deadlines`}
      className="overflow-hidden rounded-[14px] border border-[var(--ds-line)]"
    >
      <div role="row" className="grid grid-cols-7 border-b border-[var(--ds-line)]">
        {WEEKDAYS.map((w) => (
          <span key={w} role="columnheader" className="truncate px-1.5 py-2 text-[12px] font-medium text-[var(--ds-subtle)] md:px-2.5">
            {w}
          </span>
        ))}
      </div>
      {Array.from({ length: weeks }, (_, w) => (
        <div role="row" key={w} className="grid grid-cols-7 border-b border-[var(--ds-line-2)] last:border-b-0">
          {cells.slice(w * 7, w * 7 + 7).map((d, i) => {
            const key = iso(d);
            const out = d.getMonth() !== m;
            const weekend = i >= 5;
            const isToday = key === todayIso;
            const list = out ? [] : (byDay.get(key) ?? []);
            const more = list.length - 1;
            return (
              <div
                role="gridcell"
                key={key}
                aria-label={`${parts(key).long}${list.length ? `, ${list.length} ${list.length === 1 ? "deadline" : "deadlines"}` : ""}`}
                className={cn(
                  "flex h-[104px] min-w-0 flex-col gap-[3px] overflow-hidden border-r border-[var(--ds-line-2)] px-1 pt-1.5 last:border-r-0 md:px-1.5",
                  weekend && "bg-[var(--ds-hover)]"
                )}
              >
                <span
                  className={cn(
                    "flex h-6 shrink-0 items-center px-1 text-[12.5px]",
                    out ? "text-[var(--ds-faint)]" : "text-[var(--ds-muted)]"
                  )}
                >
                  {isToday ? (
                    <b className="-ml-1 grid h-[22px] min-w-[22px] place-items-center rounded-[7px] bg-[var(--ds-ink)] px-1 text-[12px] font-medium text-[var(--ds-on-accent)]">
                      {d.getDate()}
                    </b>
                  ) : (
                    d.getDate()
                  )}
                </span>
                {list[0] && <EventChip e={list[0]} onOpen={onOpen} />}
                {more > 0 && (
                  <Popover>
                    <PopoverTrigger asChild>
                      <button
                        type="button"
                        className="self-start rounded-[5px] px-1 text-left text-[11.5px] font-medium text-[var(--ds-muted)] transition-colors duration-[120ms] hover:bg-[var(--ds-surface-2)] hover:text-[var(--ds-ink)]"
                      >
                        +{more} more
                      </button>
                    </PopoverTrigger>
                    <PopoverContent align="start" className="w-[240px] p-2.5">
                      <p className="m-0 mb-2 px-0.5 text-[12.5px] font-medium text-[var(--ds-ink)]">{parts(key).long}</p>
                      <div className="flex flex-col gap-1">
                        {list.map((e) => (
                          <EventChip key={e.id} e={e} onOpen={onOpen} />
                        ))}
                      </div>
                    </PopoverContent>
                  </Popover>
                )}
              </div>
            );
          })}
        </div>
      ))}
    </div>
  );
}

function EventChip({ e, onOpen }: { e: CalendarEvent; onOpen: (href: string) => void }) {
  const past = e.daysAway < 0;
  const tone = EVENT_TONE[e.type];
  return (
    <button
      type="button"
      onClick={() => onOpen(e.href)}
      aria-label={`${[e.title, e.person || e.matterName].filter(Boolean).join(", ")}, ${parts(e.iso).long}${past ? ", passed" : ""}. ${e.draftId ? "Open the letter" : "Open the matter"}`}
      title={[e.title, e.person, e.matterName].filter(Boolean).join(" · ")}
      className="block w-full min-w-0 shrink-0 overflow-hidden rounded-[7px] px-[7px] py-[5px] text-left text-[11.5px] leading-[1.25] whitespace-nowrap transition-[filter] duration-[120ms] hover:brightness-[0.97] focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-[var(--ds-focus)]"
      style={past ? { background: "var(--ds-surface-2)", color: "var(--ds-subtle)" } : { background: tone.bg, color: tone.fg }}
    >
      <b
        className={cn(
          "block truncate",
          past ? "font-medium line-through decoration-[var(--ds-faint)]" : "font-semibold"
        )}
      >
        {e.chip}
      </b>
      <span className="block truncate">{e.person || e.matterName}</span>
    </button>
  );
}

/* ─── Rows (Coming up and Agenda) ──────────────────────────────────── */

function EventRow({ e, wide = false }: { e: CalendarEvent; wide?: boolean }) {
  const p = parts(e.iso);
  const tone = daysLeftTone(e);
  // Under the title: the matter (with the person when the matter's name
  // does not say who), else the employee the letter is for.
  const person = e.person && e.person !== "No name yet" ? e.person : "";
  const where = e.matterName
    ? person && !e.matterName.toLowerCase().includes(person.toLowerCase())
      ? `${e.matterName} · ${person}`
      : e.matterName
    : person || e.letter;
  return (
    <li className="border-t border-[var(--ds-line-2)] first:border-t-0">
      <Link
        to={e.href}
        className={cn(
          "-mx-2 flex gap-3.5 rounded-[10px] px-2 py-3 transition-colors duration-[120ms] hover:bg-[var(--ds-hover)] active:bg-[var(--ds-surface-2)] focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-[var(--ds-focus)]",
          wide && "md:items-center"
        )}
      >
        <span
          title={p.long}
          className="w-[42px] shrink-0 self-start rounded-[10px] border border-[var(--ds-line)] pt-[5px] pb-1.5 text-center"
        >
          <span className="sr-only">{p.long}</span>
          <span aria-hidden className="block text-[10.5px] font-medium tracking-[0.06em] text-[var(--ds-subtle)] uppercase">
            {p.weekday}
          </span>
          <b aria-hidden className="mt-px block text-[18px] leading-tight font-medium tracking-[-0.02em] text-[var(--ds-ink)]">
            {p.day}
          </b>
          {p.month && (
            <span
              aria-hidden
              data-testid="date-block-month"
              className="block text-[10.5px] leading-tight font-medium tracking-[0.04em] whitespace-nowrap text-[var(--ds-subtle)] uppercase"
            >
              {p.month}
            </span>
          )}
          {p.year && (
            <span
              aria-hidden
              data-testid="date-block-year"
              className="block text-[10.5px] leading-tight font-medium tracking-[0.04em] whitespace-nowrap text-[var(--ds-subtle)] tabular-nums"
            >
              {p.year}
            </span>
          )}
        </span>
        <span className={cn("min-w-0 flex-1", wide && "md:flex md:items-center md:gap-4")}>
          <span className={cn("block min-w-0", wide && "md:flex-1")}>
            {/* The whole title, wrapping when it is long, so a time at the
             * end ("Return-to-work meeting, 14:00") is never cut off. */}
            <span className="flex min-w-0 items-start gap-[7px] text-[14px] leading-[1.35] text-[var(--ds-ink)]">
              <i
                aria-hidden
                className="mt-[6px] inline-block size-[7px] shrink-0 rounded-[2px]"
                style={{ background: EVENT_TONE[e.type].fg }}
              />
              <span className="min-w-0 [overflow-wrap:anywhere]">{e.title}</span>
            </span>
            {where && (
              <span className="mt-[3px] flex min-w-0 items-center gap-[5px] text-[12.5px] text-[var(--ds-muted)]">
                {e.matterName ? (
                  <Folder className="size-[13px] shrink-0 text-[var(--ds-subtle)]" aria-label="Matter" />
                ) : person ? (
                  <User className="size-[13px] shrink-0 text-[var(--ds-subtle)]" aria-label="Employee" />
                ) : (
                  <FileText className="size-[13px] shrink-0 text-[var(--ds-subtle)]" aria-label="Letter" />
                )}
                <span className="truncate">{where}</span>
              </span>
            )}
          </span>
          <span className={cn("mt-[7px] flex flex-wrap items-center gap-1.5", wide && "md:mt-0 md:shrink-0")}>
            <Pill tone={tone}>{daysLeftLabel(e.daysAway)}</Pill>
            {e.citation && (
              <span
                title={e.basis}
                className="inline-flex h-[22px] max-w-[170px] items-center truncate rounded-[6px] border border-[var(--ds-line)] bg-[var(--ds-surface)] px-1.5 text-[11.5px] text-[var(--ds-body)]"
              >
                {e.citation}
              </span>
            )}
          </span>
        </span>
      </Link>
    </li>
  );
}

function Agenda({ events }: { events: CalendarEvent[] }) {
  const upcoming = events.filter((e) => e.daysAway >= 0);
  const past = events.filter((e) => e.daysAway < 0).reverse();
  const groups = useMemo(() => {
    const map = new Map<string, CalendarEvent[]>();
    for (const e of upcoming) {
      const k = e.iso.slice(0, 7);
      map.set(k, [...(map.get(k) ?? []), e]);
    }
    return [...map.entries()];
  }, [upcoming]);

  if (events.length === 0) {
    return (
      <p className="m-0 rounded-[14px] border border-[var(--ds-line)] px-5 py-8 text-center text-[13.5px] text-[var(--ds-muted)]">
        No deadlines for this matter.
      </p>
    );
  }
  return (
    <div className="flex flex-col gap-6">
      {groups.map(([k, list]) => {
        const [yy, mm] = k.split("-").map(Number);
        return (
          <AgendaGroup key={k} title={monthTitle(yy, mm - 1)} list={list} />
        );
      })}
      {past.length > 0 && <AgendaGroup title="Passed" list={past} />}
    </div>
  );
}

function AgendaGroup({ title, list }: { title: string; list: CalendarEvent[] }) {
  return (
    <section aria-label={title}>
      <h3 className="m-0 mb-1 flex items-baseline gap-2 text-[15px] font-semibold text-[var(--ds-ink)]">
        {title}
        <span className="text-[12.5px] font-normal text-[var(--ds-subtle)]">{list.length}</span>
      </h3>
      <ul className="m-0 list-none rounded-[14px] border border-[var(--ds-line)] px-4 py-0.5">
        {list.map((e) => (
          <EventRow key={e.id} e={e} wide />
        ))}
      </ul>
    </section>
  );
}
