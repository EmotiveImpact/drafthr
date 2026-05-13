import { useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Plus, FolderOpen, ArrowRight, Briefcase, UserRound } from "lucide-react";
import { useDraftStore } from "@/lib/store";
import { useProfileStore } from "@/lib/profile";
import {
  activeMatters,
  closedMatters,
  draftsInMatter,
  MATTER_COLOR_CLASSES,
  matterInitial,
} from "@/lib/matters";
import { daysUntilDateOnly, formatDateOnly } from "@/lib/date-only";
import type { Draft, Matter, MatterColor, Mode } from "@/lib/letters/types";
import { PageHeader } from "@/components/ds";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";

/**
 * /matters — the index page that opens when the user clicks the
 * "Matters" parent label in the sidebar. Every matter as a card
 * grouped Active / Closed. Cards click through to /matters/:id.
 *
 * Two view modes — HR or Employee — derived from profile.role so the
 * page only ever shows matters that match the user's current mode.
 */
export function MattersIndex() {
  const nav = useNavigate();
  const profile = useProfileStore((s) => s.profile);
  const matters = useDraftStore((s) => s.matters);
  const drafts = useDraftStore((s) => s.drafts);
  const createMatter = useDraftStore((s) => s.createMatter);
  const [createOpen, setCreateOpen] = useState(false);

  // Pick mode from profile; default to whichever side has more matters.
  const profileMode = profile.role ?? "employer";
  const ownMatters = useMemo(() => Object.values(matters), [matters]);
  const allDrafts = useMemo(() => Object.values(drafts), [drafts]);

  const active = activeMatters(ownMatters, profileMode);
  const closed = closedMatters(ownMatters, profileMode);

  const prefix = profileMode === "employer" ? "/hr" : "/me";

  return (
    <div className="max-w-5xl px-4 py-6 sm:px-6 sm:py-8">
      <PageHeader
        crumbs={[
          { label: profileMode === "employer" ? "HR / Management" : "Employee", href: prefix },
          { label: "Matters" },
        ]}
        title="Matters"
        lede={
          profileMode === "employer"
            ? "Named cases bundling related letters about a person, hiring round, or HR workstream. Letters not yet in a matter live on Home — promote them with 'Make this a Matter →'."
            : "Named cases bundling related letters about an employer, claim, or matter. Letters not yet in a matter live on Home — promote them with 'Make this a Matter →'."
        }
        actions={
          <div className="flex items-center gap-2">
            <Button size="sm" variant="outline" onClick={() => setCreateOpen(true)}>
              <Plus className="size-3.5" />
              New matter
            </Button>
            <Link to={`${prefix}/new`}>
              <Button size="sm">
                <Plus className="size-3.5" />
                New letter
              </Button>
            </Link>
          </div>
        }
      />

      <NewMatterDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        mode={profileMode}
        onCreate={(input) => {
          const id = createMatter({ ...input, mode: profileMode });
          setCreateOpen(false);
          nav(`/matters/${id}`);
        }}
      />

      {/* Empty state */}
      {ownMatters.length === 0 && (
        <div className="rounded-lg border border-dashed border-[var(--ds-line)] bg-[var(--ds-surface)] p-8 text-center">
          <FolderOpen className="size-8 text-[var(--ds-muted)] mx-auto mb-3" />
          <h2 className="text-[15px] font-semibold text-[var(--ds-ink)] m-0">
            No matters yet
          </h2>
          <p className="text-[13px] text-[var(--ds-muted)] mt-1 mb-4 m-0 max-w-md mx-auto">
            Matters are named containers for related letters. Create one
            below, or promote an auto-group on <Link to={prefix} className="text-[var(--ds-ink)] underline">Home</Link>.
          </p>
          <div className="inline-flex gap-2">
            <Button size="sm" onClick={() => setCreateOpen(true)}>
              <Plus className="size-3.5" />
              New matter
            </Button>
            <Link to={prefix}>
              <Button variant="outline" size="sm">
                <ArrowRight className="size-3.5" />
                Go to Home
              </Button>
            </Link>
          </div>
        </div>
      )}

      {/* Active section */}
      {active.length > 0 && (
        <section className="mb-6">
          <SectionHeader title="Active" count={active.length} />
          <div className="space-y-2">
            {active.map((m) => (
              <MatterCard
                key={m.id}
                matter={m}
                drafts={allDrafts}
                onOpen={() => nav(`/matters/${m.id}`)}
              />
            ))}
          </div>
        </section>
      )}

      {/* Closed section */}
      {closed.length > 0 && (
        <section className="mb-6">
          <SectionHeader title="Closed" count={closed.length} />
          <div className="space-y-2 opacity-75">
            {closed.map((m) => (
              <MatterCard
                key={m.id}
                matter={m}
                drafts={allDrafts}
                onOpen={() => nav(`/matters/${m.id}`)}
              />
            ))}
          </div>
        </section>
      )}
    </div>
  );
}

