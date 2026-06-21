import { useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { ArrowLeft, ArrowRight, Plus, Settings2, Archive, Trash2, FolderPlus } from "lucide-react";
import { useDraftStore } from "@/lib/store";
import { useProfileStore, prefillsFromProfile } from "@/lib/profile";
import { draftsInMatter, MATTER_COLOR_CLASSES, matterInitial } from "@/lib/matters";
import { effectiveRiskBand } from "@/lib/matters/risk";
import { daysUntilDateOnly, formatDateOnly } from "@/lib/date-only";
import { getLetterMeta } from "@/lib/letters/catalog";
import { briefTitleFor } from "@/lib/letters/display";
import type { Draft, LetterTypeId, MatterType } from "@/lib/letters/types";
import { PageHeader } from "@/components/ds";
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

/**
 * /matters/:matterId — single matter detail. Hero with parties +
 * countdown + counsel-review chip + status chip, followed by the
 * letters list and a matter timeline aggregated from each draft's
 * timeline events.
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

  if (!matter) {
    return (
      <div className="max-w-5xl px-4 py-6 sm:px-6 sm:py-8">
        <p className="text-sm text-[var(--ds-muted)] m-0">Matter not found.</p>
        <Link
          to="/matters"
          className="inline-flex items-center gap-1.5 mt-4 text-[13px] text-[var(--ds-ink)] hover:underline"
        >
          <ArrowLeft className="size-3.5" /> Back to all matters
        </Link>
      </div>
    );
  }

  const colors = MATTER_COLOR_CLASSES[matter.color];
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

  return (
    <div className="max-w-5xl px-4 py-6 sm:px-6 sm:py-8">
      <PageHeader
        crumbs={[
          { label: matter.mode === "employer" ? "HR / Management" : "Employee", href: prefix },
          { label: "Matters", href: "/matters" },
          { label: matter.name },
        ]}
        title={matter.name}
        actions={
          <div className="flex items-center gap-2">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" size="sm">
                  <Settings2 className="size-3.5" />
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
              Add letter
            </Button>
          </div>
        }
      />

      {/* Hero card */}
      <div className="rounded-xl border border-[var(--ds-line)] bg-[var(--ds-surface)] p-5 mb-5 flex items-start gap-4">
        <div
          className={cn(
            "size-12 rounded-lg grid place-items-center text-white font-semibold text-[20px] shrink-0",
            colors.swatch
          )}
          style={{ fontFamily: "var(--font-serif)" }}
        >
          {matterInitial(matter)}
        </div>
        <div className="flex-1 min-w-0">
          {matter.parties?.primaryName && (
            <p className="text-[13px] text-[var(--ds-body)] m-0">
              {matter.parties.primaryName}
              {matter.parties.primaryContext && (
                <span className="text-[var(--ds-muted)]">
                  {" "}
                  · {matter.parties.primaryContext}
                </span>
              )}
            </p>
          )}
          {matter.description && (
            <p className="text-[13px] text-[var(--ds-muted)] mt-2 m-0">{matter.description}</p>
          )}
          <div className="flex items-center gap-1.5 mt-3 flex-wrap">
            <Pill
              tone={matter.status === "active" ? "green" : "muted"}
              label={
                matter.status === "active"
                  ? "Active"
                  : matter.status === "closed"
                  ? "Closed"
                  : "Archived"
              }
            />
            {matter.counselReviewed && <Pill tone="amber" label="⚠ Counsel-reviewed" />}
            {matter.type && <Pill tone="blue" label={matterTypeLabel(matter.type)} />}
            <MatterRiskBadge band={effectiveRiskBand(matter, matterDrafts)} />
            <Pill
              tone="muted"
              label={`${matterDrafts.length} letter${matterDrafts.length === 1 ? "" : "s"}`}
            />
            {matter.mode === "employer" && (
              <Pill tone="muted" label="HR / Management" />
            )}
          </div>
        </div>

        {matter.deadlineISO && (
          <div className="text-right shrink-0">
            <div className="text-[11px] text-[var(--ds-muted)]">
              {matter.deadlineLabel ?? "Deadline"}
            </div>
            <div
              className={cn(
                "font-mono text-[26px] font-bold leading-none mt-1",
                deadlinePastDue
                  ? "text-[var(--ds-red-fg)]"
                  : deadlineUrgent
                  ? "text-[var(--ds-amber-fg)]"
                  : "text-[var(--ds-ink)]"
              )}
            >
              {daysToDeadline !== undefined
                ? daysToDeadline < 0
                  ? `+${Math.abs(daysToDeadline)}d`
                  : `${daysToDeadline}d`
                : "—"}
            </div>
            <div className="text-[10px] text-[var(--ds-muted)] mt-1">
              {formatDateOnly(matter.deadlineISO, { dateStyle: "medium" })}
            </div>
          </div>
        )}
      </div>

      {/* Next-action banner — derived from matter.nextAction or soonest open task */}
      <NextActionBanner
        matter={matter}
        tasks={matterTasks}
        onGenerate={() => setShowAddLetter(true)}
      />

      {/* Participants */}
      <MatterParticipants matterId={matter.id} participants={matter.participants ?? []} />

      {/* Tasks */}
      <MatterTasks matterId={matter.id} tasks={matterTasks} />

      {/* Calendar */}
      <MatterCalendar matterId={matter.id} events={matterEvents} />

      {/* Add letter quick picker */}
      {showAddLetter && (
        <AddLetterPicker
          mode={matter.mode}
          onPick={onNewLetter}
          onCancel={() => setShowAddLetter(false)}
        />
      )}

      {/* Letters */}
      <section className="mb-5">
        <h2 className="text-[11px] font-semibold uppercase tracking-[0.08em] text-[var(--ds-muted)] m-0 mb-2">
          Letters
        </h2>
        {matterDrafts.length === 0 ? (
          <div className="rounded-lg border border-dashed border-[var(--ds-line)] bg-[var(--ds-surface)] p-6 text-center">
            <FolderPlus className="size-7 text-[var(--ds-muted)] mx-auto mb-2" />
            <p className="text-[13px] text-[var(--ds-muted)] m-0">
              No letters in this matter yet. Click <strong>Add letter</strong> above to start one.
            </p>
          </div>
        ) : (
          <div className="rounded-lg border border-[var(--ds-line)] bg-[var(--ds-surface)] overflow-hidden">
            {matterDrafts.map((draft, i) => (
              <LetterRow
                key={draft.id}
                draft={draft}
                isFirst={i === 0}
                onOpen={() => nav(`/editor/${draft.id}`)}
                onRemove={() => assignDraftToMatter(draft.id, null)}
              />
            ))}
          </div>
        )}
      </section>

      {/* Timeline (aggregated from draft.timeline) */}
      <MatterTimeline drafts={matterDrafts} />
    </div>
  );
}

