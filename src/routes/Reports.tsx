import { useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import {
  BarChart3,
  ShieldCheck,
  TrendingUp,
  Activity,
  AlertTriangle,
  ArrowRight,
  FileText,
} from "lucide-react";
import {
  differenceInCalendarDays,
  format,
  startOfMonth,
  subMonths,
} from "date-fns";

import type {
  Draft,
  Matter,
  Mode,
  RiskBand,
} from "@/lib/letters/types";
import { useDraftStore } from "@/lib/store";
import { useProfileStore } from "@/lib/profile";
import { EmptyState, PageHeader } from "@/components/ds";
import {
  computeHealthScore,
  runHealthChecks,
  DIMENSION_LABELS,
  type HealthCheck,
  type HealthDimension,
  type HealthScore,
} from "@/lib/finalize/healthChecks";
import { effectiveRiskBand } from "@/lib/matters/risk";
import { draftsInMatter } from "@/lib/matters";
import { briefTitleFor } from "@/lib/letters/display";
import { getLetterMeta } from "@/lib/letters/catalog";
import {
  HEALTH_CHECKS,
  failingCountForCheck,
  type HealthCheck as ReportsHealthCheck,
} from "@/lib/reports/check-predicates";

/* ============================================================================
 * /reports — HR Director's signal panel.
 *
 * Three rolled-up surfaces over the workspace's drafts + matters. Pure client
 * read — no new endpoints, no new schema. HR-mode only; employee mode gets
 * an empty state because reports across one self-record + one matter aren't
 * useful.
 *
 *   1. Compliance health   — aggregate runHealthChecks across every HR draft
 *   2. Risk exposure       — effectiveRiskBand per matter, tiled in 4 cols
 *   3. Operations          — letters by month + time-to-resolve + top types
 *
 * Filters out template-source drafts everywhere (they're not real letters).
 * ==========================================================================*/

export function Reports() {
  const profileRole = useProfileStore((s) => s.profile.role);
  const drafts = useDraftStore((s) => s.drafts);
  const matters = useDraftStore((s) => s.matters);

  const realDrafts = useMemo(
    () =>
      Object.values(drafts).filter(
        (d) => d.mode === "employer" && !d.isTemplateSource
      ),
    [drafts]
  );
  const allMatters = useMemo(
    () => Object.values(matters).filter((m) => m.mode === "employer"),
    [matters]
  );
  const activeMatters = useMemo(
    () => allMatters.filter((m) => m.status === "active"),
    [allMatters]
  );

  // Employee-mode fallback. We keep the route reachable so deep-links don't
  // 404, but the surface is meaningless with one self-record so we punt.
  if (profileRole === "employee") {
    return (
      <div className="max-w-5xl mx-auto px-4 sm:px-6 py-6 sm:py-8">
        <ReportsHeader mode="employee" />
        <div className="bg-[var(--ds-surface)] border border-[var(--ds-line)] rounded-[12px]">
          <EmptyState
            icon={BarChart3}
            title="Reports are an HR portfolio view"
            body="Switch to HR / Management to see compliance, risk, and operations rolled up across matters."
          />
        </div>
      </div>
    );
  }

  if (realDrafts.length === 0 && allMatters.length === 0) {
    return (
      <div className="max-w-5xl mx-auto px-4 sm:px-6 py-6 sm:py-8">
        <ReportsHeader mode="employer" />
        <div className="bg-[var(--ds-surface)] border border-[var(--ds-line)] rounded-[12px]">
          <EmptyState
            icon={BarChart3}
            title="Nothing to report yet"
            body="Reports populate as you draft letters and open matters."
            primary={{ label: "Browse templates", to: "/hr/new" }}
          />
        </div>
      </div>
    );
  }

  const fade = {
    initial: { opacity: 0, y: 6 },
    animate: { opacity: 1, y: 0 },
    transition: { duration: 0.35, ease: [0.32, 0.72, 0, 1] as const },
  };

  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-6 py-6 sm:py-8">
      <ReportsHeader mode="employer" />

      <motion.div {...fade} className="mb-5">
        <ComplianceHealthCard drafts={realDrafts} />
      </motion.div>

      <motion.div
        {...fade}
        transition={{ ...fade.transition, delay: 0.06 }}
        className="mb-5"
      >
        <RiskExposureCard matters={activeMatters} drafts={realDrafts} />
      </motion.div>

      <motion.div
        {...fade}
        transition={{ ...fade.transition, delay: 0.12 }}
        className="mb-5"
      >
        <OperationsCard drafts={realDrafts} matters={allMatters} />
      </motion.div>
    </div>
  );
}

