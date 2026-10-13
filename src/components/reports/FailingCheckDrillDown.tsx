import { useMemo } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { AlertTriangle, ShieldCheck } from "lucide-react";

import type { Draft, Matter } from "@/lib/letters/types";
import { useDraftStore } from "@/lib/store";
import { EmptyState, Pill } from "@/components/ds";
import { PaperThumb } from "@/components/reports/parts";
import { Band } from "@/components/home/HomeBand";
import { DRILL_ROW, DRILL_TH, DrillBody, DrillShell, lastEdited } from "@/components/reports/drillChrome";
import { briefTitleFor } from "@/lib/letters/display";
import {
  failingDraftsForCheck,
  getHealthCheck,
  type FailingDraft,
} from "@/lib/reports/check-predicates";
import { plainReason, ruleCopy } from "@/components/reports/reportsData";

/* ============================================================================
 * /reports/checks/:checkId: per-check drill-down for HR Director.
 *
 * Layered on top of the workspace-level Compliance Health card on /reports.
 * Clicking a failing check there navigates here so the user can see exactly
 * which letters are failing the check, the specific reason each one fails,
 * and jump straight into the editor to fix it.
 *
 * Data + tenant scoping: same as MatterDrillDown: reuses `useDraftStore`,
 * the same source the Reports page reads, so no separate filtering needed.
 * ==========================================================================*/

export function FailingCheckDrillDown() {
  const { checkId } = useParams<{ checkId: string }>();
  const nav = useNavigate();
  const drafts = useDraftStore((s) => s.drafts);
  const matters = useDraftStore((s) => s.matters);

  const check = checkId ? getHealthCheck(checkId) : undefined;

  // Same filter the Reports.tsx page uses: HR-mode, non-template drafts only.
  // Drill-downs must never expose template-source drafts as if they were
  // real letters.
  const realDrafts = useMemo<Draft[]>(
    () =>
      Object.values(drafts).filter(
        (d) => d.mode === "employer" && !d.isTemplateSource
      ),
    [drafts]
  );

  // Each letter's reason in plain words (the rule's own reason is for code).
  const failing = useMemo<FailingDraft[]>(() => {
    if (!check) return [];
    return failingDraftsForCheck(realDrafts, check.id).map((f) => ({
      ...f,
      reason: plainReason(check.id, f.draft, f.reason),
    }));
  }, [check, realDrafts]);

  const crumbs = [{ label: "Reports", href: "/reports" }, { label: "Failing check" }];

  if (!check) {
    return (
      <DrillShell>
        <Band crumbs={crumbs} title="Failing check" />
        <DrillBody>
          <div className="rounded-[16px] border border-[var(--ds-line)] bg-[var(--ds-surface)]">
            <EmptyState
              icon={AlertTriangle}
              title="Check not found"
              body="This health check doesn't exist. The Reports page lists every available check."
              primary={{ label: "Back to Reports", to: "/reports" }}
            />
          </div>
        </DrillBody>
      </DrillShell>
    );
  }

  const copy = ruleCopy(check.id, check);
  return (
    <DrillShell>
      <Band
        crumbs={crumbs}
        title={copy.label}
        lede={
          <span className="flex flex-wrap items-center gap-x-2.5 gap-y-1.5">
            <span>
              {copy.description}
              {copy.advisory && " Advisory: this rule is not part of the health score, so it does not change the compliance rate."}
            </span>
            <span data-testid="failing-count">
              <Pill tone={failing.length === 0 ? "green" : "red"}>{failing.length} failing</Pill>
            </span>
          </span>
        }
      />
      <DrillBody>
        <section className="min-w-0 overflow-hidden rounded-[16px] border border-[var(--ds-line)] bg-[var(--ds-surface)]">
          {failing.length === 0 ? (
            <EmptyState
              icon={ShieldCheck}
              title="No letters failing this check"
              body="Every letter in this workspace passes this rule."
            />
          ) : (
            <FailingTable rows={failing} matters={matters} onRowClick={(id) => nav(`/editor/${id}`)} />
          )}
        </section>
      </DrillBody>
    </DrillShell>
  );
}

/* ─── table ──────────────────────────────────────────────────────────── */

function FailingTable({
  rows,
  matters,
  onRowClick,
}: {
  rows: FailingDraft[];
  matters: Record<string, Matter>;
  onRowClick: (draftId: string) => void;
}) {
  return (
    <table className="w-full border-collapse text-[13px] block md:table">
      <thead className="hidden md:table-header-group">
        <tr>
          <th className={DRILL_TH}>Letter</th>
          <th className={DRILL_TH}>Matter</th>
          <th className={DRILL_TH}>Owner</th>
          <th className={DRILL_TH}>Reason this letter is failing</th>
          <th className={DRILL_TH}>Last edited</th>
        </tr>
      </thead>
      <tbody className="block md:table-row-group">
        {rows.map(({ draft, reason }) => {
          const matter = draft.matterId ? matters[draft.matterId] : undefined;
          const owner =
            (draft.collaborators ?? []).find((c) => c.role === "owner")?.name ??
            (draft.collaborators ?? []).find((c) => c.role === "owner")?.email ??
            draft.employer?.legalName ??
            "Unassigned";
          return (
            <tr
              key={draft.id}
              tabIndex={0}
              role="button"
              aria-label={`Open ${briefTitleFor(draft)}: ${reason}`}
              onClick={() => onRowClick(draft.id)}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  onRowClick(draft.id);
                }
              }}
              className={DRILL_ROW}
            >
              <td className="block p-0 md:table-cell md:px-4 md:py-3 md:align-middle text-[14px] font-medium text-[var(--ds-ink)]">
                <span className="flex min-w-0 items-center gap-3">
                  <PaperThumb seed={draft.letterType} className="hidden md:block" />
                  <span className="min-w-0">{briefTitleFor(draft)}</span>
                </span>
              </td>
              <td className="block p-0 md:table-cell md:px-4 md:py-3 md:align-middle text-[12.5px] text-[var(--ds-muted)] md:text-[13px] md:text-[var(--ds-body)]">
                {matter?.name ?? <span className="text-[var(--ds-subtle)]">Unfiled</span>}
              </td>
              <td className="hidden md:table-cell md:px-4 md:py-3 text-[var(--ds-body)] truncate max-w-[160px]">
                {owner}
              </td>
              <td className="block p-0 md:table-cell md:px-4 md:py-3 md:align-middle text-[12.5px] text-[var(--ds-red-fg)] md:max-w-[320px] md:text-[13px]">
                {reason}
              </td>
              <td className="hidden whitespace-nowrap text-[13px] text-[var(--ds-muted)] md:table-cell md:px-4 md:py-3">
                {lastEdited(draft.updatedAt)}
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}
