import { useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@radix-ui/themes";
import { CalendarClock, Download, ArrowUpRight } from "lucide-react";
import { PageHeader, EmptyState } from "@/components/ds";
import { PageShell, SectionLabel, StatusPill } from "@/components/reports/parts";
import { cn } from "@/lib/utils";
import { useDraftStore } from "@/lib/store";
import { getLetterMeta } from "@/lib/letters/catalog";
import type { Draft } from "@/lib/letters/types";
import {
  addDaysToDateOnly,
  daysUntilDateOnly,
  formatDateOnly,
  todayDateOnly,
} from "@/lib/date-only";

type Event = {
  draftId: string;
  iso: string;
  daysAway: number;
  label: string;
  basis: string;
  kind: "tribunal" | "acas_ec" | "advisor" | "remedy" | "appeal" | "acceptance" | "send_by";
};

const KIND_LABEL: Record<Event["kind"], string> = {
  tribunal: "Tribunal",
  acas_ec: "ACAS EC",
  advisor: "Advisor",
  remedy: "Remedy",
  appeal: "Appeal",
  acceptance: "Acceptance",
  send_by: "Send by",
};

export function Calendar() {
  const nav = useNavigate();
  const drafts = useDraftStore((s) => s.drafts);

  const events = useMemo(
    () =>
      extractEvents(Object.values(drafts).filter((d) => !d.isTemplateSource)),
    [drafts]
  );
  const upcoming = events.filter((e) => e.daysAway >= 0);
  const past = events.filter((e) => e.daysAway < 0);
  const months = useMemo(() => groupByMonth(upcoming), [upcoming]);

  const onExportIcs = () => {
    const ics = buildIcs(events);
    const blob = new Blob([ics], { type: "text/calendar" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `drafthr-deadlines-${todayDateOnly()}.ics`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  return (
    <PageShell>
      <PageHeader
        crumbs={[{ label: "Calendar" }]}
        title="Deadlines"
        lede="Tribunal limitation periods, ACAS Early Conciliation windows, advisor sign-off deadlines, and any remedy or acceptance dates from your drafts."
        actions={
          <Button onClick={onExportIcs} disabled={events.length === 0}>
            <Download className="size-3.5" /> Export to calendar (.ics)
          </Button>
        }
      />

      {events.length === 0 && (
        <div className="rounded-[var(--ds-r-l)] border border-[var(--ds-line)]">
          <EmptyState
            icon={CalendarClock}
            title="No deadlines yet"
            body="Deadlines appear here when you start a tribunal-bound letter, or when you enter an acceptance, remedy or advisor date in a wizard."
            primary={{ label: "Start a letter", to: "/" }}
          />
        </div>
      )}

      <div className="flex flex-col gap-9">
        {months.map(([month, list]) => (
          <section key={month}>
            <SectionLabel hint={list.length === 1 ? "1 deadline" : `${list.length} deadlines`}>
              {month}
            </SectionLabel>
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
              {list.map((e, i) => (
                <EventCard key={`u-${month}-${i}`} ev={e} onOpen={() => nav(`/editor/${e.draftId}`)} />
              ))}
            </div>
          </section>
        ))}

        {past.length > 0 && (
          <section>
            <SectionLabel hint="Dates that have already gone by.">
              Passed <span className="ds-mono ml-1 text-[12px] font-normal text-[var(--ds-muted)]">{past.length}</span>
            </SectionLabel>
            <div className="flex flex-col">
              {past.map((e, i) => (
                <PastRow key={`p-${i}`} ev={e} first={i === 0} onOpen={() => nav(`/editor/${e.draftId}`)} />
              ))}
            </div>
          </section>
        )}
      </div>
    </PageShell>
  );
}

function groupByMonth(list: Event[]): [string, Event[]][] {
  const out = new Map<string, Event[]>();
  for (const e of list) {
    const key = formatDateOnly(e.iso.slice(0, 7) + "-01", { month: "long", year: "numeric" }, "en-GB");
    const arr = out.get(key) ?? [];
    arr.push(e);
    out.set(key, arr);
  }
  return [...out.entries()];
}

function daysLeftLabel(days: number): string {
  if (days === 0) return "Today";
  if (days === 1) return "1 day left";
  return `${days} days left`;
}

function EventCard({ ev, onOpen }: { ev: Event; onOpen: () => void }) {
  const urgent = ev.daysAway < 14;
  const soon = !urgent && ev.daysAway < 30;
  return (
    <button
      type="button"
      onClick={onOpen}
      className={cn(
        "group flex min-w-0 cursor-pointer flex-col rounded-[var(--ds-r-m)] px-4 pb-4 pt-3.5 text-left transition hover:shadow-[var(--ds-shadow-m)]",
        urgent ? "bg-[var(--ds-red-bg)]" : soon ? "bg-[var(--ds-amber-bg)]" : "bg-[var(--ds-surface-2)]"
      )}
    >
      <span className="flex items-center justify-between gap-3 text-[12.5px]">
        <span className="flex min-w-0 items-center gap-1.5 text-[var(--ds-muted)]">
          <CalendarClock className="size-3.5 shrink-0" aria-hidden />
          <span className="truncate">{ev.label}</span>
        </span>
        <span
          className={cn(
            "shrink-0 font-medium",
            urgent ? "text-[var(--ds-red-fg)]" : soon ? "text-[var(--ds-amber-fg)]" : "text-[var(--ds-body)]"
          )}
        >
          {daysLeftLabel(ev.daysAway)}
        </span>
      </span>
      <span className="ds-title mt-2 text-[24px] leading-tight">{formatLongDate(ev.iso)}</span>
      <span className="mt-1.5 text-[12.5px] leading-snug text-[var(--ds-muted)]">{ev.basis}</span>
      <span className="mt-3 flex items-center gap-2">
        <span className="ds-mono inline-flex h-[22px] items-center gap-1 rounded-[var(--ds-r-s)] bg-[var(--ds-surface)] px-1.5 text-[11.5px] text-[var(--ds-body)] shadow-[0_0_0_1px_var(--ds-line)]">
          <span className="grid size-3.5 place-items-center rounded-[3px] bg-[var(--ds-ink)] text-[9px] font-semibold text-[var(--ds-on-accent)]">
            §
          </span>
          {KIND_LABEL[ev.kind]}
        </span>
        <ArrowUpRight className="ml-auto size-3.5 text-[var(--ds-muted)] group-hover:text-[var(--ds-ink)]" aria-hidden />
      </span>
    </button>
  );
}

function PastRow({ ev, onOpen, first }: { ev: Event; onOpen: () => void; first: boolean }) {
  return (
    <button
      type="button"
      onClick={onOpen}
      className={cn(
        "relative flex w-full cursor-pointer items-center gap-3 rounded-[var(--ds-r-m)] px-3 py-3 text-left hover:bg-[var(--ds-surface-2)]",
        !first && "before:absolute before:inset-x-3 before:top-0 before:border-t before:border-[var(--ds-line)]"
      )}
    >
      <span className="ds-mono w-24 shrink-0 text-[12px] text-[var(--ds-muted)]">{formatDate(ev.iso)}</span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[13.5px] font-medium text-[var(--ds-body)]">{ev.label}</span>
        <span className="block truncate text-[12px] text-[var(--ds-muted)]">{ev.basis}</span>
      </span>
      <StatusPill tone="neutral" dot={false} size="sm" className="hidden sm:inline-flex">
        {KIND_LABEL[ev.kind]}
      </StatusPill>
      <span className="hidden text-[12px] text-[var(--ds-faint)] sm:inline">passed</span>
      <ArrowUpRight className="size-3.5 shrink-0 text-[var(--ds-muted)]" aria-hidden />
    </button>
  );
}

function extractEvents(drafts: Draft[]): Event[] {
  const out: Event[] = [];
  for (const d of drafts) {
    const meta = (() => {
      try { return getLetterMeta(d.letterType); } catch { return null; }
    })();
    const label = meta?.shortTitle ?? d.letterType;

    const dl = d.context.protectedDeadline;
    if (dl) {
      out.push({
        draftId: d.id,
        iso: dl.iso,
        daysAway: daysBetween(dl.iso),
        label: `${label}: limitation expires`,
        basis: dl.basis,
        kind: "tribunal",
      });
      if (d.context.jurisdiction === "UK") {
        const ec = subtractDays(dl.iso, 42);
        out.push({
          draftId: d.id,
          iso: ec,
          daysAway: daysBetween(ec),
          label: `${label}: ACAS EC by`,
          basis: "Lodge ACAS Early Conciliation at least 6 weeks before tribunal limitation",
          kind: "acas_ec",
        });
      }
    }

    const a = d.answers as Record<string, unknown>;
    pushIfDate(out, d.id, a.advisorDeadline, `${label}: advisor sign-off`, "Advisor certification deadline (settlement)", "advisor");
    pushIfDate(out, d.id, a.remedyDeadline, `${label}: remedy by`, "Demanded remedy deadline", "remedy");
    pushIfDate(out, d.id, a.appealDeadline, `${label}: appeal by`, "Appeal must be lodged by", "appeal");
    pushIfDate(out, d.id, a.acceptanceDeadline, `${label}: acceptance by`, "Acceptance deadline (offer)", "acceptance");
    pushIfDate(out, d.id, a.demandDeadline, `${label}: payment by`, "Pay-dispute demand deadline", "remedy");
    pushIfDate(out, d.id, a.reviewDate, `${label}: performance review`, "PIP / probation review date", "remedy");
    pushIfDate(out, d.id, a.sendBy, `${label}: send by`, "Target date for the letter to go out", "send_by");
  }
  out.sort((a, b) => a.iso.localeCompare(b.iso));
  return out;
}

function pushIfDate(arr: Event[], draftId: string, v: unknown, label: string, basis: string, kind: Event["kind"]) {
  if (typeof v !== "string" || !v) return;
  if (!/^\d{4}-\d{2}-\d{2}/.test(v)) return;
  arr.push({ draftId, iso: v, daysAway: daysBetween(v), label, basis, kind });
}

function daysBetween(iso: string): number {
  return daysUntilDateOnly(iso);
}

function subtractDays(iso: string, days: number): string {
  return addDaysToDateOnly(iso, -days);
}

function formatLongDate(iso: string): string {
  return formatDateOnly(iso, { day: "numeric", month: "long", year: "numeric" }, "en-GB");
}

function formatDate(iso: string): string {
  return formatDateOnly(iso, { day: "numeric", month: "short", year: "numeric" }, "en-GB");
}

function buildIcs(events: Event[]): string {
  const stamp = (iso: string) => iso.replace(/-/g, "");
  const now = new Date().toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//DRAFTHR//Calendar//EN",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
  ];
  for (let i = 0; i < events.length; i++) {
    const e = events[i];
    const date = stamp(e.iso);
    const nextDate = stamp(addDaysToDateOnly(e.iso, 1));
    // UID must be unique per VEVENT. Several distinct answer fields share a
    // single `kind` (e.g. remedyDeadline, demandDeadline and reviewDate all
    // map to "remedy"), so `draftId-kind` alone collides when a draft has
    // more than one populated: calendar apps dedupe same-UID events on
    // import and silently drop the extras. Fold in the date and index.
    lines.push(
      "BEGIN:VEVENT",
      `UID:${e.draftId}-${e.kind}-${date}-${i}@drafthr.app`,
      `DTSTAMP:${now}`,
      `DTSTART;VALUE=DATE:${date}`,
      `DTEND;VALUE=DATE:${nextDate}`,
      `SUMMARY:${escapeIcs(e.label)}`,
      `DESCRIPTION:${escapeIcs(e.basis)}`,
      "END:VEVENT"
    );
  }
  lines.push("END:VCALENDAR");
  return lines.join("\r\n");
}

function escapeIcs(s: string): string {
  return s.replace(/\\/g, "\\\\").replace(/\n/g, "\\n").replace(/,/g, "\\,").replace(/;/g, "\\;");
}
