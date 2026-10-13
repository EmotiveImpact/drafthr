import { useEffect, useMemo, useState, type CSSProperties, type ReactNode } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { toast } from "sonner";
import {
  AlertTriangle,
  ArrowRight,
  BarChart3,
  Building2,
  CalendarDays,
  ChevronDown,
  ChevronRight,
  CircleAlert,
  Clock,
  Download,
  FileText,
  Send,
  ShieldCheck,
  TrendingUp,
  TriangleAlert,
  UserRound,
} from "lucide-react";

import type { Draft, Matter, RiskBand } from "@/lib/letters/types";
import { useDraftStore } from "@/lib/store";
import { useProfileStore } from "@/lib/profile";
import { EmptyState, type PillTone } from "@/components/ds";
import { ListPlaceholder } from "@/components/home/HomeParts";
import { useLettersLoading } from "@/components/home/loadState";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { DIMENSION_LABELS, type HealthCheck, type HealthDimension } from "@/lib/finalize/healthChecks";
import { effectiveRiskBand } from "@/lib/matters/risk";
import { draftsInMatter } from "@/lib/matters";
import { briefTitleFor } from "@/lib/letters/display";
import { HEALTH_CHECKS, failingCountForCheck, type HealthCheck as ReportsHealthCheck } from "@/lib/reports/check-predicates";
import { BAND_BTN_DARK, Band, BandTabs, useWorkspaceName } from "@/components/home/HomeBand";
import { StatTiles, TileFoot, type StatTileProps } from "@/components/home/StatTiles";
import { PersonDot } from "@/components/home/ApprovalPreview";
import {
  NO_MANAGER,
  PERIODS,
  byLetterType,
  byManager,
  chartBars,
  daysWords,
  departmentsOf,
  failingChecks,
  ruleCopy,
  letterFacts,
  matterInDepartment,
  niceTop,
  oneDp,
  periodFrame,
  reportCsv,
  reportTiles,
  timeToResolve,
  topTypesWithOther,
  updatedWords,
  type ChartBar,
  type FailingRow,
  type LetterFacts,
  type ManagerRow,
  type PeriodFrame,
  type PeriodId,
  type TypeRow,
} from "@/components/reports/reportsData";
import { cn } from "@/lib/utils";

/* ============================================================================
 * /reports (mock reports). How letters are going across the workspace: the
 * Reports band with a period, a department and Export report, then four
 * tabs. Overview carries the figures that used to sit on Home; Compliance,
 * Risk and Operations keep the cards Reports already had.
 *
 * Every figure comes from the workspace's own letters, matters and
 * employee records (see reportsData.ts). HR mode only: the route is
 * guarded, and an employee who lands here anyway sees no HR figures.
 * ==========================================================================*/

type TabId = "overview" | "compliance" | "risk" | "operations";
const TAB_IDS: TabId[] = ["overview", "compliance", "risk", "operations"];
const ALL = "all";

/* Chart colours: the cool avatar ink mixed into the surface, so they follow
 * the theme and stay tokens. */
const BAR = "color-mix(in srgb, var(--ds-av-1-fg) 25%, var(--ds-surface))";
const BAR_HOT = "var(--ds-av-1-fg)";
const BAR_SO_FAR: CSSProperties = {
  background:
    "repeating-linear-gradient(135deg, color-mix(in srgb, var(--ds-av-1-fg) 14%, var(--ds-surface)) 0 4px, color-mix(in srgb, var(--ds-av-1-fg) 21%, var(--ds-surface)) 4px 7px)",
  boxShadow: "inset 0 0 0 1px color-mix(in srgb, var(--ds-av-1-fg) 32%, var(--ds-surface))",
};
const TRACK_FILL = "color-mix(in srgb, var(--ds-av-1-fg) 50%, var(--ds-surface))";