/* ─── Page chrome ─────────────────────────────────────────────────────── */

function ReportsHeader({ mode }: { mode: Mode }) {
  return (
    <PageHeader
      className="mb-6"
      crumbs={[{ label: mode === "employer" ? "HR / Management" : "Employee" }, { label: "Reports" }]}
      title="Reports"
      lede="Compliance, risk and operations rolled up across the workspace."
    />
  );
}

/* ─── Card shell ──────────────────────────────────────────────────────── */

function Card({
  icon: Icon,
  title,
  subtitle,
  children,
}: {
  icon: typeof Activity;
  title: string;
  subtitle?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="bg-[var(--ds-surface)] border border-[var(--ds-line)] rounded-[12px] p-[18px]">
      <header className="flex items-baseline justify-between mb-4">
        <h3 className="m-0 text-[12px] font-semibold uppercase tracking-[0.08em] text-[var(--ds-muted)] inline-flex items-center gap-1.5">
          <Icon className="size-3.5" />
          {title}
        </h3>
        {subtitle && (
          <span className="text-[11.5px] text-[var(--ds-muted)] tabular-nums">
            {subtitle}
          </span>
        )}
      </header>
      {children}
    </section>
  );
}

/* ============================================================================
 * 1) Compliance health
 * ==========================================================================*/

type DraftHealth = {
  draft: Draft;
  score: HealthScore;
  checks: HealthCheck[];
};

