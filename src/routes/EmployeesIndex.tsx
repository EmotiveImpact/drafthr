import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ChevronRight, Download, Plus, UsersRound } from "lucide-react";
import { useDraftStore } from "@/lib/store";
import { matchEmployeeForDraft, matterInvolvesEmployee } from "@/lib/employees";
import { Avatar, PageHeader } from "@/components/ds";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import type { Draft, Employee, EmploymentStatus, Matter } from "@/lib/letters/types";
import { EmployeeForm } from "@/components/employees/EmployeeForm";
import { ImportSuggestions } from "@/components/employees/ImportSuggestions";

/**
 * /employees — the workspace-level directory of every Employee record.
 *
 * Reads `useDraftStore.employees` as the source of truth and surfaces
 * a per-row summary derived from the related Matters + Drafts so HR
 * can see "where is this person turning up" at a glance.
 */
type StatusFilter = "all" | EmploymentStatus;

const STATUS_FILTERS: { value: StatusFilter; label: string }[] = [
  { value: "all", label: "All" },
  { value: "active", label: "Active" },
  { value: "notice", label: "Notice" },
  { value: "on-leave", label: "On leave" },
  { value: "left", label: "Left" },
];

type SortKey = "activity" | "name" | "started";

export function EmployeesIndex() {
  const nav = useNavigate();
  const employees = useDraftStore((s) => s.employees);
  const drafts = useDraftStore((s) => s.drafts);
  const matters = useDraftStore((s) => s.matters);
  const createEmployee = useDraftStore((s) => s.createEmployee);

  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [sort, setSort] = useState<SortKey>("activity");
  const [addOpen, setAddOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);

  const allEmployees = useMemo(() => Object.values(employees), [employees]);
  const allDrafts = useMemo(
    () => Object.values(drafts).filter((d) => !d.isTemplateSource),
    [drafts]
  );
  const allMatters = useMemo(() => Object.values(matters), [matters]);

  const rows = useMemo(() => {
    const q = search.trim().toLowerCase();
    const filtered = allEmployees.filter((e) => {
      if (statusFilter !== "all" && e.status !== statusFilter) return false;
      if (!q) return true;
      const haystack = [e.legalName, e.preferredName, e.jobTitle, e.department]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      return haystack.includes(q);
    });

    const enriched = filtered.map((e) => buildRowSummary(e, allDrafts, allMatters, employees));

    enriched.sort((a, b) => {
      if (sort === "name") return a.employee.legalName.localeCompare(b.employee.legalName);
      if (sort === "started") {
        const av = a.employee.startDate ?? "";
        const bv = b.employee.startDate ?? "";
        return bv.localeCompare(av);
      }
      return b.lastActivityAt - a.lastActivityAt;
    });

    return enriched;
  }, [allEmployees, allDrafts, allMatters, employees, search, statusFilter, sort]);

  const existingNames = useMemo(
    () =>
      new Set(
        allEmployees.map((e) =>
          e.legalName.trim().toLowerCase().replace(/\s+/g, " ")
        )
      ),
    [allEmployees]
  );

  const isEmpty = allEmployees.length === 0;

  return (
    <div className="max-w-5xl px-4 py-6 sm:px-6 sm:py-8">
      <PageHeader
        crumbs={[{ label: "HR / Management", href: "/hr" }, { label: "Employees" }]}
        title="Employees"
        lede="Everyone tracked in this workspace. Records persist across letters and matters — open a profile to see active matters, letter history, and surfaced risks."
        actions={
          <div className="flex items-center gap-2">
            <Button size="sm" variant="outline" onClick={() => setImportOpen(true)}>
              <Download className="size-3.5" />
              Import from drafts
            </Button>
            <Button size="sm" onClick={() => setAddOpen(true)}>
              <Plus className="size-3.5" />
              Add employee
            </Button>
          </div>
        }
      />

      {/* Toolbar — search, sort, status filter */}
      {!isEmpty && (
        <div className="mb-4 flex flex-wrap items-center gap-2">
          <Input
            placeholder="Search by name, role, or department"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="max-w-xs h-9"
          />
          <div className="flex items-center gap-1 text-[12px] text-[var(--ds-muted)]">
            <span>Sort:</span>
            <SortPill active={sort === "activity"} onClick={() => setSort("activity")}>
              Last activity
            </SortPill>
            <SortPill active={sort === "name"} onClick={() => setSort("name")}>
              Name
            </SortPill>
            <SortPill active={sort === "started"} onClick={() => setSort("started")}>
              Start date
            </SortPill>
          </div>
          <div className="ml-auto flex items-center gap-1 text-[12px]">
            {STATUS_FILTERS.map((f) => (
              <FilterPill
                key={f.value}
                active={statusFilter === f.value}
                onClick={() => setStatusFilter(f.value)}
              >
                {f.label}
              </FilterPill>
            ))}
          </div>
        </div>
      )}

      {/* Empty state */}
      {isEmpty && (
        <div
          className="rounded-lg border border-dashed border-[var(--ds-line)] bg-[var(--ds-surface)] p-10 text-center"
        >
          <UsersRound className="size-8 text-[var(--ds-muted)] mx-auto mb-3" />
          <h2 className="text-[15px] font-semibold text-[var(--ds-ink)] m-0">
            No employees yet
          </h2>
          <p className="text-[13px] text-[var(--ds-muted)] mt-1.5 mb-5 m-0 max-w-md mx-auto">
            Import from your existing drafts to get started — we'll group
            everyone mentioned in your letters into reusable records.
          </p>
          <div className="inline-flex gap-2">
            <Button size="sm" onClick={() => setImportOpen(true)}>
              <Download className="size-3.5" />
              Import from drafts
            </Button>
            <Button size="sm" variant="outline" onClick={() => setAddOpen(true)}>
              <Plus className="size-3.5" />
              Add manually
            </Button>
          </div>
        </div>
      )}

      {/* Rows */}
      {!isEmpty && rows.length === 0 && (
        <div className="rounded-md border border-dashed border-[var(--ds-line)] bg-[var(--ds-surface-2)] py-10 text-center text-[13px] text-[var(--ds-muted)]">
          No employees match those filters.
        </div>
      )}

      {!isEmpty && rows.length > 0 && (
        <ul
          className="rounded-lg border border-[var(--ds-line)] bg-[var(--ds-surface)] divide-y divide-[var(--ds-line)] overflow-hidden m-0 p-0 list-none"
        >
          {rows.map((row) => (
            <EmployeeRow
              key={row.employee.id}
              row={row}
              onOpen={() => nav(`/employees/${row.employee.id}`)}
            />
          ))}
        </ul>
      )}

      <EmployeeForm
        open={addOpen}
        onOpenChange={setAddOpen}
        title="Add employee"
        description="Create a new workspace record. You can fill in more details later."
        submitLabel="Create employee"
        onSubmit={(values) => {
          createEmployee(values);
          setAddOpen(false);
        }}
      />

      <ImportSuggestions
        open={importOpen}
        onOpenChange={setImportOpen}
        drafts={drafts}
        existingNames={existingNames}
        onImport={(chosen) => {
          for (const s of chosen) {
            const { draftCount: _dc, lastSeenAt: _ls, ...rest } = s;
            void _dc;
            void _ls;
            createEmployee(rest);
          }
          setImportOpen(false);
        }}
      />
    </div>
  );
}

