import { useMemo } from "react";
import { useNavigate } from "react-router-dom";
import {
  Badge,
  Box,
  Button,
  Card,
  Flex,
  Grid,
  Heading,
  IconButton,
  Inset,
  Separator,
  Table,
  Text,
} from "@radix-ui/themes";
import {
  PlusCircle,
  Search,
  FileText,
  CircleCheckBig,
  CalendarClock,
  AlertTriangle,
  TrendingUp,
  ArrowUpRight,
  Trash2,
  ScrollText,
  Mail,
  ShieldAlert,
  Scale,
  FileWarning,
  FileSearch,
  ShieldCheck,
  Sparkles,
} from "lucide-react";
import type { LetterTypeId, Mode } from "@/lib/letters/types";
import { useDraftStore } from "@/lib/store";
import { useProfileStore } from "@/lib/profile";
import { letterCatalogByMode, getLetterMeta } from "@/lib/letters/catalog";

const RISK_BADGE: Record<string, "green" | "amber" | "red"> = {
  low: "green",
  medium: "amber",
  high: "red",
};

const STATUS_BADGE: Record<string, "amber" | "green" | "gray"> = {
  drafting: "amber",
  ready: "green",
  exported: "gray",
  empty: "gray",
};

export function Home({ mode }: { mode: Mode }) {
  const nav = useNavigate();
  const drafts = useDraftStore((s) => s.drafts);
  const deleteDraft = useDraftStore((s) => s.deleteDraft);
  const profile = useProfileStore((s) => s.profile);

  const myDrafts = useMemo(
    () =>
      Object.values(drafts)
        .filter((d) => d.mode === mode)
        .sort((a, b) => b.updatedAt - a.updatedAt),
    [drafts, mode]
  );

  const stats = useMemo(() => deriveStats(myDrafts), [myDrafts]);
  const deadlines = useMemo(() => deriveDeadlines(myDrafts), [myDrafts]);

  const catalog = letterCatalogByMode(mode);
  const flagship = catalog.filter((l) => l.flagshipV1);
  const prefix = mode === "employer" ? "/hr" : "/me";
  const greeting = profile.personal.preferredName
    ? `Hello, ${profile.personal.preferredName}.`
    : "Welcome back.";

  return (
    <Box className="mx-auto max-w-7xl px-4 py-6 sm:px-6 sm:py-8">
      {/* Hero */}
      <Flex justify="between" align={{ initial: "stretch", sm: "end" }} direction={{ initial: "column", sm: "row" }} gap="3" mb="6">
        <Box>
          <Text size="1" color="gray" weight="medium" className="uppercase tracking-[0.18em]">
            {mode === "employer" ? "HR / Management · Home" : "Employee · Home"}
          </Text>
          <Heading size="6" mt="1">{greeting}</Heading>
          <Text size="2" color="gray">
            {myDrafts.length === 0
              ? "Pick a letter type below to get started."
              : `${myDrafts.length} draft${myDrafts.length === 1 ? "" : "s"} · last updated ${timeAgo(myDrafts[0].updatedAt)}`}
          </Text>
        </Box>
        <Flex gap="2">
          <Button variant="outline" color="gray" disabled>
            <Search className="size-3.5" />
            Search
            <Text size="1" color="gray" ml="1">soon</Text>
          </Button>
          <Button onClick={() => nav(`${prefix}/new`)}>
            <PlusCircle className="size-3.5" />
            New letter
          </Button>
        </Flex>
      </Flex>

      {/* Stats row */}
      <Grid columns={{ initial: "2", lg: "4" }} gap="3" mb="5">
        <StatCard label="Total drafts" value={String(stats.total)} hint={stats.inProgress > 0 ? `${stats.inProgress} in progress` : "—"} Icon={FileText} />
        <StatCard label="Ready to export" value={String(stats.ready)} hint={stats.ready > 0 ? "reviewed" : "draft to ready"} Icon={CircleCheckBig} />
        <StatCard
          label="Urgent deadlines"
          value={String(stats.urgent)}
          hint={stats.urgent > 0 ? "< 14 days away" : "none"}
          Icon={AlertTriangle}
          tone={stats.urgent > 0 ? "warn" : undefined}
        />
        <StatCard
          label={`Letters this ${monthLabel()}`}
          value={String(stats.thisMonth)}
          hint={stats.lastMonth > 0 ? `${signed(stats.thisMonth - stats.lastMonth)} vs last month` : "—"}
          Icon={TrendingUp}
        />
      </Grid>

      {/* Drafts table + deadlines */}
      <Grid columns={{ initial: "1", lg: "3" }} gap="4" mb="5">
        <Box gridColumn={{ lg: "span 2" }}>
          <Card size="2">
            <Flex justify="between" align="center" mb="2">
              <Heading size="3">Drafts in progress</Heading>
              <Button variant="ghost" size="1" onClick={() => nav(`${prefix}/new`)}>
                <PlusCircle className="size-3" /> New
              </Button>
            </Flex>
            {myDrafts.length === 0 ? (
              <Box className="py-10 text-center">
                <FileText className="size-5 mx-auto mb-2 text-[var(--gray-9)]" />
                <Text size="2" weight="medium" as="p">No drafts yet.</Text>
                <Text size="1" color="gray" as="p" mt="1">
                  {profile.setupComplete
                    ? "Pick a letter from Quick start below."
                    : "Set up your profile so drafts auto-fill."}
                </Text>
                <Flex gap="2" justify="center" mt="3">
                  {!profile.setupComplete && (
                    <Button variant="outline" size="2" onClick={() => nav("/settings")}>
                      Set up profile
                    </Button>
                  )}
                  <Button size="2" onClick={() => nav(`${prefix}/new`)}>
                    Browse letter types
                  </Button>
                </Flex>
              </Box>
            ) : (
              <Inset side="x" mt="3">
                <Table.Root variant="ghost">
                  <Table.Header>
                    <Table.Row>
                      <Table.ColumnHeaderCell>Letter</Table.ColumnHeaderCell>
                      <Table.ColumnHeaderCell className="hidden sm:table-cell">
                        {mode === "employer" ? "Recipient" : "To"}
                      </Table.ColumnHeaderCell>
                      <Table.ColumnHeaderCell>Status</Table.ColumnHeaderCell>
                      <Table.ColumnHeaderCell className="hidden md:table-cell">Risk</Table.ColumnHeaderCell>
                      <Table.ColumnHeaderCell justify="end">Updated</Table.ColumnHeaderCell>
                      <Table.ColumnHeaderCell />
                    </Table.Row>
                  </Table.Header>
                  <Table.Body>
                    {myDrafts.slice(0, 8).map((d) => {
                      const meta = safeMeta(d.letterType);
                      const status = draftStatus(d);
                      return (
                        <Table.Row
                          key={d.id}
                          className="hover:bg-[var(--gray-2)] cursor-pointer"
                          onClick={() => nav(`/editor/${d.id}`)}
                        >
                          <Table.Cell>
                            <Text weight="medium" size="2">{meta?.shortTitle ?? d.letterType}</Text>
                          </Table.Cell>
                          <Table.Cell className="hidden sm:table-cell">
                            <Text size="1" color="gray">
                              {mode === "employer"
                                ? d.employee.legalName || "(no recipient)"
                                : d.employer.legalName || "(no employer)"}
                            </Text>
                          </Table.Cell>
                          <Table.Cell>
                            <Badge color={STATUS_BADGE[status]} variant="soft">{status}</Badge>
                          </Table.Cell>
                          <Table.Cell className="hidden md:table-cell">
                            {meta && <Badge color={RISK_BADGE[meta.riskClass]} variant="soft">{meta.riskClass}</Badge>}
                          </Table.Cell>
                          <Table.Cell justify="end">
                            <Text size="1" color="gray" className="tabular-nums">{timeAgo(d.updatedAt)}</Text>
                          </Table.Cell>
                          <Table.Cell>
                            <IconButton
                              size="1"
                              variant="ghost"
                              color="gray"
                              onClick={(e) => {
                                e.stopPropagation();
                                if (confirm("Delete this draft?")) deleteDraft(d.id);
                              }}
                              aria-label="Delete draft"
                            >
                              <Trash2 className="size-3.5" />
                            </IconButton>
                          </Table.Cell>
                        </Table.Row>
                      );
                    })}
                  </Table.Body>
                </Table.Root>
              </Inset>
            )}
          </Card>
        </Box>

        {/* Deadlines (employee) or compliance reminders (employer) */}
        {mode === "employee" ? (
          <Card size="2">
            <Flex align="center" gap="2" mb="2">
              <CalendarClock className="size-4 text-[var(--amber-11)]" />
              <Heading size="3">Upcoming deadlines</Heading>
            </Flex>
            <Text size="1" color="gray" as="p" mb="3">
              Tribunal / EEOC limitation periods from your "date of act".
            </Text>
            <Flex direction="column" gap="2">
              {deadlines.length === 0 ? (
                <Text size="1" color="gray">
                  No tribunal-bound drafts. Deadlines appear here when you start a high-risk letter.
                </Text>
              ) : (
                deadlines.map((d) => {
                  const tone =
                    d.daysAway < 0 ? "red" : d.daysAway < 14 ? "red" : d.daysAway < 30 ? "amber" : "gray";
                  return (
                    <Card
                      key={d.id}
                      asChild
                      size="1"
                      style={{
                        background: tone === "red" ? "var(--red-2)" : tone === "amber" ? "var(--amber-2)" : undefined,
                        borderColor: tone === "red" ? "var(--red-6)" : tone === "amber" ? "var(--amber-6)" : undefined,
                      }}
                    >
                      <button onClick={() => nav(`/editor/${d.id}`)} className="text-left w-full">
                        <Flex justify="between" align="center" mb="1">
                          <Text size="2" weight="medium">{d.label}</Text>
                          <Text size="1" color="gray" className="tabular-nums">
                            {d.daysAway < 0 ? "passed" : `${d.daysAway}d`}
                          </Text>
                        </Flex>
                        <Text size="1" color="gray">Deadline {formatDate(d.iso)}</Text>
                      </button>
                    </Card>
                  );
                })
              )}
            </Flex>
          </Card>
        ) : (
          <Card size="2">
            <Flex align="center" gap="2" mb="2">
              <ShieldCheck className="size-4" />
              <Heading size="3">Compliance reminders</Heading>
            </Flex>
            <Text size="1" color="gray" as="p" mb="3">
              High-risk letter types require counsel review before export.
            </Text>
            <Flex direction="column" gap="2">
              <Text size="1" color="gray">
                <Text weight="medium" color="gray" highContrast>UK:</Text> ACAS Code — non-compliance can uplift tribunal awards by up to 25% (s.207A TULRCA).
              </Text>
              <Text size="1" color="gray">
                <Text weight="medium" color="gray" highContrast>US:</Text> WARN 60-day notice (100+ employers, 50+ affected); OWBPA 21 / 7 days for releases by employees 40+.
              </Text>
            </Flex>
          </Card>
        )}
      </Grid>

      <Separator size="4" my="4" />

      {/* Quick start */}
      <Box>
        <Flex justify="between" align="center" mb="3">
          <Heading size="3">Quick start</Heading>
          <Button variant="ghost" size="1" onClick={() => nav(`${prefix}/new`)}>
            Browse all <ArrowUpRight className="size-3" />
          </Button>
        </Flex>
        <Grid columns={{ initial: "1", sm: "2", lg: "4" }} gap="3">
          {flagship.slice(0, 8).map((l) => {
            const Icon = iconForLetter(l.id);
            return (
              <Card
                key={l.id}
                asChild
                size="2"
                className="cursor-pointer hover:border-[var(--accent-7)] transition-colors"
              >
                <button onClick={() => nav(`${prefix}/new/${l.id}`)} className="text-left w-full">
                  <Flex justify="between" align="center" mb="2">
                    <Icon className="size-4 text-[var(--gray-9)]" />
                    <Badge color={RISK_BADGE[l.riskClass]} variant="soft">{l.riskClass}</Badge>
                  </Flex>
                  <Text as="p" size="2" weight="medium" className="leading-tight">{l.shortTitle}</Text>
                  <Text as="p" size="1" color="gray" className="line-clamp-2 leading-relaxed" mt="1">
                    {l.description}
                  </Text>
                </button>
              </Card>
            );
          })}
        </Grid>
      </Box>
    </Box>
  );
}