/* ============================================================================
 * Sub-components
 * ==========================================================================*/

function Pill({
  tone,
  label,
}: {
  tone: "green" | "amber" | "red" | "muted" | "blue";
  label: string;
}) {
  const toneCls = {
    green: "bg-[var(--ds-green-bg)] text-[var(--ds-green-fg)]",
    amber: "bg-[var(--ds-amber-bg)] text-[var(--ds-amber-fg)]",
    red: "bg-[var(--ds-red-bg)] text-[var(--ds-red-fg)]",
    blue: "bg-[var(--ds-blue-bg)] text-[var(--ds-blue-fg)]",
    muted: "bg-[var(--ds-line-2)] text-[var(--ds-muted)]",
  }[tone];
  return (
    <span
      className={cn(
        "inline-flex items-center text-[10px] px-2 py-[1px] rounded-full font-medium",
        toneCls
      )}
    >
      {label}
    </span>
  );
}

function LetterRow({
  draft,
  isFirst,
  onOpen,
  onRemove,
}: {
  draft: Draft;
  isFirst: boolean;
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

  return (
    <div
      className={cn(
        "flex items-center gap-3 px-4 py-3 hover:bg-[var(--ds-line-2)] transition cursor-pointer",
        !isFirst && "border-t border-[var(--ds-line-2)]"
      )}
      onClick={onOpen}
    >
      <span
        className="grid place-items-center size-6 rounded-md bg-[var(--ds-line-2)] text-[10px] text-[var(--ds-muted)] font-mono font-semibold shrink-0"
        title={draft.letterType}
      >
        {meta.shortTitle.split(/\s+/)[0]?.[0]?.toUpperCase() ?? "L"}
      </span>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="font-medium text-[var(--ds-ink)] text-[13px] truncate">
            {briefTitleFor(draft)}
          </span>
          {hasUnresolvedComments && (
            <span className="text-[10px] text-[var(--ds-amber-fg)]">
              ●  comments
            </span>
          )}
        </div>
        <div className="text-[11px] text-[var(--ds-muted)] mt-0.5">
          {draft.sections.length} sections · {wordCount} words · {timeAgoShort(draft.updatedAt)}
        </div>
      </div>
      <Pill
        tone={
          isExported
            ? "green"
            : draft.sections.some((s) => s.status === "ready")
            ? "blue"
            : "amber"
        }
        label={isExported ? "Sent" : draft.sections.some((s) => s.status === "ready") ? "Ready" : "Draft"}
      />
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          onRemove();
        }}
        className="text-[10px] text-[var(--ds-muted)] hover:text-[var(--ds-red-fg)] hover:underline shrink-0"
        title="Remove this letter from the matter (keeps the draft)"
      >
        Remove
      </button>
      <ArrowRight className="size-3.5 text-[var(--ds-muted)] shrink-0" />
    </div>
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
    <div className="mb-5 rounded-lg border border-[var(--ds-line)] bg-[var(--ds-surface)] p-4">
      <div className="flex items-center justify-between mb-2">
        <h3 className="text-[12px] font-semibold uppercase tracking-[0.08em] text-[var(--ds-muted)] m-0">
          Add a letter to this matter
        </h3>
        <button
          type="button"
          onClick={onCancel}
          className="text-[11px] text-[var(--ds-muted)] hover:text-[var(--ds-ink)]"
        >
          Cancel
        </button>
      </div>
      <p className="text-[12px] text-[var(--ds-muted)] m-0 mt-1">
        Pick a letter type to create — it'll be created and linked to this matter automatically.
        <br />
        Or browse the full template library:{" "}
        <Link
          to={`${prefix}/new`}
          className="text-[var(--ds-ink)] underline"
          onClick={onCancel}
        >
          Open template library →
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

  if (events.length === 0) return null;

  return (
    <section>
      <h2 className="text-[11px] font-semibold uppercase tracking-[0.08em] text-[var(--ds-muted)] m-0 mb-2">
        Matter timeline
      </h2>
      <div className="rounded-lg border border-[var(--ds-line)] bg-[var(--ds-surface)] overflow-hidden">
        {events.map((ev, i) => (
          <div
            key={i}
            className={cn(
              "px-4 py-2 text-[12px] text-[var(--ds-body)]",
              i > 0 && "border-t border-[var(--ds-line-2)]"
            )}
          >
            <div className="flex items-baseline gap-2">
              <span className="text-[10px] font-mono text-[var(--ds-muted)] tabular-nums shrink-0 w-[80px]">
                {timeAgoShort(ev.ts)}
              </span>
              <span className="font-medium text-[var(--ds-ink)]">{ev.title}</span>
              <span className="text-[var(--ds-muted)]">— {ev.draftName}</span>
            </div>
            {(ev.sectionTitle || ev.detail) && (
              <div className="text-[11px] text-[var(--ds-muted)] mt-0.5 ml-[88px]">
                {ev.sectionTitle ? `${ev.sectionTitle}: ` : ""}
                {ev.detail}
              </div>
            )}
          </div>
        ))}
      </div>
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
