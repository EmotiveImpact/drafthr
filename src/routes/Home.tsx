import { useMemo, useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import {
  Badge,
  Box,
  Button,
  Card,
  Flex,
  Grid,
  Heading,
  IconButton,
  Separator,
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
import { briefTitleFor } from "@/lib/letters/display";
import { daysUntilDateOnly, formatDateOnly } from "@/lib/date-only";
import { PageHeader, DataTable, StatusDot, type StatusTone } from "@/components/ds";
import {
  activeMatters,
  draftsInMatter,
  groupDraftsForAutoMatters,
  MATTER_COLOR_CLASSES,
  matterInitial,
  type AutoGroup,
} from "@/lib/matters";
import { UpgradeToMatterDialog } from "@/components/UpgradeToMatterDialog";
import { ArrowRight, FolderPlus, FolderOpen } from "lucide-react";

const RISK_BADGE: Record<string, "green" | "amber" | "red"> = {
  low: "green",
  medium: "amber",
  high: "red",
};

const RISK_TONE: Record<string, StatusTone> = {
  low: "green",
  medium: "amber",
  high: "red",
};

const STATUS_TONE: Record<string, StatusTone> = {
  drafting: "amber",
  ready: "green",
  exported: "neutral",
  empty: "neutral",
};

export function Home({ mode }: { mode: Mode }) {
  const nav = useNavigate();
  const drafts = useDraftStore((s) => s.drafts);
  const matters = useDraftStore((s) => s.matters);
  const deleteDraft = useDraftStore((s) => s.deleteDraft);
  const profile = useProfileStore((s) => s.profile);

  const myDrafts = useMemo(
    () =>
      Object.values(drafts)
        .filter((d) => d.mode === mode)
        .sort((a, b) => b.updatedAt - a.updatedAt),
    [drafts, mode]
  );

  // Top 3 active matters for this mode — shown as quick-access cards
  // above the autoGroups / drafts table.
  const topMatters = useMemo(
    () => activeMatters(Object.values(matters), mode).slice(0, 3),
    [matters, mode]
  );

  // Unaffiliated drafts grouped by employer (employee mode) or person
  // (HR mode). Only show groups with 2+ letters AND a real primary name —
  // single-letter groups aren't worth the visual weight, and "Unsorted"
  // can't be meaningfully promoted to a named matter.
  const autoGroups = useMemo(
    () =>
      groupDraftsForAutoMatters(myDrafts, mode).filter(
        (g) => g.drafts.length >= 2 && g.key !== "_unsorted"
      ),
    [myDrafts, mode]
  );

  const [upgradeGroup, setUpgradeGroup] = useState<AutoGroup | null>(null);

  const stats = useMemo(() => deriveStats(myDrafts), [myDrafts]);
  const deadlines = useMemo(() => deriveDeadlines(myDrafts), [myDrafts]);

  const catalog = letterCatalogByMode(mode);
  const flagship = catalog.filter((l) => l.flagshipV1);
  const prefix = mode === "employer" ? "/hr" : "/me";
  const greeting = profile.personal.preferredName
    ? `Hello, ${profile.personal.preferredName}.`
    : "Welcome back.";

  return (
    <Box className="max-w-5xl px-4 py-6 sm:px-6 sm:py-8">
      <PageHeader
        crumbs={[{ label: mode === "employer" ? "HR / Management" : "Employee" }]}
        title={greeting}
        lede={
          myDrafts.length === 0
            ? "Pick a letter type below to get started."
            : `${myDrafts.length} draft${myDrafts.length === 1 ? "" : "s"} · last updated ${timeAgo(myDrafts[0].updatedAt)}`
        }
        actions={
          <>
            <Button variant="outline" color="gray" disabled>
              <Search className="size-3.5" />
              Search
              <Text size="1" color="gray" ml="1">soon</Text>
            </Button>
            <Button onClick={() => nav(`${prefix}/new`)}>
              <PlusCircle className="size-3.5" />
              New letter
            </Button>
          </>
        }
      />

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
        {/* Matters quick-access + auto-groups — sits above the legacy
         * drafts table. Renders nothing if there are no matters AND no
         * auto-groups, so the home doesn't grow vertically for users
         * with one or two drafts. */}
        {(topMatters.length > 0 || autoGroups.length > 0) && (
          <Box gridColumn={{ lg: "span 2" }} mb="3">
            {topMatters.length > 0 && (
              <Card size="2" className="mb-3">
                <Flex justify="between" align="center" mb="2">
                  <Heading size="3">Matters</Heading>
                  <Link
                    to="/matters"
                    className="text-[12px] text-[var(--ds-muted)] hover:text-[var(--ds-ink)] inline-flex items-center gap-1"
                  >
                    See all →
                  </Link>
                </Flex>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-2 mt-2">
                  {topMatters.map((m) => {
                    const matterDrafts = draftsInMatter(myDrafts, m.id);
                    const colors = MATTER_COLOR_CLASSES[m.color];
                    return (
                      <Link
                        key={m.id}
                        to={`/matters/${m.id}`}
                        className="flex items-start gap-2 p-3 rounded-md border border-[var(--ds-line)] bg-[var(--ds-surface)] hover:border-[var(--ds-subtle)] hover:shadow-sm transition"
                      >
                        <div
                          className={`size-8 rounded-md grid place-items-center text-white font-semibold text-[13px] shrink-0 ${colors.swatch}`}
                          style={{ fontFamily: "var(--font-serif)" }}
                        >
                          {matterInitial(m)}
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="font-semibold text-[var(--ds-ink)] text-[13px] truncate">
                            {m.name}
                          </div>
                          <div className="text-[11px] text-[var(--ds-muted)]">
                            {matterDrafts.length} letter{matterDrafts.length === 1 ? "" : "s"}
                            {m.deadlineISO && (() => {
                              const days = daysUntilDateOnly(m.deadlineISO);
                              return ` · ${days < 0 ? `+${Math.abs(days)}d past` : `${days}d to ${m.deadlineLabel ?? "deadline"}`}`;
                            })()}
                          </div>
                        </div>
                      </Link>
                    );
                  })}
                </div>
              </Card>
            )}

            {autoGroups.length > 0 && (
              <Card size="2">
                <Flex justify="between" align="center" mb="2">
                  <Box>
                    <Heading size="3">
                      Grouped by {mode === "employer" ? "person" : "employer"}
                    </Heading>
                    <Text size="1" color="gray" as="p" mt="1" className="leading-relaxed">
                      Letters clustered automatically. Promote a group to a named Matter for deadlines + counsel-review chips.
                    </Text>
                  </Box>
                </Flex>
                <Box mt="2">
                  {autoGroups.slice(0, 4).map((group) => (
                    <AutoGroupRow
                      key={group.key}
                      group={group}
                      mode={mode}
                      onOpen={(draftId) => nav(`/editor/${draftId}`)}
                      onUpgrade={() => setUpgradeGroup(group)}
                    />
                  ))}
                </Box>
              </Card>
            )}
          </Box>
        )}

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
              <Box mt="3">
                <DataTable
                  rows={myDrafts.slice(0, 8)}
                  rowKey={(d) => d.id}
                  onRowClick={(d) => nav(`/editor/${d.id}`)}
                  columns={[
                    {
                      key: "letter",
                      header: "Letter",
                      cell: (d) => (
                        <span className="font-medium text-[var(--ds-ink)]">
                          {briefTitleFor(d)}
                        </span>
                      ),
                    },
                    {
                      key: "to",
                      header: mode === "employer" ? "Recipient" : "To",
                      hideOn: "sm",
                      cell: (d) => (
                        <span className="text-[var(--ds-muted)]">
                          {mode === "employer"
                            ? d.employee.legalName || "(no recipient)"
                            : d.employer.legalName || "(no employer)"}
                        </span>
                      ),
                    },
                    {
                      key: "status",
                      header: "Status",
                      cell: (d) => <StatusDot tone={STATUS_TONE[draftStatus(d)]}>{draftStatus(d)}</StatusDot>,
                    },
                    {
                      key: "risk",
                      header: "Risk",
                      hideOn: "md",
                      cell: (d) => {
                        const meta = safeMeta(d.letterType);
                        return meta ? (
                          <StatusDot tone={RISK_TONE[meta.riskClass]} size="sm">{meta.riskClass}</StatusDot>
                        ) : null;
                      },
                    },
                    {
                      key: "updated",
                      header: "Updated",
                      num: true,
                      cell: (d) => (
                        <span className="text-[var(--ds-muted)] text-[12px]">{timeAgo(d.updatedAt)}</span>
                      ),
                    },
                    {
                      key: "actions",
                      header: "",
                      isActions: true,
                      cell: (d) => (
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
                      ),
                    },
                  ]}
                />
              </Box>
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

      {/* Upgrade-to-Matter dialog. Mounts at root so it can overlay
       * everything. Opens when the user clicks "Make this a Matter →"
       * on any AutoGroupRow above. */}
      <UpgradeToMatterDialog
        group={upgradeGroup}
        mode={mode}
        open={!!upgradeGroup}
        onOpenChange={(open) => {
          if (!open) setUpgradeGroup(null);
        }}
      />
    </Box>
  );
}

/* ============================================================================
 * Auto-group row — one bucket of drafts that share a primary party.
 * Click anywhere on the row → open most recent draft. Click the
 * "Make this a Matter →" chip → upgrade dialog opens.
 * ==========================================================================*/

function AutoGroupRow({
  group,
  mode,
  onOpen,
  onUpgrade,
}: {
  group: AutoGroup;
  mode: Mode;
  onOpen: (draftId: string) => void;
  onUpgrade: () => void;
}) {
  const mostRecent = group.drafts.slice().sort((a, b) => b.updatedAt - a.updatedAt)[0];
  return (
    <Box className="border-t border-[var(--ds-line-2)] py-2 first:border-t-0 first:pt-0">
      <Flex justify="between" align="center" gap="2" wrap="wrap">
        <Box className="min-w-0">
          <Flex align="center" gap="2">
            <FolderOpen className="size-3.5 text-[var(--ds-muted)]" />
            <Text size="2" weight="medium" className="text-[var(--ds-ink)]">
              {group.primaryName}
            </Text>
            {group.primaryContext && (
              <Text size="1" color="gray" className="hidden sm:inline">
                · {group.primaryContext}
              </Text>
            )}
          </Flex>
          <Text size="1" color="gray" as="p" mt="1" className="leading-relaxed">
            {group.drafts.length} letter{group.drafts.length === 1 ? "" : "s"} ·{" "}
            most recent {timeAgo(mostRecent.updatedAt)}
            {mode === "employer"
              ? " · related to this employee"
              : " · related to this employer"}
          </Text>
        </Box>
        <Flex gap="2" align="center">
          <button
            type="button"
            onClick={onUpgrade}
            className="text-[11px] font-medium text-[var(--ds-blue-fg)] bg-[var(--ds-blue-bg)] px-2 py-1 rounded-md hover:bg-[var(--ds-blue-fg)] hover:text-white transition inline-flex items-center gap-1"
          >
            <FolderPlus className="size-3" />
            Make this a Matter
          </button>
          <button
            type="button"
            onClick={() => onOpen(mostRecent.id)}
            className="text-[11px] text-[var(--ds-muted)] hover:text-[var(--ds-ink)] inline-flex items-center gap-1"
          >
            Open latest <ArrowRight className="size-3" />
          </button>
        </Flex>
      </Flex>
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
      const days = daysUntilDateOnly(dl.iso);
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
      const daysAway = daysUntilDateOnly(iso);
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
  return formatDateOnly(iso, { day: "numeric", month: "short", year: "numeric" });
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
