import { useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { ArrowLeft, ArrowRight, ChevronRight, Plus, Archive, Trash2, FolderPlus, MoreHorizontal, UsersRound, CalendarClock, History, X } from "lucide-react";
import { useDraftStore } from "@/lib/store";
import { useProfileStore, prefillsFromProfile } from "@/lib/profile";
import { draftsInMatter, matterInitial } from "@/lib/matters";
import { effectiveRiskBand } from "@/lib/matters/risk";
import { daysUntilDateOnly, formatDateOnly } from "@/lib/date-only";
import { getLetterMeta } from "@/lib/letters/catalog";
import { briefTitleFor } from "@/lib/letters/display";
import type { Draft, LetterTypeId, MatterType } from "@/lib/letters/types";
import { AvatarStack } from "@/components/ds";
import { PillTabs } from "@/components/ds/PageHeader";
import { Button } from "@/components/ui/button";
import { MatterRiskBadge } from "@/components/matter/MatterRiskBadge";
import { NextActionBanner } from "@/components/matter/NextActionBanner";
import { MatterParticipants } from "@/components/matter/MatterParticipants";
import { MatterTasks } from "@/components/matter/MatterTasks";
import { MatterCalendar } from "@/components/matter/MatterCalendar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import { MATTER_TINT, PageShell, PaperThumb, StatusPill, type PillTone } from "@/components/reports/parts";

/**
 * /matters/:matterId: single matter detail. 2A header (tinted initial tile,
 * parties, pills, people) with Overview, Letters, Deadlines and History tabs.
 * The timeline is aggregated from each draft's timeline events.
 */
export function MatterDetail() {
  const { matterId } = useParams<{ matterId: string }>();
  const nav = useNavigate();
  const profile = useProfileStore((s) => s.profile);
  const matter = useDraftStore((s) => (matterId ? s.matters[matterId] : undefined));
  const drafts = useDraftStore((s) => s.drafts);
  const archiveMatter = useDraftStore((s) => s.archiveMatter);
  const closeMatter = useDraftStore((s) => s.closeMatter);
  const deleteMatter = useDraftStore((s) => s.deleteMatter);
  const updateMatter = useDraftStore((s) => s.updateMatter);
  const createDraft = useDraftStore((s) => s.createDraft);
  const assignDraftToMatter = useDraftStore((s) => s.assignDraftToMatter);

  const allDrafts = useMemo(
    () => Object.values(drafts).filter((d) => !d.isTemplateSource),
    [drafts]
  );
  const matterDrafts = useMemo(
    () => (matter ? draftsInMatter(allDrafts, matter.id) : []),
    [allDrafts, matter]
  );

  const tasksMap = useDraftStore((s) => s.tasks);
  const eventsMap = useDraftStore((s) => s.events);
  const matterTasks = useMemo(
    () =>
      matter
        ? Object.values(tasksMap).filter((t) => t.matterId === matter.id)
        : [],
    [tasksMap, matter]
  );
  const matterEvents = useMemo(
    () =>
      matter
        ? Object.values(eventsMap).filter((e) => e.matterId === matter.id)
        : [],
    [eventsMap, matter]
  );

  const [showAddLetter, setShowAddLetter] = useState(false);
  const [tab, setTab] = useState<"overview" | "letters" | "deadlines" | "history">("overview");
  const historyCount = useMemo(
    () => matterDrafts.reduce((n, d) => n + (d.timeline?.length ?? 0), 0),
    [matterDrafts]
  );

  if (!matter) {
    return (
      <PageShell width="medium">
        <h1 className="ds-title m-0 text-[32px] leading-[1.1]">Matter not found</h1>
        <p className="m-0 mt-2 text-[14px] text-[var(--ds-muted)]">It may have been deleted, or the link is out of date.</p>
        <Link
          to="/matters"
          className="inline-flex items-center gap-1.5 mt-4 text-[13px] text-[var(--ds-ink)] hover:underline"
        >
          <ArrowLeft className="size-3.5" /> Back to all matters
        </Link>
      </PageShell>
    );
  }

  const [tint, tintInk] = MATTER_TINT[matter.color];
  const daysToDeadline = matter.deadlineISO
    ? daysUntilDateOnly(matter.deadlineISO)
    : undefined;
  const deadlinePastDue = daysToDeadline !== undefined && daysToDeadline < 0;
  const deadlineUrgent =
    daysToDeadline !== undefined && daysToDeadline <= 14 && !deadlinePastDue;

  const prefix = matter.mode === "employer" ? "/hr" : "/me";

  const onNewLetter = (letterType: LetterTypeId) => {
    const answers = prefillsFromProfile(profile, matter.mode);
    const id = createDraft(letterType, answers, matter.mode);
    assignDraftToMatter(id, matter.id);
    setShowAddLetter(false);
    nav(`/editor/${id}`);
  };

  const onDelete = () => {
    if (
      confirm(
        `Delete the matter "${matter.name}"? Its ${matterDrafts.length} letter${
          matterDrafts.length === 1 ? "" : "s"
        } will stay but become unaffiliated (back to auto-grouping on Home).`
      )
    ) {
      deleteMatter(matter.id);
      nav("/matters");
    }
  };

  const participants = matter.participants ?? [];
  const statusLabel =
    matter.status === "active" ? "Active" : matter.status === "closed" ? "Closed" : "Archived";
  const deadlineTone: PillTone = deadlinePastDue ? "danger" : deadlineUrgent ? "warn" : "neutral";
  const deadlineText =
    daysToDeadline === undefined
      ? undefined
      : daysToDeadline < 0
      ? `${Math.abs(daysToDeadline)} day${Math.abs(daysToDeadline) === 1 ? "" : "s"} overdue`
      : daysToDeadline === 0
      ? "Due today"
      : `${daysToDeadline} day${daysToDeadline === 1 ? "" : "s"} left`;

  const letters = (
    <LettersList
      drafts={matterDrafts}
      onOpen={(id) => nav(`/editor/${id}`)}
      onRemove={(id) => assignDraftToMatter(id, null)}
    />
  );

  return (
    <PageShell>
      {/* 2A matter header: crumb line, tinted initial tile, people and pills */}
      <header className="mb-8 min-w-0">
        <nav
          aria-label="Breadcrumb"
          className="mb-2.5 flex min-w-0 items-center gap-1.5 text-[12.5px] text-[var(--ds-muted)]"
        >
          <Link to={prefix} className="hidden hover:text-[var(--ds-ink)] sm:inline">
            {matter.mode === "employer" ? "HR / Management" : "Employee"}
          </Link>
          <ChevronRight className="hidden size-3 text-[var(--ds-faint)] sm:inline" aria-hidden />
          <Link to="/matters" className="inline-flex items-center gap-1 hover:text-[var(--ds-ink)]">
            <ArrowLeft className="size-3 sm:hidden" aria-hidden />
            Matters
          </Link>
          {matter.type && (
            <>
              <ChevronRight className="size-3 shrink-0 text-[var(--ds-faint)]" aria-hidden />
              <span className="truncate">{matterTypeLabel(matter.type)} matter</span>
            </>
          )}
        </nav>

        <div className="flex flex-wrap items-start justify-between gap-x-6 gap-y-4">
          <div className="flex min-w-0 flex-1 basis-[320px] items-center gap-3.5">
            <span
              className="ds-title grid size-11 shrink-0 place-items-center rounded-[var(--ds-r-s)] text-[24px] italic leading-none"
              style={{ background: tint, color: tintInk }}
              aria-hidden
            >
              {matterInitial(matter)}
            </span>
            <h1 className="ds-title m-0 min-w-0 text-[clamp(28px,4vw,40px)] leading-[1.1] [overflow-wrap:anywhere]">
              {matter.name}
            </h1>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            {participants.length > 0 && (
              <span className="mr-1 hidden sm:inline-flex">
                <AvatarStack
                  people={participants.map((p) => ({ name: p.name, seed: p.employeeId ?? p.name }))}
                  max={3}
                  size="lg"
                />
              </span>
            )}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" size="sm" aria-label="Manage matter">
                  <MoreHorizontal className="size-4" />
                  <span className="hidden sm:inline">Manage</span>
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-[220px]">
                <DropdownMenuItem
                  onClick={() => {
                    const newName = prompt("Rename matter", matter.name);
                    if (newName && newName.trim()) {
                      updateMatter(matter.id, { name: newName.trim() });
                    }
                  }}
                >
                  Rename matter
                </DropdownMenuItem>
                <DropdownMenuItem
                  onClick={() =>
                    updateMatter(matter.id, { counselReviewed: !matter.counselReviewed })
                  }
                >
                  {matter.counselReviewed ? "Mark not counsel-reviewed" : "Mark counsel-reviewed"}
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                {matter.status === "active" ? (
                  <DropdownMenuItem onClick={() => closeMatter(matter.id)}>
                    Close matter
                  </DropdownMenuItem>
                ) : (
                  <DropdownMenuItem
                    onClick={() => updateMatter(matter.id, { status: "active" })}
                  >
                    Re-open matter
                  </DropdownMenuItem>
                )}
                <DropdownMenuItem onClick={() => archiveMatter(matter.id)}>
                  <Archive className="size-4 mr-2" />
                  Archive matter
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  onClick={onDelete}
                  className="text-[var(--ds-red-fg)] focus:text-[var(--ds-red-fg)]"
                >
                  <Trash2 className="size-4 mr-2" />
                  Delete matter
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
            <Button size="sm" onClick={() => setShowAddLetter((v) => !v)}>
              <Plus className="size-3.5" />
              Add a letter
            </Button>
          </div>
        </div>

        <div className="mt-4 flex flex-wrap items-center gap-1.5">
          {matter.parties?.primaryName && (
            <span className="mr-1 inline-flex h-[26px] min-w-0 max-w-full items-center gap-1.5 rounded-[var(--ds-r-s)] border border-[var(--ds-line-strong)] px-2.5 text-[12.5px] text-[var(--ds-body)]">
              <UsersRound className="size-3.5 shrink-0 text-[var(--ds-muted)]" aria-hidden />
              <span className="truncate">
                {matter.parties.primaryName}
                {matter.parties.primaryContext && (
                  <span className="text-[var(--ds-muted)]">, {matter.parties.primaryContext}</span>
                )}
              </span>
            </span>
          )}
          <StatusPill tone={matter.status === "active" ? "ok" : "neutral"}>{statusLabel}</StatusPill>
          {matter.counselReviewed && <StatusPill tone="warn">Counsel-reviewed</StatusPill>}
          {matter.type && (
            <StatusPill tone="info" dot={false}>
              {matterTypeLabel(matter.type)}
            </StatusPill>
          )}
          <MatterRiskBadge band={effectiveRiskBand(matter, matterDrafts)} />
          {matter.deadlineISO && deadlineText && (
            <StatusPill tone={deadlineTone}>
              {matter.deadlineLabel ?? "Deadline"}: {deadlineText}
            </StatusPill>
          )}
        </div>
        {matter.description && (
          <p className="m-0 mt-3 max-w-[640px] text-[14px] leading-relaxed text-[var(--ds-muted)]">
            {matter.description}
          </p>
        )}

        <PillTabs
          tabs={[
            { id: "overview", label: "Overview" },
            { id: "letters", label: "Letters", count: matterDrafts.length },
            {
              id: "deadlines",
              label: "Deadlines",
              count: matterEvents.length + (matter.deadlineISO ? 1 : 0),
            },
            { id: "history", label: "History", count: historyCount || undefined },
          ]}
          activeTab={tab}
          onTabChange={(id) => setTab(id as typeof tab)}
        />
      </header>

      {/* Add letter quick picker */}
      {showAddLetter && (
        <AddLetterPicker
          mode={matter.mode}
          onPick={onNewLetter}
          onCancel={() => setShowAddLetter(false)}
        />
      )}

      {tab === "overview" && (
        <div className="grid min-w-0 gap-8 lg:grid-cols-[minmax(0,1fr)_320px]">
          <div className="min-w-0">
            {/* Next-action banner: derived from matter.nextAction or soonest open task */}
            <NextActionBanner
              matter={matter}
              tasks={matterTasks}
              onGenerate={() => setShowAddLetter(true)}
            />

            <MatterParticipants matterId={matter.id} participants={participants} />

            <section className="mb-6">
              <div className="mb-1 flex items-center justify-between gap-3">
                <h2 className="m-0 text-[15px] font-semibold text-[var(--ds-ink)]">Letters</h2>
                {matterDrafts.length > 3 && (
                  <button
                    type="button"
                    onClick={() => setTab("letters")}
                    className="inline-flex items-center gap-1 text-[12.5px] text-[var(--ds-muted)] hover:text-[var(--ds-ink)]"
                  >
                    View all {matterDrafts.length} <ArrowRight className="size-3" />
                  </button>
                )}
              </div>
              <LettersList
                drafts={matterDrafts.slice(0, 3)}
                onOpen={(id) => nav(`/editor/${id}`)}
                onRemove={(id) => assignDraftToMatter(id, null)}
              />
            </section>
          </div>

          <aside className="min-w-0 space-y-5">
            {matter.deadlineISO && (
              <DeadlineBox
                label={matter.deadlineLabel ?? "Deadline"}
                dateISO={matter.deadlineISO}
                days={daysToDeadline}
              />
            )}
            <MatterTasks matterId={matter.id} tasks={matterTasks} />
          </aside>
        </div>
      )}

      {tab === "letters" && <section className="min-w-0">{letters}</section>}

      {tab === "deadlines" && (
        <div className="grid min-w-0 max-w-[820px] gap-5">
          {matter.deadlineISO && (
            <DeadlineBox
              label={matter.deadlineLabel ?? "Deadline"}
              dateISO={matter.deadlineISO}
              days={daysToDeadline}
            />
          )}
          <MatterCalendar matterId={matter.id} events={matterEvents} />
        </div>
      )}

      {/* Timeline (aggregated from draft.timeline) */}
      {tab === "history" && <MatterTimeline drafts={matterDrafts} />}
    </PageShell>
  );
}

/* ============================================================================
 * Sub-components
 * ==========================================================================*/

function LettersList({
  drafts,
  onOpen,
  onRemove,
}: {
  drafts: Draft[];
  onOpen: (id: string) => void;
  onRemove: (id: string) => void;
}) {
  if (drafts.length === 0) {
    return (
      <div className="rounded-[var(--ds-r-l)] bg-[var(--ds-surface-2)] px-6 py-10 text-center">
        <div className="mx-auto mb-3 grid size-11 place-items-center rounded-full border border-[var(--ds-line)] bg-[var(--ds-surface)] text-[var(--ds-muted)]">
          <FolderPlus className="size-4" />
        </div>
        <p className="m-0 text-[13px] text-[var(--ds-muted)]">
          No letters in this matter yet. Use <strong className="font-medium text-[var(--ds-ink)]">Add a letter</strong> above to start one.
        </p>
      </div>
    );
  }
  return (
    <div className="min-w-0">
      <div
        className="hidden min-h-[30px] grid-cols-[44px_minmax(0,1fr)_110px_80px_70px_16px] items-center gap-4 border-b border-[var(--ds-line)] px-3.5 text-[12px] text-[var(--ds-muted)] md:grid"
        aria-hidden
      >
        <span />
        <span>Letter</span>
        <span>Status</span>
        <span className="text-right">Updated</span>
        <span />
        <span />
      </div>
      <ul className="m-0 list-none p-0 pt-1">
        {drafts.map((draft) => (
          <LetterRow
            key={draft.id}
            draft={draft}
            onOpen={() => onOpen(draft.id)}
            onRemove={() => onRemove(draft.id)}
          />
        ))}
      </ul>
    </div>
  );
}

function LetterRow({
  draft,
  onOpen,
  onRemove,
}: {
  draft: Draft;
  onOpen: () => void;
  onRemove: () => void;
}) {
  const meta = getLetterMeta(draft.letterType);
  const wordCount = draft.sections
    .map((s) => s.html.replace(/<[^>]+>/g, " ").trim())
    .join(" ")
    .split(/\s+/)
    .filter(Boolean).length;
  const hasUnresolvedComments = (draft.comments ?? []).some((c) => !c.resolved);
  const isExported = (draft.exports ?? []).length > 0;
  const isReady = draft.sections.some((s) => s.status === "ready");
  const tone: PillTone = isExported ? "ok" : isReady ? "info" : "neutral";
  const label = isExported ? "Sent" : isReady ? "Ready" : "Draft";

  return (
    <li className="relative m-0 [&+&]:before:absolute [&+&]:before:inset-x-3.5 [&+&]:before:top-0 [&+&]:before:border-t [&+&]:before:border-[var(--ds-line)] [&+&]:before:content-['']">
      <div
        role="button"
        tabIndex={0}
        onClick={onOpen}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            onOpen();
          }
        }}
        className={cn(
          "group grid cursor-pointer grid-cols-[44px_minmax(0,1fr)_auto] items-center gap-3 rounded-[var(--ds-r-m)] px-3.5 py-3 transition hover:bg-[var(--ds-surface-2)] md:grid-cols-[44px_minmax(0,1fr)_110px_80px_70px_16px] md:gap-4",
          hasUnresolvedComments && "bg-[var(--ds-amber-bg)] hover:bg-[var(--ds-amber-bg)]"
        )}
      >
        <PaperThumb seed={draft.id} />
        <div className="min-w-0">
          <div className="truncate text-[14px] font-semibold text-[var(--ds-ink)]">
            {briefTitleFor(draft)}
          </div>
          <div className="mt-0.5 truncate text-[12.5px] text-[var(--ds-muted)]">
            {meta.shortTitle}, {draft.sections.length} sections, {wordCount} words
            {hasUnresolvedComments && (
              <span className="text-[var(--ds-amber-fg)]">, open comments</span>
            )}
            <span className="md:hidden">, {timeAgoShort(draft.updatedAt)}</span>
          </div>
        </div>
        <span className="hidden md:block">
          <StatusPill tone={tone} size="sm">
            {label}
          </StatusPill>
        </span>
        <span className="hidden text-right text-[12.5px] text-[var(--ds-muted)] md:block">
          {timeAgoShort(draft.updatedAt)}
        </span>
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onRemove();
          }}
          className="inline-flex items-center gap-1 justify-self-end rounded-[var(--ds-r-s)] px-1.5 py-1 text-[12px] text-[var(--ds-muted)] transition hover:bg-[var(--ds-surface)] hover:text-[var(--ds-red-fg)]"
          title="Remove this letter from the matter (keeps the draft)"
        >
          <X className="size-3 md:hidden" aria-hidden />
          <span className="sr-only md:not-sr-only">Remove</span>
        </button>
        <ArrowRight className="hidden size-3.5 text-[var(--ds-subtle)] transition group-hover:text-[var(--ds-ink)] md:block" />
      </div>
    </li>
  );
}

