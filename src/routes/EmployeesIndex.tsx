import { useEffect, useMemo, useState, type MouseEvent } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { toast } from "sonner";
import {
  Archive,
  ArrowDown,
  ArrowUp,
  ArrowUpDown,
  ArrowUpRight,
  Building2,
  Download,
  FileText,
  Folder,
  MoreHorizontal,
  Pencil,
  Plus,
  Sparkles,
  Trash2,
  Upload,
  UserPlus,
  UsersRound,
} from "lucide-react";
import { useDraftStore } from "@/lib/store";
import type { Employee, EmploymentStatus } from "@/lib/letters/types";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { ListHeader } from "@/components/letters/ListHeader";
import { BulkBar, FilterMenu, NoMatch, NumberPager, SearchField, SortMenu, usePage, type BulkAction } from "@/components/letters/toolbar";
import { downloadText, Initials, MENU_MOTION, TickBox, todayStamp, useOrgName, usePageTitle } from "@/components/letters/parts";
import { EmployeeForm, type EmployeeFormValues } from "@/components/employees/EmployeeForm";
import { ImportSuggestions } from "@/components/employees/ImportSuggestions";
import { ImportCsvDialog } from "@/components/employees/ImportCsvDialog";
import { NewLetterForPerson } from "@/components/employees/NewLetterForPerson";
import { DirectorySyncStrip } from "@/components/employees/DirectorySyncStrip";
import { DeleteEmployeeDialog, EmployeeStatusPill } from "@/components/employees/parts";
import { displayName, employeesCsv, startDateLabel, useEmployeeRows, type EmployeeRow } from "@/components/employees/model";

/**
 * /employees: the workspace directory (employees mock). Every Employee
 * record with the letters about them and the matters they are part of,
 * status tabs, search, a department filter, an open-matter toggle, sorts,
 * Directory Sync status, tick boxes with bulk archive and CSV export, and
 * Add employee, Import from drafts and Import CSV.
 */
type TabId = "all" | "active" | "notice" | "on-leave" | "leavers";
type SortId = "name-asc" | "name-desc" | "activity" | "started";

const TABS: { id: TabId; label: string; status?: EmploymentStatus }[] = [
  { id: "all", label: "All" },
  { id: "active", label: "Active", status: "active" },
  { id: "notice", label: "Notice", status: "notice" },
  { id: "on-leave", label: "On leave", status: "on-leave" },
  { id: "leavers", label: "Leavers", status: "left" },
];

const SORTS: { value: SortId; label: string }[] = [
  { value: "name-asc", label: "Name, A to Z" },
  { value: "name-desc", label: "Name, Z to A" },
  { value: "activity", label: "Last activity" },
  { value: "started", label: "Start date" },
];

const PAGE = 25;
const COLS = ["40px", "27%", "19%", "11%", "11%", "11%", "8%", "11%", "40px"];
const norm = (s?: string) => (s ?? "").trim().toLowerCase().replace(/\s+/g, " ");

function readTab(v: string | null): TabId {
  if (v === "left") return "leavers";
  return TABS.some((t) => t.id === v) ? (v as TabId) : "all";
}

