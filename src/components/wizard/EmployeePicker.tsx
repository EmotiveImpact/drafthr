import { useMemo, useState } from "react";
import { Check, ChevronDown, Search, UserRound, X } from "lucide-react";
import { useDraftStore } from "@/lib/store";
import type { Employee } from "@/lib/letters/types";
import { Avatar } from "@/components/ds/Avatar";
import { cn } from "@/lib/utils";

/**
 * "Pick from your employees" affordance — shown on the HR-mode wizard's
 * employee step when the directory has any records. Selecting a row
 * populates the wizard answers with the canonical employee fields plus
 * `linkedEmployeeId` so the editor can later resolve a profile chip.
 *
 * Drawn as 13B-style rows with avatars inside a soft filled card.
 */
export function EmployeePicker({
  answers,
  onPick,
  onClear,
}: {
  answers: Record<string, unknown>;
  onPick: (patch: Record<string, unknown>, employee: Employee) => void;
  onClear: () => void;
}) {
  const employees = useDraftStore((s) => s.employees);
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");

  const list = useMemo(
    () =>
      Object.values(employees).sort((a, b) => {
        // Active first, then by most-recently-updated.
        if (a.status === "active" && b.status !== "active") return -1;
        if (b.status === "active" && a.status !== "active") return 1;
        return b.updatedAt - a.updatedAt;
      }),
    [employees],
  );
  if (list.length === 0) return null;

  const linkedId = answers.linkedEmployeeId as string | undefined;
  const linked = linkedId ? employees[linkedId] : undefined;

  const term = q.trim().toLowerCase();
  const shown = term
    ? list.filter((e) =>
        [e.legalName, e.preferredName, e.jobTitle, e.department, e.email]
          .filter(Boolean)
          .some((v) => String(v).toLowerCase().includes(term)),
      )
    : list;

  const handlePick = (emp: Employee) => {
    onPick(
      {
        linkedEmployeeId: emp.id,
        employeeLegalName: emp.legalName,
        employeePreferredName: emp.preferredName,
        employeeJobTitle: emp.jobTitle,
        employeeDepartment: emp.department,
        employeeEmail: emp.email,
        employeeStartDate: emp.startDate,
        workerClass: emp.workerClass ?? answers.workerClass,
      },
      emp
    );
    setOpen(false);
    setQ("");
  };

  return (
    <div className="rounded-[var(--ds-r-m)] bg-[var(--ds-surface-2)] p-1.5">
      {linked ? (
        <div className="flex min-w-0 items-center gap-3 rounded-[var(--ds-r-s)] bg-[var(--ds-surface)] px-3 py-2.5 shadow-[var(--ds-shadow-s)] ring-1 ring-[var(--ds-line)]">
          <Avatar name={linked.legalName} seed={linked.id} size="xl" />
          <div className="min-w-0 flex-1">
            <div className="truncate text-[13.5px] font-medium text-[var(--ds-ink)]">
              {linked.legalName}
            </div>
            <div className="truncate text-[12.5px] text-[var(--ds-muted)]">
              From your directory
              {linked.jobTitle ? `, ${linked.jobTitle}` : ""}
            </div>
          </div>
          <button
            type="button"
            onClick={() => setOpen((o) => !o)}
            aria-expanded={open}
            className="shrink-0 rounded-[var(--ds-r-s)] px-2 py-1 text-[12.5px] font-medium text-[var(--ds-ink)] hover:bg-[var(--ds-surface-2)]"
          >
            Change
          </button>
          <button
            type="button"
            onClick={onClear}
            aria-label="Clear linked employee"
            className="shrink-0 rounded-[var(--ds-r-s)] p-1 text-[var(--ds-muted)] hover:bg-[var(--ds-surface-2)] hover:text-[var(--ds-ink)]"
          >
            <X className="size-3.5" />
          </button>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          aria-expanded={open}
          className="flex w-full items-center gap-2.5 rounded-[var(--ds-r-s)] px-2.5 py-2 text-left text-[13px] font-medium text-[var(--ds-ink)] hover:bg-[var(--ds-surface-3)]"
        >
          <UserRound className="size-4 text-[var(--ds-muted)]" />
          Pick from your employees ({list.length})
          <ChevronDown
            className={cn("ml-auto size-4 text-[var(--ds-muted)] transition", open && "rotate-180")}
          />
        </button>
      )}

      {open && (
        <div className="mt-1.5 rounded-[var(--ds-r-s)] bg-[var(--ds-surface)] ring-1 ring-[var(--ds-line)]">
          {list.length > 6 && (
            <label className="flex items-center gap-2 border-b border-[var(--ds-line-2)] px-3 py-2">
              <Search className="size-3.5 text-[var(--ds-muted)]" />
              <input
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="Search employees"
                aria-label="Search employees"
                className="min-w-0 flex-1 bg-transparent text-[13px] text-[var(--ds-ink)] outline-none placeholder:text-[var(--ds-faint)]"
              />
            </label>
          )}
          <ul className="m-0 max-h-[288px] list-none overflow-y-auto p-1" role="listbox" aria-label="Employees">
            {shown.map((e) => {
              const on = linkedId === e.id;
              return (
                <li key={e.id} role="option" aria-selected={on}>
                  <button
                    type="button"
                    onClick={() => handlePick(e)}
                    className="flex w-full min-w-0 items-center gap-3 rounded-[var(--ds-r-s)] px-2.5 py-2 text-left hover:bg-[var(--ds-surface-2)]"
                  >
                    <Avatar name={e.legalName} seed={e.id} size="lg" />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[13px] font-medium text-[var(--ds-ink)]">
                        {e.legalName}
                      </span>
                      <span className="block truncate text-[12px] text-[var(--ds-muted)]">
                        {[e.jobTitle, e.department].filter(Boolean).join(", ") || e.email || "No role recorded"}
                      </span>
                    </span>
                    {e.status !== "active" && (
                      <span className="shrink-0 rounded-full bg-[var(--ds-chip)] px-2 py-0.5 text-[11.5px] capitalize text-[var(--ds-muted)]">
                        {e.status}
                      </span>
                    )}
                    {on && <Check className="size-3.5 shrink-0 text-[var(--ds-ink)]" />}
                  </button>
                </li>
              );
            })}
            {shown.length === 0 && (
              <li className="px-3 py-2 text-[12.5px] text-[var(--ds-muted)]">No one matches.</li>
            )}
          </ul>
        </div>
      )}
    </div>
  );
}
