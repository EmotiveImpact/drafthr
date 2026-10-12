import { useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { motion } from "framer-motion";
import {
  AlertTriangle,
  Archive,
  ArrowLeft,
  Edit3,
  MoreHorizontal,
  Trash2,
  UserRound,
} from "lucide-react";
import { useDraftStore } from "@/lib/store";
import { matchEmployeeForDraft } from "@/lib/employees";
import { getLetterMeta } from "@/lib/letters/catalog";
import { briefTitleFor } from "@/lib/letters/display";
import { formatDateOnly, toDateOnly } from "@/lib/date-only";
import { avatarColor } from "@/components/ds";
import { PillTabs } from "@/components/ds/PageHeader";
import { MATTER_TINT, PaperThumb, StatusPill, type PillTone } from "@/components/reports/parts";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
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
  const deleteEmployee = useDraftStore((s) => s.deleteEmployee);

  const [editOpen, setEditOpen] = useState(false);
  const [tab, setTab] = useState<"overview" | "matters" | "letters" | "notes">("overview");
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

  // Real, data-derived prompts (NOT AI) drawn from this employee's actual
  // letter history + open matters. Empty when there's no signal — we render
  // nothing rather than inventing insight.
  const reviewSignals = useMemo(() => {
    const out: string[] = [];
    const has = (re: RegExp) => matchingDrafts.filter((d) => re.test(d.letterType)).length;
    const warnings = has(/warning/);
    const grievances = has(/grievance/);
    const performance = has(/pip|performance|probation/);
    if (warnings >= 2) {
      out.push(`${warnings} warning letters on file: consider a formal review`);
    } else if (warnings === 1) {
      out.push("A warning letter is on file: track any follow-up");
    }
    if (grievances >= 1) {
      out.push(
        `${grievances} grievance${grievances > 1 ? "s" : ""} recorded: track to resolution`,
      );
    }
    if (performance >= 1) {
      out.push("Performance or PIP letter on file: check the review date");
    }
    if (activeMatters.length >= 2) {
      out.push(`${activeMatters.length} active matters open for this person`);
    }
    return out;
  }, [matchingDrafts, activeMatters]);

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
          className="inline-flex items-center gap-1.5 h-8 px-3.5 rounded-[var(--ds-r-s)] bg-[var(--ds-accent)] text-[var(--ds-on-accent)] text-[12.5px] font-medium hover:bg-[var(--ds-accent-hover)] transition"
        >
          <ArrowLeft className="size-3.5" />
          Back to employees
        </Link>
      </div>
    );
  }

  const headerSubtitle = [employee.jobTitle, employee.department]
    .filter(Boolean)
    .join(", ");

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

  const tileColor = avatarColor(employee.id);

  return (
    <motion.div
      initial={{ opacity: 0, y: 4 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25 }}
      className="w-full min-w-0 max-w-[1180px] px-4 py-6 sm:px-8 sm:py-10 lg:px-11"
    >
      {/* 2A header with an initial tile, matching the matter page */}
      <header className="mb-8 min-w-0">
        <nav aria-label="Breadcrumb" className="mb-2.5 flex items-center gap-1.5 text-[12.5px] text-[var(--ds-muted)]">
          <Link to="/employees" className="inline-flex items-center gap-1 hover:text-[var(--ds-ink)]">
            <ArrowLeft className="size-3" aria-hidden />
            Employees
          </Link>
        </nav>
        <div className="flex flex-wrap items-start justify-between gap-x-6 gap-y-4">
          <div className="flex min-w-0 flex-1 basis-[320px] items-center gap-4">
            <span
              className="ds-title grid size-12 shrink-0 place-items-center rounded-[var(--ds-r-m)] text-[26px] leading-none"
              style={{ background: tileColor }}
              aria-hidden
            >
              {employee.legalName.trim().charAt(0).toUpperCase()}
            </span>
            <div className="min-w-0">
              <h1 className="ds-title m-0 text-[clamp(28px,4vw,40px)] leading-[1.1] [overflow-wrap:anywhere]">
                {employee.legalName}
                {employee.preferredName && (
                  <span className="ml-2 font-sans text-[15px] text-[var(--ds-muted)]">
                    ({employee.preferredName})
                  </span>
                )}
              </h1>
              {headerSubtitle && (
                <p className="m-0 mt-1 text-[14px] text-[var(--ds-muted)]">{headerSubtitle}</p>
              )}
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-2">
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
                    const ok = window.confirm(
                      `Delete ${employee.legalName}? This removes the employee record permanently. ` +
                        `Their letters stay, but they'll be unlinked from any matters. ` +
                        `To keep the record, use Archive instead.`,
                    );
                    if (!ok) return;
                    deleteEmployee(employee.id);
                    nav("/employees", { replace: true });
                  }}
                  className="text-[var(--ds-red-fg)] focus:text-[var(--ds-red-fg)]"
                >
                  <Trash2 className="size-3.5" />
                  Delete
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>
        <div className="mt-4 flex flex-wrap items-center gap-2 text-[12.5px] text-[var(--ds-muted)]">
          <StatusBadge status={employee.status} />
          {employee.startDate && (
            <span>
              Started {formatDateOnly(employee.startDate, { dateStyle: "medium" }, "en-GB")}
            </span>
          )}
          {employee.workerClass && <span className="capitalize">{employee.workerClass}</span>}
          {employee.managerName && <span>Reports to {employee.managerName}</span>}
          {employee.email && (
            <a
              href={`mailto:${employee.email}`}
              className="text-[var(--ds-ink)] underline-offset-2 hover:underline"
            >
              {employee.email}
            </a>
          )}
        </div>
        <PillTabs
          tabs={[
            { id: "overview", label: "Overview" },
            { id: "matters", label: "Matters", count: activeMatters.length },
            { id: "letters", label: "Letters", count: matchingDrafts.length },
            { id: "notes", label: "Notes" },
          ]}
          activeTab={tab}
          onTabChange={(id) => setTab(id as typeof tab)}
        />
      </header>

      {tab === "overview" && (
        <div className="grid min-w-0 gap-8 lg:grid-cols-[minmax(0,1fr)_320px]">
          <div className="min-w-0">
            {!dismissedSuggestions && reviewSignals.length > 0 && (
              <ReviewPanel
                signals={reviewSignals}
                onDismiss={() => setDismissedSuggestions(true)}
              />
            )}
            <ActiveMattersPanel matters={activeMatters} onOpen={(id) => nav(`/matters/${id}`)} />
            <LetterHistoryPanel drafts={matchingDrafts.slice(0, 3)} totalCount={matchingDrafts.length} limit={3} />
          </div>
          <aside className="min-w-0">
            <DetailsCard employee={employee} />
          </aside>
        </div>
      )}

      {tab === "matters" && (
        <ActiveMattersPanel matters={activeMatters} onOpen={(id) => nav(`/matters/${id}`)} />
      )}

      {tab === "letters" && (
        <LetterHistoryPanel drafts={matchingDrafts.slice(0, 5)} totalCount={matchingDrafts.length} />
      )}

      {tab === "notes" && (
        <div className="max-w-[720px] rounded-[var(--ds-r-l)] border border-[var(--ds-line)] bg-[var(--ds-surface)] p-5">
          <p className="m-0 mb-3 text-[12.5px] text-[var(--ds-muted)]">
            Private to you. Never sent to AI or included in exports.
          </p>
          <Textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={6}
            placeholder="Anything worth remembering about this person: context, conversations, decisions."
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
      )}

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
      <div className="mb-8 rounded-[var(--ds-r-l)] bg-[var(--ds-surface-2)] py-8 text-center">
        <p className="text-[13px] text-[var(--ds-muted)] m-0">
          No active matters for this person yet.
        </p>
      </div>
    );
  }

  return (
    <section className="mb-8">
      <SectionHeader title="Active matters" />
      <ul className="m-0 list-none p-0">
        {matters.map((m, i) => (
          <li key={m.id} className={cn("relative m-0", i > 0 && ROW_RULE)}>
            <button
              type="button"
              onClick={() => onOpen(m.id)}
              className="flex w-full items-center gap-3 rounded-[var(--ds-r-m)] px-3 py-3 text-left transition hover:bg-[var(--ds-surface-2)]"
            >
              <span
                className="grid size-9 shrink-0 place-items-center rounded-[var(--ds-r-s)] text-[13px] font-semibold"
                style={{ background: MATTER_TINT[m.color][0], color: MATTER_TINT[m.color][1] }}
                aria-hidden
              >
                {m.name.trim().charAt(0).toUpperCase()}
              </span>
              <div className="flex-1 min-w-0">
                <div className="truncate text-[14px] font-semibold text-[var(--ds-ink)]">
                  {m.name}
                </div>
                <div className="mt-0.5 text-[12.5px] text-[var(--ds-muted)]">
                  {m.deadlineISO
                    ? `${m.deadlineLabel ?? "Deadline"}: ${formatDateOnly(m.deadlineISO, { dateStyle: "medium" }, "en-GB")}`
                    : `Started ${formatDateOnly(toDateOnly(new Date(m.createdAt)), { dateStyle: "medium" }, "en-GB")}`}
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
  limit = 5,
}: {
  drafts: Draft[];
  totalCount: number;
  limit?: number;
}) {
  if (drafts.length === 0) {
    return (
      <div className="rounded-[var(--ds-r-l)] bg-[var(--ds-surface-2)] py-8 text-center">
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
            ? `Showing ${limit} of ${totalCount}`
            : undefined
        }
      />
      <ul className="m-0 list-none p-0">
        {drafts.map((d, i) => {
          const meta = getLetterMeta(d.letterType);
          return (
            <li key={d.id} className={cn("relative m-0", i > 0 && ROW_RULE)}>
              <Link
                to={`/editor/${d.id}`}
                className="flex items-center gap-3 rounded-[var(--ds-r-m)] px-3 py-3 transition hover:bg-[var(--ds-surface-2)]"
              >
                <PaperThumb seed={d.letterType} />
                <div className="ml-1 min-w-0 flex-1">
                  <div className="truncate text-[14px] font-semibold text-[var(--ds-ink)]">
                    {briefTitleFor(d)}
                  </div>
                  <div className="mt-0.5 text-[12.5px] text-[var(--ds-muted)]">
                    {meta.shortTitle}, updated {timeAgo(d.updatedAt)}
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

function ReviewPanel({
  signals,
  onDismiss,
}: {
  signals: string[];
  onDismiss: () => void;
}) {
  return (
    <section className="mb-8">
      <SectionHeader title="Things to review" />
      <div className="rounded-[var(--ds-r-l)] bg-[var(--ds-amber-bg)] p-4">
        <div className="flex items-start gap-3">
          <AlertTriangle className="size-4 text-[var(--ds-amber-fg)] mt-0.5 shrink-0" />
          <ul className="flex-1 m-0 p-0 list-none space-y-1.5">
            {signals.map((s, i) => (
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
            className="text-[12px] text-[var(--ds-amber-fg)] hover:text-[var(--ds-ink)] transition shrink-0"
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
    <div className="mb-2 flex items-baseline gap-3">
      <h2 className="m-0 text-[15px] font-semibold text-[var(--ds-ink)]">
        {title}
      </h2>
      {subtitle && (
        <span className="text-[12.5px] text-[var(--ds-muted)]">{subtitle}</span>
      )}
    </div>
  );
}

function StatusBadge({ status }: { status: EmploymentStatus }) {
  const config: Record<EmploymentStatus, { label: string; tone: PillTone }> = {
    active: { label: "Active", tone: "ok" },
    notice: { label: "Notice", tone: "warn" },
    "on-leave": { label: "On leave", tone: "info" },
    left: { label: "Left", tone: "neutral" },
  };
  const { label, tone } = config[status];
  return <StatusPill tone={tone} size="sm">{label}</StatusPill>;
}

function RiskBadge({ band }: { band: NonNullable<Matter["riskBand"]> }) {
  const config: Record<NonNullable<Matter["riskBand"]>, { label: string; tone: PillTone }> = {
    low: { label: "Low risk", tone: "ok" },
    moderate: { label: "Moderate risk", tone: "warn" },
    high: { label: "High risk", tone: "warn" },
    critical: { label: "Critical risk", tone: "danger" },
  };
  const { label, tone } = config[band];
  return <StatusPill tone={tone} size="sm">{label}</StatusPill>;
}

function DraftStatusPill({ draft }: { draft: Draft }) {
  const hasExport = (draft.exports?.length ?? 0) > 0;
  return hasExport ? (
    <StatusPill tone="ok" size="sm">Sent</StatusPill>
  ) : (
    <StatusPill tone="neutral" size="sm">Draft</StatusPill>
  );
}

function DetailsCard({ employee }: { employee: Employee }) {
  const rows: [string, string | undefined][] = [
    ["Job title", employee.jobTitle],
    ["Department", employee.department],
    ["Manager", employee.managerName],
    ["Email", employee.email],
    ["Start date", employee.startDate ? formatDateOnly(employee.startDate, { dateStyle: "medium" }, "en-GB") : undefined],
    ["Worker type", employee.workerClass],
  ];
  return (
    <section className="rounded-[var(--ds-r-l)] border border-[var(--ds-line)] bg-[var(--ds-surface)] p-5">
      <h2 className="m-0 mb-3 text-[15px] font-semibold text-[var(--ds-ink)]">Details</h2>
      <dl className="m-0 space-y-2.5 text-[13px]">
        {rows.map(([k, v]) => (
          <div key={k} className="flex items-baseline justify-between gap-3">
            <dt className="shrink-0 text-[var(--ds-muted)]">{k}</dt>
            <dd className={cn("m-0 min-w-0 truncate text-right", v ? "text-[var(--ds-ink)]" : "text-[var(--ds-faint)]")}>
              {v || "Not set"}
            </dd>
          </div>
        ))}
      </dl>
    </section>
  );
}

const ROW_RULE =
  "before:absolute before:inset-x-3 before:top-0 before:border-t before:border-[var(--ds-line)] before:content-['']";


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
