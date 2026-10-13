import { useMemo } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { FileText, TrendingUp } from "lucide-react";

import type { Draft, Matter, RiskBand } from "@/lib/letters/types";
import { useDraftStore } from "@/lib/store";
import { useProfileStore } from "@/lib/profile";
import { useReviewStore } from "@/lib/journey/reviews";
import { EmptyState, Pill, type PillTone } from "@/components/ds";
import { journeysFor, viewerApproves } from "@/components/home/homeData";
import { listStatusPill } from "@/components/letters/letterView";
import { letterOwner, useMe } from "@/components/letters/rows";
import { PaperThumb } from "@/components/reports/parts";
import { Band } from "@/components/home/HomeBand";
import { DRILL_ROW, DRILL_TH, DrillBody, DrillShell, lastEdited } from "@/components/reports/drillChrome";
import { briefTitleFor } from "@/lib/letters/display";
import { draftsInMatter } from "@/lib/matters";
import { effectiveRiskBand } from "@/lib/matters/risk";
import { runHealthChecks } from "@/lib/finalize/healthChecks";

/* ============================================================================
 * /reports/matters/:matterId: per-matter drill-down for HR Director.
 *
 * Layered on top of the workspace-level Risk heatmap on /reports. Clicking a
 * matter tile in the heatmap navigates here so the user can see exactly
 * which letters in the matter are driving the band, title, status, what
 * their checks found, last-edited, owner, and jump straight into any draft.
 *
 * Data: reuses `useDraftStore` (same source the Reports page already reads),
 * so tenant scoping is inherited from the persisted store, we never
 * fabricate or query a separate list.
 * ==========================================================================*/

export function MatterDrillDown() {
  const { matterId } = useParams<{ matterId: string }>();
  const nav = useNavigate();
  const drafts = useDraftStore((s) => s.drafts);
  const matters = useDraftStore((s) => s.matters);

  const matter: Matter | undefined = matterId ? matters[matterId] : undefined;

  // Drafts for this matter, sorted most-recently-edited first so the list
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

  // Each letter's stage as everywhere else (Letters, Home, the letter itself).
  const requests = useReviewStore((s) => s.requests);
  const role = useProfileStore((s) => s.profile.workspaceRole);
  const legalName = useProfileStore((s) => s.profile.personal.legalName);
  const preferredName = useProfileStore((s) => s.profile.personal.preferredName);
  const statuses = useMemo(() => {
    const names = [legalName ?? "", preferredName ?? ""];
    const out: Record<string, { label: string; tone: PillTone }> = {};
    for (const { draft, journey } of journeysFor(matterDrafts, requests, (d) => viewerApproves(d, role, names))) {
      // The same words and colour as the Letters page (a draft that needs
      // you reads amber "Needs you").
      out[draft.id] = listStatusPill(journey);
    }
    return out;
  }, [matterDrafts, requests, role, legalName, preferredName]);

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
      <DrillShell>
        <Band crumbs={CRUMBS} title="Matter" />
        <DrillBody>
          <div className="rounded-[16px] border border-[var(--ds-line)] bg-[var(--ds-surface)]">
            <EmptyState
              icon={TrendingUp}
              title="Matter not found"
              body="This matter may have been deleted or doesn't exist in this workspace."
              primary={{ label: "Back to Reports", to: "/reports" }}
            />
          </div>
        </DrillBody>
      </DrillShell>
    );
  }

  const tone = riskTone(riskBand);
  return (
    <DrillShell>
      <Band
        crumbs={CRUMBS}
        title={matter.name}
        lede={
          <span className="flex flex-wrap items-center gap-x-3 gap-y-2">
            {/* Every letter in the matter, whatever its stage ("1 draft"
             * for a letter ready for review would be wrong). */}
            <span>
              {matterDrafts.length} {matterDrafts.length === 1 ? "letter" : "letters"}
            </span>
            <span aria-hidden className="text-[var(--ds-faint)]">
              ·
            </span>
            <span>
              {employeeCount} {employeeCount === 1 ? "person" : "people"}
            </span>
            <span
              className="inline-flex items-center gap-1.5 rounded-[6px] px-2 py-0.5 text-[12px] leading-[18px] font-medium"
              style={{ background: tone.bg, color: tone.fg }}
              data-testid="matter-risk-band"
            >
              <span className="size-1.5 rounded-full" style={{ background: tone.fg }} aria-hidden />
              {riskBand.charAt(0).toUpperCase() + riskBand.slice(1)} risk
            </span>
          </span>
        }
      />
      <DrillBody>
        <section className="min-w-0 overflow-hidden rounded-[16px] border border-[var(--ds-line)] bg-[var(--ds-surface)]">
          {matterDrafts.length === 0 ? (
            <EmptyState
              icon={FileText}
              title="No letters for this matter yet"
              body="When you draft a letter into this matter, it will appear here."
            />
          ) : (
            <DraftTable drafts={matterDrafts} statuses={statuses} onRowClick={(id) => nav(`/editor/${id}`)} />
          )}
        </section>
      </DrillBody>
    </DrillShell>
  );
}