/** Home "Deadlines" box style: tinted by urgency, serif date, days left. */
function DeadlineBox({
  label,
  dateISO,
  days,
}: {
  label: string;
  dateISO: string;
  days: number | undefined;
}) {
  const pastDue = days !== undefined && days < 0;
  const urgent = days !== undefined && days <= 14;
  const soon = days !== undefined && days <= 30;
  return (
    <section className="rounded-[var(--ds-r-l)] border border-[var(--ds-line)] bg-[var(--ds-surface)] p-1.5">
      <div className="flex items-center gap-2 px-2.5 pb-2 pt-1.5 text-[13.5px] font-semibold text-[var(--ds-ink)]">
        <CalendarClock className="size-3.5 text-[var(--ds-muted)]" aria-hidden />
        Deadline
      </div>
      <div
        className={cn(
          "rounded-[calc(var(--ds-r-l)-5px)] px-3.5 py-3",
          urgent || pastDue
            ? "bg-[var(--ds-red-bg)]"
            : soon
            ? "bg-[var(--ds-amber-bg)]"
            : "bg-[var(--ds-surface-2)]"
        )}
      >
        <div className="text-[13.5px] font-medium text-[var(--ds-ink)]">{label}</div>
        <div className="mt-1 flex items-baseline justify-between gap-3">
          <span className="ds-title text-[20px] leading-tight">
            {formatDateOnly(dateISO, { day: "numeric", month: "long", year: "numeric" }, "en-GB")}
          </span>
          {days !== undefined && (
            <span
              className={cn(
                "shrink-0 text-[12.5px] font-medium",
                urgent || pastDue
                  ? "text-[var(--ds-red-fg)]"
                  : soon
                  ? "text-[var(--ds-amber-fg)]"
                  : "text-[var(--ds-muted)]"
              )}
            >
              {pastDue
                ? `${Math.abs(days)} day${Math.abs(days) === 1 ? "" : "s"} overdue`
                : days === 0
                ? "Today"
                : `${days} day${days === 1 ? "" : "s"} left`}
            </span>
          )}
        </div>
      </div>
    </section>
  );
}

