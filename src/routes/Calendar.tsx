import { useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/Badge";
import { CalendarClock, Download, ArrowUpRight, ChevronLeft } from "lucide-react";
import { useDraftStore } from "@/lib/store";
import { getLetterMeta } from "@/lib/letters/catalog";
import type { Draft } from "@/lib/letters/types";

type Event = {
  draftId: string;
  iso: string;
  daysAway: number;
  label: string;
  basis: string;
  kind: "tribunal" | "acas_ec" | "advisor" | "remedy" | "appeal" | "acceptance";
};

/**
 * Calendar — chronological list of all deadlines extracted from your drafts.
 * Sources:
 *   - draft.context.protectedDeadline (computed at creation from "date of act")
 *   - answers.advisorDeadline / answers.remedyDeadline / answers.appealDeadline /
 *     answers.acceptanceDeadline (typed on case-by-case wizards)
 *   - For UK tribunal-bound letters, an ACAS Early Conciliation deadline 6 weeks
 *     before the tribunal limitation.
 *
 * Exports as `.ics` so you can drop it into your real calendar.
 */
export function Calendar() {
  const nav = useNavigate();
  const drafts = useDraftStore((s) => s.drafts);

  const events = useMemo(() => extractEvents(Object.values(drafts)), [drafts]);

  const upcoming = events.filter((e) => e.daysAway >= 0);
  const past = events.filter((e) => e.daysAway < 0);

  const onExportIcs = () => {
    const ics = buildIcs(events);
    const blob = new Blob([ics], { type: "text/calendar" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `hr-letter-deadlines-${new Date().toISOString().slice(0, 10)}.ics`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  return (
    <div className="mx-auto max-w-5xl px-6 py-8 space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-3">
        <div>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => nav(-1)}
            className="text-muted-foreground -ml-3 mb-2 h-7"
          >
            <ChevronLeft className="size-3.5 mr-1" /> Back
          </Button>
          <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground mb-1">
            Calendar
          </p>
          <h1 className="text-2xl font-semibold tracking-tight mb-1">Deadlines</h1>
          <p className="text-sm text-muted-foreground max-w-2xl">
            Tribunal limitation periods, ACAS Early Conciliation windows, advisor sign-off
            deadlines, and any remedy / acceptance dates from your drafts. Export to your
            calendar so nothing slips.
          </p>
        </div>
        <Button onClick={onExportIcs} disabled={events.length === 0}>
          <Download className="size-3.5 mr-1.5" />
          Export to .ics
        </Button>
      </div>

      {events.length === 0 && (
        <div className="rounded-md border border-dashed border-letter-rule p-10 text-center">
          <CalendarClock className="size-5 mx-auto mb-2 text-muted-foreground" />
          <p className="text-sm font-medium">No deadlines yet.</p>
          <p className="text-xs text-muted-foreground mt-1">
            Deadlines appear here when you start a tribunal-bound letter (employee mode) or
            enter an acceptance / remedy / advisor date in any wizard.
          </p>
        </div>
      )}

      {upcoming.length > 0 && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <CalendarClock className="size-4" />
              Upcoming ({upcoming.length})
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <ul className="divide-y divide-sidebar-border">
              {upcoming.map((e, i) => (
                <EventRow key={`u-${i}`} ev={e} onOpen={() => nav(`/editor/${e.draftId}`)} />
              ))}
            </ul>
          </CardContent>
        </Card>
      )}

      {past.length > 0 && (
        <Card className="opacity-70">
          <CardHeader className="pb-3">
            <CardTitle className="text-base text-muted-foreground">Passed ({past.length})</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <ul className="divide-y divide-sidebar-border">
              {past.map((e, i) => (
                <EventRow key={`p-${i}`} ev={e} onOpen={() => nav(`/editor/${e.draftId}`)} past />
              ))}
            </ul>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function EventRow({ ev, onOpen, past }: { ev: Event; onOpen: () => void; past?: boolean }) {
  const tone =
    past
      ? "border-letter-rule"
      : ev.daysAway < 14
      ? "bg-rose-50/40"
      : ev.daysAway < 30
      ? "bg-amber-50/40"
      : "";
  return (
    <li
      className={`px-6 py-3 grid grid-cols-[8ch_1fr_auto] sm:grid-cols-[12ch_1fr_auto_5ch] items-center gap-3 hover:bg-muted/30 cursor-pointer ${tone}`}
      onClick={onOpen}
    >
      <div className="text-xs text-muted-foreground tabular-nums">{formatDate(ev.iso)}</div>
      <div className="min-w-0">
        <div className="text-sm font-medium truncate">{ev.label}</div>
        <div className="text-xs text-muted-foreground truncate">{ev.basis}</div>
      </div>
      <Badge className={KIND_PILL[ev.kind]}>{KIND_LABEL[ev.kind]}</Badge>
      <span className="text-xs text-muted-foreground tabular-nums hidden sm:block text-right">
        {ev.daysAway < 0 ? "passed" : `${ev.daysAway}d`}
      </span>
      <ArrowUpRight className="size-3.5 text-muted-foreground sm:hidden" />
    </li>
  );
}

const KIND_LABEL: Record<Event["kind"], string> = {
  tribunal: "tribunal",
  acas_ec: "acas EC",
  advisor: "advisor",
  remedy: "remedy",
  appeal: "appeal",
  acceptance: "acceptance",
};

const KIND_PILL: Record<Event["kind"], string> = {
  tribunal: "bg-rose-50 text-rose-900 border-rose-200",
  acas_ec: "bg-amber-50 text-amber-900 border-amber-200",
  advisor: "bg-blue-50 text-blue-900 border-blue-200",
  remedy: "bg-amber-50 text-amber-900 border-amber-200",
  appeal: "bg-purple-50 text-purple-900 border-purple-200",
  acceptance: "bg-green-50 text-green-900 border-green-200",
};

function extractEvents(drafts: Draft[]): Event[] {
  const out: Event[] = [];
  for (const d of drafts) {
    const meta = (() => {
      try {
        return getLetterMeta(d.letterType);
      } catch {
        return null;
      }
    })();
    const label = meta?.shortTitle ?? d.letterType;

    // 1) Tribunal limitation
    const dl = d.context.protectedDeadline;
    if (dl) {
      out.push({
        draftId: d.id,
        iso: dl.iso,
        daysAway: daysBetween(dl.iso),
        label: `${label} — limitation expires`,
        basis: dl.basis,
        kind: "tribunal",
      });

      // 2) Derived ACAS EC deadline = 6 weeks before tribunal (UK only)
      if (d.context.jurisdiction === "UK") {
        const ec = subtractDays(dl.iso, 42);
        out.push({
          draftId: d.id,
          iso: ec,
          daysAway: daysBetween(ec),
          label: `${label} — ACAS EC by`,
          basis: "Lodge ACAS Early Conciliation at least 6 weeks before tribunal limitation",
          kind: "acas_ec",
        });
      }
    }

    // 3) Specific wizard-supplied dates
    const a = d.answers as Record<string, unknown>;
    pushIfDate(out, d.id, a.advisorDeadline, `${label} — advisor sign-off`, "Advisor certification deadline (settlement)", "advisor");
    pushIfDate(out, d.id, a.remedyDeadline, `${label} — remedy by`, "Demanded remedy deadline", "remedy");
    pushIfDate(out, d.id, a.appealDeadline, `${label} — appeal by`, "Appeal must be lodged by", "appeal");
    pushIfDate(out, d.id, a.acceptanceDeadline, `${label} — acceptance by`, "Acceptance deadline (offer)", "acceptance");
    pushIfDate(out, d.id, a.demandDeadline, `${label} — payment by`, "Pay-dispute demand deadline", "remedy");
    pushIfDate(out, d.id, a.reviewDate, `${label} — performance review`, "PIP / probation review date", "remedy");
  }

  out.sort((a, b) => a.iso.localeCompare(b.iso));
  return out;
}

function pushIfDate(
  arr: Event[],
  draftId: string,
  v: unknown,
  label: string,
  basis: string,
  kind: Event["kind"]
) {
  if (typeof v !== "string" || !v) return;
  if (!/^\d{4}-\d{2}-\d{2}/.test(v)) return;
  arr.push({ draftId, iso: v, daysAway: daysBetween(v), label, basis, kind });
}

function daysBetween(iso: string): number {
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return 9999;
  return Math.floor((t - Date.now()) / 86400000);
}

function subtractDays(iso: string, days: number): string {
  const d = new Date(iso);
  d.setDate(d.getDate() - days);
  return d.toISOString().slice(0, 10);
}

function formatDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" });
}

function buildIcs(events: Event[]): string {
  const stamp = (iso: string) => iso.replace(/-/g, "");
  const now = new Date().toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//HR Letter//Calendar//EN",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
  ];
  for (const e of events) {
    const date = stamp(e.iso);
    lines.push(
      "BEGIN:VEVENT",
      `UID:${e.draftId}-${e.kind}@hr-letter`,
      `DTSTAMP:${now}`,
      `DTSTART;VALUE=DATE:${date}`,
      `DTEND;VALUE=DATE:${date}`,
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
