import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import { ChevronRight, Download, Plus, Search, UsersRound } from "lucide-react";
import { useDraftStore } from "@/lib/store";
import { matchEmployeeForDraft } from "@/lib/employees";
import { Avatar, PageHeader } from "@/components/ds";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { PageShell, StatusPill, type PillTone } from "@/components/reports/parts";
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

    const enriched = filtered.map((e) => buildRowSummary(e, allDrafts, allMatters));

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
  }, [allEmployees, allDrafts, allMatters, search, statusFilter, sort]);

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
    <PageShell>
      <PageHeader
        crumbs={[{ label: "HR / Management", href: "/hr" }, { label: "Employees" }]}
        title="Employees"
        lede="Everyone tracked in this workspace. Records persist across letters and matters: open a profile to see active matters, letter history and surfaced risks."
        tabs={isEmpty ? undefined : STATUS_FILTERS.map((f) => ({
          id: f.value,
          label: f.label,
          count: f.value === "all" ? allEmployees.length : allEmployees.filter((e) => e.status === f.value).length,
        }))}
        activeTab={statusFilter}
        onTabChange={(id) => setStatusFilter(id as StatusFilter)}
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

      {/* Toolbar: count, search, sort */}
      {!isEmpty && (
        <div className="mb-2 flex flex-wrap items-center gap-2 sm:pl-3.5">
          <span className="mr-auto text-[13px] text-[var(--ds-muted)]">
            {rows.length === 1 ? "1 person" : `${rows.length} people`}
          </span>
          <div className="relative order-first min-w-0 basis-full sm:order-none sm:basis-auto sm:flex-none">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-[var(--ds-muted)]" />
            <Input
              placeholder="Search by name, role or department"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="h-9 w-full border-transparent bg-[var(--ds-surface-2)] pl-8 shadow-none sm:w-[260px]"
            />
          </div>
          <div className="flex items-center gap-0.5 rounded-[var(--ds-r-s)] border border-[var(--ds-line)] p-0.5 text-[12px] text-[var(--ds-muted)]">
            <span className="px-1.5">Sort</span>
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
        </div>
      )}

      {/* Empty state */}
      {isEmpty && (
        <motion.div
          initial={{ opacity: 0, y: 4 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.25 }}
          className="rounded-[var(--ds-r-l)] border border-[var(--ds-line)] bg-[var(--ds-surface)] p-10 text-center"
        >
          <div className="mx-auto mb-4 grid size-14 place-items-center rounded-full border border-[var(--ds-line)] bg-[var(--ds-line-2)] text-[var(--ds-muted)]">
            <UsersRound className="size-5" />
          </div>
          <h2 className="text-[15px] font-semibold text-[var(--ds-ink)] m-0">
            No employees yet
          </h2>
          <p className="text-[13px] text-[var(--ds-muted)] mt-1.5 mb-5 m-0 max-w-md mx-auto">
            Import from your existing drafts to get started. We'll group
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
        </motion.div>
      )}

      {/* Rows */}
      {!isEmpty && rows.length === 0 && (
        <div className="rounded-[var(--ds-r-l)] bg-[var(--ds-surface-2)] py-10 text-center text-[13px] text-[var(--ds-muted)]">
          No employees match those filters.
        </div>
      )}

      {!isEmpty && rows.length > 0 && (
        <motion.ul
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.2 }}
          className="m-0 list-none p-0 pt-1.5"
        >
          <li className="hidden min-h-[30px] grid-cols-[40px_minmax(0,1fr)_110px_150px_90px_20px] items-center gap-4 border-b border-[var(--ds-line)] px-3.5 text-[12px] text-[var(--ds-muted)] md:grid" aria-hidden>
            <span />
            <span>Person</span>
            <span>Status</span>
            <span>Work</span>
            <span className="text-right">Updated</span>
            <span />
          </li>
          {rows.map((row) => (
            <EmployeeRow
              key={row.employee.id}
              row={row}
              onOpen={() => nav(`/employees/${row.employee.id}`)}
            />
          ))}
        </motion.ul>
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
    </PageShell>
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
  matters: Matter[]
): RowSummary {
  // Match drafts by normalized legalName.
  const empMap: Record<string, Employee> = { [employee.id]: employee };
  const linkedDrafts = drafts.filter(
    (d) => matchEmployeeForDraft(d, empMap) === employee.id
  );
  const sortedDrafts = [...linkedDrafts].sort((a, b) => b.updatedAt - a.updatedAt);
  const latestDraft = sortedDrafts[0];

  const matterCount = matters.filter((m) =>
    m.participants?.some((p) => p.employeeId === employee.id)
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
  const subtitle = subtitleParts.length > 0 ? subtitleParts.join(", ") : "No role on file";

  const summary = buildActivitySummary(row);

  return (
    <li className="relative m-0 [&+&]:before:absolute [&+&]:before:inset-x-3.5 [&+&]:before:top-0 [&+&]:before:border-t [&+&]:before:border-[var(--ds-line)] [&+&]:before:content-[''] hover:before:border-transparent [&:hover+&]:before:border-transparent">
      <button
        type="button"
        onClick={onOpen}
        className="group grid w-full grid-cols-[40px_minmax(0,1fr)_20px] items-center gap-3 rounded-[var(--ds-r-m)] px-3.5 py-3 text-left transition hover:bg-[var(--ds-surface-2)] md:grid-cols-[40px_minmax(0,1fr)_110px_150px_90px_20px] md:gap-4"
      >
        <Avatar name={employee.legalName} seed={employee.id} size="xl" />
        <div className="min-w-0">
          <div className="flex min-w-0 items-center gap-2">
            <h3 className="m-0 truncate text-[14px] font-semibold text-[var(--ds-ink)]">
              {displayName}
            </h3>
            <span className="md:hidden">
              <StatusBadge status={employee.status} />
            </span>
          </div>
          <p className="m-0 mt-0.5 truncate text-[12.5px] text-[var(--ds-muted)]">
            {subtitle}
            <span className="md:hidden">, {summary}</span>
          </p>
        </div>
        <span className="hidden md:block">
          <StatusBadge status={employee.status} />
        </span>
        <span className="hidden truncate text-[12.5px] text-[var(--ds-muted)] md:block">
          {matterCount > 0 || draftCount > 0
            ? [
                matterCount > 0 ? `${matterCount} matter${matterCount === 1 ? "" : "s"}` : null,
                draftCount > 0 ? `${draftCount} draft${draftCount === 1 ? "" : "s"}` : null,
              ]
                .filter(Boolean)
                .join(", ")
            : "No activity yet"}
        </span>
        <span className="hidden text-right text-[12.5px] text-[var(--ds-muted)] md:block">
          {latestDraft ? timeAgo(latestDraft.updatedAt) : "None"}
        </span>
        <ChevronRight className="size-4 shrink-0 text-[var(--ds-subtle)] transition group-hover:text-[var(--ds-ink)]" />
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
      cls: "bg-[var(--ds-chip)] text-[var(--ds-muted)]",
    },
  };
  const { label } = config[status];
  const tone: Record<EmploymentStatus, PillTone> = {
    active: "ok",
    notice: "warn",
    "on-leave": "info",
    left: "neutral",
  };
  return (
    <StatusPill tone={tone[status]} size="sm">
      {label}
    </StatusPill>
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
        "rounded-[5px] px-2 py-1 text-[12px] transition",
        active
          ? "bg-[var(--ds-surface-2)] text-[var(--ds-ink)] font-medium"
          : "text-[var(--ds-muted)] hover:text-[var(--ds-ink)]"
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
  return parts.join(", ");
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
