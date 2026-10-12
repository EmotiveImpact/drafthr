import { useMemo } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { AlertTriangle, ShieldCheck } from "lucide-react";
import { format } from "date-fns";

import type { Draft, Matter } from "@/lib/letters/types";
import { useDraftStore } from "@/lib/store";
import { EmptyState, PageHeader } from "@/components/ds";
import { PageShell, PaperThumb, StatusPill } from "@/components/reports/parts";
import { briefTitleFor } from "@/lib/letters/display";
import {
  failingDraftsForCheck,
  getHealthCheck,
  type FailingDraft,
} from "@/lib/reports/check-predicates";

/* ============================================================================
 * /reports/checks/:checkId — per-check drill-down for HR Director.
 *
 * Layered on top of the workspace-level Compliance Health card on /reports.
 * Clicking a failing check there navigates here so the user can see exactly
 * which letters are failing the check, the specific reason each one fails,
 * and jump straight into the editor to fix it.
 *
 * Data + tenant scoping: same as MatterDrillDown — reuses `useDraftStore`,
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

  const failing = useMemo<FailingDraft[]>(() => {
    if (!check) return [];
    return failingDraftsForCheck(realDrafts, check.id);
  }, [check, realDrafts]);

  if (!check) {
    return (
      <PageShell width="medium">
        <PageHeader crumbs={[{ label: "Reports", href: "/reports" }, { label: "Failing check" }]} title="Failing check" />
        <div className="bg-[var(--ds-surface)] border border-[var(--ds-line)] rounded-[var(--ds-r-l)]">
          <EmptyState
            icon={AlertTriangle}
            title="Check not found"
            body="This health check doesn't exist. The Reports page lists every available check."
            primary={{ label: "Back to Reports", to: "/reports" }}
          />
        </div>
      </PageShell>
    );
  }

  return (
    <PageShell width="medium">
      <PageHeader
        crumbs={[{ label: "Reports", href: "/reports" }, { label: "Failing check" }]}
        title={check.label}
        lede={check.description}
        actions={
          <span data-testid="failing-count">
            <StatusPill tone={failing.length === 0 ? "ok" : "danger"}>
              {failing.length} failing
            </StatusPill>
          </span>
        }
      />

      <section className="min-w-0 bg-[var(--ds-surface)] border border-[var(--ds-line)] rounded-[var(--ds-r-l)] overflow-hidden">
        {failing.length === 0 ? (
          <EmptyState
            icon={ShieldCheck}
            title="No letters failing this check"
            body="Every letter in this workspace passes this rule."
          />
        ) : (
          <FailingTable
            rows={failing}
            matters={matters}
            onRowClick={(id) => nav(`/editor/${id}`)}
          />
        )}
      </section>
    </PageShell>
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
        <tr className="text-left text-[12px] text-[var(--ds-muted)] border-b border-[var(--ds-line)]">
          <th className="px-4 py-2.5 font-normal">Title</th>
          <th className="px-4 py-2.5 font-normal">Matter</th>
          <th className="px-4 py-2.5 font-normal">Owner</th>
          <th className="px-4 py-2.5 font-normal">Reason this letter is failing</th>
          <th className="px-4 py-2.5 font-normal">Last edited</th>
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
              className="relative flex flex-col gap-1 px-4 py-3.5 md:table-row md:p-0 border-t border-[var(--ds-line-2)] first:border-t-0 cursor-pointer hover:bg-[var(--ds-surface-2)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ds-focus)]/40 transition"
            >
              <td className="block p-0 md:table-cell md:px-4 md:py-3 md:align-middle text-[var(--ds-ink)] font-semibold text-[14px]">
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
              <td className="hidden md:table-cell md:px-4 md:py-3 ds-mono text-[12px] text-[var(--ds-muted)] whitespace-nowrap">
                {format(new Date(draft.updatedAt), "yyyy-MM-dd")}
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}