/* ============================================================================
 * Sub-components
 * ==========================================================================*/

function SectionHeader({ title, count }: { title: string; count: number }) {
  return (
    <div className="flex items-baseline gap-3 pb-2 border-b border-[var(--ds-line)] mb-3">
      <h2 className="text-[11px] font-semibold uppercase tracking-[0.08em] text-[var(--ds-muted)] m-0">
        {title}
      </h2>
      <span className="text-[11px] text-[var(--ds-muted)] font-mono tabular-nums">
        {count}
      </span>
    </div>
  );
}

function MatterCard({
  matter,
  drafts,
  onOpen,
}: {
  matter: Matter;
  drafts: Draft[];
  onOpen: () => void;
}) {
  const colors = MATTER_COLOR_CLASSES[matter.color];
  const matterDrafts = useMemo(
    () => draftsInMatter(drafts, matter.id),
    [drafts, matter.id]
  );
  const lastActivity = matterDrafts[matterDrafts.length - 1];

  const daysToDeadline = matter.deadlineISO
    ? daysUntilDateOnly(matter.deadlineISO)
    : undefined;

  const deadlineUrgent = daysToDeadline !== undefined && daysToDeadline <= 14;
  const deadlinePastDue = daysToDeadline !== undefined && daysToDeadline < 0;

  return (
    <button
      type="button"
      onClick={onOpen}
      className="group block w-full text-left rounded-lg border border-[var(--ds-line)] bg-[var(--ds-surface)] hover:border-[var(--ds-subtle)] hover:shadow-sm transition overflow-hidden"
    >
      <div className="flex items-start gap-3 p-4">
        <div
          className={cn(
            "size-10 rounded-md grid place-items-center text-white font-semibold text-[16px] shrink-0",
            colors.swatch
          )}
          style={{ fontFamily: "var(--font-serif)" }}
        >
          {matterInitial(matter)}
        </div>

        <div className="flex-1 min-w-0">
          <h3 className="font-semibold text-[var(--ds-ink)] text-[15px] m-0 leading-tight">
            {matter.name}
          </h3>
          {matter.parties?.primaryName && (
            <p className="text-[12px] text-[var(--ds-muted)] mt-0.5 m-0">
              {matter.mode === "employer" ? (
                <UserRound className="size-3 inline -mt-0.5 mr-1" />
              ) : (
                <Briefcase className="size-3 inline -mt-0.5 mr-1" />
              )}
              {matter.parties.primaryName}
              {matter.parties.primaryContext && (
                <span className="text-[var(--ds-subtle)]"> · {matter.parties.primaryContext}</span>
              )}
            </p>
          )}

          <div className="flex items-center gap-1.5 mt-2 flex-wrap">
            <Pill
              tone={matter.status === "active" ? "green" : "muted"}
              label={matter.status === "active" ? "Active" : matter.status === "closed" ? "Closed" : "Archived"}
            />
            {matter.counselReviewed && (
              <Pill tone="amber" label="⚠ Counsel-reviewed" />
            )}
            <Pill
              tone="muted"
              label={`${matterDrafts.length} letter${matterDrafts.length === 1 ? "" : "s"}`}
            />
            {deadlineUrgent && !deadlinePastDue && daysToDeadline !== undefined && (
              <Pill
                tone="red"
                label={`⏰ ${matter.deadlineLabel ?? "deadline"} in ${daysToDeadline}d`}
              />
            )}
            {deadlinePastDue && daysToDeadline !== undefined && (
              <Pill
                tone="red"
                label={`⚠ past due by ${Math.abs(daysToDeadline)}d`}
              />
            )}
          </div>
        </div>

        {matter.deadlineISO && (
          <div className="text-right text-[10px] text-[var(--ds-muted)] shrink-0">
            <div>{matter.deadlineLabel ?? "Deadline"}</div>
            <div
              className={cn(
                "font-mono text-[13px] font-semibold mt-0.5",
                deadlinePastDue
                  ? "text-[var(--ds-red-fg)]"
                  : deadlineUrgent
                  ? "text-[var(--ds-amber-fg)]"
                  : "text-[var(--ds-ink)]"
              )}
            >
              {formatDateOnly(matter.deadlineISO, { dateStyle: "medium" })}
            </div>
          </div>
        )}
      </div>

      <div className="flex items-center gap-2 px-4 py-2 bg-[var(--ds-surface-2)] border-t border-[var(--ds-line-2)] text-[11px] text-[var(--ds-muted)]">
        {lastActivity ? (
          <span className="truncate">
            Last:{" "}
            <strong className="text-[var(--ds-body)] font-medium">
              {lastActivity.letterType.replace(/_/g, " ")}
            </strong>{" "}
            · {timeAgo(lastActivity.updatedAt)}
          </span>
        ) : (
          <span className="italic">No letters yet in this matter</span>
        )}
        <span className="ml-auto inline-flex items-center gap-1 text-[var(--ds-ink)] font-medium group-hover:translate-x-0.5 transition">
          Open <ArrowRight className="size-3" />
        </span>
      </div>
    </button>
  );
}

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