function AddLetterPicker({
  mode,
  onPick,
  onCancel,
}: {
  mode: Draft["mode"];
  onPick: (letterType: LetterTypeId) => void;
  onCancel: () => void;
}) {
  const prefix = mode === "employer" ? "/hr" : "/me";
  return (
    <div className="mb-6 rounded-[var(--ds-r-l)] border border-[var(--ds-line)] bg-[var(--ds-surface)] p-4 shadow-[var(--ds-shadow-s)] sm:p-5">
      <div className="flex items-center justify-between mb-1">
        <h3 className="m-0 text-[15px] font-semibold text-[var(--ds-ink)]">
          Add a letter to this matter
        </h3>
        <button
          type="button"
          onClick={onCancel}
          className="text-[12.5px] text-[var(--ds-muted)] hover:text-[var(--ds-ink)]"
        >
          Cancel
        </button>
      </div>
      <p className="m-0 mt-1 text-[13px] leading-relaxed text-[var(--ds-muted)]">
        Pick a letter type. It will be created and linked to this matter automatically.
        <br />
        Or browse the full template library:{" "}
        <Link
          to={`${prefix}/new`}
          className="text-[var(--ds-ink)] underline underline-offset-2"
          onClick={onCancel}
        >
          Open template library
        </Link>
      </p>
      <div className="flex flex-wrap gap-2 mt-3">
        {[
          { id: "grievance", label: "Grievance" },
          { id: "appeal", label: "Appeal" },
          { id: "warning", label: "Disciplinary warning" },
          { id: "termination", label: "Termination" },
          { id: "pip_response", label: "PIP response" },
          { id: "offer", label: "Offer letter" },
        ]
          .filter((opt) => {
            // Filter to letter types valid for this mode (employer mode
            // wants HR-side templates, employee mode wants employee-side).
            try {
              const meta = getLetterMeta(opt.id as LetterTypeId);
              return meta.mode === mode;
            } catch {
              return false;
            }
          })
          .map((opt) => (
            <Button
              key={opt.id}
              variant="outline"
              size="sm"
              onClick={() => onPick(opt.id as LetterTypeId)}
            >
              <Plus className="size-3" />
              {opt.label}
            </Button>
          ))}
      </div>
    </div>
  );
}