/* ============================================================================
 * Row summary derivation
 * ==========================================================================*/

type RowSummary = {
  employee: Employee;
  draftCount: number;
  matterCount: number;
  latestDraft?: Draft;
  lastActivityAt: number;
};

function buildRowSummary(
  employee: Employee,
  drafts: Draft[],
  matters: Matter[],
  employees: Record<string, Employee>,
): RowSummary {
  const linkedDrafts = drafts.filter(
    (d) => matchEmployeeForDraft(d, employees) === employee.id
  );
  const sortedDrafts = [...linkedDrafts].sort((a, b) => b.updatedAt - a.updatedAt);
  const latestDraft = sortedDrafts[0];

  const matterCount = matters.filter((m) =>
    matterInvolvesEmployee(m, employee.id, employees)
  ).length;

  const lastActivityAt = latestDraft?.updatedAt ?? employee.updatedAt;

  return {
    employee,
    draftCount: linkedDrafts.length,
    matterCount,
    latestDraft,
    lastActivityAt,
  };
}

/* ============================================================================
 * Sub-components
 * ==========================================================================*/

function EmployeeRow({ row, onOpen }: { row: RowSummary; onOpen: () => void }) {
  const { employee, draftCount, matterCount, latestDraft } = row;
  const displayName = employee.preferredName
    ? `${employee.legalName} (${employee.preferredName})`
    : employee.legalName;

  const subtitleParts = [employee.jobTitle, employee.department].filter(Boolean);
  const subtitle = subtitleParts.length > 0 ? subtitleParts.join(" · ") : "No role on file";

  const summary = buildActivitySummary(row);

  return (
    <li className="m-0">
      <button
        type="button"
        onClick={onOpen}
        className="group w-full flex items-center gap-4 px-4 py-3.5 text-left hover:bg-[var(--ds-surface-2)] transition"
      >
        <Avatar name={employee.legalName} seed={employee.id} size="xl" />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 min-w-0">
            <h3 className="font-semibold text-[14px] text-[var(--ds-ink)] m-0 truncate">
              {displayName}
            </h3>
            <StatusBadge status={employee.status} />
          </div>
          <p className="text-[12.5px] text-[var(--ds-muted)] mt-0.5 m-0 truncate">
            {subtitle}
          </p>
          <p className="text-[11.5px] text-[var(--ds-subtle)] mt-1 m-0 truncate">
            {summary}
          </p>
        </div>
        <div className="hidden sm:flex flex-col items-end text-[11px] text-[var(--ds-muted)] shrink-0">
          {draftCount > 0 && (
            <span>
              {draftCount} draft{draftCount === 1 ? "" : "s"}
            </span>
          )}
          {matterCount > 0 && (
            <span>
              {matterCount} matter{matterCount === 1 ? "" : "s"}
            </span>
          )}
          {latestDraft && (
            <span className="font-mono tabular-nums mt-0.5">
              {timeAgo(latestDraft.updatedAt)}
            </span>
          )}
        </div>
        <ChevronRight className="size-4 text-[var(--ds-subtle)] group-hover:text-[var(--ds-ink)] transition shrink-0" />
      </button>
    </li>
  );
}

