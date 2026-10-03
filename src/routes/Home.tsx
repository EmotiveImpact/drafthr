import { useMemo, useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import { formatDistanceToNowStrict } from "date-fns";
import {
  PlusCircle,
  FileText,
  Mail,
  ShieldAlert,
  ShieldCheck,
  Scale,
  FileWarning,
  FileSearch,
  ScrollText,
  Sparkles,
  CalendarClock,
  ArrowRight,
  AlertCircle,
  Clock,
  TrendingUp,
  Activity,
  Users,
  X,
} from "lucide-react";
import type {
  Draft,
  LetterTypeId,
  Matter,
  Mode,
  RiskBand,
  Task,
} from "@/lib/letters/types";
import { useDraftStore } from "@/lib/store";
import { useProfileStore, type WorkspaceRole } from "@/lib/profile";
import { letterCatalogByMode, getLetterMeta } from "@/lib/letters/catalog";
import { briefTitleFor } from "@/lib/letters/display";
import { daysUntilDateOnly, formatDateOnly } from "@/lib/date-only";
import { EmptyState } from "@/components/ds";
import { getDraftReadiness } from "@/lib/finalize/readiness";
import { deriveEmployeesFromDrafts } from "@/lib/employees";
import { draftsInMatter } from "@/lib/matters";
import { effectiveRiskBand } from "@/lib/matters/risk";

const BACKFILL_DISMISS_KEY = "drafthr.hr.employeeBackfillDismissed.v1";

/* ============================================================================
 * Home — the landing dashboard.
 *
 * Layout (matches /home-v2-mockup.html):
 *
 *   ┌ breadcrumb
 *   │
 *   ├ HERO ─ eyebrow · serif H1 (greeting + italic accent) · lede · two CTAs
 *   │       Decorative giant "D" watermark in the top-right corner.
 *   │
 *   ├ CATALOG ─ 3×2 grid of flagship letter types as tactile tiles. This is
 *   │           the page's real workhorse — the place a user goes to start.
 *   │
 *   ├ CONTINUE + UPCOMING ─ a quiet two-column row. Rendered only when there
 *   │                       are drafts or deadlines to surface (no
 *   │                       "0 / 0 / 0 / 0" graveyard for new users).
 *   │
 *   └ TRUST FOOTER ─ four legal-coverage chips + "not legal advice".
 *
 * Previous home had a four-up stat row, Matters cards, AutoGroup rows, and a
 * buried "Quick start" section. Those moved to /matters or are gone — the
 * home now exists to start a letter, resume one in progress, or eyeball
 * what's due next.
 * ==========================================================================*/

export function Home({ mode }: { mode: Mode }) {
  if (mode === "employer") {
    return <HrDashboard />;
  }
  return <EmployeeHome mode={mode} />;
}

/* ============================================================================
 * HR Dashboard — portfolio view for HR/Management mode
 * ==========================================================================*/

function HrDashboard() {
  const nav = useNavigate();
  const drafts = useDraftStore((s) => s.drafts);
  const matters = useDraftStore((s) => s.matters);
  const tasks = useDraftStore((s) => s.tasks);
  const employees = useDraftStore((s) => s.employees);
  const createEmployee = useDraftStore((s) => s.createEmployee);
  const profile = useProfileStore((s) => s.profile);

  const prefix = "/hr";
  const firstName =
    profile.personal.preferredName ||
    profile.personal.legalName?.split(/\s+/)[0] ||
    "";

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
  const latestEmployerDraft = useMemo(
    () => allDrafts.filter((d) => d.mode === "employer").sort((a, b) => b.updatedAt - a.updatedAt)[0],
    [allDrafts]
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

  // RECENT ACTIVITY: flatten draft timelines, sort, take 5
  const recent = useMemo(() => deriveRecentActivity(drafts, "employer"), [drafts]);

  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-6 py-6 sm:py-8">
      <div className="text-[12px] text-[var(--ds-muted)] mb-3.5 flex items-center gap-1.5">
        <span>HR / Management</span>
        <span className="opacity-40">/</span>
        <span className="text-[var(--ds-ink)] font-medium">Dashboard</span>
      </div>

      {/* Employee backfill — surfaces once when HR has drafts but the
       * normalised employee directory is empty. One click migrates every
       * person mentioned in existing drafts into the workspace directory. */}
      {backfillCount > 0 && (
        <div
          className="mb-5 rounded-[12px] border border-[var(--ds-line)] bg-gradient-to-r from-[var(--ds-blue-bg)]/40 to-[var(--ds-surface)] px-4 py-3.5 flex items-start gap-3"
        >
          <span
            aria-hidden
            className="mt-0.5 size-9 shrink-0 rounded-[9px] bg-[var(--ds-blue-bg)] text-[var(--ds-blue-fg)] grid place-items-center"
          >
            <Users className="size-[18px]" />
          </span>
          <div className="flex-1 min-w-0">
            <h3 className="m-0 text-[13.5px] font-semibold text-[var(--ds-ink)]">
              Build your employee directory from existing drafts
            </h3>
            <p className="m-0 text-[12.5px] text-[var(--ds-body)] mt-0.5 leading-snug">
              {backfillCount} unique{" "}
              {backfillCount === 1 ? "person" : "people"} appear across your
              drafts. Import them so future letters, matters, and the new
              Employees page link to one record per person.
            </p>
            <div className="flex items-center gap-2 mt-2.5">
              <button
                type="button"
                onClick={onImportEmployees}
                className="inline-flex items-center gap-1.5 px-3 py-[6px] rounded-[7px] bg-[var(--ds-ink)] text-white font-semibold text-[12px] hover:-translate-y-px transition"
              >
                Import {backfillCount}{" "}
                {backfillCount === 1 ? "employee" : "employees"}
                <ArrowRight className="size-3" />
              </button>
              <Link
                to="/employees"
                className="inline-flex items-center gap-1 text-[12px] font-semibold text-[var(--ds-muted)] hover:text-[var(--ds-ink)] transition"
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
            className="text-[var(--ds-muted)] hover:text-[var(--ds-ink)] transition shrink-0 -m-1 p-1"
          >
            <X className="size-3.5" />
          </button>
        </div>
      )}

      {/* Greeting */}
      <header className="mb-6">
        <h1
          className="m-0 text-[var(--ds-ink)] font-semibold"
          style={{
            fontSize: "clamp(26px, 4vw, 34px)",
            lineHeight: 1.15,
            letterSpacing: "-0.02em",
          }}
        >
          {greeting}.
        </h1>
        <p className="m-0 mt-1.5 text-[14.5px] text-[var(--ds-body)]">
          You own{" "}
          <span className="font-semibold text-[var(--ds-ink)]">
            {activeMatters.length} active {activeMatters.length === 1 ? "matter" : "matters"}
          </span>
          {todayItems.length > 0 ? (
            <>
              {" · "}
              <span className="font-semibold text-[var(--ds-amber-fg)]">
                {todayItems.length} need{todayItems.length === 1 ? "s" : ""} you today
              </span>
            </>
          ) : null}
        </p>
      </header>

      {/* Three-panel row */}
      <div
        className="grid grid-cols-1 md:grid-cols-3 gap-3.5 mb-7"
      >
        <TodayCard items={todayItems} prefix={prefix} continueDraft={latestEmployerDraft} />
        <RiskRegister summary={riskSummary} />
        <ComplianceHealth summary={complianceSummary} prefix={prefix} />
      </div>

      {/* Recent activity */}
      <section
        className="bg-[var(--ds-surface)] border border-[var(--ds-line)] rounded-[12px] overflow-hidden mb-6"
      >
        <header className="flex items-center justify-between px-[18px] py-3.5 border-b border-[var(--ds-line-2)]">
          <h3 className="m-0 text-[13px] font-semibold uppercase tracking-[0.08em] text-[var(--ds-muted)] inline-flex items-center gap-2">
            <Activity className="size-3.5" />
            Recent activity
          </h3>
        </header>
        {recent.length === 0 ? (
          <div className="px-[18px] py-5 text-[13px] text-[var(--ds-muted)]">
            Activity will appear here as you draft, edit, and export letters.
          </div>
        ) : (
          <ul className="m-0 p-0 list-none">
            {recent.map((r) => (
              <li
                key={r.id}
                className="flex items-center gap-3 px-[18px] py-2.5 border-b border-[var(--ds-line-2)] last:border-b-0"
              >
                <span
                  aria-hidden
                  className="w-1.5 h-1.5 rounded-full bg-[var(--ds-subtle)] shrink-0"
                />
                <span className="text-[13px] text-[var(--ds-body)] flex-1 min-w-0 truncate">
                  {r.label}
                </span>
                <span className="text-[11px] text-[var(--ds-muted)] tabular-nums shrink-0">
                  {r.ago}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* Footer CTAs */}
      <div
        className="flex flex-wrap items-center gap-2.5 mb-2"
      >
        <button
          type="button"
          onClick={() => nav("/matters")}
          className="inline-flex items-center gap-2 px-[16px] py-[10px] rounded-[9px] bg-[var(--ds-ink)] text-white font-semibold text-[13.5px] shadow-sm hover:-translate-y-px hover:shadow-md transition"
        >
          <PlusCircle className="size-4" />
          New matter
        </button>
        <Link
          to={`${prefix}/new`}
          className="inline-flex items-center gap-2 px-[16px] py-[10px] rounded-[9px] bg-transparent text-[var(--ds-ink)] font-semibold text-[13.5px] border border-[var(--ds-line)] hover:bg-white hover:border-[var(--ds-subtle)] transition"
        >
          Browse templates
          <ArrowRight className="size-3.5 opacity-70" />
        </Link>
      </div>
    </div>
  );
}

/* ─── Dashboard panels ─────────────────────────────────────────────────── */

type TodayItem = {
  id: string;
  label: string;
  matterName?: string;
  matterId?: string;
  dueLabel: string;
  urgent: boolean;
  kind: "task" | "next-action" | "review";
  /** Deep-link target — set on "review" items so the row jumps to the editor. */
  draftId?: string;
};

function TodayCard({
  items,
  prefix,
  continueDraft,
}: {
  items: TodayItem[];
  prefix: string;
  continueDraft?: Draft;
}) {
  const nav = useNavigate();
  const emptyAction = emptyTodayAction(continueDraft, prefix);
  return (
    <DashboardPanel
      icon={Clock}
      title="Today"
      badge={items.length > 0 ? String(items.length) : undefined}
    >
      {items.length === 0 ? (
        <PanelEmpty
          body="Nothing due today."
          ctaLabel={emptyAction.label}
          onClick={() => nav(emptyAction.href)}
        />
      ) : (
        <>
          <ul className="m-0 p-0 list-none flex-1">
            {items.slice(0, 5).map((it) => {
              const onClick = it.draftId
                ? () => nav(`/editor/${it.draftId}`)
                : it.matterId
                  ? () => nav(`/matters/${it.matterId}`)
                  : undefined;
              return (
                <li
                  key={it.id}
                  className={`flex items-start gap-2.5 py-2 border-b border-[var(--ds-line-2)] last:border-b-0 ${onClick ? "cursor-pointer hover:bg-[var(--ds-line-2)]/30 -mx-2 px-2 rounded transition" : ""}`}
                  onClick={onClick}
                  role={onClick ? "button" : undefined}
                >
                  <AlertCircle
                    className={`size-3.5 mt-0.5 shrink-0 ${
                      it.urgent ? "text-[var(--ds-amber-fg)]" : "text-[var(--ds-subtle)]"
                    }`}
                  />
                  <div className="min-w-0 flex-1">
                    <div className="text-[13px] font-semibold text-[var(--ds-ink)] leading-snug truncate">
                      {it.label}
                    </div>
                    <div className="text-[11.5px] text-[var(--ds-muted)] truncate">
                      {it.dueLabel}
                      {it.matterName ? ` · ${it.matterName}` : ""}
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
          {/* Until /today is a thing, "See all tasks" lands on the matters
           * index — tasks live inside matters today, so it's the right
           * destination by content even if not by name. */}
          <PanelFooterButton
            onClick={() => nav('/matters')}
            label="See all in matters"
          />
        </>
      )}
    </DashboardPanel>
  );
}

type RiskSummary = {
  totalExposure: number;
  matterCount: number;
  bands: Record<RiskBand, number>;
  hasAnyExposure: boolean;
};

function RiskRegister({ summary }: { summary: RiskSummary }) {
  const nav = useNavigate();
  const bands: RiskBand[] = ["low", "moderate", "high", "critical"];
  // Show the panel when there are matters at all — even with zero
  // tagged exposure, the derived band heatmap is useful signal.
  return (
    <DashboardPanel icon={TrendingUp} title="Risk">
      {summary.matterCount === 0 ? (
        <PanelEmpty
          body="Risk register populates as you open matters."
          ctaLabel="Browse matters"
          onClick={() => nav('/matters')}
        />
      ) : (
        <>
          <div className="flex-1">
            <div
              className="text-[var(--ds-ink)] font-semibold tabular-nums"
              style={{
                fontSize: "clamp(22px, 3vw, 28px)",
                letterSpacing: "-0.02em",
                lineHeight: 1.1,
              }}
            >
              {summary.hasAnyExposure ? formatGBP(summary.totalExposure) : "—"}
            </div>
            <div className="text-[11.5px] text-[var(--ds-muted)] mt-1 leading-snug">
              {summary.hasAnyExposure
                ? `tribunal-style exposure across ${summary.matterCount} active ${summary.matterCount === 1 ? "case" : "cases"}`
                : `${summary.matterCount} active ${summary.matterCount === 1 ? "case" : "cases"} — add exposure on a matter to track £`}
            </div>

            {/* Tiny heatmap */}
            <div className="mt-4 grid grid-cols-4 gap-1.5" role="img" aria-label="Risk band heatmap">
              {bands.map((b) => {
                const count = summary.bands[b];
                const tone = bandTone(b);
                return (
                  <div
                    key={b}
                    className="rounded-[6px] px-1.5 py-1.5 text-center"
                    style={{ background: tone.bg }}
                  >
                    <div
                      className="text-[13px] font-semibold tabular-nums leading-none"
                      style={{ color: tone.fg }}
                    >
                      {count}
                    </div>
                    <div
                      className="text-[9px] uppercase tracking-wider mt-1"
                      style={{ color: tone.fg, opacity: 0.85 }}
                    >
                      {b}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
          <PanelFooterButton
            onClick={() => nav("/matters")}
            label="Risk register"
          />
        </>
      )}
    </DashboardPanel>
  );
}

type ComplianceSummary = {
  totalDrafts: number;
  strongDrafts: number;
  needsReview: number;
  percent: number;
};

function ComplianceHealth({
  summary,
  prefix,
}: {
  summary: ComplianceSummary;
  prefix: string;
}) {
  const nav = useNavigate();
  return (
    <DashboardPanel icon={ShieldCheck} title="Compliance">
      {summary.totalDrafts === 0 ? (
        <PanelEmpty
          body="No letters drafted yet."
          ctaLabel="Browse templates"
          onClick={() => nav(`${prefix}/new`)}
        />
      ) : (
        <>
          <div className="flex-1">
            <div className="flex items-baseline gap-1.5">
              <div
                className="text-[var(--ds-ink)] font-semibold tabular-nums"
                style={{
                  fontSize: "clamp(22px, 3vw, 28px)",
                  letterSpacing: "-0.02em",
                  lineHeight: 1.1,
                }}
              >
                {summary.percent}%
              </div>
              <TrendingUp className="size-3.5 text-[var(--ds-green-fg)]" />
            </div>
            <div className="text-[11.5px] text-[var(--ds-muted)] mt-1 leading-snug">
              {summary.strongDrafts} of {summary.totalDrafts} clearing all health checks
            </div>

            {summary.needsReview > 0 && (
              <div className="mt-4 text-[12px] text-[var(--ds-body)] leading-snug bg-[var(--ds-amber-bg)] text-[var(--ds-amber-fg)] rounded-[8px] px-2.5 py-2 font-medium">
                {summary.needsReview} letter{summary.needsReview === 1 ? "" : "s"} need counsel
                review before send
              </div>
            )}
          </div>
          <PanelFooterButton
            onClick={() => nav("/activity")}
            label="Audit log"
          />
        </>
      )}
    </DashboardPanel>
  );
}

/* ─── Panel primitives ─────────────────────────────────────────────────── */

function DashboardPanel({
  icon: Icon,
  title,
  badge,
  children,
}: {
  icon: typeof Clock;
  title: string;
  badge?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="bg-[var(--ds-surface)] border border-[var(--ds-line)] rounded-[12px] p-[18px] flex flex-col min-h-[200px]">
      <header className="flex items-center justify-between mb-3">
        <h3 className="m-0 text-[12px] font-semibold uppercase tracking-[0.08em] text-[var(--ds-muted)] inline-flex items-center gap-1.5">
          <Icon className="size-3.5" />
          {title}
        </h3>
        {badge ? (
          <span className="text-[11px] text-[var(--ds-muted)] font-semibold tabular-nums bg-[var(--ds-surface-2)] px-2 py-0.5 rounded-full">
            {badge}
          </span>
        ) : null}
      </header>
      {children}
    </section>
  );
}

function PanelEmpty({
  body,
  ctaLabel,
  onClick,
}: {
  body: string;
  ctaLabel: string;
  onClick: () => void;
}) {
  return (
    <div className="flex-1 flex flex-col justify-center">
      <p className="m-0 text-[13px] text-[var(--ds-muted)] leading-snug">{body}</p>
      <button
        type="button"
        onClick={onClick}
        className="mt-3 self-start inline-flex items-center gap-1.5 text-[12.5px] font-semibold text-[var(--ds-ink)] hover:underline"
      >
        {ctaLabel}
        <ArrowRight className="size-3" />
      </button>
    </div>
  );
}

function PanelFooterButton({
  label,
  onClick,
}: {
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="mt-3 self-start inline-flex items-center gap-1 text-[12px] font-semibold text-[var(--ds-muted)] hover:text-[var(--ds-ink)] transition"
    >
      {label}
      <ArrowRight className="size-3" />
    </button>
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
            ? "due soon"
            : days < 0
            ? `${Math.abs(days)}d overdue`
            : days === 0
            ? "due today"
            : `due in ${days}d`,
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
      dueLabel: "next action",
      urgent: m.riskBand === "high" || m.riskBand === "critical",
      kind: "next-action" as const,
    }));

  // In-review drafts surface to reviewers (and admin/owner who can act as
  // reviewer in the single-user case). Empty for drafter/viewer roles.
  const reviewItems: TodayItem[] =
    role && (role === "owner" || role === "admin" || role === "reviewer")
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
            dueLabel: "awaiting approval",
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

export function deriveComplianceSummary(
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
      const readiness = getDraftReadiness(d);
      if (readiness.status === "ready_to_send" || readiness.status === "sent") {
        strong += 1;
      } else if (readiness.blockers.length > 0) {
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

export function emptyTodayAction(
  continueDraft: Pick<Draft, "id"> | undefined,
  prefix: string,
): { label: string; href: string } {
  return continueDraft
    ? { label: "Continue your latest letter", href: `/editor/${continueDraft.id}` }
    : { label: "Create your first letter", href: `${prefix}/new` };
}

type RecentItem = { id: string; label: string; ago: string; ts: number };

function deriveRecentActivity(
  drafts: Record<string, Draft>,
  mode: Mode
): RecentItem[] {
  const rows: RecentItem[] = [];
  for (const d of Object.values(drafts)) {
    if (d.mode !== mode) continue;
    if (d.isTemplateSource) continue;
    const meta = safeMeta(d.letterType);
    const title = meta?.shortTitle ?? d.letterType;
    for (const ev of d.timeline ?? []) {
      rows.push({
        id: `${d.id}:${ev.id}`,
        label: `${ev.title} · ${title}`,
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
 * Employee-mode Home — preserved from prior implementation
 * ==========================================================================*/

function EmployeeHome({ mode }: { mode: Mode }) {
  const nav = useNavigate();
  const drafts = useDraftStore((s) => s.drafts);
  const profile = useProfileStore((s) => s.profile);

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
  const name =
    profile.personal.preferredName ||
    profile.personal.legalName?.split(/\s+/)[0] ||
    "";
  const greeting = name ? `Hello, ${name}.` : "Welcome back.";

  const today = useMemo(
    () =>
      new Date().toLocaleDateString(undefined, {
        weekday: "long",
        day: "numeric",
        month: "long",
      }),
    []
  );

  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-6 py-6 sm:py-8">
      {/* Breadcrumb */}
      <div className="text-[12px] text-[var(--ds-muted)] mb-3.5 flex items-center gap-1.5">
        <span>Employee workspace</span>
        <span className="opacity-40">/</span>
        <span className="text-[var(--ds-ink)] font-medium">Home</span>
      </div>

      <Hero greeting={greeting} today={today} prefix={prefix} catalogCount={catalog.length} />

      <Catalog tiles={flagship.slice(0, 5)} prefix={prefix} hasMore={flagship.length > 5} />

      {(myDrafts.length > 0 || deadlines.length > 0) && (
        <ContinueAndDeadlines
          drafts={myDrafts.slice(0, 3)}
          deadlines={deadlines}
          onOpenDraft={(id) => nav(`/editor/${id}`)}
          onOpenNew={() => nav(`${prefix}/new`)}
        />
      )}

      <TrustFooter />
    </div>
  );
}

/* ─── Hero ─────────────────────────────────────────────────────────────── */

function Hero({
  greeting,
  today,
  prefix,
  catalogCount,
}: {
  greeting: string;
  today: string;
  prefix: string;
  catalogCount: number;
}) {
  return (
    <section
      className="relative overflow-hidden rounded-2xl border border-[var(--ds-line)] mb-7 px-7 sm:px-14 py-12 sm:py-14"
      style={{
        background:
          "radial-gradient(80% 60% at 88% -10%, rgba(10,11,13,0.05), transparent 70%), linear-gradient(180deg,#fff 0%,#fbfbfc 100%)",
      }}
    >
      {/* Decorative DraftHR "D" watermark — the real logo at low opacity,
       * positioned bottom-right so it bleeds off the hero corner. */}
      <img
        src="/drafthr-d-mark.png"
        alt=""
        aria-hidden
        className="pointer-events-none absolute select-none hidden sm:block"
        style={{
          right: -50,
          bottom: -60,
          width: 340,
          height: 340,
          opacity: 0.08,
          objectFit: "contain",
        }}
      />

      <div
        className="relative z-[1] text-[11px] font-semibold uppercase tracking-[0.14em] text-[var(--ds-muted)] mb-3.5 inline-flex items-center gap-2"
      >
        <span className="inline-block w-[18px] h-px bg-[var(--ds-subtle)]" />
        {today}
      </div>

      <h1
        className="m-0 mb-1.5 text-[var(--ds-ink)] font-semibold"
        style={{
          fontSize: "clamp(32px, 5vw, 44px)",
          lineHeight: 1.1,
          letterSpacing: "-0.02em",
          maxWidth: "22ch",
        }}
      >
        {greeting}
        <br />
        <span className="font-medium text-[var(--ds-body)]">Let's put it in writing.</span>
      </h1>

      <p
        className="text-[var(--ds-body)] leading-relaxed mt-4 mb-7"
        style={{ fontSize: "15.5px", maxWidth: "58ch" }}
      >
        Wizard-guided HR letters with UK and US legal awareness — grievance, resignation,
        settlement, flexible working, and more.{" "}
        <span className="font-semibold text-[var(--ds-ink)]">Defensible by default.</span>
      </p>

      <div className="flex items-center gap-2.5 flex-wrap relative z-[1]">
        <Link
          to={`${prefix}/new`}
          data-tour="new-letter-cta"
          className="inline-flex items-center gap-2 px-[18px] py-[11px] rounded-[9px] bg-[var(--ds-ink)] text-white font-semibold text-[14px] shadow-sm hover:-translate-y-px hover:shadow-md transition"
        >
          <PlusCircle className="size-4" />
          New letter
        </Link>
        <Link
          to={`${prefix}/new`}
          className="inline-flex items-center gap-2 px-[18px] py-[11px] rounded-[9px] bg-transparent text-[var(--ds-ink)] font-semibold text-[14px] border border-[var(--ds-line)] hover:bg-white hover:border-[var(--ds-subtle)] transition"
        >
          Browse all {catalogCount} letter types
          <ArrowRight className="size-3.5 opacity-70" />
        </Link>
      </div>
    </section>
  );
}

/* ─── Letter catalog ───────────────────────────────────────────────────── */

function Catalog({
  tiles,
  prefix,
  hasMore,
}: {
  tiles: ReturnType<typeof letterCatalogByMode>;
  prefix: string;
  hasMore: boolean;
}) {
  return (
    <>
      <div className="flex items-baseline justify-between mt-2 mb-4.5">
        <h2 className="m-0 text-[var(--ds-ink)] text-[18px] font-semibold tracking-[-0.01em]">
          Start a letter
        </h2>
        <Link
          to={`${prefix}/new`}
          className="text-[12.5px] text-[var(--ds-muted)] font-medium hover:text-[var(--ds-ink)] transition"
        >
          See all letter types →
        </Link>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3.5 mb-9">
        {tiles.map((l) => {
          const Icon = iconForLetter(l.id);
          const tone = toneForLetter(l.id, l.riskClass);
          return (
            <Link
              key={l.id}
              to={`${prefix}/new/${l.id}`}
              className="group relative flex flex-col gap-2.5 p-5 rounded-[12px] bg-[var(--ds-surface)] border border-[var(--ds-line)] hover:border-[var(--ds-ink)] hover:-translate-y-0.5 hover:shadow-[0_8px_24px_-10px_rgba(0,0,0,0.12)] transition min-h-[148px]"
            >
              <div
                className="size-9 rounded-[9px] grid place-items-center"
                style={{ background: tone.bg, color: tone.fg }}
              >
                <Icon className="size-[18px]" />
              </div>
              <h3 className="m-0 text-[15px] font-semibold text-[var(--ds-ink)] leading-tight">
                {l.shortTitle}
              </h3>
              <p className="m-0 text-[12.5px] leading-[1.5] text-[var(--ds-muted)] line-clamp-2">
                {l.description}
              </p>
              <span className="absolute bottom-3.5 right-4.5 text-[11.5px] font-semibold text-[var(--ds-ink)] opacity-0 group-hover:opacity-100 transition">
                Start →
              </span>
            </Link>
          );
        })}

        {hasMore && (
          <Link
            to={`${prefix}/new`}
            className="flex items-center justify-center text-center rounded-[12px] border border-dashed border-[var(--ds-line)] bg-transparent text-[var(--ds-muted)] hover:text-[var(--ds-ink)] hover:border-[var(--ds-ink)] transition min-h-[148px] p-5"
          >
            <h3 className="m-0 text-[14px] font-semibold">More letter types →</h3>
          </Link>
        )}
      </div>
    </>
  );
}

/* ─── Continue + Upcoming ──────────────────────────────────────────────── */

function ContinueAndDeadlines({
  drafts,
  deadlines,
  onOpenDraft,
  onOpenNew,
}: {
  drafts: ReturnType<typeof useDraftStore.getState>["drafts"][string][];
  deadlines: ReturnType<typeof deriveDeadlines>;
  onOpenDraft: (id: string) => void;
  onOpenNew: () => void;
}) {
  return (
    <div className="grid grid-cols-1 lg:grid-cols-[1.5fr_1fr] gap-4 mb-9">
      {/* Continue where you left off */}
      <section className="bg-[var(--ds-surface)] border border-[var(--ds-line)] rounded-[12px] overflow-hidden">
        <header className="flex items-center justify-between px-[18px] py-3.5 border-b border-[var(--ds-line-2)]">
          <h3 className="m-0 text-[14px] font-semibold text-[var(--ds-ink)]">
            Continue where you left off
          </h3>
          {drafts.length > 0 ? (
            <span className="text-[11px] text-[var(--ds-muted)] font-semibold tracking-wide bg-[var(--ds-surface-2)] px-2 py-0.5 rounded-full">
              {drafts.length} draft{drafts.length === 1 ? "" : "s"}
            </span>
          ) : null}
        </header>
        {drafts.length === 0 ? (
          <EmptyState
            size="sm"
            icon={FileText}
            title="No drafts yet"
            body="Pick a letter type from the catalogue to start your first draft. It'll appear here as soon as you generate it."
            primary={{ label: "Browse letters", onClick: onOpenNew }}
          />
        ) : (
          drafts.map((d) => {
            const status = draftStatus(d);
            const statusBg =
              status === "drafting"
                ? "var(--ds-amber-fg)"
                : status === "ready"
                ? "var(--ds-green-fg)"
                : "var(--ds-subtle)";
            return (
              <button
                key={d.id}
                onClick={() => onOpenDraft(d.id)}
                className="w-full text-left flex items-center gap-3 px-[18px] py-3 border-b border-[var(--ds-line-2)] last:border-b-0 hover:bg-[var(--ds-surface-2)] transition"
              >
                <span
                  className="w-1.5 h-1.5 rounded-full shrink-0"
                  style={{ background: statusBg }}
                />
                <div className="flex-1 min-w-0">
                  <div className="text-[13px] font-semibold text-[var(--ds-ink)] truncate">
                    {briefTitleFor(d)}
                  </div>
                  <div className="text-[11.5px] text-[var(--ds-muted)]">
                    {statusLabel(status, d.sections.length)}
                  </div>
                </div>
                <span className="text-[11px] text-[var(--ds-subtle)] shrink-0 tabular-nums">
                  {timeAgo(d.updatedAt)}
                </span>
              </button>
            );
          })
        )}
      </section>

      {/* Upcoming deadlines */}
      <section className="bg-[var(--ds-surface)] border border-[var(--ds-line)] rounded-[12px] overflow-hidden">
        <header className="flex items-center justify-between px-[18px] py-3.5 border-b border-[var(--ds-line-2)]">
          <h3 className="m-0 text-[14px] font-semibold text-[var(--ds-ink)] inline-flex items-center gap-2">
            <CalendarClock className="size-3.5 text-[var(--ds-subtle)]" />
            Upcoming
          </h3>
          {deadlines.length > 0 && (
            <span className="text-[11px] text-[var(--ds-muted)] font-semibold tracking-wide bg-[var(--ds-surface-2)] px-2 py-0.5 rounded-full">
              {deadlines.length} deadline{deadlines.length === 1 ? "" : "s"}
            </span>
          )}
        </header>
        {deadlines.length === 0 ? (
          <EmptyState
            size="sm"
            icon={CalendarClock}
            title="No deadlines yet"
            body="Deadlines appear here when you start a tribunal-bound letter — appeals, grievances, dismissal responses."
            primary={{ label: "Start a letter", onClick: onOpenNew }}
          />
        ) : (
          deadlines.map((d) => {
            const urgent = d.daysAway >= 0 && d.daysAway < 14;
            const passed = d.daysAway < 0;
            return (
              <div
                key={d.id}
                className="flex items-center gap-2.5 px-[18px] py-3 border-b border-[var(--ds-line-2)] last:border-b-0"
              >
                <div className="w-9 text-center font-mono shrink-0">
                  <div
                    className="text-[18px] font-semibold leading-none"
                    style={{
                      color: passed
                        ? "var(--ds-red-fg)"
                        : urgent
                        ? "var(--ds-amber-fg)"
                        : "var(--ds-ink)",
                    }}
                  >
                    {passed ? "—" : d.daysAway}
                  </div>
                  <div className="text-[9px] uppercase tracking-wider text-[var(--ds-muted)] mt-0.5">
                    {passed ? "passed" : "days"}
                  </div>
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-[12.5px] font-semibold text-[var(--ds-ink)] truncate">
                    {d.label}
                  </div>
                  <div className="text-[11px] text-[var(--ds-muted)]">{formatDate(d.iso)}</div>
                </div>
                {urgent && <AlertCircle className="size-3.5 text-[var(--ds-amber-fg)] shrink-0" />}
              </div>
            );
          })
        )}
      </section>
    </div>
  );
}

/* ─── Trust footer ─────────────────────────────────────────────────────── */

function TrustFooter() {
  const chips = [
    "UK Employment Rights Act 1996",
    "ACAS Code aware",
    "US FLSA & state-law variants",
    "Private — drafts never train models",
  ];
  return (
    <section className="bg-[var(--ds-surface-2)] border border-[var(--ds-line)] rounded-[12px] px-5 sm:px-7 py-4 sm:py-5 flex flex-col md:flex-row md:items-center md:justify-between gap-4">
      <div className="flex flex-wrap gap-2">
        {chips.map((c) => (
          <span
            key={c}
            className="inline-flex items-center gap-1.5 text-[11.5px] text-[var(--ds-body)] font-medium bg-white px-2.5 py-1 rounded-full border border-[var(--ds-line)]"
          >
            <span className="text-[var(--ds-green-fg)] font-bold">✓</span> {c}
          </span>
        ))}
      </div>
      <p className="text-[11.5px] text-[var(--ds-muted)] md:text-right md:max-w-[42ch] m-0 leading-snug">
        Not legal advice. High-stakes letters should be reviewed by qualified counsel before
        issuance.
      </p>
    </section>
  );
}

/* ============================================================================
 * Helpers
 * ==========================================================================*/

function safeMeta(id: string) {
  try {
    return getLetterMeta(id as Parameters<typeof getLetterMeta>[0]);
  } catch {
    return null;
  }
}

function deriveDeadlines(
  drafts: ReturnType<typeof useDraftStore.getState>["drafts"][string][]
) {
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

function draftStatus(d: Draft): "empty" | "drafting" | "blocked" | "ready" | "exported" {
  const readiness = getDraftReadiness(d);
  if (readiness.status === "sent") return "exported";
  if (readiness.status === "ready_to_send") return "ready";
  if (readiness.status === "blocked") return "blocked";
  if (readiness.sections.written > 0) return "drafting";
  return "empty";
}

function statusLabel(status: ReturnType<typeof draftStatus>, sectionCount: number): string {
  switch (status) {
    case "ready":
      return "Ready to export";
    case "drafting":
      return `Drafting · ${sectionCount} section${sectionCount === 1 ? "" : "s"}`;
    case "blocked":
      return "Needs attention before sending";
    case "exported":
      return "Exported";
    default:
      return "Not started";
  }
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

/* Per-letter tile colour. Keeps the catalog tactile without screaming.
 * Falls back to riskClass mapping for letter types we haven't hand-tuned. */
function toneForLetter(id: LetterTypeId, riskClass: "low" | "medium" | "high") {
  const handTuned: Partial<Record<LetterTypeId, { bg: string; fg: string }>> = {
    grievance: { bg: "var(--ds-amber-bg)", fg: "var(--ds-amber-fg)" },
    appeal: { bg: "var(--ds-red-bg)", fg: "var(--ds-red-fg)" },
    resignation_clean: { bg: "var(--ds-blue-bg)", fg: "var(--ds-blue-fg)" },
    resignation_with_grievance: { bg: "var(--ds-blue-bg)", fg: "var(--ds-blue-fg)" },
    resignation_constructive: { bg: "var(--ds-blue-bg)", fg: "var(--ds-blue-fg)" },
    flexible_working_request: { bg: "var(--ds-violet-bg)", fg: "var(--ds-violet-fg)" },
    offer: { bg: "var(--ds-green-bg)", fg: "var(--ds-green-fg)" },
    promotion: { bg: "var(--ds-green-bg)", fg: "var(--ds-green-fg)" },
    salary_increase: { bg: "var(--ds-green-bg)", fg: "var(--ds-green-fg)" },
    settlement_cover: { bg: "var(--ds-green-bg)", fg: "var(--ds-green-fg)" },
    settlement_counter_offer: { bg: "var(--ds-green-bg)", fg: "var(--ds-green-fg)" },
    termination: { bg: "var(--ds-red-bg)", fg: "var(--ds-red-fg)" },
    warning: { bg: "var(--ds-amber-bg)", fg: "var(--ds-amber-fg)" },
    subject_access_request: { bg: "var(--ds-blue-bg)", fg: "var(--ds-blue-fg)" },
    whistleblowing: { bg: "var(--ds-red-bg)", fg: "var(--ds-red-fg)" },
    reference: { bg: "var(--ds-blue-bg)", fg: "var(--ds-blue-fg)" },
    accommodation_request: { bg: "var(--ds-violet-bg)", fg: "var(--ds-violet-fg)" },
  };
  if (handTuned[id]) return handTuned[id]!;
  if (riskClass === "high") return { bg: "var(--ds-red-bg)", fg: "var(--ds-red-fg)" };
  if (riskClass === "medium") return { bg: "var(--ds-amber-bg)", fg: "var(--ds-amber-fg)" };
  return { bg: "var(--ds-green-bg)", fg: "var(--ds-green-fg)" };
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