/* ----------------------------------------------------------------------------
 * New matter dialog — simple name + optional context. Color suggested from
 * mode and can be overridden. Counsel review is opt-in per matter.
 * --------------------------------------------------------------------------*/
function NewMatterDialog({
  open,
  onOpenChange,
  mode,
  onCreate,
}: {
  open: boolean;
  onOpenChange: (next: boolean) => void;
  mode: Mode;
  onCreate: (input: {
    name: string;
    color: MatterColor;
    description?: string;
    primaryName?: string;
    deadlineISO?: string;
    deadlineLabel?: string;
  }) => void;
}) {
  const [name, setName] = useState("");
  const [primaryName, setPrimaryName] = useState("");
  const [description, setDescription] = useState("");
  const [deadlineISO, setDeadline] = useState("");
  const [deadlineLabel, setDeadlineLabel] = useState("");
  const [color, setColor] = useState<MatterColor>("blue");

  // Reset on open so each invocation is fresh.
  useMemo(() => {
    if (open) {
      setName("");
      setPrimaryName("");
      setDescription("");
      setDeadline("");
      setDeadlineLabel("");
      setColor("blue");
    }
  }, [open]);

  const canSubmit = name.trim().length > 0;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>New matter</DialogTitle>
          <DialogDescription>
            {mode === "employer"
              ? "Bundle related letters about a single person, hiring round, or HR workstream."
              : "Bundle related letters about an employer, claim, or grievance you're pursuing."}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor="matter-name">Matter name *</Label>
            <Input
              id="matter-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={mode === "employer" ? "e.g. Jane Smith — performance" : "e.g. Acme Ltd — constructive dismissal"}
              autoFocus
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="matter-primary">
              {mode === "employer" ? "Person / role" : "Employer"} (optional)
            </Label>
            <Input
              id="matter-primary"
              value={primaryName}
              onChange={(e) => setPrimaryName(e.target.value)}
              placeholder={mode === "employer" ? "Jane Smith" : "Acme Holdings Limited"}
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="matter-desc">Short description (optional)</Label>
            <Textarea
              id="matter-desc"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={2}
              placeholder="A line or two of context. Visible only to you."
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="matter-deadline">Key deadline (optional)</Label>
              <Input
                id="matter-deadline"
                type="date"
                value={deadlineISO}
                onChange={(e) => setDeadline(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="matter-deadline-label">Deadline label</Label>
              <Input
                id="matter-deadline-label"
                value={deadlineLabel}
                onChange={(e) => setDeadlineLabel(e.target.value)}
                placeholder="e.g. ACAS EC ends"
                disabled={!deadlineISO}
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label>Colour</Label>
            <div className="flex items-center gap-1.5">
              {(["blue","green","amber","red","violet","slate"] as const satisfies readonly MatterColor[]).map((c) => (
                <button
                  key={c}
                  type="button"
                  onClick={() => setColor(c)}
                  aria-label={`Colour ${c}`}
                  className={cn(
                    "size-6 rounded-full border transition",
                    MATTER_COLOR_CLASSES[c].swatch,
                    color === c ? "ring-2 ring-offset-1 ring-[var(--ds-ink)]" : "opacity-80 hover:opacity-100"
                  )}
                />
              ))}
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button
            disabled={!canSubmit}
            onClick={() =>
              onCreate({
                name: name.trim(),
                color,
                description: description.trim() || undefined,
                primaryName: primaryName.trim() || undefined,
                deadlineISO: deadlineISO || undefined,
                deadlineLabel: deadlineLabel.trim() || undefined,
              })
            }
          >
            Create matter
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
