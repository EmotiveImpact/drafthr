import { useMemo } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { ArrowLeft, AlertTriangle, ShieldCheck } from "lucide-react";
import { format } from "date-fns";

import type { Draft, Matter } from "@/lib/letters/types";
import { useDraftStore } from "@/lib/store";
import { EmptyState } from "@/components/ds";
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
      <div className="max-w-5xl mx-auto px-4 sm:px-6 py-6 sm:py-8">
        <BackToReports />
        <div className="bg-[var(--ds-surface)] border border-[var(--ds-line)] rounded-[12px]">
          <EmptyState
            icon={AlertTriangle}
            title="Check not found"
            body="This health check doesn't exist. The Reports page lists every available check."
            primary={{ label: "Back to Reports", to: "/reports" }}
          />
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-6 py-6 sm:py-8">
      <BackToReports />

      <header className="mb-5">
        <h1
          className="m-0 text-[var(--ds-ink)] font-semibold inline-flex items-center gap-2.5"
          style={{
            fontSize: "clamp(22px, 3.2vw, 28px)",
            lineHeight: 1.2,
            letterSpacing: "-0.02em",
          }}
        >
          {check.label}
          <span
            className="inline-flex items-center px-2 py-0.5 rounded-full text-[12px] font-semibold tabular-nums"
            style={{
              background:
                failing.length === 0
                  ? "var(--ds-green-bg)"
                  : "var(--ds-red-bg)",
              color:
                failing.length === 0
                  ? "var(--ds-green-fg)"
                  : "var(--ds-red-fg)",
            }}
            data-testid="failing-count"
          >
            {failing.length} failing
          </span>
        </h1>
        <p className="m-0 mt-2 text-[14px] text-[var(--ds-body)] max-w-[68ch] leading-relaxed">
          {check.description}
        </p>
      </header>

      <section className="bg-[var(--ds-surface)] border border-[var(--ds-line)] rounded-[12px] overflow-hidden">
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
      <span className="text-[var(--ds-ink)] font-medium">Failing check</span>
    </div>
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
    <table className="w-full text-[13px] border-collapse">
      <thead>
        <tr className="text-left text-[11.5px] font-semibold uppercase tracking-wider text-[var(--ds-muted)]">
          <th className="px-4 py-3 font-semibold">Title</th>
          <th className="px-4 py-3 font-semibold">Matter</th>
          <th className="px-4 py-3 font-semibold">Owner</th>
          <th className="px-4 py-3 font-semibold">Reason this letter is failing</th>
          <th className="px-4 py-3 font-semibold">Last edited</th>
        </tr>
      </thead>
      <tbody>
        {rows.map(({ draft, reason }) => {
          const matter = draft.matterId ? matters[draft.matterId] : undefined;
          const owner =
            (draft.collaborators ?? []).find((c) => c.role === "owner")?.name ??
            (draft.collaborators ?? []).find((c) => c.role === "owner")?.email ??
            draft.employer?.legalName ??
            "—";
          return (
            <tr
              key={draft.id}
              tabIndex={0}
              role="button"
              aria-label={`Open ${briefTitleFor(draft)} — ${reason}`}
              onClick={() => onRowClick(draft.id)}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  onRowClick(draft.id);
                }
              }}
              className="border-t border-[var(--ds-line-2)] cursor-pointer hover:bg-[var(--ds-line-2)]/40 focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ds-ink)]/30 transition"
            >
              <td className="px-4 py-3 text-[var(--ds-ink)] font-medium">
                {briefTitleFor(draft)}
              </td>
              <td className="px-4 py-3 text-[var(--ds-body)]">
                {matter?.name ?? <span className="text-[var(--ds-subtle)] italic">Unfiled</span>}
              </td>
              <td className="px-4 py-3 text-[var(--ds-body)] truncate max-w-[160px]">
                {owner}
              </td>
              <td className="px-4 py-3 text-[var(--ds-body)] max-w-[320px]">
                {reason}
              </td>
              <td className="px-4 py-3 text-[var(--ds-body)] tabular-nums whitespace-nowrap">
                {format(new Date(draft.updatedAt), "yyyy-MM-dd")}
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}