/* --- helpers --- */

function StatCard({
  label,
  value,
  hint,
  Icon,
  tone,
}: {
  label: string;
  value: string;
  hint: string;
  Icon: typeof FileText;
  tone?: "warn";
}) {
  return (
    <Card
      size="2"
      style={
        tone === "warn"
          ? { background: "var(--amber-2)", borderColor: "var(--amber-6)" }
          : undefined
      }
    >
      <Flex justify="between" align="center" mb="2">
        <Text size="1" color="gray">{label}</Text>
        <Icon className="size-3.5 text-[var(--gray-9)]" />
      </Flex>
      <Heading size="6" weight="medium">{value}</Heading>
      <Text size="1" color="gray" mt="1" as="p">{hint}</Text>
    </Card>
  );
}

function safeMeta(id: string) {
  try {
    return getLetterMeta(id as Parameters<typeof getLetterMeta>[0]);
  } catch {
    return null;
  }
}

function deriveStats(drafts: ReturnType<typeof useDraftStore.getState>["drafts"][string][]) {
  let inProgress = 0,
    ready = 0,
    urgent = 0,
    thisMonth = 0,
    lastMonth = 0;
  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).getTime();
  const lastMonthStart = new Date(now.getFullYear(), now.getMonth() - 1, 1).getTime();

  for (const d of drafts) {
    const status = draftStatus(d);
    if (status === "drafting" || status === "empty") inProgress += 1;
    if (status === "ready") ready += 1;

    const dl = d.context.protectedDeadline;
    if (dl) {
      const days = Math.floor((new Date(dl.iso).getTime() - Date.now()) / 86400000);
      if (days >= 0 && days < 14) urgent += 1;
    }

    if (d.createdAt >= monthStart) thisMonth += 1;
    else if (d.createdAt >= lastMonthStart) lastMonth += 1;
  }
  return { total: drafts.length, inProgress, ready, urgent, thisMonth, lastMonth };
}