function ComplianceHealthCard({ drafts }: { drafts: Draft[] }) {
  const nav = useNavigate();

  const scored = useMemo<DraftHealth[]>(() => {
    const out: DraftHealth[] = [];
    for (const d of drafts) {
      try {
        const checks = runHealthChecks(d);
        out.push({ draft: d, checks, score: computeHealthScore(checks) });
      } catch {
        // skip drafts the scorer can't process
      }
    }
    return out;
  }, [drafts]);

  if (scored.length === 0) {
    return (
      <Card icon={ShieldCheck} title="Compliance health">
        <EmptyState
          size="sm"
          icon={ShieldCheck}
          title="No letters to score"
          body="Health checks appear here once you have at least one HR draft."
        />
      </Card>
    );
  }

  // Strong = passes every check AND lands in the strong band. Mirrors the
  // Home dashboard so the two surfaces agree on what "send-ready" means.
  const strong = scored.filter(
    (s) => s.score.band === "strong" && s.score.failCount === 0
  ).length;
  const percent = Math.round((strong / scored.length) * 100);

  const dimensionScores = aggregateDimensionScores(scored);
  const topFailing = topFailingChecks(scored, 3);

  return (
    <Card
      icon={ShieldCheck}
      title="Compliance health"
      subtitle={`${scored.length} letter${scored.length === 1 ? "" : "s"} scored`}
    >
      <div className="grid grid-cols-1 md:grid-cols-[auto_1fr] gap-6 items-start">
        {/* Hero ring */}
        <div className="flex items-center gap-4">
          <Ring percent={percent} size={84} stroke={9} />
          <div>
            <div className="text-[11.5px] uppercase tracking-wider text-[var(--ds-muted)] font-semibold">
              Strong
            </div>
            <div
              className="text-[var(--ds-ink)] font-semibold tabular-nums leading-none mt-1"
              style={{ fontSize: "28px", letterSpacing: "-0.02em" }}
            >
              {percent}%
            </div>
            <div className="text-[12px] text-[var(--ds-muted)] mt-1.5 leading-snug">
              {strong} of {scored.length} clearing every check
            </div>
          </div>
        </div>

        {/* Dimension breakdown */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          {dimensionScores.map((d) => (
            <DimensionBar key={d.dimension} {...d} />
          ))}
        </div>
      </div>

      <FailingChecksList drafts={drafts} />

      {topFailing.length > 0 && (
        <div className="mt-5 pt-5 border-t border-[var(--ds-line-2)]">
          <h4 className="m-0 text-[12px] font-semibold uppercase tracking-[0.08em] text-[var(--ds-muted)] inline-flex items-center gap-1.5 mb-2.5">
            <AlertTriangle className="size-3.5" />
            Letters needing attention
          </h4>
          <ul className="m-0 p-0 list-none">
            {topFailing.map((item) => (
              <li key={`${item.draft.id}:${item.check.id}`}>
                <button
                  type="button"
                  onClick={() => nav(`/editor/${item.draft.id}`)}
                  className="w-full text-left flex items-start gap-3 py-2.5 border-b border-[var(--ds-line-2)] last:border-b-0 hover:bg-[var(--ds-line-2)]/40 -mx-2 px-2 rounded transition"
                >
                  <span
                    aria-hidden
                    className={`mt-1 size-1.5 rounded-full shrink-0 ${
                      item.check.severity === "fail"
                        ? "bg-[var(--ds-red-fg)]"
                        : "bg-[var(--ds-amber-fg)]"
                    }`}
                  />
                  <div className="flex-1 min-w-0">
                    <div className="text-[13px] font-semibold text-[var(--ds-ink)] leading-snug truncate">
                      {item.check.label}
                    </div>
                    <div className="text-[11.5px] text-[var(--ds-muted)] truncate">
                      {briefTitleFor(item.draft)}
                      {item.draft.employee.legalName
                        ? ` · ${item.draft.employee.legalName}`
                        : ""}
                    </div>
                  </div>
                  <ArrowRight className="size-3 text-[var(--ds-muted)] shrink-0 mt-1" />
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </Card>
  );
}

type DimensionRoll = {
  dimension: HealthDimension;
  averageScore: number;
};

function aggregateDimensionScores(scored: DraftHealth[]): DimensionRoll[] {
  const dims: HealthDimension[] = ["compliance", "quality", "risk"];
  return dims.map((dimension) => {
    const subset = scored
      .map((s) => s.score.dimensions.find((d) => d.dimension === dimension))
      .filter((d): d is NonNullable<typeof d> => Boolean(d));
    if (subset.length === 0) return { dimension, averageScore: 0 };
    const avg =
      subset.reduce((acc, d) => acc + d.score, 0) / subset.length;
    return { dimension, averageScore: Math.round(avg) };
  });
}

function DimensionBar({
  dimension,
  averageScore,
}: DimensionRoll) {
  const tone =
    averageScore >= 80
      ? { fg: "var(--ds-green-fg)", bg: "var(--ds-green-bg)" }
      : averageScore >= 60
        ? { fg: "var(--ds-amber-fg)", bg: "var(--ds-amber-bg)" }
        : { fg: "var(--ds-red-fg)", bg: "var(--ds-red-bg)" };
  return (
    <div className="rounded-[10px] border border-[var(--ds-line)] p-3">
      <div className="flex items-baseline justify-between mb-2">
        <div className="text-[11.5px] font-semibold uppercase tracking-wider text-[var(--ds-muted)]">
          {DIMENSION_LABELS[dimension]}
        </div>
        <div
          className="text-[15px] font-semibold tabular-nums"
          style={{ color: tone.fg }}
        >
          {averageScore}
        </div>
      </div>
      <div
        className="h-1.5 rounded-full overflow-hidden"
        style={{ background: "var(--ds-line-2)" }}
        role="progressbar"
        aria-valuenow={averageScore}
        aria-valuemin={0}
        aria-valuemax={100}
      >
        <div
          className="h-full rounded-full"
          style={{
            width: `${Math.min(100, Math.max(0, averageScore))}%`,
            background: tone.fg,
          }}
        />
      </div>
    </div>
  );
}

type FailingItem = { draft: Draft; check: HealthCheck };

function topFailingChecks(scored: DraftHealth[], limit: number): FailingItem[] {
  // Each draft contributes its single most-severe check. Then we rank by:
  //   1. fail before warn
  //   2. lower overall score first (worst letter rises)
  const candidates: (FailingItem & { score: number })[] = [];
  for (const s of scored) {
    const failed = s.checks.filter((c) => c.severity !== "pass");
    if (failed.length === 0) continue;
    // Prefer compliance fails > other fails > warns.
    const sorted = [...failed].sort((a, b) => sevRank(a) - sevRank(b));
    candidates.push({ draft: s.draft, check: sorted[0], score: s.score.score });
  }
  candidates.sort((a, b) => {
    const sa = sevRank(a.check);
    const sb = sevRank(b.check);
    if (sa !== sb) return sa - sb;
    return a.score - b.score;
  });
  return candidates.slice(0, limit).map(({ draft, check }) => ({ draft, check }));
}

function sevRank(c: HealthCheck): number {
  if (c.severity === "fail" && c.dimension === "compliance") return 0;
  if (c.severity === "fail") return 1;
  if (c.severity === "warn" && c.dimension === "compliance") return 2;
  return 3;
}

/* ─── Failing-check roll-up ───────────────────────────────────────────── */

/**
 * Workspace-level roll-up of HEALTH_CHECKS — one row per check, with the
 * count of letters failing it. Each row is a `<button>` that drills into
 * the failing-check route. Shared HEALTH_CHECKS list keeps the count here
 * and the drill-down list in lockstep.
 *
 * Only renders rows with ≥1 failing letter — a tidy workspace shouldn't
 * surface noise.
 */
function FailingChecksList({ drafts }: { drafts: Draft[] }) {
  const nav = useNavigate();
  const rows = useMemo(() => {
    return HEALTH_CHECKS
      .map((c) => ({ check: c, count: failingCountForCheck(drafts, c.id) }))
      .filter((r) => r.count > 0)
      .sort((a, b) => b.count - a.count);
  }, [drafts]);

  if (rows.length === 0) return null;

  return (
    <div className="mt-5 pt-5 border-t border-[var(--ds-line-2)]">
      <h4 className="m-0 text-[12px] font-semibold uppercase tracking-[0.08em] text-[var(--ds-muted)] inline-flex items-center gap-1.5 mb-2.5">
        <AlertTriangle className="size-3.5" />
        Failing checks
      </h4>
      <ul className="m-0 p-0 list-none">
        {rows.map(({ check, count }) => (
          <FailingCheckRow
            key={check.id}
            check={check}
            count={count}
            onClick={() => nav(`/reports/checks/${check.id}`)}
          />
        ))}
      </ul>
    </div>
  );
}

function FailingCheckRow({
  check,
  count,
  onClick,
}: {
  check: ReportsHealthCheck;
  count: number;
  onClick: () => void;
}) {
  return (
    <li>
      <button
        type="button"
        aria-label={`${count} letter${count === 1 ? "" : "s"} failing ${check.label} — open drill-down`}
        onClick={onClick}
        className="w-full text-left flex items-start gap-3 py-2.5 border-b border-[var(--ds-line-2)] last:border-b-0 hover:bg-[var(--ds-line-2)]/40 -mx-2 px-2 rounded focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ds-ink)]/30 transition"
      >
        <span
          aria-hidden
          className="mt-1 size-1.5 rounded-full shrink-0 bg-[var(--ds-red-fg)]"
        />
        <div className="flex-1 min-w-0">
          <div className="text-[13px] font-semibold text-[var(--ds-ink)] leading-snug truncate">
            {count} letter{count === 1 ? "" : "s"} · {check.label}
          </div>
          <div className="text-[11.5px] text-[var(--ds-muted)] truncate">
            {check.description}
          </div>
        </div>
        <ArrowRight className="size-3 text-[var(--ds-muted)] shrink-0 mt-1" />
      </button>
    </li>
  );
}

/* ─── Mini ring ───────────────────────────────────────────────────────── */

function Ring({
  percent,
  size,
  stroke,
}: {
  percent: number;
  size: number;
  stroke: number;
}) {
  const r = (size - stroke) / 2;
  const circ = 2 * Math.PI * r;
  const offset = circ - (Math.max(0, Math.min(100, percent)) / 100) * circ;
  const tone =
    percent >= 80
      ? "var(--ds-green-fg)"
      : percent >= 60
        ? "var(--ds-amber-fg)"
        : "var(--ds-red-fg)";
  return (
    <svg
      width={size}
      height={size}
      viewBox={`0 0 ${size} ${size}`}
      role="img"
      aria-label={`${percent}% of letters strong`}
    >
      <circle
        cx={size / 2}
        cy={size / 2}
        r={r}
        fill="none"
        stroke="var(--ds-line-2)"
        strokeWidth={stroke}
      />
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
 * 2) Risk exposure heatmap
 * ==========================================================================*/

function RiskExposureCard({
  matters,
  drafts,
}: {
  matters: Matter[];
  drafts: Draft[];
}) {
  const nav = useNavigate();

  const bands = useMemo(
    () => groupMattersByBand(matters, drafts),
    [matters, drafts]
  );
  const totalExposure = useMemo(
    () =>
      matters.reduce(
        (acc, m) =>
          acc + (typeof m.exposureGBP === "number" ? m.exposureGBP : 0),
        0
      ),
    [matters]
  );
  const hasExposure = matters.some(
    (m) => typeof m.exposureGBP === "number" && m.exposureGBP > 0
  );

  if (matters.length === 0) {
    return (
      <Card icon={TrendingUp} title="Risk exposure">
        <EmptyState
          size="sm"
          icon={TrendingUp}
          title="No active matters"
          body="The risk heatmap fills in as you open matters."
          primary={{ label: "Open Matters", to: "/matters" }}
        />
      </Card>
    );
  }

  const subtitle = hasExposure
    ? `${formatGBP(totalExposure)} tracked across ${matters.length} ${matters.length === 1 ? "case" : "cases"}`
    : `${matters.length} active ${matters.length === 1 ? "case" : "cases"}`;

  const order: RiskBand[] = ["low", "moderate", "high", "critical"];

  return (
    <Card icon={TrendingUp} title="Risk exposure" subtitle={subtitle}>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
        {order.map((band) => {
          const tone = bandTone(band);
          const list = bands[band];
          return (
            <div
              key={band}
              className="rounded-[10px] border border-[var(--ds-line)] overflow-hidden flex flex-col"
            >
              <div
                className="px-3 py-2 flex items-baseline justify-between"
                style={{ background: tone.bg }}
              >
                <span
                  className="text-[10.5px] font-semibold uppercase tracking-wider"
                  style={{ color: tone.fg }}
                >
                  {band}
                </span>
                <span
                  className="text-[14px] font-semibold tabular-nums"
                  style={{ color: tone.fg }}
                >
                  {list.length}
                </span>
              </div>
              <div className="flex-1 min-h-[80px] p-2 flex flex-col gap-1.5">
                {list.length === 0 ? (
                  <div className="flex-1 grid place-items-center text-[11.5px] text-[var(--ds-subtle)] italic">
                    none
                  </div>
                ) : (
                  list.map((m) => (
                    <button
                      key={m.id}
                      type="button"
                      aria-label={`Open ${m.name} drill-down`}
                      onClick={() => nav(`/reports/matters/${m.id}`)}
                      className="text-left rounded-[7px] border border-[var(--ds-line)] bg-[var(--ds-surface)] px-2.5 py-1.5 hover:border-[var(--ds-subtle)] hover:bg-[var(--ds-line-2)]/40 focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ds-ink)]/30 transition"
                    >
                      <div className="text-[12px] font-semibold text-[var(--ds-ink)] truncate leading-snug">
                        {m.name}
                      </div>
                      {typeof m.exposureGBP === "number" && m.exposureGBP > 0 ? (
                        <div className="text-[10.5px] text-[var(--ds-muted)] tabular-nums mt-0.5">
                          {formatGBP(m.exposureGBP)}
                        </div>
                      ) : m.parties?.primaryName ? (
                        <div className="text-[10.5px] text-[var(--ds-muted)] truncate mt-0.5">
                          {m.parties.primaryName}
                        </div>
                      ) : null}
                    </button>
                  ))
                )}
              </div>
            </div>
          );
        })}
      </div>
    </Card>
  );
}

function groupMattersByBand(
  matters: Matter[],
  drafts: Draft[]
): Record<RiskBand, Matter[]> {
  const out: Record<RiskBand, Matter[]> = {
    low: [],
    moderate: [],
    high: [],
    critical: [],
  };
  for (const m of matters) {
    const band = effectiveRiskBand(m, draftsInMatter(drafts, m.id)) ?? "low";
    out[band].push(m);
  }
  // Within each bucket: heaviest exposure first, then most-recent activity.
  for (const band of Object.keys(out) as RiskBand[]) {
    out[band].sort((a, b) => {
      const ea = a.exposureGBP ?? 0;
      const eb = b.exposureGBP ?? 0;
      if (ea !== eb) return eb - ea;
      return b.updatedAt - a.updatedAt;
    });
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
 * 3) Operations
 * ==========================================================================*/

function OperationsCard({
  drafts,
  matters,
}: {
  drafts: Draft[];
  matters: Matter[];
}) {
  const monthly = useMemo(() => lettersByMonth(drafts), [drafts]);
  const resolution = useMemo(() => timeToResolve(matters), [matters]);
  const topTypes = useMemo(() => topLetterTypes(drafts, 5), [drafts]);

  return (
    <Card icon={Activity} title="Operations">
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Letters by month */}
        <div>
          <h4 className="m-0 text-[12px] font-semibold uppercase tracking-[0.08em] text-[var(--ds-muted)] mb-3">
            Letters drafted · last 6 months
          </h4>
          <BarChart data={monthly} />
        </div>

        {/* Time to resolve */}
        <div>
          <h4 className="m-0 text-[12px] font-semibold uppercase tracking-[0.08em] text-[var(--ds-muted)] mb-3">
            Time to resolve
          </h4>
          {resolution.count === 0 ? (
            <p className="m-0 text-[13px] text-[var(--ds-muted)] leading-snug">
              No closed matters yet — close one to see how long matters take
              to resolve.
            </p>
          ) : (
            <div className="grid grid-cols-2 gap-3">
              <Stat
                label="Median"
                value={`${resolution.medianDays}d`}
                detail={`across ${resolution.count} closed ${resolution.count === 1 ? "matter" : "matters"}`}
              />
              <Stat
                label="P90"
                value={`${resolution.p90Days}d`}
                detail="90th percentile"
              />
            </div>
          )}
        </div>
      </div>

      {/* Volume by letter type */}
      <div className="mt-6 pt-5 border-t border-[var(--ds-line-2)]">
        <h4 className="m-0 text-[12px] font-semibold uppercase tracking-[0.08em] text-[var(--ds-muted)] mb-3">
          Most-used templates
        </h4>
        {topTypes.length === 0 ? (
          <p className="m-0 text-[13px] text-[var(--ds-muted)]">
            No drafts yet.
          </p>
        ) : (
          <ul className="m-0 p-0 list-none">
            {topTypes.map((t) => (
              <li
                key={t.id}
                className="flex items-center gap-3 py-2 border-b border-[var(--ds-line-2)] last:border-b-0"
              >
                <FileText className="size-3.5 text-[var(--ds-subtle)] shrink-0" />
                <div className="flex-1 min-w-0">
                  <div className="text-[13px] font-semibold text-[var(--ds-ink)] truncate">
                    {t.label}
                  </div>
                </div>
                <div
                  className="h-1.5 rounded-full overflow-hidden shrink-0"
                  style={{ width: 80, background: "var(--ds-line-2)" }}
                  aria-hidden
                >
                  <div
                    className="h-full"
                    style={{
                      width: `${(t.count / topTypes[0].count) * 100}%`,
                      background: "var(--ds-ink)",
                    }}
                  />
                </div>
                <div className="text-[12px] font-semibold text-[var(--ds-ink)] tabular-nums w-7 text-right">
                  {t.count}
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </Card>
  );
}

function Stat({
  label,
  value,
  detail,
}: {
  label: string;
  value: string;
  detail: string;
}) {
  return (
    <div className="rounded-[10px] border border-[var(--ds-line)] p-3">
      <div className="text-[11.5px] font-semibold uppercase tracking-wider text-[var(--ds-muted)]">
        {label}
      </div>
      <div
        className="text-[var(--ds-ink)] font-semibold tabular-nums leading-none mt-1.5"
        style={{ fontSize: "22px", letterSpacing: "-0.02em" }}
      >
        {value}
      </div>
      <div className="text-[11.5px] text-[var(--ds-muted)] mt-1.5 leading-snug">
        {detail}
      </div>
    </div>
  );
}

/* ─── Bar chart (plain SVG) ───────────────────────────────────────────── */

type MonthBucket = { key: string; label: string; count: number };

function lettersByMonth(drafts: Draft[]): MonthBucket[] {
  const now = new Date();
  // 6 buckets, oldest first. Bucket key = yyyy-MM.
  const buckets: MonthBucket[] = [];
  for (let i = 5; i >= 0; i--) {
    const d = startOfMonth(subMonths(now, i));
    buckets.push({
      key: format(d, "yyyy-MM"),
      label: format(d, "MMM"),
      count: 0,
    });
  }
  const index = new Map(buckets.map((b, i) => [b.key, i]));
  for (const draft of drafts) {
    const created = new Date(draft.createdAt);
    const key = format(startOfMonth(created), "yyyy-MM");
    const idx = index.get(key);
    if (idx !== undefined) buckets[idx].count += 1;
  }
  return buckets;
}

function BarChart({ data }: { data: MonthBucket[] }) {
  const W = 320;
  const H = 120;
  const padX = 8;
  const padBottom = 18;
  const padTop = 6;
  const innerW = W - padX * 2;
  const innerH = H - padBottom - padTop;
  const max = Math.max(1, ...data.map((d) => d.count));
  const barW = (innerW / data.length) * 0.62;
  const slot = innerW / data.length;

  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      width="100%"
      preserveAspectRatio="xMidYMid meet"
      role="img"
      aria-label={`Letters drafted across the last ${data.length} months`}
    >
      {data.map((d, i) => {
        const x = padX + slot * i + (slot - barW) / 2;
        const h = (d.count / max) * innerH;
        const y = padTop + innerH - h;
        return (
          <g key={d.key}>
            {/* Track */}
            <rect
              x={x}
              y={padTop}
              width={barW}
              height={innerH}
              rx={3}
              fill="var(--ds-line-2)"
            />
            {/* Bar */}
            {d.count > 0 && (
              <rect
                x={x}
                y={y}
                width={barW}
                height={Math.max(2, h)}
                rx={3}
                fill="var(--ds-ink)"
              />
            )}
            {/* Count */}
            {d.count > 0 && (
              <text
                x={x + barW / 2}
                y={y - 3}
                textAnchor="middle"
                fontSize="9"
                fill="var(--ds-muted)"
                fontFamily="var(--font-sans)"
              >
                {d.count}
              </text>
            )}
            {/* Label */}
            <text
              x={x + barW / 2}
              y={H - 5}
              textAnchor="middle"
              fontSize="9.5"
              fill="var(--ds-muted)"
              fontFamily="var(--font-sans)"
            >
              {d.label}
            </text>
          </g>
        );
      })}
    </svg>
  );
}

/* ─── Time-to-resolve ─────────────────────────────────────────────────── */

type Resolution = { count: number; medianDays: number; p90Days: number };

function timeToResolve(matters: Matter[]): Resolution {
  // archivedAt is set on closed matters; fall back to updatedAt for legacy
  // closed matters that pre-date the archivedAt field.
  const durations: number[] = [];
  for (const m of matters) {
    // Count BOTH terminal states. "archived" is also a resolved state (set by
    // the Archive action, which records archivedAt) — excluding it under-
    // reported resolution data and disagreed with closedMatters() in
    // matters.ts, which counts archived as closed (bug #8).
    if (m.status === "active") continue;
    const closed = m.archivedAt ?? m.updatedAt;
    if (!closed || !m.createdAt) continue;
    const days = differenceInCalendarDays(new Date(closed), new Date(m.createdAt));
    if (days >= 0) durations.push(days);
  }
  if (durations.length === 0) {
    return { count: 0, medianDays: 0, p90Days: 0 };
  }
  durations.sort((a, b) => a - b);
  return {
    count: durations.length,
    medianDays: percentile(durations, 0.5),
    p90Days: percentile(durations, 0.9),
  };
}

function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0;
  if (sorted.length === 1) return Math.round(sorted[0]);
  const idx = (sorted.length - 1) * p;
  const lo = Math.floor(idx);
  const hi = Math.ceil(idx);
  const frac = idx - lo;
  return Math.round(sorted[lo] * (1 - frac) + sorted[hi] * frac);
}

/* ─── Top letter types ────────────────────────────────────────────────── */

type LetterTypeRow = { id: string; label: string; count: number };

function topLetterTypes(drafts: Draft[], limit: number): LetterTypeRow[] {
  const counts = new Map<string, number>();
  for (const d of drafts) {
    counts.set(d.letterType, (counts.get(d.letterType) ?? 0) + 1);
  }
  const rows: LetterTypeRow[] = [];
  for (const [id, count] of counts) {
    let label = id.replace(/_/g, " ");
    try {
      label = getLetterMeta(id as Parameters<typeof getLetterMeta>[0]).shortTitle;
    } catch {
      // unknown letter type — fall back to the raw id label
    }
    rows.push({ id, label, count });
  }
  rows.sort((a, b) => b.count - a.count);
  return rows.slice(0, limit);
}

/* ─── Formatting ──────────────────────────────────────────────────────── */

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