function StatusBadge({ status }: { status: EmploymentStatus }) {
  const config: Record<EmploymentStatus, { label: string; cls: string }> = {
    active: {
      label: "Active",
      cls: "bg-[var(--ds-green-bg)] text-[var(--ds-green-fg)]",
    },
    notice: {
      label: "Notice",
      cls: "bg-[var(--ds-amber-bg)] text-[var(--ds-amber-fg)]",
    },
    "on-leave": {
      label: "On leave",
      cls: "bg-[var(--ds-blue-bg)] text-[var(--ds-blue-fg)]",
    },
    left: {
      label: "Left",
      cls: "bg-[var(--ds-line-2)] text-[var(--ds-muted)]",
    },
  };
  const { label, cls } = config[status];
  return (
    <span
      className={cn(
        "inline-flex items-center text-[10px] px-1.5 py-[1px] rounded-full font-medium",
        cls
      )}
    >
      {label}
    </span>
  );
}

function SortPill({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "px-2 py-1 rounded text-[12px] transition",
        active
          ? "text-[var(--ds-ink)] font-medium"
          : "text-[var(--ds-muted)] hover:text-[var(--ds-ink)]"
      )}
    >
      {children}
    </button>
  );
}

function FilterPill({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "px-2.5 py-1 rounded-full text-[11.5px] border transition",
        active
          ? "bg-[var(--ds-ink)] text-white border-[var(--ds-ink)]"
          : "bg-transparent text-[var(--ds-muted)] border-[var(--ds-line)] hover:text-[var(--ds-ink)] hover:border-[var(--ds-subtle)]"
      )}
    >
      {children}
    </button>
  );
}

/* ============================================================================
 * Helpers
 * ==========================================================================*/

function buildActivitySummary(row: RowSummary): string {
  const { draftCount, matterCount, latestDraft } = row;
  const parts: string[] = [];
  if (matterCount > 0) {
    parts.push(`${matterCount} matter${matterCount === 1 ? "" : "s"}`);
  }
  if (draftCount > 0) {
    parts.push(`${draftCount} draft${draftCount === 1 ? "" : "s"}`);
  }
  if (latestDraft) {
    parts.push(`last touched ${timeAgo(latestDraft.updatedAt)}`);
  }
  if (parts.length === 0) return "No activity yet";
  return parts.join(" · ");
}

function timeAgo(ts: number): string {
  const seconds = Math.max(0, Math.floor((Date.now() - ts) / 1000));
  if (seconds < 60) return "just now";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d ago`;
  const months = Math.floor(days / 30);
  return `${months}mo ago`;
}

// Re-export the link helper for consumers that want to deep-link.
export const employeesIndexPath = "/employees";
