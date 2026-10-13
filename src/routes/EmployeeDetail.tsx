import { useMemo, useState, type ReactNode } from "react";
import { Link, useNavigate, useParams, useSearchParams } from "react-router-dom";
import { format, isToday } from "date-fns";
import { toast } from "sonner";
import {
  AlertTriangle,
  Archive,
  ArrowLeft,
  ArrowUpRight,
  CalendarDays,
  FolderOpen,
  Info,
  MoreHorizontal,
  Pencil,
  Plus,
  RotateCcw,
  Trash2,
} from "lucide-react";
import { useDraftStore } from "@/lib/store";
import type { Draft, Employee } from "@/lib/letters/types";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Pill } from "@/components/ds";
import { StatusPill } from "@/components/journey/ui/StatusPill";
import { ListHeader } from "@/components/letters/ListHeader";
import { LettersTable } from "@/components/letters/LettersTable";
import { FlatPaper, Initials, MENU_MOTION, usePageTitle } from "@/components/letters/parts";
import { useLetterRows, type LetterRowData } from "@/components/letters/rows";
import { letterLabel, shortTypeLabel } from "@/components/letters/letterView";
import { EmployeeForm, type EmployeeFormValues } from "@/components/employees/EmployeeForm";
import { NewLetterForPerson } from "@/components/employees/NewLetterForPerson";
import { DeleteEmployeeDialog, EmployeeStatusPill } from "@/components/employees/parts";
import { buildEmployeeRow, firstName, inMatter, startDateLabel, tenureLabel, WORKER_LABEL } from "@/components/employees/model";
import { useMatterRows, type MatterRow } from "@/components/matter/rows";
import { CardLink, EvidenceList, evidenceRows, SectionCard, SectionHead } from "@/components/matter/cards";
import { RISK_LABEL, RISK_TONE, relativeDays, shortDay } from "@/components/matter/model";

/**
 * /employees/:employeeId: one person (employee mock). The record with the
 * letters about them, the matters they are part of, what needs doing this
 * week, their details and a timeline, plus Letters, Matters, Documents
 * (when their letters hold evidence) and private Notes.
 *
 * The route wrapper keys the page on the id so moving between two people
 * with back and forward remounts it, and one person's unsaved notes never
 * land in the other's record.
 */
export function EmployeeDetail() {
  const { employeeId } = useParams<{ employeeId: string }>();
  return <EmployeeDetailBody key={employeeId ?? "none"} />;
}

type TabId = "overview" | "letters" | "matters" | "documents" | "notes";

function EmployeeDetailBody() {
  const { employeeId } = useParams<{ employeeId: string }>();
  const employee = useDraftStore((s) => (employeeId ? s.employees[employeeId] : undefined));
  usePageTitle(employee ? employee.legalName : "Employee not found");
  if (!employee) {
    return (
      <div className="mx-auto max-w-[560px] px-6 py-20 text-center">
        <h1 className="ds-title m-0 text-[34px] leading-tight">Employee not found</h1>
        <p className="m-0 mt-2 text-[15px] text-[var(--ds-muted)]">This record may have been deleted, or the URL is incorrect.</p>
        <Button variant="outline" className="mt-5" asChild>
          <Link to="/employees">
            <ArrowLeft className="size-[17px]" />
            Back to employees
          </Link>
        </Button>
      </div>
    );
  }
  return <EmployeePage employee={employee} />;
}

