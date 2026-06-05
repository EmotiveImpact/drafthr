import { useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { motion } from "framer-motion";
import {
  AlertTriangle,
  Archive,
  ArrowLeft,
  Edit3,
  MoreHorizontal,
  Sparkles,
  Trash2,
  UserRound,
} from "lucide-react";
import { useDraftStore } from "@/lib/store";
import { matchEmployeeForDraft } from "@/lib/employees";
import { getLetterMeta } from "@/lib/letters/catalog";
import { briefTitleFor } from "@/lib/letters/display";
import { formatDateOnly, toDateOnly } from "@/lib/date-only";
import { Avatar } from "@/components/ds";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import type {
  Draft,
  Employee,
  EmploymentStatus,
  Matter,
} from "@/lib/letters/types";
import {
  EmployeeForm,
  type EmployeeFormValues,
} from "@/components/employees/EmployeeForm";

/**
 * /employees/:employeeId — single employee profile.
 *
 * Surfaces the workspace-level Employee record alongside derived
 * context: matters they participate in, the letters that mention them,
 * and a stubbed AI-suggestions strip (real ML lands in a future wave).
 */
/**
 * Route wrapper: keys the inner component on employeeId so React remounts it
 * (resetting all local state — notes, editOpen, dismissedSuggestions) when the
 * user navigates between two employee profiles via history. Without this, the
 * single reused instance kept employee A's `notes` while the save guard
 * compared against B — clicking Save wrote A's notes into B's record.
 */
export function EmployeeDetail() {
  const { employeeId } = useParams<{ employeeId: string }>();
  return <EmployeeDetailBody key={employeeId ?? "none"} />;
}

function EmployeeDetailBody() {
  const { employeeId } = useParams<{ employeeId: string }>();
  const nav = useNavigate();
  const employee = useDraftStore((s) =>
    employeeId ? s.employees[employeeId] : undefined
  );
  const drafts = useDraftStore((s) => s.drafts);
  const matters = useDraftStore((s) => s.matters);
  const updateEmployee = useDraftStore((s) => s.updateEmployee);
  const archiveEmployee = useDraftStore((s) => s.archiveEmployee);

  const [editOpen, setEditOpen] = useState(false);
  const [dismissedSuggestions, setDismissedSuggestions] = useState(false);
  const [notes, setNotes] = useState(employee?.notes ?? "");

  const allDrafts = useMemo(
    () => Object.values(drafts).filter((d) => !d.isTemplateSource),
    [drafts]
  );
  const allMatters = useMemo(() => Object.values(matters), [matters]);

  const matchingDrafts = useMemo(() => {
    if (!employee) return [] as Draft[];
    const empMap: Record<string, Employee> = { [employee.id]: employee };
    return allDrafts
      .filter((d) => matchEmployeeForDraft(d, empMap) === employee.id)
      .sort((a, b) => b.updatedAt - a.updatedAt);
  }, [employee, allDrafts]);

  const linkedMatters = useMemo(() => {
    if (!employee) return [] as Matter[];
    return allMatters.filter((m) => {
      // Prefer the explicit participants link, with a backwards-compat
      // fallback to legacy matters that only set parties.primaryName.
      if (m.participants?.some((p) => p.employeeId === employee.id)) return true;
      const primary = m.parties?.primaryName?.trim().toLowerCase();
      if (primary && primary === employee.legalName.trim().toLowerCase()) return true;
      return false;
    });
  }, [employee, allMatters]);

  const activeMatters = useMemo(
    () => linkedMatters.filter((m) => m.status === "active"),
    [linkedMatters]
  );

  if (!employee) {
    return (
      <div className="max-w-3xl px-4 py-12 sm:px-6 mx-auto text-center">
        <UserRound className="size-8 text-[var(--ds-muted)] mx-auto mb-3" />
        <h2 className="text-[16px] font-semibold text-[var(--ds-ink)] m-0">
          Employee not found
        </h2>
        <p className="text-[13px] text-[var(--ds-muted)] mt-1.5 mb-5">
          This record may have been deleted, or the URL is incorrect.
        </p>
        <Link
          to="/employees"
          className="inline-flex items-center gap-1.5 h-8 px-3.5 rounded-md bg-[var(--ds-ink)] text-white text-[12.5px] font-medium hover:opacity-90 transition"
        >
          <ArrowLeft className="size-3.5" />
          Back to employees
        </Link>
      </div>
    );
  }

  const headerSubtitle = [employee.jobTitle, employee.department]
    .filter(Boolean)
    .join(" · ");

  const initialForm: EmployeeFormValues = {
    legalName: employee.legalName,
    preferredName: employee.preferredName,
    jobTitle: employee.jobTitle,
    department: employee.department,
    email: employee.email,
    startDate: employee.startDate,
    workerClass: employee.workerClass,
    status: employee.status,
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 4 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25 }}
      className="max-w-5xl px-4 py-6 sm:px-6 sm:py-8"
    >
      <div className="mb-4">
        <Link
          to="/employees"
          className="inline-flex items-center gap-1.5 text-[12.5px] text-[var(--ds-muted)] hover:text-[var(--ds-ink)] transition"
        >
          <ArrowLeft className="size-3.5" />
          Employees
        </Link>
      </div>

      {/* Hero */}
      <header className="rounded-lg border border-[var(--ds-line)] bg-[var(--ds-surface)] p-6 mb-6 flex items-start gap-5">
        <div className="shrink-0">
          <Avatar
            name={employee.legalName}
            seed={employee.id}
            size="xl"
            className="size-16 text-[20px]"
          />
        </div>
        <div className="flex-1 min-w-0">
          <h1
            className="m-0 text-[24px] font-semibold leading-[1.15] text-[var(--ds-ink)] tracking-[-0.01em]"
            style={{ fontFamily: "var(--font-serif)" }}
          >
            {employee.legalName}
            {employee.preferredName && (
              <span className="ml-2 text-[15px] font-normal text-[var(--ds-muted)]">
                ({employee.preferredName})
              </span>
            )}
          </h1>
          {headerSubtitle && (
            <p className="mt-1 m-0 text-[13.5px] text-[var(--ds-body)]">
              {headerSubtitle}
            </p>
          )}
          <div className="mt-3 flex flex-wrap items-center gap-2 text-[12px] text-[var(--ds-muted)]">
            <StatusBadge status={employee.status} />
            {employee.startDate && (
              <span>
                Started {formatDateOnly(employee.startDate, { dateStyle: "medium" })}
              </span>
            )}
            {employee.workerClass && <span>· {employee.workerClass}</span>}
            {employee.managerName && <span>· Reports to {employee.managerName}</span>}
            {employee.email && (
              <a
                href={`mailto:${employee.email}`}
                className="text-[var(--ds-ink)] underline-offset-2 hover:underline"
              >
                {employee.email}
              </a>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <Button size="sm" variant="outline" onClick={() => setEditOpen(true)}>
            <Edit3 className="size-3.5" />
            Edit
          </Button>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button size="sm" variant="outline" aria-label="More actions">
                <MoreHorizontal className="size-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem
                onClick={() => {
                  archiveEmployee(employee.id);
                }}
              >
                <Archive className="size-3.5" />
                Archive (mark as left)
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                onClick={() => {
                  // eslint-disable-next-line no-alert
                  alert("Not yet supported — archive instead.");
                }}
              >
                <Trash2 className="size-3.5" />
                Delete
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </header>

      {/* Tabs — Active matters / Letter history / Notes */}
      <Tabs defaultValue="matters">
        <TabsList variant="line" className="mb-4">
          <TabsTrigger value="matters">
            Active matters{activeMatters.length > 0 && ` (${activeMatters.length})`}
          </TabsTrigger>
          <TabsTrigger value="letters">
            Letter history{matchingDrafts.length > 0 && ` (${matchingDrafts.length})`}
          </TabsTrigger>
          <TabsTrigger value="notes">Notes</TabsTrigger>
        </TabsList>

        <TabsContent value="matters">
          <ActiveMattersPanel matters={activeMatters} onOpen={(id) => nav(`/matters/${id}`)} />
          {!dismissedSuggestions && (
            <AISuggestionsPanel
              employee={employee}
              onDismiss={() => setDismissedSuggestions(true)}
            />
          )}
        </TabsContent>

        <TabsContent value="letters">
          <LetterHistoryPanel drafts={matchingDrafts.slice(0, 5)} totalCount={matchingDrafts.length} />
        </TabsContent>

        <TabsContent value="notes">
          <div className="rounded-lg border border-[var(--ds-line)] bg-[var(--ds-surface)] p-4">
            <p className="text-[12px] text-[var(--ds-muted)] m-0 mb-2">
              Private to you. Never sent to AI or included in exports.
            </p>
            <Textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={6}
              placeholder="Anything worth remembering about this person — context, conversations, decisions."
            />
            <div className="mt-3 flex justify-end">
              <Button
                size="sm"
                onClick={() => updateEmployee(employee.id, { notes: notes.trim() || undefined })}
                disabled={notes === (employee.notes ?? "")}
              >
                Save notes
              </Button>
            </div>
          </div>
        </TabsContent>
      </Tabs>

      <EmployeeForm
        open={editOpen}
        onOpenChange={setEditOpen}
        initial={initialForm}
        title="Edit employee"
        description="Update this person's workspace record. Changes apply across all letters and matters."
        submitLabel="Save changes"
        onSubmit={(values) => {
          updateEmployee(employee.id, values);
          setEditOpen(false);
        }}
      />
    </motion.div>
  );
}

/* ============================================================================
 * Sub-components
 * ==========================================================================*/

function ActiveMattersPanel({
  matters,
  onOpen,
}: {
  matters: Matter[];
  onOpen: (id: string) => void;
}) {
  if (matters.length === 0) {
    return (
      <div className="rounded-md border border-dashed border-[var(--ds-line)] bg-[var(--ds-surface-2)] py-8 text-center mb-4">
        <p className="text-[13px] text-[var(--ds-muted)] m-0">
          No active matters for this person yet.
        </p>
      </div>
    );
  }

  return (
    <section className="mb-4">
      <SectionHeader title="Active matters" />
      <ul className="rounded-lg border border-[var(--ds-line)] bg-[var(--ds-surface)] divide-y divide-[var(--ds-line)] m-0 p-0 list-none">
        {matters.map((m) => (
          <li key={m.id} className="m-0">
            <button
              type="button"
              onClick={() => onOpen(m.id)}
              className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-[var(--ds-surface-2)] transition"
            >
              <div className="flex-1 min-w-0">
                <div className="font-medium text-[14px] text-[var(--ds-ink)] truncate">
                  {m.name}
                </div>
                <div className="text-[12px] text-[var(--ds-muted)] mt-0.5">
                  {m.deadlineISO
                    ? `${m.deadlineLabel ?? "Deadline"}: ${formatDateOnly(m.deadlineISO, { dateStyle: "medium" })}`
                    : `Started ${formatDateOnly(toDateOnly(new Date(m.createdAt)), { dateStyle: "medium" })}`}
                </div>
              </div>
              {m.riskBand && <RiskBadge band={m.riskBand} />}
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}

function LetterHistoryPanel({
  drafts,
  totalCount,
}: {
  drafts: Draft[];
  totalCount: number;
}) {
  if (drafts.length === 0) {
    return (
      <div className="rounded-md border border-dashed border-[var(--ds-line)] bg-[var(--ds-surface-2)] py-8 text-center">
        <p className="text-[13px] text-[var(--ds-muted)] m-0">
          No letters reference this person yet.
        </p>
      </div>
    );
  }

  return (
    <section>
      <SectionHeader
        title="Letter history"
        subtitle={
          totalCount > drafts.length
            ? `Showing 5 of ${totalCount}`
            : undefined
        }
      />
      <ul className="rounded-lg border border-[var(--ds-line)] bg-[var(--ds-surface)] divide-y divide-[var(--ds-line)] m-0 p-0 list-none">
        {drafts.map((d) => {
          const meta = getLetterMeta(d.letterType);
          return (
            <li key={d.id} className="m-0">
              <Link
                to={`/editor/${d.id}`}
                className="flex items-center gap-3 px-4 py-3 hover:bg-[var(--ds-surface-2)] transition"
              >
                <div className="flex-1 min-w-0">
                  <div className="font-medium text-[13.5px] text-[var(--ds-ink)] truncate">
                    {briefTitleFor(d)}
                  </div>
                  <div className="text-[11.5px] text-[var(--ds-muted)] mt-0.5">
                    {meta.shortTitle} · updated {timeAgo(d.updatedAt)}
                  </div>
                </div>
                <DraftStatusPill draft={d} />
              </Link>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

function AISuggestionsPanel({
  employee,
  onDismiss,
}: {
  employee: Employee;
  onDismiss: () => void;
}) {
  // STUB — hardcoded demo suggestions. Real LLM-derived insights land
  // in a future wave once the directory has signal to learn from.
  const suggestions = [
    "3 sickness episodes in 6 months — open absence matter?",
    "2 grievances in 12 months — consider escalation review",
  ];
  // Touch the param so the lint rule is happy + we have a hook for
  // future personalization without changing the call sites.
  void employee;

  return (
    <section className="mt-2">
      <SectionHeader title="AI suggestions" />
      <div className="rounded-lg border border-[var(--ds-amber-fg)]/30 bg-[var(--ds-amber-bg)] p-4">
        <div className="flex items-start gap-3">
          <Sparkles className="size-4 text-[var(--ds-amber-fg)] mt-0.5 shrink-0" />
          <ul className="flex-1 m-0 p-0 list-none space-y-1.5">
            {suggestions.map((s, i) => (
              <li
                key={i}
                className="text-[13px] text-[var(--ds-ink)] leading-snug"
              >
                {s}
              </li>
            ))}
          </ul>
          <button
            type="button"
            onClick={onDismiss}
            className="text-[11.5px] text-[var(--ds-muted)] hover:text-[var(--ds-ink)] transition shrink-0"
          >
            Dismiss
          </button>
        </div>
      </div>
    </section>
  );
}

function SectionHeader({ title, subtitle }: { title: string; subtitle?: string }) {
  return (
    <div className="flex items-baseline gap-3 pb-2 border-b border-[var(--ds-line)] mb-3">
      <h2 className="text-[11px] font-semibold uppercase tracking-[0.08em] text-[var(--ds-muted)] m-0">
        {title}
      </h2>
      {subtitle && (
        <span className="text-[11px] text-[var(--ds-muted)]">{subtitle}</span>
      )}
    </div>
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
        "inline-flex items-center text-[10.5px] px-2 py-[1.5px] rounded-full font-medium",
        cls
      )}
    >
      {label}
    </span>
  );
}

function RiskBadge({ band }: { band: NonNullable<Matter["riskBand"]> }) {
  const config: Record<NonNullable<Matter["riskBand"]>, { label: string; cls: string }> = {
    low: { label: "Low", cls: "bg-[var(--ds-green-bg)] text-[var(--ds-green-fg)]" },
    moderate: { label: "Moderate", cls: "bg-[var(--ds-amber-bg)] text-[var(--ds-amber-fg)]" },
    high: { label: "High", cls: "bg-[var(--ds-amber-bg)] text-[var(--ds-amber-fg)]" },
    critical: { label: "Critical", cls: "bg-[var(--ds-red-bg)] text-[var(--ds-red-fg)]" },
  };
  const { label, cls } = config[band];
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 text-[10.5px] px-2 py-[1.5px] rounded-full font-medium shrink-0",
        cls
      )}
    >
      <AlertTriangle className="size-3" />
      {label}
    </span>
  );
}

function DraftStatusPill({ draft }: { draft: Draft }) {
  const hasExport = (draft.exports?.length ?? 0) > 0;
  const label = hasExport ? "Sent" : "Draft";
  const cls = hasExport
    ? "bg-[var(--ds-green-bg)] text-[var(--ds-green-fg)]"
    : "bg-[var(--ds-line-2)] text-[var(--ds-muted)]";
  return (
    <span
      className={cn(
        "inline-flex items-center text-[10px] px-2 py-[1px] rounded-full font-medium shrink-0",
        cls
      )}
    >
      {label}
    </span>
  );
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