export function Reports() {
  const profileRole = useProfileStore((s) => s.profile.role);
  const workspace = useWorkspaceName();
  const drafts = useDraftStore((s) => s.drafts);
  const matters = useDraftStore((s) => s.matters);
  const employees = useDraftStore((s) => s.employees);
  const [params, setParams] = useSearchParams();

  const tabParam = params.get("tab") as TabId | null;
  const tab: TabId = tabParam && TAB_IDS.includes(tabParam) ? tabParam : "overview";
  const periodParam = params.get("period") as PeriodId | null;
  const period: PeriodId = periodParam && PERIODS.some((p) => p.id === periodParam) ? periodParam : "12m";
  const dept = params.get("dept") ?? ALL;

  const setParam = (key: string, value: string | null) => {
    const next = new URLSearchParams(params);
    if (value == null) next.delete(key);
    else next.set(key, value);
    setParams(next, { replace: true });
  };

  const realDrafts = useMemo(
    () => Object.values(drafts).filter((d) => d.mode === "employer" && !d.isTemplateSource),
    [drafts]
  );
  const allMatters = useMemo(() => Object.values(matters).filter((m) => m.mode === "employer"), [matters]);

  // Worked out once per change to the letters, matters or people.
  const facts = useMemo(() => realDrafts.map((d) => letterFacts(d, employees)), [realDrafts, employees]);
  const computedAt = useMemo(() => Date.now(), [facts, allMatters]);
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = window.setInterval(() => setNow(Date.now()), 30_000);
    return () => window.clearInterval(t);
  }, []);

  const departments = useMemo(() => departmentsOf(employees, facts), [employees, facts]);
  const activeDept = dept !== ALL && departments.includes(dept) ? dept : ALL;

  const scoped = useMemo(
    () => (activeDept === ALL ? facts : facts.filter((l) => l.department === activeDept)),
    [facts, activeDept]
  );
  const scopedMatters = useMemo(
    () => (activeDept === ALL ? allMatters : allMatters.filter((m) => matterInDepartment(m, activeDept, facts, employees))),
    [allMatters, activeDept, facts, employees]
  );
  const activeMatters = useMemo(() => scopedMatters.filter((m) => m.status === "active"), [scopedMatters]);

  const earliest = useMemo(
    () => (facts.length ? Math.min(...facts.map((l) => l.draft.createdAt)) : undefined),
    [facts]
  );
  const frame = useMemo(() => periodFrame(period, computedAt, earliest), [period, computedAt, earliest]);
  const inPeriod = useMemo(
    () => scoped.filter((l) => l.at >= frame.start && l.at <= computedAt),
    [scoped, frame, computedAt]
  );

  const tiles = useMemo(
    () => reportTiles({ letters: scoped, matters: scopedMatters, drafts: realDrafts, frame, now: computedAt }),
    [scoped, scopedMatters, realDrafts, frame, computedAt]
  );
  const bars = useMemo(() => chartBars(scoped, frame), [scoped, frame]);
  const types = useMemo(() => byLetterType(inPeriod), [inPeriod]);
  const managers = useMemo(() => byManager(inPeriod, activeMatters), [inPeriod, activeMatters]);
  const failing = useMemo(() => failingChecks(inPeriod), [inPeriod]);

  const crumbs = [{ label: workspace, href: "/hr" }, { label: "Reports" }];
  const loading = useLettersLoading();

  // Employees never see HR figures, even if they reach the page.
  if (profileRole === "employee") {
    return (
      <div className="min-w-0">
        <Band crumbs={[{ label: "Employee" }, { label: "Reports" }]} title="Reports" />
        <div className="px-5 pt-6 pb-12 md:px-12">
          <div className="rounded-[16px] border border-[var(--ds-line)] bg-[var(--ds-surface)]">
            <EmptyState
              icon={BarChart3}
              title="Reports are an HR portfolio view"
              body="Switch to HR / Management to see compliance, risk and operations rolled up across matters."
            />
          </div>
        </div>
      </div>
    );
  }

  if (realDrafts.length === 0 && allMatters.length === 0) {
    return (
      <div className="min-w-0">
        <Band
          crumbs={crumbs}
          title="Reports"
          // While the first pull is still bringing letters to this device,
          // say so (as Home does) rather than the empty-workspace line.
          lede={
            loading ? (
              <>Getting your letters from the workspace.</>
            ) : (
              <>How letters are going across {workspace}. Figures appear as you draft and send letters.</>
            )
          }
        />
        <div className="px-5 pt-6 pb-12 md:px-12">
          {loading ? (
            <div className="rounded-[16px] border border-[var(--ds-line)] bg-[var(--ds-surface)] px-5 py-2">
              <ListPlaceholder rows={4} thumb={false} label="Loading reports" />
            </div>
          ) : (
          <div className="rounded-[16px] border border-[var(--ds-line)] bg-[var(--ds-surface)]">
            <EmptyState
              icon={BarChart3}
              title="Nothing to report yet"
              body="Reports populate as you draft letters and open matters."
              primary={{ label: "Browse templates", to: "/hr/new" }}
            />
          </div>
          )}
        </div>
      </div>
    );
  }

  const periodLabel = frame.label;
  const deptLabel = activeDept === ALL ? "All" : activeDept;

  const exportReport = () => {
    const csv = reportCsv({
      workspace,
      period: periodLabel,
      department: activeDept === ALL ? "All departments" : activeDept,
      now: computedAt,
      tiles,
      bars,
      types,
      managers,
      failing,
    });
    const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
    const day = new Date(computedAt).toISOString().slice(0, 10);
    const name = `drafthr-report-${slug(periodLabel)}-${activeDept === ALL ? "all-departments" : slug(activeDept)}-${day}.csv`;
    try {
      const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
      const a = document.createElement("a");
      a.href = url;
      a.download = name;
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 1000);
      toast.success("Report downloaded", { description: name });
    } catch {
      toast.error("Couldn't download the report. Try again.");
    }
  };

  const filters = (
    <>
      <PeriodMenu value={period} onChange={(id) => setParam("period", id === "12m" ? null : id)} />
      <DepartmentMenu
        value={activeDept}
        options={departments}
        onChange={(d) => setParam("dept", d === ALL ? null : d)}
      />
    </>
  );

  return (
    <div className="min-w-0">
      <Band
        crumbs={crumbs}
        title="Reports"
        lede={
          <>
            How letters are going across {workspace}. Updated <b>{updatedWords(computedAt, Math.max(now, computedAt))}</b>.
          </>
        }
        actions={
          <>
            {filters}
            <button type="button" onClick={exportReport} className={BAND_BTN_DARK}>
              <Download className="size-4" aria-hidden />
              Export report
            </button>
          </>
        }
        tabs={
          <BandTabs
            label="Reports"
            active={tab}
            onChange={(id) => setParam("tab", id === "overview" ? null : id)}
            tabs={[
              { id: "overview", label: "Overview" },
              { id: "compliance", label: "Compliance" },
              { id: "risk", label: "Risk" },
              { id: "operations", label: "Operations" },
            ]}
          />
        }
      />

      <div className="px-4 pt-4 pb-12 md:px-12 md:pt-[26px] md:pb-10">
        {/* Phone: the band's actions are hidden, so the filters sit here. */}
        <div className="no-scrollbar -mx-4 mb-4 flex gap-2 overflow-x-auto px-4 md:hidden">
          {filters}
          <button
            type="button"
            onClick={exportReport}
            aria-label="Export report"
            className="grid size-[38px] shrink-0 place-items-center rounded-[9px] bg-[var(--ds-accent)] text-[var(--ds-on-accent)] transition-colors duration-[120ms] hover:bg-[var(--ds-accent-hover)] active:bg-[var(--ds-accent-press)]"
          >
            <Download className="size-4" aria-hidden />
          </button>
        </div>

        <div key={tab} className="animate-in fade-in-0 duration-200 motion-reduce:animate-none">
          {tab === "overview" && (
            <Overview
              tiles={tiles}
              bars={bars}
              frame={frame}
              types={types}
              managers={managers}
              failing={failing}
              onCompliance={() => setParam("tab", "compliance")}
            />
          )}
          {tab === "compliance" && <ComplianceHealthCard letters={inPeriod} frameLabel={periodLabel} />}
          {tab === "risk" && <RiskExposureCard matters={activeMatters} drafts={realDrafts} />}
          {tab === "operations" && (
            <OperationsCard bars={bars} frame={frame} matters={scopedMatters} letters={inPeriod} types={types} />
          )}
        </div>
        {activeDept !== ALL && (
          <p className="m-0 mt-4 text-[12.5px] text-[var(--ds-muted)]">
            Showing letters for people in {deptLabel}, from their employee records.
          </p>
        )}
      </div>
    </div>
  );
}

/* ─── Filters ─────────────────────────────────────────────────────── */

const CHIP =
  "inline-flex h-[38px] shrink-0 items-center gap-[7px] whitespace-nowrap rounded-[9px] border border-[var(--ds-line)] bg-[var(--ds-surface)] px-3 text-[14px] text-[var(--ds-body)] transition-colors duration-[120ms] hover:bg-[var(--ds-hover)] active:bg-[var(--ds-surface-2)] data-[state=open]:bg-[var(--ds-hover)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--ds-focus)]";

