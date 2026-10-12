import { useMemo, useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import { motion } from "framer-motion";
import { format, formatDistanceToNowStrict, subMonths } from "date-fns";
import {
  Plus,
  FileText,
  ShieldCheck,
  CalendarClock,
  ArrowRight,
  AlertCircle,
  Send,
  TrendingUp,
  Users,
  X,
  CircleCheck,
  BellRing,
  Activity,
  Library,
} from "lucide-react";
import type { Draft, Matter, Mode, RiskBand, Task } from "@/lib/letters/types";
import { useDraftStore } from "@/lib/store";
import { useProfileStore, type WorkspaceRole } from "@/lib/profile";
import { letterCatalogByMode } from "@/lib/letters/catalog";
import { daysUntilDateOnly, formatDateOnly } from "@/lib/date-only";
import { EmptyState, PageHeader } from "@/components/ds";
import { computeHealthScore, runHealthChecks } from "@/lib/finalize/healthChecks";
import { deriveEmployeesFromDrafts } from "@/lib/employees";
import { draftsInMatter } from "@/lib/matters";
import { effectiveRiskBand } from "@/lib/matters/risk";
import { canApprove } from "@/lib/permissions";
import { AssistantBox } from "@/components/home/AssistantBox";
import {
  StatTiles,
  DeltaChip,
  FooterDot,
  weeklySeries,
  type StatTileProps,
} from "@/components/home/StatTiles";
import { TemplateCards } from "@/components/home/TemplateCards";
import {
  BTN_OUTLINE,
  BTN_PRIMARY,
  HomeGrid,
  RailBox,
  SectionHead,
} from "@/components/home/HomeParts";
import { LetterRows } from "@/components/letters/LetterRows";
import { safeLetterMeta } from "@/components/letters/letterView";

const BACKFILL_DISMISS_KEY = "drafthr.hr.employeeBackfillDismissed.v1";

/* ============================================================================
 * Home: the landing page for HR and employee modes.
 *
 *   ┌ 2A header: breadcrumb, serif greeting, summary line, New letter
 *   ├ main column
 *   │   3A assistant box: describe a letter, or pick a suggestion, to open
 *   │                     that letter type's wizard
 *   │   7B stat tiles:    real numbers from the drafts and matters in the store
 *   │   6B cards:         letter types to start from (employee home also lists
 *   │                     drafts to continue as 13B rows)
 *   └ rail: what needs you (HR) or deadlines (employee), then history
 * ==========================================================================*/

export function Home({ mode }: { mode: Mode }) {
  if (mode === "employer") {
    return <HrDashboard />;
  }
  return <EmployeeHome mode={mode} />;
}

const PAGE = "mx-auto w-full max-w-[1180px] px-4 py-6 sm:px-8 sm:py-10 lg:px-11";

const fade = {
  initial: { opacity: 0, y: 6 },
  animate: { opacity: 1, y: 0 },
  transition: { duration: 0.35, ease: [0.32, 0.72, 0, 1] as const },
};

function useGreetingName() {
  const profile = useProfileStore((s) => s.profile);
  return (
    profile.personal.preferredName?.split(/\s+/)[0] ||
    profile.personal.legalName?.split(/\s+/)[0] ||
    ""
  );
}

/* ============================================================================
 * HR dashboard
 * ==========================================================================*/

function HrDashboard() {
  const nav = useNavigate();
  const drafts = useDraftStore((s) => s.drafts);
  const matters = useDraftStore((s) => s.matters);
  const tasks = useDraftStore((s) => s.tasks);
  const employees = useDraftStore((s) => s.employees);
  const createEmployee = useDraftStore((s) => s.createEmployee);
  const profile = useProfileStore((s) => s.profile);
  const firstName = useGreetingName();

  const prefix = "/hr";

  const greeting = useMemo(() => {
    const h = new Date().getHours();
    const slot = h < 12 ? "Good morning" : h < 18 ? "Good afternoon" : "Good evening";
    return firstName ? `${slot}, ${firstName}` : `${slot}, there`;
  }, [firstName]);

  const activeMatters = useMemo(
    () =>
      Object.values(matters).filter(
        (m) => m.mode === "employer" && m.status === "active"
      ),
    [matters]
  );

  // TODAY: open tasks due in next 7 days + matters with nextAction +
  // drafts in review when the current user is a reviewer (or admin/owner
  // acting as one). Surfaces approval-queue work alongside calendar work.
  const todayItems = useMemo(
    () => deriveTodayItems(tasks, matters, drafts, profile.workspaceRole),
    [tasks, matters, drafts, profile.workspaceRole]
  );

  // RISK: exposure + heatmap counts. We derive each active matter's risk
  // band from its drafts when no manual override exists (effectiveRiskBand)
  // so the dashboard tells the truth out of the box.
  const allDrafts = useMemo(
    () => Object.values(drafts).filter((d) => !d.isTemplateSource),
    [drafts]
  );
  const riskSummary = useMemo(
    () => deriveRiskSummary(activeMatters, allDrafts),
    [activeMatters, allDrafts]
  );

  // Employee backfill: when HR has drafts but no normalised employee records,
  // surface a one-click import banner. Dismissable; remembered locally so it
  // doesn't nag once the user has decided.
  const [dismissed, setDismissed] = useState(
    () =>
      typeof window !== "undefined" &&
      window.localStorage.getItem(BACKFILL_DISMISS_KEY) === "1"
  );
  const backfillCount = useMemo(() => {
    if (dismissed) return 0;
    if (Object.keys(employees).length > 0) return 0;
    return deriveEmployeesFromDrafts(drafts).length;
  }, [dismissed, drafts, employees]);

  const onImportEmployees = () => {
    const suggestions = deriveEmployeesFromDrafts(drafts);
    for (const s of suggestions) {
      const { draftCount: _d, lastSeenAt: _l, ...rest } = s;
      createEmployee(rest);
    }
    window.localStorage.setItem(BACKFILL_DISMISS_KEY, "1");
    setDismissed(true);
    nav("/employees");
  };

  const onDismissBackfill = () => {
    window.localStorage.setItem(BACKFILL_DISMISS_KEY, "1");
    setDismissed(true);
  };

  // COMPLIANCE: roll up health across HR-mode drafts
  const complianceSummary = useMemo(() => deriveComplianceSummary(drafts, "employer"), [drafts]);

  // LETTERS SENT: first export of each HR letter, this month vs last.
  const sent = useMemo(() => deriveSentSummary(drafts, "employer"), [drafts]);

  // RECENT ACTIVITY: flatten draft timelines, sort, take 5
  const recent = useMemo(() => deriveRecentActivity(drafts, "employer"), [drafts]);

  const catalog = useMemo(() => letterCatalogByMode("employer"), []);
  const starters = useMemo(() => {
    const j = profile.defaults.jurisdiction;
    return catalog
      .filter((l) => l.flagshipV1)
      .filter((l) => !(l.jurisdictionScope === "uk_only" && j !== "UK"))
      .filter((l) => !(l.jurisdictionScope === "us_only" && j !== "US"))
      .slice(0, 6);
  }, [catalog, profile.defaults.jurisdiction]);

  const urgentCount = todayItems.filter((t) => t.urgent).length;
  const highRisk = riskSummary.bands.high + riskSummary.bands.critical;
  const now = new Date();
  const lastMonthName = format(subMonths(now, 1), "MMMM");

  const tiles: StatTileProps[] = [
    {
      label: "Letters sent",
      icon: Send,
      value: sent.thisMonth,
      series: sent.weekly,
      sparkLabel: "Letters sent each week over the last 12 weeks",
      footer:
        sent.total === 0 ? (
          <span>None sent yet</span>
        ) : sent.delta === 0 ? (
          <span>Same as {lastMonthName}</span>
        ) : (
          <>
            <DeltaChip delta={sent.delta} />
            <span className="truncate">on {lastMonthName}</span>
          </>
        ),
    },
    {
      label: "Compliance",
      icon: ShieldCheck,
      value:
        complianceSummary.totalDrafts === 0 ? (
          <span className="text-[var(--ds-faint)]">0%</span>
        ) : (
          `${complianceSummary.percent}%`
        ),
      footer:
        complianceSummary.totalDrafts === 0 ? (
          <TileLink to={`${prefix}/new`}>Browse templates</TileLink>
        ) : complianceSummary.needsReview > 0 ? (
          <FooterDot tone="amber">
            {complianceSummary.needsReview} need{complianceSummary.needsReview === 1 ? "s" : ""} counsel review
          </FooterDot>
        ) : (
          <span className="truncate" title="Letters clearing all health checks">
            {complianceSummary.strongDrafts} of {complianceSummary.totalDrafts} clear all checks
          </span>
        ),
    },
    {
      label: "High-risk matters",
      icon: TrendingUp,
      value: highRisk,
      footer:
        riskSummary.matterCount === 0 ? (
          <TileLink to="/matters">Browse matters</TileLink>
        ) : (
          <span className="truncate">
            of {riskSummary.matterCount} active {riskSummary.matterCount === 1 ? "matter" : "matters"}
          </span>
        ),
    },
    {
      label: "Needs you",
      icon: BellRing,
      value: todayItems.length,
      footer:
        urgentCount > 0 ? (
          <FooterDot tone="red">{urgentCount} urgent</FooterDot>
        ) : (
          <span>Nothing urgent</span>
        ),
    },
  ];

  return (
    <motion.div {...fade} className={PAGE}>
      {/* Employee backfill: surfaces once when HR has drafts but the
       * normalised employee directory is empty. One click migrates every
       * person mentioned in existing drafts into the workspace directory. */}
      {backfillCount > 0 && (
        <div className="mb-8 flex items-start gap-3 rounded-[var(--ds-r-l)] bg-[var(--ds-tint-sky)] px-4 py-3.5">
          <span
            aria-hidden
            className="mt-0.5 grid size-8 shrink-0 place-items-center rounded-[var(--ds-r-s)] bg-[var(--ds-surface)] text-[var(--ds-tint-sky-ink)]"
          >
            <Users className="size-4" />
          </span>
          <div className="min-w-0 flex-1">
            <h3 className="m-0 text-[13.5px] font-semibold text-[var(--ds-ink)]">
              Build your employee directory from existing drafts
            </h3>
            <p className="m-0 mt-0.5 text-[12.5px] leading-snug text-[var(--ds-body)]">
              {backfillCount} unique{" "}
              {backfillCount === 1 ? "person appears" : "people appear"} across your
              drafts. Import them so future letters, matters and the Employees
              page link to one record per person.
            </p>
            <div className="mt-2.5 flex flex-wrap items-center gap-3">
              <button
                type="button"
                onClick={onImportEmployees}
                className="inline-flex h-8 items-center gap-1.5 rounded-[var(--ds-r-s)] bg-[var(--ds-accent)] px-3 text-[12.5px] font-medium text-[var(--ds-on-accent)] transition hover:bg-[var(--ds-accent-hover)]"
              >
                Import {backfillCount}{" "}
                {backfillCount === 1 ? "employee" : "employees"}
                <ArrowRight className="size-3" />
              </button>
              <Link
                to="/employees"
                className="inline-flex items-center gap-1 text-[12.5px] font-medium text-[var(--ds-body)] transition hover:text-[var(--ds-ink)]"
              >
                Open Employees
                <ArrowRight className="size-3 opacity-70" />
              </Link>
            </div>
          </div>
          <button
            type="button"
            onClick={onDismissBackfill}
            aria-label="Dismiss"
            className="-m-1 shrink-0 p-1 text-[var(--ds-muted)] transition hover:text-[var(--ds-ink)]"
          >
            <X className="size-3.5" />
          </button>
        </div>
      )}

      <PageHeader
        crumbs={[{ label: "HR / Management" }, { label: "Dashboard" }]}
        title={greeting}
        lede={
          <>
            You own{" "}
            <span className="font-medium text-[var(--ds-ink)]">
              {activeMatters.length} active {activeMatters.length === 1 ? "matter" : "matters"}
            </span>
            {todayItems.length > 0 ? (
              <>
                {", and "}
                <span className="font-medium text-[var(--ds-amber-fg)]">
                  {todayItems.length} {todayItems.length === 1 ? "thing needs" : "things need"} you today
                </span>
              </>
            ) : null}
            .
          </>
        }
        actions={
          <>
            <Link to="/matters" className={BTN_OUTLINE}>
              <Plus className="size-4" />
              New matter
            </Link>
            <Link to={`${prefix}/new`} className={BTN_PRIMARY} data-tour="new-letter-cta">
              <Plus className="size-4" />
              New letter
            </Link>
          </>
        }
      />

      <HomeGrid
        top={
          <>
            <AssistantBox mode="employer" jurisdiction={profile.defaults.jurisdiction} />
            <section aria-label="Your workspace at a glance" className="mt-10">
              <SectionHead
                title="Your team this month"
                sub={`${format(now, "MMMM yyyy")}, from your letters and matters`}
              />
              <StatTiles tiles={tiles} />
              {riskSummary.matterCount > 0 && <RiskStrip summary={riskSummary} />}
            </section>
          </>
        }
        rail={
          <>
            <NeedsYouBox items={todayItems} prefix={prefix} />
            <HistoryBox items={recent} />
          </>
        }
        bottom={
          <section aria-label="Start from a template">
            <SectionHead
              title="Start from a template"
              sub="Letters your policies and the law already shape"
              action={{ label: "Browse templates", to: `${prefix}/new` }}
            />
            <TemplateCards letters={starters} prefix={prefix} />
          </section>
        }
      />
    </motion.div>
  );
}

function TileLink({ to, children }: { to: string; children: React.ReactNode }) {
  return (
    <Link
      to={to}
      className="inline-flex items-center gap-1 font-medium text-[var(--ds-ink)] hover:underline"
    >
      {children}
      <ArrowRight className="size-3" />
    </Link>
  );
}

/* ─── HR rail and strips ───────────────────────────────────────────────── */

type TodayItem = {
  id: string;
  label: string;
  matterName?: string;
  matterId?: string;
  dueLabel: string;
  urgent: boolean;
  kind: "task" | "next-action" | "review";
  /** Deep-link target: set on "review" items so the row jumps to the editor. */
  draftId?: string;
};

function NeedsYouBox({ items, prefix }: { items: TodayItem[]; prefix: string }) {
  const nav = useNavigate();
  return (
    <RailBox title="Needs you" count={items.length}>
      {items.length === 0 ? (
        <div className="rounded-[var(--ds-r-m)] bg-[var(--ds-surface-2)] px-4 py-4">
          <p className="m-0 text-[13px] text-[var(--ds-muted)]">Nothing due today.</p>
          <button
            type="button"
            onClick={() => nav(`${prefix}/new`)}
            className="mt-2 inline-flex items-center gap-1.5 text-[12.5px] font-medium text-[var(--ds-ink)] hover:underline"
          >
            Start your first letter
            <ArrowRight className="size-3" />
          </button>
        </div>
      ) : (
        <>
          <ul className="m-0 -mx-2 flex list-none flex-col gap-0.5 p-0">
            {items.slice(0, 5).map((it) => {
              const onClick = it.draftId
                ? () => nav(`/editor/${it.draftId}`)
                : it.matterId
                  ? () => nav(`/matters/${it.matterId}`)
                  : undefined;
              const body = (
                <>
                  <span
                    aria-hidden
                    className="mt-0.5 grid size-6 shrink-0 place-items-center rounded-[var(--ds-r-s)]"
                    style={{
                      background: it.urgent ? "var(--ds-amber-bg)" : "var(--ds-surface-2)",
                      color: it.urgent ? "var(--ds-amber-fg)" : "var(--ds-subtle)",
                    }}
                  >
                    <AlertCircle className="size-3.5" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[13.5px] leading-snug text-[var(--ds-ink)]">
                      {it.label}
                    </span>
                    <span className="block truncate text-[12px] text-[var(--ds-muted)]">
                      {it.dueLabel}
                      {it.matterName ? `, ${it.matterName}` : ""}
                    </span>
                  </span>
                </>
              );
              return (
                <li key={it.id}>
                  {onClick ? (
                    <button
                      type="button"
                      onClick={onClick}
                      className="flex w-full items-start gap-2.5 rounded-[var(--ds-r-s)] px-2 py-2 text-left transition hover:bg-[var(--ds-surface-2)]"
                    >
                      {body}
                    </button>
                  ) : (
                    <div className="flex items-start gap-2.5 px-2 py-2">{body}</div>
                  )}
                </li>
              );
            })}
          </ul>
          {/* Until /today is a thing, "See all tasks" lands on the matters
           * index: tasks live inside matters today, so it's the right
           * destination by content even if not by name. */}
          <Link
            to="/matters"
            className="mt-2 inline-flex items-center gap-1 text-[12.5px] font-medium text-[var(--ds-muted)] transition hover:text-[var(--ds-ink)]"
          >
            See all in matters
            <ArrowRight className="size-3" />
          </Link>
        </>
      )}
    </RailBox>
  );
}

function HistoryBox({ items }: { items: RecentItem[] }) {
  return (
    <RailBox title="History" action={{ label: "View all", to: "/activity" }}>
      {items.length === 0 ? (
        <p className="m-0 text-[13px] leading-snug text-[var(--ds-muted)]">
          Activity will appear here as you draft, edit and export letters.
        </p>
      ) : (
        <ul className="m-0 flex list-none flex-col gap-3.5 p-0">
          {items.map((r) => (
            <li key={r.id} className="flex items-start gap-2.5">
              <span
                aria-hidden
                className="mt-0.5 grid size-6 shrink-0 place-items-center rounded-[var(--ds-r-s)] bg-[var(--ds-surface-2)] text-[var(--ds-muted)]"
              >
                <Activity className="size-3.5" />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[13.5px] leading-snug text-[var(--ds-ink)]">
                  {r.title}
                </span>
                <span className="block truncate text-[12px] text-[var(--ds-muted)]">
                  {r.letter}
                  <span className="text-[var(--ds-faint)]"> · </span>
                  {r.ago}
                </span>
              </span>
            </li>
          ))}
        </ul>
      )}
    </RailBox>
  );
}

type RiskSummary = {
  totalExposure: number;
  matterCount: number;
  bands: Record<RiskBand, number>;
  hasAnyExposure: boolean;
};

/** Risk register under the tiles: exposure, the band heatmap, a way in. */
function RiskStrip({ summary }: { summary: RiskSummary }) {
  const bands: RiskBand[] = ["low", "moderate", "high", "critical"];
  return (
    <div className="mt-3 flex min-w-0 flex-wrap items-center gap-x-5 gap-y-3 rounded-[var(--ds-r-l)] border border-[var(--ds-line)] px-4 py-3">
      <div className="min-w-0 flex-1 basis-[220px]">
        <div className="text-[13px] font-medium text-[var(--ds-ink)]">
          {summary.hasAnyExposure ? (
            <>
              <span className="ds-mono">{formatGBP(summary.totalExposure)}</span> tribunal-style exposure
            </>
          ) : (
            "Risk register"
          )}
        </div>
        <div className="mt-0.5 text-[12px] leading-snug text-[var(--ds-muted)]">
          {summary.hasAnyExposure
            ? `Across ${summary.matterCount} active ${summary.matterCount === 1 ? "case" : "cases"}`
            : `${summary.matterCount} active ${summary.matterCount === 1 ? "case" : "cases"}. Add exposure on a matter to track £.`}
        </div>
      </div>
      <div className="grid grid-cols-4 gap-1.5" role="img" aria-label="Risk band heatmap">
        {bands.map((b) => {
          const tone = bandTone(b);
          return (
            <div
              key={b}
              className="min-w-[58px] rounded-[var(--ds-r-s)] px-1.5 py-1.5 text-center"
              style={{ background: tone.bg, color: tone.fg }}
            >
              <div className="ds-mono text-[13px] leading-none font-semibold">{summary.bands[b]}</div>
              <div className="mt-1 text-[10.5px] capitalize opacity-85">{b}</div>
            </div>
          );
        })}
      </div>
      <Link
        to="/matters"
        className="inline-flex shrink-0 items-center gap-1 text-[12.5px] font-medium text-[var(--ds-muted)] transition hover:text-[var(--ds-ink)]"
      >
        Risk register
        <ArrowRight className="size-3" />
      </Link>
    </div>
  );
}

/* ─── Dashboard data derivation ────────────────────────────────────────── */

function deriveTodayItems(
  tasks: Record<string, Task>,
  matters: Record<string, Matter>,
  drafts: Record<string, Draft>,
  role: WorkspaceRole | undefined
): TodayItem[] {
  const now = Date.now();
  const sevenDays = 7 * 24 * 60 * 60 * 1000;

  const taskItems: TodayItem[] = Object.values(tasks)
    .filter((t) => t.status === "open")
    .filter((t) => {
      if (!t.dueISO) return false;
      const due = parseISODateTime(t.dueISO);
      if (due == null) return false;
      return due - now <= sevenDays;
    })
    // Sort by actual due date (ascending = most overdue/soonest first) BEFORE
    // mapping. Sorting on dueLabel afterwards compares human strings
    // lexicographically ("due in 10d" < "due in 2d"), which scrambles urgency.
    // dueISO is guaranteed present by the filter above.
    .sort((a, b) => (a.dueISO ?? "").localeCompare(b.dueISO ?? ""))
    .map((t) => {
      const matter = matters[t.matterId];
      const days = t.dueISO ? daysUntilDateOnly(t.dueISO) : null;
      const urgent = days != null && days <= 2;
      return {
        id: `task:${t.id}`,
        label: t.label,
        matterName: matter?.name,
        matterId: matter?.id,
        dueLabel:
          days == null
            ? "Due soon"
            : days < 0
            ? `${Math.abs(days)}d overdue`
            : days === 0
            ? "Due today"
            : `Due in ${days}d`,
        urgent,
        kind: "task" as const,
      };
    });

  const matterNextActions: TodayItem[] = Object.values(matters)
    .filter((m) => m.mode === "employer" && m.status === "active" && m.nextAction)
    .map((m) => ({
      id: `matter:${m.id}`,
      label: m.nextAction!,
      matterName: m.name,
      matterId: m.id,
      dueLabel: "Next action",
      urgent: m.riskBand === "high" || m.riskBand === "critical",
      kind: "next-action" as const,
    }));

  // In-review drafts surface to reviewers (and admin/owner who can act as
  // reviewer in the single-user case). Empty for drafter/viewer roles.
  const reviewItems: TodayItem[] = canApprove(role)
    ? Object.values(drafts)
        .filter(
          (d) =>
            d.mode === "employer" &&
            d.reviewStatus === "in_review" &&
            !d.isTemplateSource
        )
        .map((d) => ({
          id: `review:${d.id}`,
          label: `Review: ${d.title || d.letterType.replace(/_/g, " ")}`,
          matterName: d.employee.legalName || undefined,
          matterId: undefined,
          dueLabel: "Awaiting approval",
          urgent: true,
          kind: "review" as const,
          draftId: d.id,
        }))
    : [];

  return [...reviewItems, ...taskItems, ...matterNextActions];
}

function deriveRiskSummary(
  activeMatters: Matter[],
  allDrafts: Draft[]
): RiskSummary {
  const bands: Record<RiskBand, number> = { low: 0, moderate: 0, high: 0, critical: 0 };
  let totalExposure = 0;
  let hasAnyExposure = false;
  for (const m of activeMatters) {
    if (typeof m.exposureGBP === "number" && m.exposureGBP > 0) {
      totalExposure += m.exposureGBP;
      hasAnyExposure = true;
    }
    const band = effectiveRiskBand(m, draftsInMatter(allDrafts, m.id));
    if (band) bands[band] += 1;
  }
  return {
    totalExposure,
    matterCount: activeMatters.length,
    bands,
    hasAnyExposure,
  };
}

type ComplianceSummary = {
  totalDrafts: number;
  strongDrafts: number;
  needsReview: number;
  percent: number;
};

function deriveComplianceSummary(
  drafts: Record<string, Draft>,
  mode: Mode
): ComplianceSummary {
  const all = Object.values(drafts).filter(
    (d) => d.mode === mode && !d.isTemplateSource
  );
  if (all.length === 0) {
    return { totalDrafts: 0, strongDrafts: 0, needsReview: 0, percent: 0 };
  }
  let strong = 0;
  let needsReview = 0;
  for (const d of all) {
    try {
      const checks = runHealthChecks(d);
      const score = computeHealthScore(checks);
      if (score.band === "strong" && score.failCount === 0) {
        strong += 1;
      } else if (score.failCount > 0 || score.band === "weak") {
        needsReview += 1;
      }
    } catch {
      // skip drafts that can't be scored yet
    }
  }
  return {
    totalDrafts: all.length,
    strongDrafts: strong,
    needsReview,
    percent: Math.round((strong / all.length) * 100),
  };
}

/** When each letter was first exported (sent), with month and weekly counts. */
function deriveSentSummary(drafts: Record<string, Draft>, mode: Mode) {
  const firstSent: number[] = [];
  for (const d of Object.values(drafts)) {
    if (d.mode !== mode || d.isTemplateSource) continue;
    const times = (d.exports ?? []).map((e) => e.exportedAt).filter((t) => Number.isFinite(t));
    if (times.length > 0) firstSent.push(Math.min(...times));
  }
  const now = new Date();
  const thisStart = new Date(now.getFullYear(), now.getMonth(), 1).getTime();
  const lastStart = new Date(now.getFullYear(), now.getMonth() - 1, 1).getTime();
  const thisMonth = firstSent.filter((t) => t >= thisStart).length;
  const lastMonth = firstSent.filter((t) => t >= lastStart && t < thisStart).length;
  return {
    total: firstSent.length,
    thisMonth,
    delta: thisMonth - lastMonth,
    weekly: weeklySeries(firstSent),
  };
}

type RecentItem = { id: string; title: string; letter: string; ago: string; ts: number };

function deriveRecentActivity(
  drafts: Record<string, Draft>,
  mode: Mode
): RecentItem[] {
  const rows: RecentItem[] = [];
  for (const d of Object.values(drafts)) {
    if (d.mode !== mode) continue;
    if (d.isTemplateSource) continue;
    const meta = safeLetterMeta(d.letterType);
    const title = meta?.shortTitle ?? d.letterType;
    for (const ev of d.timeline ?? []) {
      rows.push({
        id: `${d.id}:${ev.id}`,
        title: ev.title,
        letter: title,
        ts: ev.createdAt,
        ago: formatDistanceToNowStrict(ev.createdAt, { addSuffix: true }),
      });
    }
  }
  rows.sort((a, b) => b.ts - a.ts);
  return rows.slice(0, 5);
}

function parseISODateTime(iso: string): number | null {
  const t = Date.parse(iso);
  return Number.isFinite(t) ? t : null;
}

function formatGBP(n: number): string {
  try {
    return new Intl.NumberFormat("en-GB", {
      style: "currency",
      currency: "GBP",
      maximumFractionDigits: 0,
    }).format(n);
  } catch {
    return `£${Math.round(n).toLocaleString()}`;
  }
}

function bandTone(band: RiskBand): { bg: string; fg: string } {
  switch (band) {
    case "critical":
      return { bg: "var(--ds-red-bg)", fg: "var(--ds-red-fg)" };
    case "high":
      return { bg: "var(--ds-amber-bg)", fg: "var(--ds-amber-fg)" };
    case "moderate":
      return { bg: "var(--ds-blue-bg)", fg: "var(--ds-blue-fg)" };
    case "low":
    default:
      return { bg: "var(--ds-green-bg)", fg: "var(--ds-green-fg)" };
  }
}

/* ============================================================================
 * Employee home
 * ==========================================================================*/

function EmployeeHome({ mode }: { mode: Mode }) {
  const drafts = useDraftStore((s) => s.drafts);
  const profile = useProfileStore((s) => s.profile);
  const name = useGreetingName();

  const myDrafts = useMemo(
    () =>
      Object.values(drafts)
        .filter((d) => d.mode === mode && !d.isTemplateSource)
        .sort((a, b) => b.updatedAt - a.updatedAt),
    [drafts, mode]
  );

  const deadlines = useMemo(() => deriveDeadlines(myDrafts), [myDrafts]);

  const catalog = letterCatalogByMode(mode);
  const flagship = catalog.filter((l) => l.flagshipV1);

  const prefix = "/me";
  const greeting = name ? `Hello, ${name}` : "Welcome back";

  const today = useMemo(
    () =>
      new Date().toLocaleDateString(undefined, {
        weekday: "long",
        day: "numeric",
        month: "long",
      }),
    []
  );

  const hasWork = myDrafts.length > 0 || deadlines.length > 0;

  const stats = useMemo(() => deriveEmployeeStats(myDrafts), [myDrafts]);
  const next = deadlines.find((d) => d.daysAway >= 0);

  const tiles: StatTileProps[] = [
    {
      label: "Letters",
      icon: FileText,
      value: myDrafts.length,
      series: stats.startedWeekly,
      sparkLabel: "Letters started each week over the last 12 weeks",
      footer: <span className="truncate">{stats.startedThisMonth} started this month</span>,
    },
    {
      label: "Ready to send",
      icon: CircleCheck,
      value: stats.ready,
      footer: <span className="truncate">{stats.inProgress} still in progress</span>,
    },
    {
      label: "Sent",
      icon: Send,
      value: stats.sent,
      footer: (
        <span className="truncate">
          {stats.lastSentAt ? `Last sent ${formatDistanceToNowStrict(stats.lastSentAt, { addSuffix: true })}` : "None sent yet"}
        </span>
      ),
    },
    {
      label: "Deadlines",
      icon: CalendarClock,
      value: deadlines.filter((d) => d.daysAway >= 0).length,
      footer: next ? (
        next.daysAway < 14 ? (
          <FooterDot tone="red">Next closes in {next.daysAway} {next.daysAway === 1 ? "day" : "days"}</FooterDot>
        ) : (
          <span className="truncate">Next closes in {next.daysAway} days</span>
        )
      ) : (
        <span>None coming up</span>
      ),
    },
  ];

  return (
    <motion.div {...fade} className={PAGE}>
      <PageHeader
        crumbs={[{ label: "Employee workspace" }, { label: today }]}
        title={greeting}
        lede={
          <>
            Let's put it in writing. Wizard-guided letters with UK and US legal awareness, for
            grievance, resignation, settlement, flexible working and more.{" "}
            <span className="font-medium text-[var(--ds-ink)]">Defensible by default.</span>
          </>
        }
        actions={
          <>
            <Link to={`${prefix}/new`} className={BTN_OUTLINE}>
              <Library className="size-4" />
              Browse all {catalog.length} letter types
            </Link>
            <Link to={`${prefix}/new`} data-tour="new-letter-cta" className={BTN_PRIMARY}>
              <Plus className="size-4" />
              New letter
            </Link>
          </>
        }
      />

      <HomeGrid
        top={
          <>
            <AssistantBox mode={mode} jurisdiction={profile.defaults.jurisdiction} />
            {myDrafts.length > 0 && (
              <section aria-label="Your letters at a glance" className="mt-10">
                <SectionHead title="Your letters" sub="Live from your drafts" />
                <StatTiles tiles={tiles} />
              </section>
            )}
          </>
        }
        rail={hasWork ? <DeadlinesBox deadlines={deadlines} prefix={prefix} /> : undefined}
        bottom={
          <>
            {hasWork && (
              <section aria-label="Continue where you left off">
                <SectionHead
                  title="Continue where you left off"
                  sub={
                    myDrafts.length > 0
                      ? `${myDrafts.length} ${myDrafts.length === 1 ? "letter" : "letters"} in progress or sent`
                      : undefined
                  }
                  action={myDrafts.length > 0 ? { label: "View all", to: "/letters" } : undefined}
                />
                {myDrafts.length === 0 ? (
                  <EmptyState
                    size="sm"
                    icon={FileText}
                    title="No drafts yet"
                    body="Pick a letter type to start your first draft. It appears here as soon as you generate it."
                    primary={{ label: "Browse letters", to: `${prefix}/new` }}
                  />
                ) : (
                  <LetterRows drafts={myDrafts.slice(0, 3)} viewerCanApprove={false} showHeader={false} />
                )}
              </section>
            )}
            <section aria-label="Start a letter">
              <SectionHead
                title="Start a letter"
                sub="The letters people need most, each with a guided wizard"
                action={{ label: "See all letter types", to: `${prefix}/new` }}
              />
              <TemplateCards
                letters={flagship.slice(0, 5)}
                prefix={prefix}
                moreHref={flagship.length > 5 ? `${prefix}/new` : undefined}
              />
            </section>
          </>
        }
      />

      <TrustFooter />
    </motion.div>
  );
}

/* ─── Employee rail: deadlines ─────────────────────────────────────────── */

function DeadlinesBox({
  deadlines,
  prefix,
}: {
  deadlines: ReturnType<typeof deriveDeadlines>;
  prefix: string;
}) {
  return (
    <RailBox
      title="Deadlines"
      count={deadlines.length}
      action={deadlines.length > 0 ? { label: "View all", to: "/calendar" } : undefined}
    >
      {deadlines.length === 0 ? (
        <EmptyState
          size="sm"
          icon={CalendarClock}
          title="No deadlines yet"
          body="Deadlines appear here when you start a tribunal-bound letter: appeals, grievances, dismissal responses."
          primary={{ label: "Start a letter", to: `${prefix}/new` }}
        />
      ) : (
        <ul className="m-0 flex list-none flex-col gap-2.5 p-0">
          {deadlines.map((d) => {
            const passed = d.daysAway < 0;
            const urgent = !passed && d.daysAway < 14;
            return (
              <li key={d.id}>
                <Link
                  to={`/editor/${d.id}`}
                  className="block rounded-[var(--ds-r-m)] px-4 py-3.5 transition hover:brightness-[0.98]"
                  style={{ background: urgent ? "var(--ds-red-bg)" : "var(--ds-surface-2)" }}
                >
                  <span className="flex items-center justify-between gap-3 text-[12.5px]">
                    <span className="inline-flex min-w-0 items-center gap-1.5 text-[var(--ds-muted)]">
                      <CalendarClock className="size-3.5 shrink-0" />
                      <span className="truncate">{d.label}</span>
                    </span>
                    <span
                      className="shrink-0 font-medium"
                      style={{
                        color: passed || urgent ? "var(--ds-red-fg)" : "var(--ds-ink)",
                      }}
                    >
                      {passed
                        ? "Passed"
                        : d.daysAway === 0
                          ? "Today"
                          : `${d.daysAway} ${d.daysAway === 1 ? "day" : "days"} left`}
                    </span>
                  </span>
                  <span className="ds-title mt-1.5 block text-[24px] leading-tight">
                    {formatDate(d.iso)}
                  </span>
                  {d.basis && (
                    <span className="mt-1 line-clamp-2 block text-[12px] leading-snug text-[var(--ds-muted)]">
                      {d.basis}
                    </span>
                  )}
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </RailBox>
  );
}

/* ─── Trust footer ─────────────────────────────────────────────────────── */

function TrustFooter() {
  const chips = [
    "UK Employment Rights Act 1996",
    "ACAS Code aware",
    "US FLSA and state-law variants",
    "Private: drafts never train models",
  ];
  return (
    <footer className="mt-14 flex flex-col gap-3 border-t border-[var(--ds-line)] pt-5 md:flex-row md:items-center md:justify-between">
      <ul className="m-0 flex list-none flex-wrap gap-x-4 gap-y-1.5 p-0">
        {chips.map((c) => (
          <li key={c} className="inline-flex items-center gap-1.5 text-[12px] text-[var(--ds-muted)]">
            <CircleCheck className="size-3.5 text-[var(--ds-green-fg)]" aria-hidden />
            {c}
          </li>
        ))}
      </ul>
      <p className="m-0 text-[12px] leading-snug text-[var(--ds-muted)] md:max-w-[42ch] md:text-right">
        Not legal advice. High-stakes letters should be reviewed by qualified counsel before
        issuance.
      </p>
    </footer>
  );
}

/* ============================================================================
 * Helpers
 * ==========================================================================*/

function deriveDeadlines(drafts: Draft[]) {
  return drafts
    .filter((d) => d.context.protectedDeadline)
    .map((d) => {
      const iso = d.context.protectedDeadline!.iso;
      const daysAway = daysUntilDateOnly(iso);
      return {
        id: d.id,
        label: safeLetterMeta(d.letterType)?.shortTitle ?? d.letterType,
        iso,
        basis: d.context.protectedDeadline!.basis,
        daysAway,
      };
    })
    .sort((a, b) => a.daysAway - b.daysAway)
    .slice(0, 5);
}

function draftStatus(d: {
  sections: { status: string; html: string }[];
}): "empty" | "drafting" | "ready" {
  const all = d.sections;
  if (all.length === 0) return "empty";
  if (all.every((s) => s.status === "empty" && !s.html)) return "empty";
  if (all.every((s) => s.status === "ready")) return "ready";
  if (all.some((s) => s.status === "ready" || s.status === "edited" || s.status === "streaming" || s.html))
    return "drafting";
  return "empty";
}

function deriveEmployeeStats(drafts: Draft[]) {
  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).getTime();
  let ready = 0;
  let inProgress = 0;
  let sent = 0;
  let lastSentAt = 0;
  for (const d of drafts) {
    const exported = (d.exports?.length ?? 0) > 0;
    if (exported) {
      sent += 1;
      for (const e of d.exports ?? []) lastSentAt = Math.max(lastSentAt, e.exportedAt);
      continue;
    }
    const s = draftStatus(d);
    if (s === "ready") ready += 1;
    else inProgress += 1;
  }
  const created = drafts.map((d) => d.createdAt);
  return {
    ready,
    inProgress,
    sent,
    lastSentAt: lastSentAt || null,
    startedThisMonth: created.filter((t) => t >= monthStart).length,
    startedWeekly: weeklySeries(created),
  };
}

function formatDate(iso: string): string {
  return formatDateOnly(iso, { day: "numeric", month: "long", year: "numeric" });
}