function EmployeePage({ employee: e }: { employee: Employee }) {
  const nav = useNavigate();
  const drafts = useDraftStore((s) => s.drafts);
  const matters = useDraftStore((s) => s.matters);
  const events = useDraftStore((s) => s.events);
  const updateEmployee = useDraftStore((s) => s.updateEmployee);
  const archiveEmployee = useDraftStore((s) => s.archiveEmployee);
  const deleteEmployee = useDraftStore((s) => s.deleteEmployee);

  const [params, setParams] = useSearchParams();
  const [editOpen, setEditOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [letterOpen, setLetterOpen] = useState(false);
  const [timelineOpen, setTimelineOpen] = useState(false);
  const [dismissed, setDismissed] = useState(false);
  const [notes, setNotes] = useState(e.notes ?? "");

  const row = useMemo(
    () =>
      buildEmployeeRow(
        e,
        Object.values(drafts).filter((d) => !d.isTemplateSource && d.mode === "employer"),
        Object.values(matters).filter((m) => m.mode === "employer")
      ),
    [e, drafts, matters]
  );
  const letterRows = useLetterRows(row.letters);
  const letters = useMemo(() => [...letterRows].sort((a, b) => b.updatedAt - a.updatedAt), [letterRows]);
  const allMatterRows = useMatterRows(true);
  const matterRows = useMemo(
    () =>
      allMatterRows
        .filter((r) => inMatter(r.matter, e))
        .sort((a, b) => Number(b.matter.status === "active") - Number(a.matter.status === "active") || b.matter.updatedAt - a.matter.updatedAt),
    [allMatterRows, e]
  );
  const openMatterRows = matterRows.filter((r) => r.matter.status === "active");
  const evidence = useMemo(() => evidenceRows(row.letters), [row.letters]);

  const tabs: { id: TabId; label: string; count?: number }[] = [
    { id: "overview", label: "Overview" },
    { id: "letters", label: "Letters", count: letters.length },
    { id: "matters", label: "Matters", count: openMatterRows.length },
    ...(evidence.length > 0 ? [{ id: "documents" as TabId, label: "Documents", count: evidence.length }] : []),
    { id: "notes", label: "Notes" },
  ];
  const raw = params.get("tab") as TabId | null;
  const tab: TabId = raw && tabs.some((t) => t.id === raw) ? raw : "overview";
  const setTab = (id: string) => {
    const next = new URLSearchParams(params);
    if (id === "overview") next.delete("tab");
    else next.set("tab", id);
    setParams(next, { replace: true });
    window.scrollTo({ top: 0 });
  };

  const first = firstName(e);

  /* Things to review: letters that need you, matter events this week, record signals. */
  const review = useMemo(() => {
    const items: ReviewItem[] = [];
    for (const r of letters.filter((l) => l.journey.needsYou)) {
      const c = r.journey.counts;
      const reason =
        c.failingRequired > 0
          ? `${c.failingRequired} required ${c.failingRequired === 1 ? "check is" : "checks are"} failing`
          : c.pendingSuggestions > 0
            ? `${c.pendingSuggestions} suggested ${c.pendingSuggestions === 1 ? "edit" : "edits"} to look at`
            : r.journey.whereLabel;
      const title = r.journey.stage === "review" || r.journey.stage === "approve" ? `${r.label} needs your review` : `${r.label} needs finishing`;
      items.push({ id: `l-${r.id}`, tone: "amber", title, detail: reason, action: { label: "Open letter", to: `/editor/${r.id}` } });
    }
    const now = Date.now();
    const week = now + 7 * 86400000;
    const mine = new Set(openMatterRows.map((r) => r.matter.id));
    for (const ev of Object.values(events)) {
      if (!mine.has(ev.matterId)) continue;
      const t = new Date(ev.whenISO).getTime();
      if (Number.isNaN(t) || t < now - 3600000 || t > week) continue;
      const hasTime = ev.whenISO.includes("T");
      const when = format(new Date(ev.whenISO), hasTime ? "EEE d MMM, HH:mm" : "EEE d MMM");
      const matterName = matters[ev.matterId]?.name;
      items.push({
        id: `e-${ev.id}`,
        tone: "blue",
        title: `${ev.label} on ${when}`,
        detail: [ev.detail, matterName].filter(Boolean).join(". "),
        action: { label: "View matter", to: `/matters/${ev.matterId}` },
        ts: t,
      });
    }
    const has = (re: RegExp) => row.letters.filter((d) => re.test(d.letterType)).length;
    const warnings = has(/warning/);
    const grievances = has(/grievance/);
    const performance = has(/pip|performance|probation/);
    const signals: string[] = [];
    if (warnings >= 2) signals.push(`${warnings} warning letters on file: consider a formal review`);
    else if (warnings === 1) signals.push("A warning letter is on file: track any follow-up");
    if (grievances >= 1) signals.push(`${grievances} grievance${grievances > 1 ? "s" : ""} recorded: track to resolution`);
    if (performance >= 1) signals.push("Performance or PIP letter on file: check the review date");
    if (openMatterRows.length >= 2) signals.push(`${openMatterRows.length} active matters open for this person`);
    for (const s of signals) items.push({ id: `s-${s}`, tone: "grey", title: s });
    return items;
  }, [letters, events, openMatterRows, matters, row.letters]);

  const timeline = useMemo(() => buildTimeline(row.letters, matterRows), [row.letters, matterRows]);

  const initialForm: EmployeeFormValues = {
    legalName: e.legalName,
    preferredName: e.preferredName,
    jobTitle: e.jobTitle,
    department: e.department,
    email: e.email,
    startDate: e.startDate,
    workerClass: e.workerClass,
    status: e.status,
  };

  const archive = () => {
    const prev = { status: e.status, endDate: e.endDate };
    archiveEmployee(e.id);
    toast(`${e.legalName} marked as left`, { duration: 6000, action: { label: "Undo", onClick: () => updateEmployee(e.id, prev) } });
  };

  const lede = (
    <div className="flex min-w-0 flex-wrap items-center gap-y-1.5">
      {[e.jobTitle, e.department].filter(Boolean).map((t, i) => (
        <span key={i} className="flex items-center">
          {i > 0 && <Sep />}
          <span>{t}</span>
        </span>
      ))}
      <span className={cn("inline-flex flex-wrap items-center gap-1.5", (e.jobTitle || e.department) && "ml-3")}>
        <EmployeeStatusPill status={e.status} />
        {openMatterRows.length > 0 && (
          <Pill tone="amber">
            {openMatterRows.length} open {openMatterRows.length === 1 ? "matter" : "matters"}
          </Pill>
        )}
      </span>
    </div>
  );

  return (
    <div className="min-w-0">
      <ListHeader
        crumbs={[{ label: "Employees", href: "/employees" }, { label: e.legalName }]}
        title={e.legalName}
        titleExtra={e.preferredName && e.preferredName.trim() !== e.legalName.trim() ? `(${e.preferredName})` : undefined}
        mark={
          <span className="grid size-[52px] shrink-0 place-items-center rounded-[14px] border border-[var(--ds-line)]" aria-hidden>
            <Initials name={e.legalName} seed={e.id} size={50} className="!rounded-[13px] !text-[19px]" />
          </span>
        }
        lede={lede}
        actions={
          <>
            <Button variant="outline" onClick={() => setEditOpen(true)}>
              <Pencil className="size-[16px]" />
              Edit details
            </Button>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" size="icon" aria-label="More actions">
                  <MoreHorizontal className="size-[18px]" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" sideOffset={8} className={cn("w-[230px] max-w-[calc(100vw-32px)]", MENU_MOTION)}>
                {e.status !== "left" ? (
                  <DropdownMenuItem onSelect={archive}>
                    <Archive />
                    Archive (mark as left)
                  </DropdownMenuItem>
                ) : (
                  <DropdownMenuItem
                    onSelect={() => {
                      updateEmployee(e.id, { status: "active", endDate: undefined });
                      toast(`${e.legalName} is active again`);
                    }}
                  >
                    <RotateCcw />
                    Mark as active again
                  </DropdownMenuItem>
                )}
                <DropdownMenuSeparator />
                <DropdownMenuItem variant="destructive" onSelect={() => setDeleteOpen(true)}>
                  <Trash2 />
                  Delete
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
            <Button onClick={() => setLetterOpen(true)}>
              <Plus className="size-[17px]" />
              New letter
            </Button>
          </>
        }
        tabs={tabs}
        activeTab={tab}
        onTabChange={setTab}
        countStyle="chip"
        tabsLabel="Employee sections"
      />

      <div className="min-w-0 px-4 pb-14 pt-6 md:px-12 md:pt-[30px]">
        {tab === "overview" && (
          <div className="grid min-w-0 gap-9 lg:grid-cols-[minmax(0,1fr)_340px]">
            <div className="min-w-0 space-y-9">
              {!dismissed && review.length > 0 && (
                <section aria-label="Things to review">
                  <SectionHead
                    title="Things to review"
                    sub={`What needs doing for ${first} this week`}
                    action={<CardLink onClick={() => setDismissed(true)}>Dismiss</CardLink>}
                  />
                  <ReviewList items={review} />
                </section>
              )}

              <section aria-label="Letters">
                <SectionHead title="Letters" sub={`Every letter written about ${first}`} action={letters.length > 0 ? <CardLink onClick={() => setTab("letters")}>View all</CardLink> : undefined} />
                {letters.length === 0 ? <Quiet>No letters reference this person yet.</Quiet> : <LetterLines rows={letters.slice(0, 3)} />}
              </section>

              <section aria-label="Matters">
                <SectionHead title="Matters" sub={`Cases ${first} is part of`} action={matterRows.length > 0 ? <CardLink onClick={() => setTab("matters")}>View all</CardLink> : undefined} />
                {openMatterRows.length === 0 ? <Quiet>No active matters for this person yet.</Quiet> : <MatterCards rows={openMatterRows} />}
              </section>
            </div>

            <aside className="min-w-0 space-y-4">
              <SectionCard title="Details" action={<CardLink onClick={() => setEditOpen(true)}>Edit</CardLink>}>
                <DetailsList employee={e} />
              </SectionCard>
              <SectionCard title="Timeline" action={timeline.length > 5 ? <CardLink onClick={() => setTimelineOpen(true)}>View all</CardLink> : undefined}>
                {timeline.length === 0 ? <p className="m-0 mb-3.5 text-[13.5px] text-[var(--ds-muted)]">Nothing has happened for {first} yet.</p> : <TimelineList items={timeline.slice(0, 5)} />}
              </SectionCard>
            </aside>
          </div>
        )}

        {tab === "letters" &&
          (letters.length === 0 ? (
            <Quiet>No letters reference this person yet.</Quiet>
          ) : (
            <LettersTable rows={letters} columns={["matter", "where", "health", "updated", "owner"]} ariaLabel={`Letters about ${e.legalName}`} />
          ))}

        {tab === "matters" && (matterRows.length === 0 ? <Quiet>No matters for this person yet.</Quiet> : <MatterCards rows={matterRows} />)}

        {tab === "documents" && (
          <div className="max-w-[860px]">
            <SectionCard title="Documents">
              <EvidenceList rows={evidence} detailed />
            </SectionCard>
          </div>
        )}

        {tab === "notes" && (
          <div className="max-w-[720px] rounded-[16px] border border-[var(--ds-line)] bg-[var(--ds-surface)] p-5">
            <p className="m-0 mb-3 text-[13px] text-[var(--ds-muted)]">Private to you. Never sent to AI or included in exports.</p>
            <Textarea
              value={notes}
              onChange={(ev) => setNotes(ev.target.value)}
              rows={7}
              aria-label="Notes"
              placeholder="Anything worth remembering about this person: context, conversations, decisions."
            />
            <div className="mt-3 flex justify-end">
              <Button
                onClick={() => {
                  updateEmployee(e.id, { notes: notes.trim() || undefined });
                  toast("Notes saved");
                }}
                disabled={notes === (e.notes ?? "")}
              >
                Save notes
              </Button>
            </div>
          </div>
        )}
      </div>

      <EmployeeForm
        open={editOpen}
        onOpenChange={setEditOpen}
        initial={initialForm}
        title="Edit employee"
        description="Update this person's workspace record. Changes apply across all letters and matters."
        submitLabel="Save changes"
        onSubmit={(values) => {
          updateEmployee(e.id, values);
          setEditOpen(false);
        }}
      />
      <DeleteEmployeeDialog
        employee={e}
        open={deleteOpen}
        onOpenChange={setDeleteOpen}
        onConfirm={() => {
          deleteEmployee(e.id);
          toast(`${e.legalName} deleted`);
          nav("/employees", { replace: true });
        }}
      />
      <NewLetterForPerson employee={e} open={letterOpen} onOpenChange={setLetterOpen} />
      <Dialog open={timelineOpen} onOpenChange={setTimelineOpen}>
        <DialogContent className="max-h-[calc(100dvh-32px)] max-w-[560px] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Timeline</DialogTitle>
          </DialogHeader>
          <TimelineList items={timeline} />
        </DialogContent>
      </Dialog>
    </div>
  );
}

/* ─── Parts ──────────────────────────────────────────────────────────── */

function Sep() {
  return (
    <span aria-hidden className="mx-2 text-[var(--ds-faint)]">
      ·
    </span>
  );
}

function Quiet({ children }: { children: ReactNode }) {
  return <p className="m-0 rounded-[12px] bg-[var(--ds-surface-2)] px-4 py-6 text-center text-[13.5px] text-[var(--ds-muted)]">{children}</p>;
}

type ReviewItem = { id: string; tone: "amber" | "blue" | "grey"; title: string; detail?: string; action?: { label: string; to: string }; ts?: number };

const TILE: Record<ReviewItem["tone"], string> = {
  amber: "border-[var(--ds-amber-bd)] bg-[var(--ds-amber-bg)] text-[var(--ds-amber-fg)]",
  blue: "border-[var(--ds-blue-bd,var(--ds-line))] bg-[var(--ds-blue-bg)] text-[var(--ds-blue-fg)]",
  grey: "border-[var(--ds-line)] bg-[var(--ds-surface-2)] text-[var(--ds-muted)]",
};

function ReviewList({ items }: { items: ReviewItem[] }) {
  return (
    <ul className="m-0 list-none overflow-hidden rounded-[14px] border border-[var(--ds-line)] bg-[var(--ds-surface)] p-0">
      {items.map((it, i) => {
        const Icon = it.tone === "amber" ? AlertTriangle : it.tone === "blue" ? CalendarDays : Info;
        return (
          <li
            key={it.id}
            className={cn(
              "flex min-w-0 flex-wrap items-center gap-x-3 gap-y-2 border-t border-[var(--ds-line-2)] px-4 py-3 first:border-t-0",
              i === 0 && it.tone === "amber" && "bg-[var(--ds-amber-soft)]"
            )}
          >
            <span className={cn("grid size-8 shrink-0 place-items-center rounded-[9px] border", TILE[it.tone])}>
              <Icon aria-hidden className="size-4" />
            </span>
            <div className="min-w-0 flex-1 basis-[200px]">
              <div className="text-[14px] font-medium text-[var(--ds-ink)] [overflow-wrap:anywhere]">{it.title}</div>
              {it.detail && <div className="truncate text-[12.5px] text-[var(--ds-muted)]">{it.detail}</div>}
            </div>
            {it.action && (
              <Button variant="outline" size="sm" asChild>
                <Link to={it.action.to}>{it.action.label}</Link>
              </Button>
            )}
          </li>
        );
      })}
    </ul>
  );
}

function whoLine(r: LetterRowData): string {
  const type = shortTypeLabel(r.draft.letterType);
  if (r.journey.stage === "sent") return `${type} · ${r.reviewedBy ? `Sent by ${r.reviewedBy}` : "Sent"}`;
  const approver = [...(r.draft.approvals ?? [])].reverse().find((a) => a.decision === "approved")?.reviewerName;
  if (r.journey.stage === "send" && approver) return `${type} · Approved by ${approver}`;
  return `${type} · Drafted by ${r.owner.name}`;
}

function shortDate(ts: number): string {
  return isToday(ts) ? "Today" : format(ts, "d MMM");
}

function LetterLines({ rows }: { rows: LetterRowData[] }) {
  const nav = useNavigate();
  return (
    <ul className="m-0 list-none border-t border-[var(--ds-line-2)] p-0">
      {rows.map((r) => (
        <li
          key={r.id}
          onClick={(ev) => {
            if ((ev.target as HTMLElement).closest("a,button,[role=menuitem]")) return;
            nav(`/editor/${r.id}`);
          }}
          className="flex min-w-0 cursor-pointer items-center gap-3.5 border-b border-[var(--ds-line-2)] py-2.5 transition-colors duration-[120ms] hover:bg-[var(--ds-hover)]"
        >
          <FlatPaper tint={r.tint} />
          <div className="min-w-0 flex-1">
            <Link to={`/editor/${r.id}`} className="block truncate rounded-[4px] text-[14px] font-medium text-[var(--ds-ink)] outline-none focus-visible:shadow-[var(--ds-focus-ring)]">
              {r.label}
            </Link>
            <div className="truncate text-[12.5px] text-[var(--ds-muted)]">{whoLine(r)}</div>
          </div>
          <span className="hidden sm:inline-flex">
            <StatusPill tone={r.journey.statusTone}>{r.journey.statusLabel}</StatusPill>
          </span>
          <span className="w-12 shrink-0 text-right text-[13px] text-[var(--ds-subtle)]">{shortDate(r.journey.stage === "sent" && r.sentAt ? r.sentAt : r.updatedAt)}</span>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                type="button"
                aria-label={`Actions for ${r.label}`}
                className="grid size-7 shrink-0 place-items-center rounded-[8px] text-[var(--ds-subtle)] outline-none transition-colors duration-[120ms] hover:bg-[var(--ds-surface-3)] hover:text-[var(--ds-ink)] focus-visible:shadow-[var(--ds-focus-ring)] data-[state=open]:bg-[var(--ds-surface-3)]"
              >
                <MoreHorizontal className="size-4" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className={cn("w-44", MENU_MOTION)}>
              <DropdownMenuItem onSelect={() => nav(`/editor/${r.id}`)}>
                <ArrowUpRight />
                Open
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </li>
      ))}
    </ul>
  );
}

function nextStep(r: MatterRow): string | null {
  if (r.matter.status !== "active") return null;
  const n = r.next;
  if (n?.iso) {
    const rel = relativeDays(n.iso);
    const title = n.title.length > 30 ? `${n.title.slice(0, 28).trimEnd()}…` : n.title;
    return `${title} ${rel.text}`;
  }
  return r.matter.nextAction?.trim() || null;
}

function MatterCards({ rows }: { rows: MatterRow[] }) {
  return (
    <ul className="m-0 grid list-none gap-2.5 p-0">
      {rows.map((r) => {
        const m = r.matter;
        const step = nextStep(r);
        return (
          <li key={m.id} className="relative min-w-0 rounded-[14px] bg-[var(--ds-surface-2)] transition-colors duration-[120ms] hover:bg-[var(--ds-surface-3)]">
            <div className="flex min-w-0 flex-wrap items-start gap-x-3.5 gap-y-2 px-4 py-3.5">
              <span className="grid size-9 shrink-0 place-items-center rounded-[10px] border border-[var(--ds-line)] bg-[var(--ds-surface)] text-[var(--ds-muted)]">
                <FolderOpen aria-hidden className="size-[17px]" />
              </span>
              <div className="min-w-0 flex-1 basis-[220px]">
                <Link
                  to={`/matters/${m.id}`}
                  className="block truncate rounded-[4px] text-[14.5px] font-medium text-[var(--ds-ink)] outline-none after:absolute after:inset-0 after:rounded-[14px] focus-visible:after:shadow-[var(--ds-focus-ring)]"
                >
                  {m.name}
                </Link>
                <div className="truncate text-[12.5px] text-[var(--ds-muted)]">
                  Opened {format(m.createdAt, "d MMM")} by {r.owner} · {r.letters.length} {r.letters.length === 1 ? "letter" : "letters"} · {r.evidenceCount}{" "}
                  {r.evidenceCount === 1 ? "document" : "documents"}
                </div>
                <div className="mt-2 flex flex-wrap gap-1.5">
                  <Pill tone={r.stage.tone}>{r.stage.label}</Pill>
                  {r.risk && <Pill tone={RISK_TONE[r.risk]}>{RISK_LABEL[r.risk]} risk</Pill>}
                </div>
              </div>
              {step && (
                <div className="max-w-[300px] text-left sm:text-right">
                  <div className="text-[12.5px] text-[var(--ds-subtle)]">Next step</div>
                  <div className="text-[14px] font-medium text-[var(--ds-ink)]">{step}</div>
                  {r.next?.iso && <div className="text-[12px] text-[var(--ds-subtle)]">{shortDay(r.next.iso)}</div>}
                </div>
              )}
            </div>
          </li>
        );
      })}
    </ul>
  );
}

function DetailsList({ employee: e }: { employee: Employee }) {
  const start = startDateLabel(e.startDate);
  const tenure = tenureLabel(e.startDate);
  const rows: [string, ReactNode | undefined][] = [
    ["Email", e.email ? <a href={`mailto:${e.email}`} className="truncate underline-offset-2 hover:underline">{e.email}</a> : undefined],
    ["Start date", start ? <>{start}{tenure && <span className="text-[var(--ds-muted)]"> · {tenure}</span>}</> : undefined],
    [
      "Manager",
      e.managerName ? (
        <span className="inline-flex min-w-0 items-center gap-2">
          <Initials name={e.managerName} size={20} />
          <span className="truncate">{e.managerName}</span>
        </span>
      ) : undefined,
    ],
    ["Job title", e.jobTitle],
    ["Department", e.department],
    ["Worker type", e.workerClass ? WORKER_LABEL[e.workerClass] : undefined],
  ];
  return (
    <dl className="m-0 mb-3.5 grid grid-cols-[96px_minmax(0,1fr)] gap-x-3 gap-y-2.5 text-[13.5px]">
      {rows.map(([k, v]) => (
        <div key={k} className="contents">
          <dt className="text-[var(--ds-subtle)]">{k}</dt>
          <dd className={cn("m-0 min-w-0 truncate", v ? "text-[var(--ds-ink)]" : "text-[var(--ds-faint)]")}>{v ?? "Not set"}</dd>
        </div>
      ))}
    </dl>
  );
}

type TimelineItem = { id: string; ts: number; text: string; who?: string; tone: "amber" | "blue" | "green" | "grey"; to?: string };

const DRAFTING = new Set(["created", "sections_updated", "section_generated", "review_submitted", "review_changes_requested"]);

function buildTimeline(letters: Draft[], matters: MatterRow[]): TimelineItem[] {
  const out: TimelineItem[] = [];
  for (const d of letters) {
    const label = letterLabel(d);
    for (const ev of d.timeline ?? []) {
      const title = ev.title.trim();
      const text = title.toLowerCase().includes(label.toLowerCase()) ? title : `${label}: ${title.charAt(0).toLowerCase()}${title.slice(1)}`;
      out.push({
        id: `${d.id}-${ev.id}`,
        ts: ev.createdAt,
        text,
        who: ev.actorName,
        tone: ev.kind === "exported" ? "blue" : DRAFTING.has(ev.kind) ? "amber" : "grey",
        to: `/editor/${d.id}`,
      });
    }
  }
  for (const r of matters) {
    out.push({ id: `m-${r.matter.id}`, ts: r.matter.createdAt, text: `Matter opened: ${r.matter.name}`, who: r.owner, tone: "green", to: `/matters/${r.matter.id}` });
  }
  return out.sort((a, b) => b.ts - a.ts);
}

const DOT: Record<TimelineItem["tone"], string> = {
  amber: "border-[var(--ds-amber-dot)]",
  blue: "border-[var(--ds-blue-fg)]",
  green: "border-[var(--ds-green-fg)]",
  grey: "border-[var(--ds-line-strong)]",
};

function TimelineList({ items }: { items: TimelineItem[] }) {
  return (
    <ol className="relative m-0 mb-3 list-none p-0 before:absolute before:bottom-3 before:left-[5px] before:top-3 before:w-px before:bg-[var(--ds-line)]">
      {items.map((it) => (
        <li key={it.id} className="relative flex gap-3 py-2">
          <span aria-hidden className={cn("relative mt-[5px] size-[11px] shrink-0 rounded-full border-2 bg-[var(--ds-surface)]", DOT[it.tone])} />
          <div className="min-w-0">
            {it.to ? (
              <Link to={it.to} className="block rounded-[4px] text-[14px] text-[var(--ds-ink)] outline-none hover:underline hover:underline-offset-2 focus-visible:shadow-[var(--ds-focus-ring)]">
                {it.text}
              </Link>
            ) : (
              <div className="text-[14px] text-[var(--ds-ink)]">{it.text}</div>
            )}
            <div className="text-[12.5px] text-[var(--ds-muted)]">{[it.who, isToday(it.ts) ? `Today, ${format(it.ts, "HH:mm")}` : format(it.ts, "d MMM")].filter(Boolean).join(" · ")}</div>
          </div>
        </li>
      ))}
    </ol>
  );
}
