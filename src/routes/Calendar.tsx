import { useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { Badge, Box, Button, Card, Flex, Heading, Text } from "@radix-ui/themes";
import { CalendarClock, Download, ArrowUpRight } from "lucide-react";
import { PageHeader, EmptyState } from "@/components/ds";
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
  kind: "tribunal" | "acas_ec" | "advisor" | "remedy" | "appeal" | "acceptance";
};

const KIND_COLOR: Record<Event["kind"], "red" | "amber" | "blue" | "purple" | "green"> = {
  tribunal: "red",
  acas_ec: "amber",
  advisor: "blue",
  remedy: "amber",
  appeal: "purple",
  acceptance: "green",
};

const KIND_LABEL: Record<Event["kind"], string> = {
  tribunal: "tribunal",
  acas_ec: "acas EC",
  advisor: "advisor",
  remedy: "remedy",
  appeal: "appeal",
  acceptance: "acceptance",
};

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
    a.download = `drafthr-deadlines-${todayDateOnly()}.ics`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  return (
    <Box className="max-w-5xl px-4 py-6 sm:px-6 sm:py-8">
      <PageHeader
        crumbs={[{ label: "Calendar" }]}
        title="Deadlines"
        lede="Tribunal limitation periods, ACAS Early Conciliation windows, advisor sign-off deadlines, and any remedy / acceptance dates from your drafts."
        actions={
          <Button onClick={onExportIcs} disabled={events.length === 0}>
            <Download className="size-3.5" /> Export to .ics
          </Button>
        }
      />

      {events.length === 0 && (
        <EmptyState
          icon={CalendarClock}
          title="No deadlines yet"
          body="Deadlines appear here when you start a tribunal-bound letter, or when you enter an acceptance / remedy / advisor date in a wizard."
          primary={{ label: "Start a letter", to: "/" }}
        />
      )}

      {upcoming.length > 0 && (
        <Card size="2" mb="4">
          <Flex align="center" gap="2" mb="3">
            <CalendarClock className="size-4" />
            <Heading size="3">Upcoming ({upcoming.length})</Heading>
          </Flex>
          <Flex direction="column">
            {upcoming.map((e, i) => <EventRow key={`u-${i}`} ev={e} onOpen={() => nav(`/editor/${e.draftId}`)} />)}
          </Flex>
        </Card>
      )}

      {past.length > 0 && (
        <Card size="2" style={{ opacity: 0.7 }}>
          <Heading size="3" color="gray" mb="3">Passed ({past.length})</Heading>
          <Flex direction="column">
            {past.map((e, i) => <EventRow key={`p-${i}`} ev={e} onOpen={() => nav(`/editor/${e.draftId}`)} past />)}
          </Flex>
        </Card>
      )}
    </Box>
  );
}

function EventRow({ ev, onOpen, past }: { ev: Event; onOpen: () => void; past?: boolean }) {
  const bg = past
    ? undefined
    : ev.daysAway < 14
    ? "var(--red-2)"
    : ev.daysAway < 30
    ? "var(--amber-2)"
    : undefined;
  return (
    <button onClick={onOpen} className="text-left">
      <Flex
        align="center"
        gap="3"
        px="4"
        py="3"
        className="hover:bg-[var(--gray-2)] cursor-pointer border-b border-[var(--gray-5)] last:border-b-0"
        style={{ background: bg }}
      >
        <Text size="1" color="gray" className="tabular-nums w-24">{formatDate(ev.iso)}</Text>
        <Box className="flex-1 min-w-0">
          <Text size="2" weight="medium" as="div" className="truncate">{ev.label}</Text>
          <Text size="1" color="gray" as="div" className="truncate">{ev.basis}</Text>
        </Box>
        <Badge color={KIND_COLOR[ev.kind]} variant="soft">{KIND_LABEL[ev.kind]}</Badge>
        <Text size="1" color="gray" className="tabular-nums hidden sm:inline" style={{ minWidth: 48, textAlign: "right" }}>
          {ev.daysAway < 0 ? "passed" : `${ev.daysAway}d`}
        </Text>
        <ArrowUpRight className="size-3.5 text-[var(--gray-9)] sm:hidden" />
      </Flex>
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
        label: `${label} — limitation expires`,
        basis: dl.basis,
        kind: "tribunal",
      });
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

function formatDate(iso: string): string {
  return formatDateOnly(iso, { day: "numeric", month: "short", year: "numeric" });
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
  for (const e of events) {
    const date = stamp(e.iso);
    const nextDate = stamp(addDaysToDateOnly(e.iso, 1));
    lines.push(
      "BEGIN:VEVENT",
      `UID:${e.draftId}-${e.kind}@drafthr.app`,
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