function deriveDeadlines(drafts: ReturnType<typeof useDraftStore.getState>["drafts"][string][]) {
  return drafts
    .filter((d) => d.context.protectedDeadline)
    .map((d) => {
      const iso = d.context.protectedDeadline!.iso;
      const daysAway = Math.floor((new Date(iso).getTime() - Date.now()) / 86400000);
      return {
        id: d.id,
        label: safeMeta(d.letterType)?.shortTitle ?? d.letterType,
        iso,
        daysAway,
      };
    })
    .sort((a, b) => a.daysAway - b.daysAway)
    .slice(0, 5);
}

function draftStatus(d: { sections: { status: string; html: string }[] }): "empty" | "drafting" | "ready" | "exported" {
  const all = d.sections;
  if (all.length === 0) return "empty";
  if (all.every((s) => s.status === "empty" && !s.html)) return "empty";
  if (all.every((s) => s.status === "ready")) return "ready";
  if (all.some((s) => s.status === "ready" || s.status === "edited" || s.html)) return "drafting";
  return "empty";
}

function timeAgo(ts: number): string {
  const diff = Date.now() - ts;
  const m = Math.floor(diff / 60000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h`;
  const d = Math.floor(h / 24);
  return `${d}d`;
}

function formatDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" });
}

function monthLabel(): string {
  return new Date().toLocaleDateString(undefined, { month: "long" });
}

function signed(n: number): string {
  if (n > 0) return `+${n}`;
  return String(n);
}

function iconForLetter(id: LetterTypeId) {
  switch (id) {
    case "offer":
    case "promotion":
    case "salary_increase":
      return Sparkles;
    case "termination":
    case "warning":
      return ShieldAlert;
    case "reference":
    case "probation_outcome":
    case "resignation_clean":
    case "resignation_with_grievance":
    case "resignation_constructive":
      return Mail;
    case "grievance":
      return FileWarning;
    case "appeal":
      return Scale;
    case "subject_access_request":
      return FileSearch;
    case "whistleblowing":
      return ShieldAlert;
    case "flexible_working_request":
      return CalendarClock;
    case "accommodation_request":
      return ShieldCheck;
    default:
      return ScrollText;
  }
}