export function EmployeesIndex() {
  usePageTitle("Employees");
  const nav = useNavigate();
  const org = useOrgName();
  const rows = useEmployeeRows();
  const drafts = useDraftStore((s) => s.drafts);
  const createEmployee = useDraftStore((s) => s.createEmployee);
  const updateEmployee = useDraftStore((s) => s.updateEmployee);
  const archiveEmployee = useDraftStore((s) => s.archiveEmployee);
  const deleteEmployee = useDraftStore((s) => s.deleteEmployee);

  const [params, setParams] = useSearchParams();
  const tab = readTab(params.get("tab"));
  const setTab = (t: TabId) =>
    setParams(
      (p) => {
        const next = new URLSearchParams(p);
        if (t === "all") next.delete("tab");
        else next.set("tab", t);
        return next;
      },
      { replace: true }
    );

  const [q, setQ] = useState("");
  const [dept, setDept] = useState<string | null>(null);
  const [openOnly, setOpenOnly] = useState(false);
  const [sort, setSort] = useState<SortId>("name-asc");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [addOpen, setAddOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [csvOpen, setCsvOpen] = useState(false);
  const [editing, setEditing] = useState<Employee | null>(null);
  const [deleting, setDeleting] = useState<Employee | null>(null);
  const [letterFor, setLetterFor] = useState<Employee | null>(null);

  const counts = useMemo(() => {
    const c: Record<TabId, number> = { all: rows.length, active: 0, notice: 0, "on-leave": 0, leavers: 0 };
    for (const r of rows) {
      const t = TABS.find((x) => x.status === r.employee.status);
      if (t) c[t.id] += 1;
    }
    return c;
  }, [rows]);

  const departments = useMemo(() => {
    const m = new Map<string, { label: string; count: number }>();
    for (const r of rows) {
      const d = r.employee.department?.trim();
      if (!d) continue;
      const k = norm(d);
      const v = m.get(k) ?? { label: d, count: 0 };
      v.count += 1;
      m.set(k, v);
    }
    return [...m.entries()].map(([value, v]) => ({ value, label: v.label, count: v.count })).sort((a, b) => a.label.localeCompare(b.label));
  }, [rows]);
  const deptCount = new Set(rows.map((r) => norm(r.employee.department)).filter(Boolean)).size;
  const withMatter = rows.filter((r) => r.openMatters.length > 0).length;

  const shown = useMemo(() => {
    const status = TABS.find((t) => t.id === tab)?.status;
    const query = norm(q);
    const list = rows.filter((r) => {
      const e = r.employee;
      if (status && e.status !== status) return false;
      if (dept && norm(e.department) !== dept) return false;
      if (openOnly && r.openMatters.length === 0) return false;
      if (query) {
        const hay = norm([e.legalName, e.preferredName, e.jobTitle, e.department, e.email].filter(Boolean).join(" "));
        if (!hay.includes(query)) return false;
      }
      return true;
    });
    const byName = (a: EmployeeRow, b: EmployeeRow) => a.employee.legalName.localeCompare(b.employee.legalName);
    list.sort((a, b) => {
      if (sort === "name-asc") return byName(a, b);
      if (sort === "name-desc") return byName(b, a);
      if (sort === "started") return (b.employee.startDate ?? "").localeCompare(a.employee.startDate ?? "") || byName(a, b);
      return b.lastActivityAt - a.lastActivityAt;
    });
    return list;
  }, [rows, tab, q, dept, openOnly, sort]);

  const { page, pages, setPage } = usePage(shown.length, PAGE, `${tab}|${q}|${dept}|${openOnly}|${sort}`);
  const pageRows = shown.slice(page * PAGE, page * PAGE + PAGE);

  // Keep the selection to people on this page.
  const pageIds = pageRows.map((r) => r.employee.id).join(",");
  useEffect(() => {
    setSelected((prev) => {
      const ids = new Set(pageIds.split(",").filter(Boolean));
      const next = new Set([...prev].filter((id) => ids.has(id)));
      return next.size === prev.size ? prev : next;
    });
  }, [pageIds]);

  const filtersSet = !!(q.trim() || dept || openOnly);
  const clearFilters = () => {
    setQ("");
    setDept(null);
    setOpenOnly(false);
  };

  const existingNames = useMemo(() => new Set(rows.map((r) => norm(r.employee.legalName))), [rows]);
  const isEmpty = rows.length === 0;

  const archive = (people: Employee[]) => {
    const live = people.filter((e) => e.status !== "left");
    if (live.length === 0) return;
    const before = live.map((e) => ({ id: e.id, status: e.status, endDate: e.endDate }));
    for (const e of live) archiveEmployee(e.id);
    setSelected(new Set());
    toast.success(live.length === 1 ? `${live[0].legalName} marked as left` : `${live.length} people marked as left`, {
      duration: 6000,
      action: {
        label: "Undo",
        onClick: () => {
          for (const b of before) updateEmployee(b.id, { status: b.status, endDate: b.endDate });
        },
      },
    });
  };

  const exportCsv = (list: EmployeeRow[]) => {
    downloadText(`drafthr-employees-${todayStamp()}.csv`, employeesCsv(list));
    toast.success(`Exported ${list.length} ${list.length === 1 ? "person" : "people"}`);
  };

  const selectedRows = pageRows.filter((r) => selected.has(r.employee.id));
  const bulkActions: BulkAction[] = [
    {
      id: "archive",
      label: "Archive (mark as left)",
      icon: Archive,
      onClick: () => archive(selectedRows.map((r) => r.employee)),
      disabledReason: selectedRows.every((r) => r.employee.status === "left") ? "Everyone ticked has already left" : null,
    },
    { id: "export", label: "Export CSV", icon: Download, onClick: () => exportCsv(selectedRows) },
  ];

  const allTicked = pageRows.length > 0 && pageRows.every((r) => selected.has(r.employee.id));
  const someTicked = pageRows.some((r) => selected.has(r.employee.id));
  const selection = {
    selected,
    toggle: (id: string) =>
      setSelected((prev) => {
        const next = new Set(prev);
        if (next.has(id)) next.delete(id);
        else next.add(id);
        return next;
      }),
    toggleAll: (on: boolean) => setSelected(on ? new Set(pageRows.map((r) => r.employee.id)) : new Set()),
    header: (allTicked ? true : someTicked ? "mixed" : false) as boolean | "mixed",
  };

  const menu = {
    open: (e: Employee) => nav(`/employees/${e.id}`),
    edit: (e: Employee) => setEditing(e),
    newLetter: (e: Employee) => setLetterFor(e),
    archive: (e: Employee) => archive([e]),
    remove: (e: Employee) => setDeleting(e),
  };

  return (
    <div className="min-w-0">
      <ListHeader
        crumbs={[{ label: org }, { label: "People" }]}
        title="Employees"
        lede={
          isEmpty ? (
            "Everyone tracked in this workspace, with their letters and matters."
          ) : (
            <>
              <b>
                {rows.length} {rows.length === 1 ? "person" : "people"}
              </b>{" "}
              across {deptCount} {deptCount === 1 ? "department" : "departments"}. <b>{withMatter}</b> {withMatter === 1 ? "has" : "have"} an open matter.
            </>
          )
        }
        actions={
          <>
            <Button variant="outline" onClick={() => setImportOpen(true)}>
              <Sparkles className="size-[17px]" />
              Import from drafts
            </Button>
            <Button variant="outline" onClick={() => setCsvOpen(true)}>
              <Upload className="size-[17px]" />
              Import CSV
            </Button>
            <Button onClick={() => setAddOpen(true)}>
              <UserPlus className="size-[17px]" />
              Add employee
            </Button>
          </>
        }
        tabs={isEmpty ? undefined : TABS.map((t) => ({ id: t.id, label: t.label, count: counts[t.id] }))}
        activeTab={tab}
        onTabChange={(id) => setTab(id as TabId)}
        countStyle="chip"
        tabsLabel="Employees"
      />

      <section aria-label="People" className="min-w-0 px-4 pb-12 pt-5 md:px-12 md:pt-[22px]">
        {isEmpty ? (
          <div className="flex flex-col items-center px-6 py-14 text-center">
            <div className="mb-4 grid size-11 place-items-center rounded-[12px] border border-[var(--ds-line)] bg-[var(--ds-surface)] text-[var(--ds-ink)]">
              <UsersRound className="size-5" />
            </div>
            <h2 className="m-0 text-[16px] font-medium text-[var(--ds-ink)]">No employees yet</h2>
            <p className="m-0 mt-1.5 max-w-[52ch] text-[13.5px] text-[var(--ds-muted)]">
              Import from your existing drafts to get started. We'll group everyone mentioned in your letters into reusable records.
            </p>
            <div className="mt-5 flex flex-wrap justify-center gap-2.5">
              <Button onClick={() => setImportOpen(true)}>
                <Sparkles className="size-[17px]" />
                Import from drafts
              </Button>
              <Button variant="outline" onClick={() => setCsvOpen(true)}>
                <Upload className="size-[17px]" />
                Import CSV
              </Button>
              <Button variant="outline" onClick={() => setAddOpen(true)}>
                <Plus className="size-[17px]" />
                Add manually
              </Button>
            </div>
          </div>
        ) : (
          <>
            <div className="mb-4 flex min-w-0 flex-wrap items-center gap-2.5">
              <SearchField
                value={q}
                onChange={setQ}
                label="Search employees"
                placeholder="Search by name, job title or email"
                size="lg"
                className="md:w-[300px] md:flex-none"
              />
              <FilterMenu
                variant="button"
                label="Department"
                allLabel="All"
                icon={Building2}
                options={departments}
                value={dept}
                onChange={setDept}
                emptyText="No departments on file yet"
              />
              <button
                type="button"
                aria-pressed={openOnly}
                onClick={() => setOpenOnly((v) => !v)}
                className={cn(
                  "inline-flex h-[38px] items-center gap-[7px] whitespace-nowrap rounded-[10px] border px-3 text-[13.5px] outline-none transition-colors duration-[120ms] focus-visible:shadow-[var(--ds-focus-ring)]",
                  openOnly
                    ? "border-[var(--ds-ink)] bg-[var(--ds-ink)] text-[var(--ds-on-accent)] hover:bg-[var(--ds-accent-hover)] active:bg-[var(--ds-accent-press)]"
                    : "border-[var(--ds-line)] bg-[var(--ds-surface)] text-[var(--ds-body)] hover:bg-[var(--ds-surface-2)] active:bg-[var(--ds-surface-3)]"
                )}
              >
                <Folder className={cn("size-[15px]", openOnly ? "text-[var(--ds-on-accent)]" : "text-[var(--ds-subtle)]")} />
                Has open matter
              </button>
              <span className="hidden flex-1 md:block" />
              <SortMenu variant="button" buttonLabel="Sort" options={SORTS} value={sort} onChange={setSort} />
            </div>

            <DirectorySyncStrip />

            {shown.length === 0 ? (
              filtersSet ? (
                <NoMatch onClear={clearFilters}>No employees match those filters.</NoMatch>
              ) : (
                <NoMatch>{tab === "leavers" ? "No leavers yet." : `No one is ${TABS.find((t) => t.id === tab)?.label.toLowerCase()} right now.`}</NoMatch>
              )
            ) : (
              <EmployeesTable rows={pageRows} selection={selection} sort={sort} onSort={setSort} menu={menu} />
            )}

            <BulkBar count={selectedRows.length} actions={bulkActions} onClear={() => setSelected(new Set())} />

            {shown.length > 0 && (
              <div className="mt-3.5 flex flex-wrap items-center justify-between gap-3 pt-1 text-[13px] text-[var(--ds-muted)]">
                <span aria-live="polite">
                  Showing {page * PAGE + 1} to {Math.min(shown.length, page * PAGE + PAGE)} of {shown.length}
                </span>
                <NumberPager page={page} pages={pages} onPage={setPage} />
              </div>
            )}
          </>
        )}
      </section>

      <EmployeeForm
        open={addOpen}
        onOpenChange={setAddOpen}
        title="Add employee"
        description="Create a new workspace record. You can fill in more details later."
        submitLabel="Create employee"
        onSubmit={(values) => {
          createEmployee(values);
          setAddOpen(false);
          toast.success(`${values.legalName} added`);
        }}
      />
      <EmployeeForm
        open={!!editing}
        onOpenChange={(v) => !v && setEditing(null)}
        initial={editing ? formValues(editing) : undefined}
        title="Edit employee"
        description="Update this person's workspace record. Changes apply across all letters and matters."
        submitLabel="Save changes"
        onSubmit={(values) => {
          if (editing) updateEmployee(editing.id, values);
          setEditing(null);
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
          toast.success(`${chosen.length} ${chosen.length === 1 ? "record" : "records"} created`);
        }}
      />
      <ImportCsvDialog
        open={csvOpen}
        onOpenChange={setCsvOpen}
        existingNames={rows.map((r) => r.employee.legalName)}
        onImport={(people) => {
          for (const p of people) createEmployee(p);
        }}
      />
      <DeleteEmployeeDialog
        employee={deleting}
        open={!!deleting}
        onOpenChange={(v) => !v && setDeleting(null)}
        onConfirm={() => {
          if (!deleting) return;
          deleteEmployee(deleting.id);
          toast.success(`${deleting.legalName} deleted`);
          setDeleting(null);
        }}
      />
      <NewLetterForPerson employee={letterFor} open={!!letterFor} onOpenChange={(v) => !v && setLetterFor(null)} />
    </div>
  );
}

function formValues(e: Employee): EmployeeFormValues {
  return {
    legalName: e.legalName,
    preferredName: e.preferredName,
    jobTitle: e.jobTitle,
    department: e.department,
    email: e.email,
    startDate: e.startDate,
    workerClass: e.workerClass,
    status: e.status,
  };
}

/* ─── Table ──────────────────────────────────────────────────────────── */

type Menu = Record<"open" | "edit" | "newLetter" | "archive" | "remove", (e: Employee) => void>;
type Sel = {
  selected: Set<string>;
  toggle: (id: string) => void;
  toggleAll: (on: boolean) => void;
  header: boolean | "mixed";
};

const INTERACTIVE = "a,button,[role=menuitem],[role=checkbox],[data-radix-popper-content-wrapper]";

function EmployeesTable({ rows, selection, sort, onSort, menu }: { rows: EmployeeRow[]; selection: Sel; sort: SortId; onSort: (s: SortId) => void; menu: Menu }) {
  const nav = useNavigate();
  const open = (e: MouseEvent, id: string) => {
    if ((e.target as HTMLElement).closest(INTERACTIVE)) return;
    nav(`/employees/${id}`);
  };
  const byName = sort === "name-asc" || sort === "name-desc";
  const th = "whitespace-nowrap border-b border-[var(--ds-line)] px-3 pb-2.5 text-left text-[12.5px] font-medium text-[var(--ds-subtle)]";
  return (
    <div className="min-w-0 animate-in fade-in-0 duration-200">
      <table aria-label="Employees" className="hidden w-full table-fixed border-separate border-spacing-0 lg:table">
        <colgroup>
          {COLS.map((w, i) => (
            <col key={i} style={{ width: w }} />
          ))}
        </colgroup>
        <thead>
          <tr>
            <th scope="col" className={cn(th, "pl-3")}>
              <TickBox checked={selection.header} onChange={selection.toggleAll} label="Select everyone on this page" />
            </th>
            <th scope="col" className={th} aria-sort={byName ? (sort === "name-asc" ? "ascending" : "descending") : "none"}>
              <button
                type="button"
                onClick={() => onSort(sort === "name-asc" ? "name-desc" : "name-asc")}
                className="-mx-1 inline-flex items-center gap-1 rounded-[6px] px-1 font-medium text-[var(--ds-ink)] outline-none hover:bg-[var(--ds-surface-2)] focus-visible:shadow-[var(--ds-focus-ring)]"
              >
                Name
                {!byName ? (
                  <ArrowUpDown aria-hidden className="size-3 text-[var(--ds-subtle)]" />
                ) : sort === "name-asc" ? (
                  <ArrowDown aria-hidden className="size-3 text-[var(--ds-muted)]" />
                ) : (
                  <ArrowUp aria-hidden className="size-3 text-[var(--ds-muted)]" />
                )}
                <span className="sr-only">{byName ? (sort === "name-asc" ? ", A to Z. Sort Z to A" : ", Z to A. Sort A to Z") : ". Sort by name"}</span>
              </button>
            </th>
            {["Job title", "Department", "Start date", "Open matters", "Letters", "Status"].map((h) => (
              <th key={h} scope="col" className={th}>
                {h}
              </th>
            ))}
            <th scope="col" className={th}>
              <span className="sr-only">Actions</span>
            </th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => {
            const e = r.employee;
            const on = selection.selected.has(e.id);
            const td = cn(
              "whitespace-nowrap border-b border-[var(--ds-line-2)] px-3 py-[11px] align-middle text-[13.5px] text-[var(--ds-body)] transition-colors duration-[120ms]",
              on ? "bg-[var(--ds-surface-2)]" : "group-hover/row:bg-[var(--ds-hover)]"
            );
            return (
              <tr key={e.id} data-employee-id={e.id} onClick={(ev) => open(ev, e.id)} className="group/row cursor-pointer">
                <td className={td}>
                  <TickBox checked={on} onChange={() => selection.toggle(e.id)} label={`Select ${e.legalName}`} />
                </td>
                <td className={td}>
                  <div className="flex min-w-0 items-center gap-3">
                    <Initials name={e.legalName} seed={e.id} size={32} />
                    <div className="min-w-0">
                      <Link
                        to={`/employees/${e.id}`}
                        className="block truncate rounded-[4px] text-[14px] font-medium leading-[1.3] text-[var(--ds-ink)] outline-none focus-visible:shadow-[var(--ds-focus-ring)]"
                      >
                        {displayName(e)}
                      </Link>
                      {e.email && <div className="truncate text-[12.5px] leading-[1.3] text-[var(--ds-muted)]">{e.email}</div>}
                    </div>
                  </div>
                </td>
                <td className={td}>
                  <Cell value={e.jobTitle} />
                </td>
                <td className={td}>
                  <Cell value={e.department} />
                </td>
                <td className={td}>
                  <Cell value={startDateLabel(e.startDate)} />
                </td>
                <td className={td}>
                  <Count n={r.openMatters.length} icon={Folder} label="open matters" />
                </td>
                <td className={td}>
                  <Count n={r.letters.length} icon={FileText} label="letters" />
                </td>
                <td className={td}>
                  <EmployeeStatusPill status={e.status} />
                </td>
                <td className={cn(td, "px-1 text-right")}>
                  <EmployeeRowMenu employee={e} menu={menu} />
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>

      <ul aria-label="Employees" className="m-0 list-none border-t border-[var(--ds-line-2)] p-0 lg:hidden">
        {rows.map((r) => {
          const e = r.employee;
          const sub = [e.jobTitle, e.department].filter(Boolean).join(" · ");
          return (
            <li
              key={e.id}
              data-employee-id={e.id}
              onClick={(ev) => open(ev, e.id)}
              className="flex min-w-0 cursor-pointer items-start gap-3 border-b border-[var(--ds-line-2)] py-3 transition-colors duration-[120ms] hover:bg-[var(--ds-hover)]"
            >
              <Initials name={e.legalName} seed={e.id} size={36} />
              <div className="min-w-0 flex-1">
                <div className="flex min-w-0 items-center gap-2">
                  <Link to={`/employees/${e.id}`} className="min-w-0 truncate rounded-[4px] text-[14.5px] font-medium text-[var(--ds-ink)] outline-none focus-visible:shadow-[var(--ds-focus-ring)]">
                    {displayName(e)}
                  </Link>
                  <EmployeeStatusPill status={e.status} />
                </div>
                <div className="truncate text-[13px] text-[var(--ds-muted)]">{sub || "No role on file"}</div>
                <div className="mt-1 flex items-center gap-4 text-[12.5px] text-[var(--ds-muted)]">
                  <Count n={r.openMatters.length} icon={Folder} label={r.openMatters.length === 1 ? "open matter" : "open matters"} showLabel />
                  <Count n={r.letters.length} icon={FileText} label={r.letters.length === 1 ? "letter" : "letters"} showLabel />
                </div>
              </div>
              <EmployeeRowMenu employee={e} menu={menu} />
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function Cell({ value }: { value?: string }) {
  return value ? <span className="block truncate">{value}</span> : <span className="text-[var(--ds-faint)]">-</span>;
}

function Count({ n, icon: Icon, label, showLabel }: { n: number; icon: typeof Folder; label: string; showLabel?: boolean }) {
  if (n === 0)
    return (
      <span className="text-[var(--ds-faint)]">
        0{showLabel ? ` ${label}` : <span className="sr-only"> {label}</span>}
      </span>
    );
  return (
    <span className="inline-flex items-center gap-1.5 text-[var(--ds-ink)]">
      <Icon aria-hidden className="size-[14px] text-[var(--ds-muted)]" />
      {n}
      {showLabel ? <span className="text-[var(--ds-muted)]">{label}</span> : <span className="sr-only">{label}</span>}
    </span>
  );
}

function EmployeeRowMenu({ employee: e, menu }: { employee: Employee; menu: Menu }) {
  return (
    <span className="contents" onClick={(ev) => ev.stopPropagation()}>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button
            type="button"
            aria-label={`Actions for ${e.legalName}`}
            className="grid size-8 shrink-0 place-items-center rounded-[8px] text-[var(--ds-subtle)] outline-none transition-colors duration-[120ms] hover:bg-[var(--ds-surface-3)] hover:text-[var(--ds-ink)] focus-visible:shadow-[var(--ds-focus-ring)] data-[state=open]:bg-[var(--ds-surface-3)]"
          >
            <MoreHorizontal className="size-4" />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className={cn("w-56", MENU_MOTION)}>
          <DropdownMenuItem onSelect={() => menu.open(e)}>
            <ArrowUpRight />
            Open
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={() => menu.edit(e)}>
            <Pencil />
            Edit
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={() => menu.newLetter(e)}>
            <Plus />
            New letter
          </DropdownMenuItem>
          {e.status !== "left" && (
            <DropdownMenuItem onSelect={() => menu.archive(e)}>
              <Archive />
              Archive (mark as left)
            </DropdownMenuItem>
          )}
          <DropdownMenuSeparator />
          <DropdownMenuItem variant="destructive" onSelect={() => menu.remove(e)}>
            <Trash2 />
            Delete
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </span>
  );
}