function MatterTimeline({ drafts }: { drafts: Draft[] }) {
  const events = useMemo(() => {
    const all: Array<{
      ts: number;
      kind: string;
      title: string;
      sectionTitle?: string;
      detail?: string;
      draftId: string;
      draftName: string;
    }> = [];
    for (const d of drafts) {
      const draftName = briefTitleFor(d);
      for (const ev of d.timeline ?? []) {
        all.push({
          ts: ev.createdAt,
          kind: ev.kind,
          title: ev.title,
          sectionTitle: ev.sectionTitle,
          detail: ev.detail,
          draftId: d.id,
          draftName,
        });
      }
    }
    return all.sort((a, b) => b.ts - a.ts).slice(0, 20);
  }, [drafts]);

  if (events.length === 0) {
    return (
      <div className="rounded-[var(--ds-r-l)] bg-[var(--ds-surface-2)] px-6 py-10 text-center text-[13px] text-[var(--ds-muted)]">
        <History className="mx-auto mb-2 size-5" aria-hidden />
        Nothing has happened on this matter's letters yet.
      </div>
    );
  }

  return (
    <section className="max-w-[820px] rounded-[var(--ds-r-l)] border border-[var(--ds-line)] bg-[var(--ds-surface)] p-1.5">
      <h2 className="m-0 flex items-center gap-2 px-2.5 pb-2 pt-1.5 text-[13.5px] font-semibold text-[var(--ds-ink)]">
        <History className="size-3.5 text-[var(--ds-muted)]" aria-hidden />
        Matter timeline
      </h2>
      <ol className="m-0 list-none p-0">
        {events.map((ev, i) => (
          <li
            key={i}
            className="flex gap-3 rounded-[var(--ds-r-m)] px-2.5 py-2.5 text-[13px] text-[var(--ds-body)] hover:bg-[var(--ds-surface-2)]"
          >
            <span className="mt-[7px] size-1.5 shrink-0 rounded-full bg-[var(--ds-faint)]" aria-hidden />
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-baseline gap-x-2">
                <span className="font-medium text-[var(--ds-ink)]">{ev.title}</span>
                <span className="text-[var(--ds-muted)]">{ev.draftName}</span>
              </div>
              {(ev.sectionTitle || ev.detail) && (
                <div className="mt-0.5 text-[12.5px] text-[var(--ds-muted)]">
                  {ev.sectionTitle ? `${ev.sectionTitle}: ` : ""}
                  {ev.detail}
                </div>
              )}
            </div>
            <span className="shrink-0 text-[12px] tabular-nums text-[var(--ds-muted)]">
              {timeAgoShort(ev.ts)}
            </span>
          </li>
        ))}
      </ol>
    </section>
  );
}

const MATTER_TYPE_LABEL: Record<MatterType, string> = {
  investigation: "Investigation",
  grievance: "Grievance",
  disciplinary: "Disciplinary",
  performance: "Performance",
  absence: "Absence",
  redundancy: "Redundancy",
  restructure: "Restructure",
  settlement: "Settlement",
  tribunal: "Tribunal",
  onboarding: "Onboarding",
  offboarding: "Offboarding",
  other: "Other",
};

function matterTypeLabel(type: MatterType): string {
  return MATTER_TYPE_LABEL[type] ?? type;
}

function timeAgoShort(ts: number): string {
  const seconds = Math.max(0, Math.floor((Date.now() - ts) / 1000));
  if (seconds < 60) return "just now";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d`;
  const months = Math.floor(days / 30);
  return `${months}mo`;
}