const CRUMBS = [{ label: "Reports", href: "/reports" }, { label: "Matter" }];

/* ─── table ──────────────────────────────────────────────────────────── */

type DraftSeverity = "low" | "medium" | "high";

/**
 * Each letter's own checks, in words: the matter's risk band in the header
 * is a different measure (the matter's risk), so the letters' column says
 * what their checks found rather than a second "risk" that could seem to
 * contradict it ("Low risk" over a "Medium" letter).
 *
 *   high (red):     a required check fails     "1 failing"
 *   medium (blue):  an advised check to look at "2 advised"
 *   low (green):    every check passes          "All pass"
 */
function checksFor(draft: Draft): { severity: DraftSeverity; label: string } {
  try {
    const checks = runHealthChecks(draft);
    const fails = checks.filter((c) => c.severity === "fail").length;
    if (fails > 0) return { severity: "high", label: `${fails} failing` };
    const warns = checks.filter((c) => c.severity === "warn").length;
    if (warns > 0) return { severity: "medium", label: `${warns} advised` };
    return { severity: "low", label: "All pass" };
  } catch {
    return { severity: "low", label: "Not checked" };
  }
}

function severityTone(s: DraftSeverity): { bg: string; fg: string } {
  switch (s) {
    case "high":
      return { bg: "var(--ds-red-bg)", fg: "var(--ds-red-fg)" };
    case "medium":
      // Advice, not a problem: the neutral info colour (amber means "needs
      // you", and the matter's own risk band sits in the header).
      return { bg: "var(--ds-blue-bg)", fg: "var(--ds-blue-fg)" };
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

/** Fallback for a letter whose stage cannot be worked out. */
function statusLabel(draft: Draft): { label: string; tone: PillTone } {
  if ((draft.exports ?? []).some((e) => e.format === "marked-sent")) return { label: "Sent", tone: "green" };
  if (draft.reviewStatus === "approved") return { label: "Approved", tone: "green" };
  return { label: "Draft", tone: "grey" };
}

function DraftTable({
  drafts,
  statuses,
  onRowClick,
}: {
  drafts: Draft[];
  statuses: Record<string, { label: string; tone: PillTone }>;
  onRowClick: (draftId: string) => void;
}) {
  const me = useMe();
  return (
    <table className="w-full border-collapse text-[13px] block md:table">
      <thead className="hidden md:table-header-group">
        <tr>
          <th className={DRILL_TH}>Letter</th>
          <th className={DRILL_TH}>Status</th>
          <th className={DRILL_TH}>Checks</th>
          <th className={DRILL_TH}>Last edited</th>
          <th className={DRILL_TH}>Owner</th>
        </tr>
      </thead>
      <tbody className="block md:table-row-group">
        {drafts.map((d) => {
          const checks = checksFor(d);
          const sev = checks.severity;
          const tone = severityTone(sev);
          const status = statuses[d.id] ?? statusLabel(d);
          // The person who owns the letter, as on the Letters page.
          const owner = letterOwner(d, me).name;
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
              className={DRILL_ROW}
            >
              <td className="block p-0 md:table-cell md:px-4 md:py-3 md:align-middle text-[14px] font-medium text-[var(--ds-ink)]">
                <span className="flex min-w-0 items-center gap-3">
                  <PaperThumb seed={d.letterType} className="hidden md:block" />
                  <span className="min-w-0">{briefTitleFor(d)}</span>
                </span>
              </td>
              <td className="block p-0 md:table-cell md:px-4 md:py-3 md:align-middle text-[12.5px] text-[var(--ds-muted)] md:text-[13px] md:text-[var(--ds-body)]">
                <Pill tone={status.tone}>{status.label}</Pill>
              </td>
              <td className="block p-0 md:table-cell md:px-4 md:py-3 md:align-middle">
                <span
                  className="inline-flex items-center rounded-[6px] px-2 py-0.5 text-[12px] leading-[18px] font-medium whitespace-nowrap"
                  style={{ background: tone.bg, color: tone.fg }}
                  data-testid={`severity-${d.id}`}
                  data-severity={sev}
                >
                  {checks.label}
                </span>
              </td>
              <td className="hidden whitespace-nowrap text-[13px] text-[var(--ds-muted)] md:table-cell md:px-4 md:py-3">
                {lastEdited(d.updatedAt)}
              </td>
              <td className="hidden md:table-cell md:px-4 md:py-3 text-[var(--ds-body)] truncate max-w-[200px]">
                {owner}
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}