function PeriodMenu({ value, onChange }: { value: PeriodId; onChange: (id: PeriodId) => void }) {
  const label = PERIODS.find((p) => p.id === value)?.label ?? "Last 12 months";
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button type="button" className={CHIP} aria-label={`Period: ${label}`}>
          <CalendarDays className="size-[15px] text-[var(--ds-subtle)]" aria-hidden />
          <b className="font-medium text-[var(--ds-ink)]">{label}</b>
          <ChevronDown className="size-3.5 text-[var(--ds-subtle)]" aria-hidden />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-[200px]">
        <DropdownMenuLabel>Period</DropdownMenuLabel>
        <DropdownMenuRadioGroup value={value} onValueChange={(v) => onChange(v as PeriodId)}>
          {PERIODS.map((p) => (
            <DropdownMenuRadioItem key={p.id} value={p.id}>
              {p.label}
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function DepartmentMenu({
  value,
  options,
  onChange,
}: {
  value: string;
  options: string[];
  onChange: (d: string) => void;
}) {
  const label = value === ALL ? "All" : value;
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button type="button" className={CHIP} aria-label={`Department: ${label}`}>
          <Building2 className="size-[15px] text-[var(--ds-subtle)]" aria-hidden />
          <span className="max-sm:hidden">Department</span>
          <b className="max-w-[140px] truncate font-medium text-[var(--ds-ink)]">{label}</b>
          <ChevronDown className="size-3.5 text-[var(--ds-subtle)]" aria-hidden />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="max-h-[min(380px,70vh)] w-[230px] overflow-y-auto">
        <DropdownMenuLabel>Department</DropdownMenuLabel>
        <DropdownMenuRadioGroup value={value} onValueChange={onChange}>
          <DropdownMenuRadioItem value={ALL}>All</DropdownMenuRadioItem>
          {options.length > 0 && <DropdownMenuSeparator />}
          {options.map((d) => (
            <DropdownMenuRadioItem key={d} value={d}>
              {d}
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>
        {options.length === 0 && (
          <p className="m-0 px-2 pt-1 pb-2 text-[12.5px] leading-snug text-[var(--ds-muted)]">
            Add a department to employee records to filter by it.
          </p>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

/* ─── Card shell (mock .card, .ch) ────────────────────────────────── */

function ReportCard({
  title,
  action,
  sub,
  children,
  className,
  label,
}: {
  title: string;
  action?: ReactNode;
  sub?: ReactNode;
  children: ReactNode;
  className?: string;
  label?: string;
}) {
  return (
    <section
      aria-label={label}
      className={cn("min-w-0 rounded-[16px] border border-[var(--ds-line)] bg-[var(--ds-surface)] px-5 pt-5 pb-[18px]", className)}
    >
      <header className="mb-3 flex min-w-0 flex-wrap items-center justify-between gap-x-4 gap-y-1.5">
        <h2 className="ds-title m-0 text-[22px] leading-tight font-normal tracking-[-0.015em] text-[var(--ds-ink)]">{title}</h2>
        {action}
      </header>
      {sub && <p className="m-0 -mt-1.5 mb-3.5 text-[13px] text-[var(--ds-muted)]">{sub}</p>}
      {children}
    </section>
  );
}

const CARD_LINK =
  "rounded-[4px] text-[13.5px] text-[var(--ds-ink)] underline-offset-[3px] transition-colors duration-[120ms] hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--ds-focus)]";

/* ─── Overview ────────────────────────────────────────────────────── */

function deltaTone(n: number | null, betterWhenUp = true): PillTone {
  if (n == null || n === 0) return "grey";
  return (n > 0) === betterWhenUp ? "green" : "red";
}

function signed(n: number, unit = ""): string {
  return `${n > 0 ? "+" : n < 0 ? "-" : ""}${Math.abs(n)}${unit}`;
}

function Overview({
  tiles,
  bars,
  frame,
  types,
  managers,
  failing,
  onCompliance,
}: {
  tiles: ReturnType<typeof reportTiles>;
  bars: ChartBar[];
  frame: PeriodFrame;
  types: TypeRow[];
  managers: ManagerRow[];
  failing: FailingRow[];
  onCompliance: () => void;
}) {
  const { timeToSend: t, compliance: c, highRisk: h } = tiles;
  const tileList: StatTileProps[] = [
    {
      label: "Letters sent this month",
      icon: Send,
      value: tiles.sentThisMonth,
      series: tiles.sentSeries,
      sparkLabel: `Letters sent, ${frame.label.toLowerCase()}`,
      footer: (
        <TileFoot dot pill={signed(tiles.sentDelta)} tone={deltaTone(tiles.sentDelta)}>
          vs this point in {tiles.lastMonthName}
        </TileFoot>
      ),
    },
    {
      label: "Compliance rate",
      icon: ShieldCheck,
      value: c.percent,
      unit: "%",
      series: c.series,
      // Strong: a health score of 80 or more with no required check failing.
      // Advisory workspace rules (Failing checks) are not part of it.
      sparkLabel: `Share of letters rated strong (health score 80 or more, no required check failing), ${frame.label.toLowerCase()}`,
      footer:
        c.deltaPts == null ? (
          <TileFoot>
            {c.strong} of {c.scored} rated strong
          </TileFoot>
        ) : (
          <TileFoot dot pill={signed(c.deltaPts, " pts")} tone={deltaTone(c.deltaPts)}>
            letters rated strong
          </TileFoot>
        ),
    },
    {
      label: "High-risk matters",
      icon: TriangleAlert,
      value: h.open,
      unit: "open",
      series: h.series,
      sparkColor: "var(--ds-amber-dot)",
      sparkLabel: `High-risk matters open, ${frame.label.toLowerCase()}`,
      footer: (
        <TileFoot dot pill={`${h.newThisWeek} new`} tone={h.newThisWeek > 0 ? "amber" : "grey"}>
          this week
        </TileFoot>
      ),
    },
    {
      label: "Average time to send",
      icon: Clock,
      value: t.days == null ? "None" : oneDp(t.days),
      unit: t.days == null ? undefined : oneDp(t.days) === "1" ? "day" : "days",
      series: t.series,
      sparkLabel: `Average days from draft to sent, ${frame.label.toLowerCase()}`,
      footer:
        t.days == null ? (
          <TileFoot>No letters sent yet</TileFoot>
        ) : t.delta == null || t.delta === 0 ? (
          <TileFoot dot={t.delta === 0} pill={t.delta === 0 ? "No change" : undefined}>
            draft to sent
          </TileFoot>
        ) : (
          <TileFoot dot pill={`${oneDp(Math.abs(t.delta))} ${t.delta < 0 ? "faster" : "slower"}`} tone={t.delta < 0 ? "green" : "red"}>
            draft to sent
          </TileFoot>
        ),
    },
  ];

  return (
    <>
      <section aria-label="Your workspace at a glance">
        <StatTiles tiles={tileList} />
      </section>
      <div className="mt-5 grid gap-5 xl:grid-cols-[minmax(0,1fr)_340px]">
        <LettersChartCard bars={bars} frame={frame} />
        <TypesCard types={types} frame={frame} />
      </div>
      <div className="mt-5 grid gap-5 xl:grid-cols-[minmax(0,1fr)_340px]">
        <ManagersCard managers={managers} />
        <FailingCard failing={failing} onViewAll={onCompliance} />
      </div>
    </>
  );
}

/* ─── Letters per month ───────────────────────────────────────────── */

const UNIT_WORD = { day: "day", week: "week", month: "month" } as const;
const CHART_H = 234;

function soFarLabel(frame: PeriodFrame, bars: ChartBar[]): string {
  const cur = bars[bars.length - 1];
  if (frame.unit === "day") return "Today so far";
  if (frame.unit === "week") return "This week so far";
  return `${cur ? cur.long.split(" ")[0] : "This month"} so far`;
}

function LettersChartCard({ bars, frame }: { bars: ChartBar[]; frame: PeriodFrame }) {
  const [asTable, setAsTable] = useState(false);
  const [hot, setHot] = useState<number | null>(null);
  const total = bars.reduce((n, b) => n + b.sent, 0);
  const per = bars.length ? total / bars.length : 0;
  const top = niceTop(Math.max(0, ...bars.map((b) => b.sent)));
  const unit = UNIT_WORD[frame.unit];
  const span = frame.label.replace(/^Last /, "last ").replace(/^All time$/, "all time");
  const sub =
    total === 0
      ? `No letters sent in the ${span} yet`
      : `${total} ${total === 1 ? "letter" : "letters"} sent in the ${span}, ${
          per < 0.5 ? `fewer than 1 a ${unit}` : `about ${Math.round(per)} a ${unit}`
        }`;
  const dense = bars.length > 13;
  const labelEvery = bars.length > 24 ? 6 : dense ? 5 : 1;
  const shownLabel = (i: number) => (bars.length - 1 - i) % labelEvery === 0;
  const chartName = `Letters sent per ${unit}, ${frame.label.toLowerCase()}. ${sub}.`;

  return (
    <ReportCard
      title={`Letters per ${unit}`}
      action={
        <div className="flex items-center gap-3.5">
          <span className="hidden items-center gap-4 text-[12px] text-[var(--ds-muted)] sm:flex" aria-hidden>
            <span className="inline-flex items-center gap-1.5">
              <i className="inline-block size-2.5 rounded-[3px]" style={{ background: BAR }} />
              Sent
            </span>
            <span className="inline-flex items-center gap-1.5">
              <i className="inline-block size-2.5 rounded-[3px]" style={BAR_SO_FAR} />
              {soFarLabel(frame, bars)}
            </span>
          </span>
          <button type="button" className={CARD_LINK} onClick={() => setAsTable((v) => !v)} aria-pressed={asTable}>
            {asTable ? "View as chart" : "View as table"}
          </button>
        </div>
      }
      sub={sub}
    >
      {asTable ? (
        <div className="max-h-[300px] overflow-y-auto">
          <table className="w-full border-collapse text-[13.5px]">
            <caption className="sr-only">{chartName}</caption>
            <thead>
              <tr className="text-left text-[12.5px] text-[var(--ds-subtle)]">
                <th className="border-b border-[var(--ds-line)] pb-2 font-medium capitalize">{unit}</th>
                <th className="border-b border-[var(--ds-line)] pb-2 text-right font-medium">Letters sent</th>
                <th className="border-b border-[var(--ds-line)] pb-2 text-right font-medium">Compliance</th>
              </tr>
            </thead>
            <tbody>
              {[...bars].reverse().map((b) => (
                <tr key={b.key} className="text-[var(--ds-body)]">
                  <td className="border-b border-[var(--ds-line-2)] py-2">
                    {b.long}
                    {b.current && <span className="text-[var(--ds-muted)]"> (so far)</span>}
                  </td>
                  <td className="border-b border-[var(--ds-line-2)] py-2 text-right tabular-nums">{b.sent}</td>
                  <td className="border-b border-[var(--ds-line-2)] py-2 text-right tabular-nums">
                    {b.compliance == null ? <span className="text-[var(--ds-subtle)]">None sent</span> : `${b.compliance}%`}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div role="group" aria-label={chartName} className="relative ml-7" style={{ height: CHART_H + 26 }}>
          <div className="absolute inset-x-0 top-0 bottom-[26px] flex flex-col justify-between" aria-hidden>
            {[4, 3, 2, 1, 0].map((g) => (
              <div
                key={g}
                className={cn("relative h-0 border-t", g === 0 ? "border-[var(--ds-line)]" : "border-[var(--ds-line-2)]")}
              >
                <span className="absolute -top-2 -left-7 w-5 text-right text-[11.5px] text-[var(--ds-subtle)] tabular-nums">
                  {(top / 4) * g}
                </span>
              </div>
            ))}
          </div>
          <div
            className={cn("absolute inset-0 grid px-1.5", dense ? "gap-x-[3px]" : "gap-x-1.5 md:gap-x-2.5")}
            style={{ gridTemplateColumns: `repeat(${bars.length}, minmax(0, 1fr))` }}
            onMouseLeave={() => setHot(null)}
          >
            {bars.map((b, i) => {
              const h = top ? (b.sent / top) * CHART_H : 0;
              const on = hot === i;
              return (
                <div key={b.key} className="flex min-w-0 flex-col items-center justify-end">
                  <div className="relative flex w-full items-end justify-center" style={{ height: CHART_H }}>
                    {on && (
                      <div
                        role="tooltip"
                        className={cn(
                          "pointer-events-none absolute z-10 flex flex-col gap-0.5 rounded-[10px] border border-[var(--ds-line)] bg-[var(--ds-surface)] px-[11px] py-2 text-[12px] whitespace-nowrap text-[var(--ds-muted)] shadow-[var(--ds-shadow-m)]",
                          i < 2 ? "left-0" : i > bars.length - 3 ? "right-0" : "left-1/2 -translate-x-1/2"
                        )}
                        style={{ bottom: h + 10 }}
                      >
                        <b className="text-[12.5px] font-medium text-[var(--ds-ink)]">{b.long}</b>
                        <span>
                          {b.sent} {b.sent === 1 ? "letter" : "letters"} sent{b.current ? " so far" : ""}
                        </span>
                        <span>{b.compliance == null ? "No letters to score" : `Compliance ${b.compliance}%`}</span>
                      </div>
                    )}
                    <button
                      type="button"
                      data-bar
                      aria-label={`${b.long}: ${b.sent} ${b.sent === 1 ? "letter" : "letters"} sent${
                        b.compliance == null ? "" : `, compliance ${b.compliance}%`
                      }`}
                      onMouseEnter={() => setHot(i)}
                      onFocus={() => setHot(i)}
                      onBlur={() => setHot((v) => (v === i ? null : v))}
                      className="flex h-full w-full max-w-[30px] items-end rounded-t-[4px] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--ds-focus)]"
                    >
                      <span
                        aria-hidden
                        className="block w-full rounded-t-[4px] transition-colors duration-[120ms]"
                        style={{
                          height: Math.max(b.sent > 0 ? 2 : 0, h),
                          ...(on ? { background: BAR_HOT } : b.current ? BAR_SO_FAR : { background: BAR }),
                        }}
                      />
                    </button>
                  </div>
                  <div
                    aria-hidden
                    className={cn(
                      "flex h-[26px] items-end text-[12px] whitespace-nowrap",
                      b.current ? "font-medium text-[var(--ds-ink)]" : "text-[var(--ds-subtle)]",
                      !shownLabel(i) && "invisible",
                      !dense && (bars.length - 1 - i) % 2 === 1 && "max-md:invisible"
                    )}
                  >
                    {b.short}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </ReportCard>
  );
}

/* ─── By letter type ──────────────────────────────────────────────── */

function TypesCard({ types, frame }: { types: TypeRow[]; frame: PeriodFrame }) {
  const [all, setAll] = useState(false);
  const rows = all ? types : topTypesWithOther(types, 6);
  const max = Math.max(1, ...rows.map((r) => r.count));
  return (
    <ReportCard
      title="By letter type"
      action={
        types.length > 7 ? (
          <button type="button" className={CARD_LINK} onClick={() => setAll((v) => !v)} aria-expanded={all}>
            {all ? "Show fewer" : "View all"}
          </button>
        ) : undefined
      }
      sub={frame.label}
    >
      {rows.length === 0 ? (
        <p className="m-0 py-6 text-center text-[13.5px] text-[var(--ds-muted)]">No letters in this period.</p>
      ) : (
        <ul className="m-0 flex list-none flex-col gap-[11px] p-0">
          {rows.map((r) => (
            <li key={r.id}>
              <div className="flex justify-between gap-3 text-[13.5px] text-[var(--ds-body)]">
                <span className="min-w-0 truncate">{r.label}</span>
                <b className="font-medium text-[var(--ds-ink)] tabular-nums">{r.count}</b>
              </div>
              <div className="mt-1.5 h-1.5 overflow-hidden rounded-[3px] bg-[var(--ds-surface-2)]" aria-hidden>
                <i className="block h-full rounded-[3px]" style={{ width: `${(r.count / max) * 100}%`, background: TRACK_FILL }} />
              </div>
            </li>
          ))}
        </ul>
      )}
    </ReportCard>
  );
}

/* ─── By manager ──────────────────────────────────────────────────── */

function ManagersCard({ managers }: { managers: ManagerRow[] }) {
  const [all, setAll] = useState(false);
  const rows = all ? managers : managers.slice(0, 4);
  return (
    <ReportCard
      title="By manager"
      action={
        managers.length > 4 ? (
          <button type="button" className={CARD_LINK} onClick={() => setAll((v) => !v)} aria-expanded={all}>
            {all ? "Show fewer" : `View all ${managers.length}`}
          </button>
        ) : undefined
      }
    >
      {rows.length === 0 ? (
        <p className="m-0 py-6 text-center text-[13.5px] text-[var(--ds-muted)]">No letters in this period.</p>
      ) : (
        <div className="-mx-5 overflow-x-auto px-5">
          <table className="w-full min-w-[560px] border-collapse text-[14px]">
            <thead>
              <tr className="text-[12.5px] text-[var(--ds-subtle)]">
                <th className="border-b border-[var(--ds-line)] pr-3 pb-2.5 text-left font-medium">Manager</th>
                <th className="border-b border-[var(--ds-line)] px-3 pb-2.5 text-right font-medium">Letters</th>
                <th className="border-b border-[var(--ds-line)] px-3 pb-2.5 text-right font-medium">Average time to send</th>
                <th className="border-b border-[var(--ds-line)] px-3 pb-2.5 text-right font-medium">Compliance</th>
                <th className="border-b border-[var(--ds-line)] pb-2.5 pl-3 text-right font-medium">Open matters</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((m) => (
                <tr key={m.name} className="text-[var(--ds-body)]">
                  <td className="border-b border-[var(--ds-line-2)] py-2.5 pr-3 align-middle">
                    <div className="flex min-w-0 items-center gap-2.5">
                      {m.name === NO_MANAGER ? (
                        <span
                          aria-hidden
                          className="grid size-7 shrink-0 place-items-center rounded-full bg-[var(--ds-surface-2)] text-[var(--ds-subtle)]"
                        >
                          <UserRound className="size-3.5" />
                        </span>
                      ) : (
                        <PersonDot name={m.name} size={28} />
                      )}
                      <div className="min-w-0">
                        <div className={cn("truncate font-medium", m.name === NO_MANAGER ? "text-[var(--ds-muted)]" : "text-[var(--ds-ink)]")}>
                          {m.name}
                        </div>
                        {m.department && <div className="mt-0.5 truncate text-[12.5px] text-[var(--ds-muted)]">{m.department}</div>}
                      </div>
                    </div>
                  </td>
                  <td className="border-b border-[var(--ds-line-2)] px-3 py-2.5 text-right tabular-nums">{m.letters}</td>
                  <td className="border-b border-[var(--ds-line-2)] px-3 py-2.5 text-right tabular-nums">
                    {m.avgDaysToSend == null ? (
                      <span className="text-[var(--ds-subtle)]">None sent</span>
                    ) : (
                      daysWords(m.avgDaysToSend)
                    )}
                  </td>
                  <td className="border-b border-[var(--ds-line-2)] px-3 py-2.5 text-right">
                    {m.compliance == null ? (
                      <span className="text-[var(--ds-subtle)]">Not scored</span>
                    ) : (
                      <span className="inline-flex items-center gap-2 tabular-nums">
                        <span className="h-[5px] w-11 overflow-hidden rounded-[3px] bg-[var(--ds-surface-3)]" aria-hidden>
                          <i className="block h-full" style={{ width: `${m.compliance}%`, background: TRACK_FILL }} />
                        </span>
                        {m.compliance}%
                      </span>
                    )}
                  </td>
                  <td className="border-b border-[var(--ds-line-2)] py-2.5 pl-3 text-right tabular-nums">
                    {m.openMatters === 0 ? <span className="text-[var(--ds-faint)]">0</span> : m.openMatters}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </ReportCard>
  );
}

/* ─── Failing checks ──────────────────────────────────────────────── */

function FailingCard({ failing, onViewAll }: { failing: FailingRow[]; onViewAll: () => void }) {
  const nav = useNavigate();
  return (
    <ReportCard
      title="Failing checks"
      action={
        <button type="button" className={CARD_LINK} onClick={onViewAll}>
          View all
        </button>
      }
    >
      {failing.length === 0 ? (
        <p className="m-0 flex items-center gap-2 py-3 text-[13.5px] text-[var(--ds-muted)]">
          <ShieldCheck className="size-4 text-[var(--ds-green-fg)]" aria-hidden />
          Every letter in this period passes every rule.
        </p>
      ) : (
        <ul className="m-0 list-none p-0">
          {failing.slice(0, 4).map((f) => (
            <li key={f.id} className="border-t border-[var(--ds-line-2)] first:border-t-0">
              <button
                type="button"
                onClick={() => nav(`/reports/checks/${f.id}`)}
                aria-label={`${f.count} letter${f.count === 1 ? "" : "s"} failing ${f.label}, open drill-down`}
                className="-mx-2 flex w-[calc(100%+16px)] items-start gap-[11px] rounded-[8px] px-2 py-2.5 text-left transition-colors duration-[120ms] hover:bg-[var(--ds-hover)] active:bg-[var(--ds-surface-2)] focus-visible:outline-2 focus-visible:outline-[var(--ds-focus)]"
              >
                <CircleAlert className="mt-px size-[15px] shrink-0 text-[var(--ds-amber-dot)]" aria-hidden />
                <span className="min-w-0 flex-1">
                  <span className="flex min-w-0 items-center gap-1.5">
                    <span className="truncate text-[13.5px] text-[var(--ds-ink)]">{f.label}</span>
                    {f.advisory && <AdvisoryTag />}
                  </span>
                  <span className="mt-0.5 block truncate text-[12px] text-[var(--ds-muted)]">{f.where}</span>
                </span>
                <span className="inline-flex items-center gap-1 text-[13px] font-medium whitespace-nowrap text-[var(--ds-ink)] tabular-nums">
                  {f.count}
                  <ChevronRight className="size-3.5 text-[var(--ds-faint)]" aria-hidden />
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </ReportCard>
  );
}

/** A quiet marker for a workspace rule that is not part of the health score. */
function AdvisoryTag() {
  return (
    <span
      title="Advisory: not part of the health score, so it does not change the compliance rate"
      className="inline-flex h-[18px] shrink-0 items-center rounded-[5px] bg-[var(--ds-surface-2)] px-1.5 text-[11px] font-medium text-[var(--ds-muted)]"
    >
      Advisory
    </span>
  );
}

/* ============================================================================
 * Compliance tab: the compliance health card, kept.
 * ==========================================================================*/

type FailingItem = { draft: Draft; check: HealthCheck };

function sevRank(c: HealthCheck): number {
  if (c.severity === "fail" && c.dimension === "compliance") return 0;
  if (c.severity === "fail") return 1;
  if (c.severity === "warn" && c.dimension === "compliance") return 2;
  return 3;
}

function topFailingChecks(scored: LetterFacts[], limit: number): FailingItem[] {
  // Each letter contributes its most severe check; fails first, then the worst letter.
  const candidates: (FailingItem & { score: number })[] = [];
  for (const s of scored) {
    if (!s.checks || !s.score) continue;
    const failed = s.checks.filter((c) => c.severity !== "pass");
    if (failed.length === 0) continue;
    const sorted = [...failed].sort((a, b) => sevRank(a) - sevRank(b));
    candidates.push({ draft: s.draft, check: sorted[0], score: s.score.score });
  }
  candidates.sort((a, b) => sevRank(a.check) - sevRank(b.check) || a.score - b.score);
  return candidates.slice(0, limit).map(({ draft, check }) => ({ draft, check }));
}

function ComplianceHealthCard({ letters, frameLabel }: { letters: LetterFacts[]; frameLabel: string }) {
  const nav = useNavigate();
  const scored = letters.filter((l) => l.score);
  const drafts = useMemo(() => letters.map((l) => l.draft), [letters]);

  if (scored.length === 0) {
    return (
      <ReportCard title="Compliance health">
        <EmptyState
          size="sm"
          icon={ShieldCheck}
          title="No letters to score"
          body="Health checks appear here once you have at least one HR draft."
        />
      </ReportCard>
    );
  }

  // Strong = a health score of 80 or more with no required check failing.
  const strong = scored.filter((s) => s.strong).length;
  const percent = Math.round((strong / scored.length) * 100);
  // Not strong, with a failing check or a weak band: worth counsel's eye.
  const counsel = scored.filter((s) => !s.strong && (s.score!.failCount > 0 || s.score!.band === "weak")).length;
  const dims = (["compliance", "quality", "risk"] as HealthDimension[]).map((dimension) => {
    const subset = scored
      .map((s) => s.score!.dimensions.find((d) => d.dimension === dimension))
      .filter((d): d is NonNullable<typeof d> => Boolean(d));
    return {
      dimension,
      averageScore: subset.length ? Math.round(subset.reduce((a, d) => a + d.score, 0) / subset.length) : 0,
    };
  });
  const topFailing = topFailingChecks(scored, 3);

  return (
    <ReportCard
      title="Compliance health"
      sub={`${scored.length} letter${scored.length === 1 ? "" : "s"} scored, ${frameLabel.toLowerCase()}`}
    >
      <div className="grid grid-cols-1 items-start gap-6 md:grid-cols-[auto_1fr]">
        <div className="flex items-center gap-4">
          <Ring percent={percent} size={84} stroke={8} />
          <div>
            <div className="text-[12.5px] text-[var(--ds-muted)]">Strong</div>
            <div className="ds-title mt-1 text-[34px] leading-none">{percent}%</div>
            <div className="mt-1.5 text-[12px] leading-snug text-[var(--ds-muted)]">
              {strong} of {scored.length} rated strong
            </div>
            <div className="mt-1 max-w-[260px] text-[12px] leading-snug text-[var(--ds-muted)]">
              Strong means a health score of 80 or more with no required check failing.
            </div>
          </div>
        </div>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          {dims.map((d) => (
            <DimensionBar key={d.dimension} {...d} />
          ))}
        </div>
      </div>

      <div
        data-testid="counsel-review-count"
        className="mt-5 flex items-center gap-2 rounded-[10px] bg-[var(--ds-surface-2)] px-3.5 py-2.5 text-[13.5px] text-[var(--ds-body)]"
      >
        <span
          aria-hidden
          className={cn("size-1.5 shrink-0 rounded-full", counsel > 0 ? "bg-[var(--ds-amber-dot)]" : "bg-[var(--ds-green-solid)]")}
        />
        {counsel > 0 ? (
          <span>
            <b className="font-medium text-[var(--ds-ink)]">{counsel}</b> {counsel === 1 ? "letter needs" : "letters need"} counsel
            review: a failing check or a weak score.
          </span>
        ) : (
          <span>No letters need counsel review.</span>
        )}
      </div>

      <FailingChecksList drafts={drafts} />

      {topFailing.length > 0 && (
        <div className="mt-5 border-t border-[var(--ds-line-2)] pt-5">
          <h3 className="m-0 mb-2.5 inline-flex items-center gap-1.5 text-[13.5px] font-semibold text-[var(--ds-ink)]">
            <AlertTriangle className="size-3.5" aria-hidden />
            Letters needing attention
          </h3>
          <ul className="m-0 list-none p-0">
            {topFailing.map((item) => (
              <li key={`${item.draft.id}:${item.check.id}`}>
                <button
                  type="button"
                  onClick={() => nav(`/editor/${item.draft.id}`)}
                  className="-mx-2 flex w-[calc(100%+16px)] items-start gap-3 rounded-[8px] border-b border-[var(--ds-line-2)] px-2 py-2.5 text-left transition-colors duration-[120ms] last:border-b-0 hover:bg-[var(--ds-hover)] active:bg-[var(--ds-surface-2)]"
                >
                  <span
                    aria-hidden
                    className={cn(
                      "mt-1.5 size-1.5 shrink-0 rounded-full",
                      item.check.severity === "fail" ? "bg-[var(--ds-red-fg)]" : "bg-[var(--ds-amber-dot)]"
                    )}
                  />
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-[13.5px] leading-snug font-medium text-[var(--ds-ink)]">{item.check.label}</div>
                    <div className="truncate text-[12px] text-[var(--ds-muted)]">
                      {briefTitleFor(item.draft)}
                      {item.draft.employee.legalName ? `, ${item.draft.employee.legalName}` : ""}
                    </div>
                  </div>
                  <ArrowRight className="mt-1 size-3 shrink-0 text-[var(--ds-subtle)]" aria-hidden />
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </ReportCard>
  );
}

function DimensionBar({ dimension, averageScore }: { dimension: HealthDimension; averageScore: number }) {
  const fg = averageScore >= 80 ? "var(--ds-green-fg)" : averageScore >= 60 ? "var(--ds-amber-fg)" : "var(--ds-red-fg)";
  return (
    <div className="rounded-[12px] bg-[var(--ds-surface-2)] p-3.5">
      <div className="mb-2.5 flex items-baseline justify-between">
        <div className="text-[12.5px] text-[var(--ds-muted)]">{DIMENSION_LABELS[dimension]}</div>
        <div className="text-[15px] font-semibold tabular-nums" style={{ color: fg }}>
          {averageScore}
        </div>
      </div>
      <div
        className="h-1.5 overflow-hidden rounded-full bg-[var(--ds-surface)]"
        role="progressbar"
        aria-label={`${DIMENSION_LABELS[dimension]} average`}
        aria-valuenow={averageScore}
        aria-valuemin={0}
        aria-valuemax={100}
      >
        <div className="h-full rounded-full" style={{ width: `${Math.min(100, Math.max(0, averageScore))}%`, background: fg }} />
      </div>
    </div>
  );
}

/**
 * One row per check with the count of letters failing it, each opening the
 * failing-check drill-down. The shared HEALTH_CHECKS list keeps this count
 * and the drill-down in step. Only checks with a failing letter show.
 */
function FailingChecksList({ drafts }: { drafts: Draft[] }) {
  const nav = useNavigate();
  const rows = useMemo(
    () =>
      HEALTH_CHECKS.map((c) => ({ check: c, count: failingCountForCheck(drafts, c.id) }))
        .filter((r) => r.count > 0)
        .sort((a, b) => b.count - a.count),
    [drafts]
  );
  if (rows.length === 0) {
    return (
      <p className="m-0 mt-5 flex items-center gap-2 border-t border-[var(--ds-line-2)] pt-5 text-[13.5px] text-[var(--ds-muted)]">
        <ShieldCheck className="size-4 text-[var(--ds-green-fg)]" aria-hidden />
        Every letter passes every rule.
      </p>
    );
  }
  return (
    <div className="mt-5 border-t border-[var(--ds-line-2)] pt-5">
      <h3 className="m-0 mb-1 inline-flex items-center gap-1.5 text-[13.5px] font-semibold text-[var(--ds-ink)]">
        <CircleAlert className="size-3.5 text-[var(--ds-amber-dot)]" aria-hidden />
        Failing checks
      </h3>
      <p className="m-0 mb-2.5 text-[12.5px] leading-snug text-[var(--ds-muted)]">
        Rules DraftHR runs on every letter. Advisory rules are not part of the health score, so they do not change
        the compliance rate.
      </p>
      <ul className="m-0 list-none p-0">
        {rows.map(({ check, count }) => (
          <FailingCheckRow key={check.id} check={check} count={count} onClick={() => nav(`/reports/checks/${check.id}`)} />
        ))}
      </ul>
    </div>
  );
}

function FailingCheckRow({ check, count, onClick }: { check: ReportsHealthCheck; count: number; onClick: () => void }) {
  const copy = ruleCopy(check.id, check);
  return (
    <li>
      <button
        type="button"
        aria-label={`${count} letter${count === 1 ? "" : "s"} failing ${copy.label}, open drill-down`}
        onClick={onClick}
        className="-mx-2 flex w-[calc(100%+16px)] items-start gap-3 rounded-[8px] border-b border-[var(--ds-line-2)] px-2 py-2.5 text-left transition-colors duration-[120ms] last:border-b-0 hover:bg-[var(--ds-hover)] active:bg-[var(--ds-surface-2)] focus-visible:outline-2 focus-visible:outline-[var(--ds-focus)]"
      >
        <span aria-hidden className="mt-1.5 size-1.5 shrink-0 rounded-full bg-[var(--ds-red-fg)]" />
        <div className="min-w-0 flex-1">
          <div className="flex min-w-0 items-center gap-1.5 text-[13.5px] leading-snug font-medium text-[var(--ds-ink)]">
            <span className="truncate">{copy.label}</span>
            {copy.advisory && <AdvisoryTag />}
            <span className="shrink-0 font-normal text-[var(--ds-muted)]">
              {count} letter{count === 1 ? "" : "s"}
            </span>
          </div>
          <div className="truncate text-[12px] text-[var(--ds-muted)]">{copy.description}</div>
        </div>
        <ChevronRight className="mt-0.5 size-3.5 shrink-0 text-[var(--ds-faint)]" aria-hidden />
      </button>
    </li>
  );
}

function Ring({ percent, size, stroke }: { percent: number; size: number; stroke: number }) {
  const r = (size - stroke) / 2;
  const circ = 2 * Math.PI * r;
  const offset = circ - (Math.max(0, Math.min(100, percent)) / 100) * circ;
  const tone = percent >= 80 ? "var(--ds-green-fg)" : percent >= 60 ? "var(--ds-amber-fg)" : "var(--ds-red-fg)";
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} role="img" aria-label={`${percent}% of letters strong`}>
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--ds-line-2)" strokeWidth={stroke} />
      <circle
        cx={size / 2}
        cy={size / 2}
        r={r}
        fill="none"
        stroke={tone}
        strokeWidth={stroke}
        strokeDasharray={circ}
        strokeDashoffset={offset}
        strokeLinecap="round"
        transform={`rotate(-90 ${size / 2} ${size / 2})`}
      />
    </svg>
  );
}

/* ============================================================================
 * Risk tab: the risk exposure heatmap, kept.
 * ==========================================================================*/

function RiskExposureCard({ matters, drafts }: { matters: Matter[]; drafts: Draft[] }) {
  const nav = useNavigate();
  const bands = useMemo(() => groupMattersByBand(matters, drafts), [matters, drafts]);
  const totalExposure = matters.reduce((acc, m) => acc + (typeof m.exposureGBP === "number" ? m.exposureGBP : 0), 0);
  const hasExposure = matters.some((m) => typeof m.exposureGBP === "number" && m.exposureGBP > 0);

  if (matters.length === 0) {
    return (
      <ReportCard title="Risk exposure">
        <EmptyState
          size="sm"
          icon={TrendingUp}
          title="No active matters"
          body="The risk heatmap fills in as you open matters."
          primary={{ label: "Open Matters", to: "/matters" }}
        />
      </ReportCard>
    );
  }

  const subtitle = hasExposure
    ? `${formatGBP(totalExposure)} tracked across ${matters.length} ${matters.length === 1 ? "case" : "cases"}`
    : `${matters.length} active ${matters.length === 1 ? "case" : "cases"}`;
  const order: RiskBand[] = ["low", "moderate", "high", "critical"];

  return (
    <ReportCard title="Risk exposure" sub={subtitle} label="Risk band heatmap">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {order.map((band) => {
          const tone = bandTone(band);
          const list = bands[band];
          return (
            <div key={band} className="flex min-w-0 flex-col overflow-hidden rounded-[12px] border border-[var(--ds-line)]">
              <div className="mx-1 mt-1 flex items-baseline justify-between rounded-[8px] px-3 py-2.5" style={{ background: tone.bg }}>
                <span className="text-[12.5px] font-medium capitalize" style={{ color: tone.fg }}>
                  {band}
                </span>
                <span className="ds-title text-[24px] leading-none" style={{ color: tone.fg }}>
                  {list.length}
                </span>
              </div>
              <div className="flex min-h-[80px] flex-1 flex-col gap-1.5 p-2">
                {list.length === 0 ? (
                  <div className="grid flex-1 place-items-center text-[12px] text-[var(--ds-subtle)]">None</div>
                ) : (
                  list.map((m) => (
                    <button
                      key={m.id}
                      type="button"
                      aria-label={`Open ${m.name} drill-down`}
                      onClick={() => nav(`/reports/matters/${m.id}`)}
                      className="rounded-[7px] bg-[var(--ds-surface-2)] px-2.5 py-2 text-left transition-colors duration-[120ms] hover:bg-[var(--ds-surface-3)] focus-visible:outline-2 focus-visible:outline-[var(--ds-focus)]"
                    >
                      <div className="truncate text-[12.5px] leading-snug font-medium text-[var(--ds-ink)]">{m.name}</div>
                      {typeof m.exposureGBP === "number" && m.exposureGBP > 0 ? (
                        <div className="mt-0.5 text-[12px] text-[var(--ds-muted)] tabular-nums">{formatGBP(m.exposureGBP)}</div>
                      ) : m.parties?.primaryName ? (
                        <div className="mt-0.5 truncate text-[12px] text-[var(--ds-muted)]">{m.parties.primaryName}</div>
                      ) : null}
                    </button>
                  ))
                )}
              </div>
            </div>
          );
        })}
      </div>
    </ReportCard>
  );
}

function groupMattersByBand(matters: Matter[], drafts: Draft[]): Record<RiskBand, Matter[]> {
  const out: Record<RiskBand, Matter[]> = { low: [], moderate: [], high: [], critical: [] };
  for (const m of matters) {
    let band: RiskBand = "low";
    try {
      band = effectiveRiskBand(m, draftsInMatter(drafts, m.id)) ?? "low";
    } catch {
      band = "low";
    }
    out[band].push(m);
  }
  // Heaviest exposure first, then the most recent activity.
  for (const band of Object.keys(out) as RiskBand[]) {
    out[band].sort((a, b) => (b.exposureGBP ?? 0) - (a.exposureGBP ?? 0) || b.updatedAt - a.updatedAt);
  }
  return out;
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
 * Operations tab: letters per month, time to resolve, time to send and the
 * most-used letter types, kept.
 * ==========================================================================*/

function OperationsCard({
  bars,
  frame,
  matters,
  letters,
  types,
}: {
  bars: ChartBar[];
  frame: PeriodFrame;
  matters: Matter[];
  letters: LetterFacts[];
  types: TypeRow[];
}) {
  const resolution = useMemo(() => timeToResolve(matters), [matters]);
  const sent = letters.filter((l) => l.daysToSend != null);
  const avgSend = sent.length ? sent.reduce((n, l) => n + (l.daysToSend ?? 0), 0) / sent.length : null;
  const unit = UNIT_WORD[frame.unit];
  const top = types.slice(0, 8);

  return (
    <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_340px]">
      <ReportCard
        title={`Letters per ${unit}`}
        sub={`Sent and drafted, ${frame.label.toLowerCase()}`}
        action={
          <span className="flex items-center gap-4 text-[12px] text-[var(--ds-muted)]" aria-hidden>
            <span className="inline-flex items-center gap-1.5">
              <i className="inline-block size-2.5 rounded-[3px]" style={{ background: BAR_HOT }} />
              Sent
            </span>
            <span className="inline-flex items-center gap-1.5">
              <i className="inline-block size-2.5 rounded-[3px]" style={{ background: BAR }} />
              Drafted
            </span>
          </span>
        }
      >
        <PairedBars bars={bars} unit={unit} />
      </ReportCard>
      <div className="flex min-w-0 flex-col gap-5">
        <ReportCard title="Time to resolve">
          {resolution.count === 0 ? (
            <p className="m-0 text-[13.5px] leading-snug text-[var(--ds-muted)]">
              No closed matters yet. Close one to see how long matters take to resolve.
            </p>
          ) : (
            <div className="grid grid-cols-2 gap-3">
              <Stat
                label="Median"
                value={`${resolution.medianDays}d`}
                detail={`across ${resolution.count} closed ${resolution.count === 1 ? "matter" : "matters"}`}
              />
              <Stat label="P90" value={`${resolution.p90Days}d`} detail="90th percentile" />
            </div>
          )}
        </ReportCard>
        <ReportCard title="Average time to send">
          {avgSend == null ? (
            <p className="m-0 text-[13.5px] text-[var(--ds-muted)]">No letters sent in this period yet.</p>
          ) : (
            <Stat
              label="Draft to sent"
              value={`${oneDp(avgSend)}d`}
              detail={`across ${sent.length} sent ${sent.length === 1 ? "letter" : "letters"}`}
            />
          )}
        </ReportCard>
      </div>
      <ReportCard title="Most-used letter types" sub={frame.label} className="xl:col-span-2">
        {top.length === 0 ? (
          <p className="m-0 text-[13.5px] text-[var(--ds-muted)]">No drafts yet.</p>
        ) : (
          <ul className="m-0 list-none p-0">
            {top.map((t) => (
              <li key={t.id} className="flex items-center gap-3 border-b border-[var(--ds-line-2)] py-2 last:border-b-0">
                <FileText className="size-3.5 shrink-0 text-[var(--ds-subtle)]" aria-hidden />
                <div className="min-w-0 flex-1 truncate text-[13.5px] text-[var(--ds-ink)]">{t.label}</div>
                <div className="h-1.5 w-20 shrink-0 overflow-hidden rounded-full bg-[var(--ds-surface-2)]" aria-hidden>
                  <div className="h-full" style={{ width: `${(t.count / top[0].count) * 100}%`, background: TRACK_FILL }} />
                </div>
                <div className="w-7 text-right text-[13px] font-medium text-[var(--ds-ink)] tabular-nums">{t.count}</div>
              </li>
            ))}
          </ul>
        )}
      </ReportCard>
    </div>
  );
}

function PairedBars({ bars, unit }: { bars: ChartBar[]; unit: string }) {
  const data = bars;
  const W = 640;
  const H = 180;
  const padX = 4;
  const padTop = 16;
  const padBottom = 22;
  const innerW = W - padX * 2;
  const innerH = H - padTop - padBottom;
  const max = Math.max(1, ...bars.map((b) => Math.max(b.sent, b.drafted)));
  const slot = innerW / bars.length;
  const barW = Math.min(14, (slot * 0.7) / 2);
  const every = bars.length > 24 ? 6 : bars.length > 13 ? 5 : 1;
  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      width="100%"
      preserveAspectRatio="xMidYMid meet"
      className="block"
      role="img"
      aria-label={
        unit === "month"
          ? `Letters drafted across the last ${data.length} months`
          : `Letters drafted across the last ${data.length} ${unit}s`
      }
    >
      {bars.map((b, i) => {
        const x = padX + slot * i + slot / 2;
        const hs = (b.sent / max) * innerH;
        const hd = (b.drafted / max) * innerH;
        return (
          <g key={b.key}>
            <title>{`${b.long}: ${b.sent} sent, ${b.drafted} drafted`}</title>
            <rect x={x - barW - 1} y={padTop + innerH - hd} width={barW} height={Math.max(b.drafted ? 2 : 0, hd)} rx={3} fill={BAR} />
            <rect x={x + 1} y={padTop + innerH - hs} width={barW} height={Math.max(b.sent ? 2 : 0, hs)} rx={3} fill={BAR_HOT} />
            {(bars.length - 1 - i) % every === 0 && (
              <text
                x={x}
                y={H - 6}
                textAnchor="middle"
                fontSize="11"
                fill={b.current ? "var(--ds-ink)" : "var(--ds-subtle)"}
                fontWeight={b.current ? 500 : 400}
                fontFamily="var(--font-sans)"
              >
                {b.short}
              </text>
            )}
          </g>
        );
      })}
      <line x1={0} x2={W} y1={padTop + innerH + 0.5} y2={padTop + innerH + 0.5} stroke="var(--ds-line)" />
    </svg>
  );
}

function Stat({ label, value, detail }: { label: string; value: string; detail: string }) {
  return (
    <div className="min-w-0 rounded-[12px] bg-[var(--ds-surface-2)] p-3.5">
      <div className="text-[12.5px] text-[var(--ds-muted)]">{label}</div>
      <div className="mt-2 text-[30px] leading-none font-medium tracking-[-0.03em] text-[var(--ds-ink)]">{value}</div>
      <div className="mt-2 text-[12.5px] leading-snug text-[var(--ds-muted)]">{detail}</div>
    </div>
  );
}

function formatGBP(n: number): string {
  try {
    return new Intl.NumberFormat("en-GB", { style: "currency", currency: "GBP", maximumFractionDigits: 0 }).format(n);
  } catch {
    return `£${Math.round(n).toLocaleString()}`;
  }
}
