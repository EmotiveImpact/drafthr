import { useMemo } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { ArrowLeft, FileText, TrendingUp } from "lucide-react";
import { format } from "date-fns";

import type { Draft, Matter, RiskBand } from "@/lib/letters/types";
import { useDraftStore } from "@/lib/store";
import { EmptyState } from "@/components/ds";
import { briefTitleFor } from "@/lib/letters/display";
import { draftsInMatter } from "@/lib/matters";
import { effectiveRiskBand } from "@/lib/matters/risk";
import { runHealthChecks } from "@/lib/finalize/healthChecks";

/* ============================================================================
 * /reports/matters/:matterId — per-matter drill-down for HR Director.
 *
 * Layered on top of the workspace-level Risk heatmap on /reports. Clicking a
 * matter tile in the heatmap navigates here so the user can see exactly
 * which letters in the matter are driving the band — title, status, severity
 * badge, last-edited, owner — and jump straight into any draft.
 *
 * Data: reuses `useDraftStore` (same source the Reports page already reads),
 * so tenant scoping is inherited from the persisted store — we never
 * fabricate or query a separate list.
 * ==========================================================================*/

export function MatterDrillDown() {
  const { matterId } = useParams<{ matterId: string }>();
  const nav = useNavigate();
  const drafts = useDraftStore((s) => s.drafts);
  const matters = useDraftStore((s) => s.matters);

  const matter: Matter | undefined = matterId ? matters[matterId] : undefined;

  // Drafts for this matter — sorted most-recently-edited first so the list
  // reads as "what's hot in this case". draftsInMatter() sorts by createdAt
  // (chronological narrative); for the drill-down a recency sort is more
  // useful because the HR Director is triaging.
  const matterDrafts = useMemo<Draft[]>(() => {
    if (!matterId) return [];
    const list = draftsInMatter(
      Object.values(drafts).filter((d) => !d.isTemplateSource),
      matterId
    );
    return [...list].sort((a, b) => b.updatedAt - a.updatedAt);
  }, [drafts, matterId]);

  const employeeCount = useMemo(
    () => new Set(matterDrafts.map((d) => d.employee?.legalName).filter(Boolean)).size,
    [matterDrafts]
  );

  const riskBand: RiskBand = useMemo(
    () => (matter ? effectiveRiskBand(matter, matterDrafts) ?? "low" : "low"),
    [matter, matterDrafts]
  );

  if (!matter) {
    return (
      <div className="max-w-5xl mx-auto px-4 sm:px-6 py-6 sm:py-8">
        <BackToReports />
        <div className="bg-[var(--ds-surface)] border border-[var(--ds-line)] rounded-[12px]">
          <EmptyState
            icon={TrendingUp}
            title="Matter not found"
            body="This matter may have been deleted or doesn't exist in this workspace."
            primary={{ label: "Back to Reports", to: "/reports" }}
          />
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-6 py-6 sm:py-8">
      <BackToReports />
      <DrillDownHeader
        matter={matter}
        employeeCount={employeeCount}
        draftCount={matterDrafts.length}
        riskBand={riskBand}
      />

      <section className="bg-[var(--ds-surface)] border border-[var(--ds-line)] rounded-[12px] overflow-hidden mt-5">
        {matterDrafts.length === 0 ? (
          <EmptyState
            icon={FileText}
            title="No letters for this matter yet"
            body="When you draft a letter into this matter, it will appear here."
          />
        ) : (
          <DraftTable drafts={matterDrafts} onRowClick={(id) => nav(`/editor/${id}`)} />
        )}
      </section>
    </div>
  );
}

/* ─── chrome ─────────────────────────────────────────────────────────── */

function BackToReports() {
  return (
    <div className="text-[12px] text-[var(--ds-muted)] mb-3.5 flex items-center gap-1.5">
      <Link
        to="/reports"
        className="inline-flex items-center gap-1 hover:text-[var(--ds-ink)] transition"
      >
        <ArrowLeft className="size-3" />
        Reports
      </Link>
      <span className="opacity-40">/</span>
      <span className="text-[var(--ds-ink)] font-medium">Matter</span>
    </div>
  );
}

function DrillDownHeader({
  matter,
  employeeCount,
  draftCount,
  riskBand,
}: {
  matter: Matter;
  employeeCount: number;
  draftCount: number;
  riskBand: RiskBand;
}) {
  const tone = riskTone(riskBand);
  return (
    <header className="mb-2">
      <h1
        className="m-0 text-[var(--ds-ink)] font-semibold"
        style={{
          fontSize: "clamp(22px, 3.2vw, 28px)",
          lineHeight: 1.2,
          letterSpacing: "-0.02em",
        }}
      >
        {matter.name}
      </h1>
      <div className="mt-2 flex items-center flex-wrap gap-3 text-[13px] text-[var(--ds-body)]">
        <span className="tabular-nums">
          {draftCount} draft{draftCount === 1 ? "" : "s"}
        </span>
        <span className="opacity-40">·</span>
        <span className="tabular-nums">
          {employeeCount} {employeeCount === 1 ? "person" : "people"}
        </span>
        <span className="opacity-40">·</span>
        <span
          className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[11.5px] font-semibold uppercase tracking-wider"
          style={{ background: tone.bg, color: tone.fg }}
          data-testid="matter-risk-band"
        >
          {riskBand} risk
        </span>
      </div>
    </header>
  );
}

/* ─── table ──────────────────────────────────────────────────────────── */

type DraftSeverity = "low" | "medium" | "high";

/** Per-draft severity computed from the same health-check rules the
 * Compliance Health card aggregates. Mirrors the heatmap colour scale
 * (low/moderate/high/critical) but collapsed to three buckets for
 * compactness in the drill-down table:
 *
 *   high   — any compliance fail (PII, broken evidence, missing parties)
 *   medium — any warn (placeholders, word count, signature, comments)
 *   low    — clean sweep
 */
function severityFor(draft: Draft): DraftSeverity {
  try {
    const checks = runHealthChecks(draft);
    if (checks.some((c) => c.severity === "fail")) return "high";
    if (checks.some((c) => c.severity === "warn")) return "medium";
    return "low";
  } catch {
    return "low";
  }
}

function severityTone(s: DraftSeverity): { bg: string; fg: string } {
  switch (s) {
    case "high":
      return { bg: "var(--ds-red-bg)", fg: "var(--ds-red-fg)" };
    case "medium":
      return { bg: "var(--ds-amber-bg)", fg: "var(--ds-amber-fg)" };
    case "low":
    default:
      return { bg: "var(--ds-green-bg)", fg: "var(--ds-green-fg)" };
  }
}

function riskTone(band: RiskBand): { bg: string; fg: string } {
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

function statusLabel(draft: Draft): "Sent" | "Ready" | "Draft" {
  if ((draft.exports ?? []).some((e) => e.format === "marked-sent")) return "Sent";
  if (draft.reviewStatus === "approved") return "Ready";
  return "Draft";
}

function DraftTable({
  drafts,
  onRowClick,
}: {
  drafts: Draft[];
  onRowClick: (draftId: string) => void;
}) {
  return (
    <table className="w-full text-[13px] border-collapse">
      <thead>
        <tr className="text-left text-[11.5px] font-semibold uppercase tracking-wider text-[var(--ds-muted)]">
          <th className="px-4 py-3 font-semibold">Title</th>
          <th className="px-4 py-3 font-semibold">Status</th>
          <th className="px-4 py-3 font-semibold">Severity</th>
          <th className="px-4 py-3 font-semibold">Last edited</th>
          <th className="px-4 py-3 font-semibold">Owner</th>
        </tr>
      </thead>
      <tbody>
        {drafts.map((d) => {
          const sev = severityFor(d);
          const tone = severityTone(sev);
          const status = statusLabel(d);
          const owner =
            (d.collaborators ?? []).find((c) => c.role === "owner")?.name ??
            (d.collaborators ?? []).find((c) => c.role === "owner")?.email ??
            d.employer?.legalName ??
            "—";
          return (
            <tr
              key={d.id}
              tabIndex={0}
              role="button"
              aria-label={`Open ${briefTitleFor(d)}`}
              onClick={() => onRowClick(d.id)}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  onRowClick(d.id);
                }
              }}
              className="border-t border-[var(--ds-line-2)] cursor-pointer hover:bg-[var(--ds-line-2)]/40 focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ds-ink)]/30 transition"
            >
              <td className="px-4 py-3 text-[var(--ds-ink)] font-medium">
                {briefTitleFor(d)}
              </td>
              <td className="px-4 py-3 text-[var(--ds-body)]">{status}</td>
              <td className="px-4 py-3">
                <span
                  className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-semibold uppercase tracking-wider"
                  style={{ background: tone.bg, color: tone.fg }}
                  data-testid={`severity-${d.id}`}
                  data-severity={sev}
                >
                  {sev}
                </span>
              </td>
              <td className="px-4 py-3 text-[var(--ds-body)] tabular-nums">
                {format(new Date(d.updatedAt), "yyyy-MM-dd")}
              </td>
              <td className="px-4 py-3 text-[var(--ds-body)] truncate max-w-[200px]">
                {owner}
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}
