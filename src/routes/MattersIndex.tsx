import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Plus, FolderOpen, ArrowRight, Briefcase, UserRound } from "lucide-react";
import { useDraftStore } from "@/lib/store";
import { useProfileStore } from "@/lib/profile";
import {
  activeMatters,
  closedMatters,
  draftsInMatter,
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
import { MATTER_TINT, PageShell } from "@/components/reports/parts";

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
  const allDrafts = useMemo(
    () => Object.values(drafts).filter((d) => !d.isTemplateSource),
    [drafts]
  );

  const active = activeMatters(ownMatters, profileMode);
  const closedAll = closedMatters(ownMatters, profileMode);
  const closed = closedAll.filter((m) => m.status === "closed");
  const archived = closedAll.filter((m) => m.status === "archived");
  const [tab, setTab] = useState<"active" | "closed" | "archived">("active");
  const shown = tab === "active" ? active : tab === "closed" ? closed : archived;

  const prefix = profileMode === "employer" ? "/hr" : "/me";

  return (
    <PageShell>
      <PageHeader
        crumbs={[
          { label: profileMode === "employer" ? "HR / Management" : "Employee", href: prefix },
          { label: "Matters" },
        ]}
        title="Matters"
        lede={
          profileMode === "employer"
            ? "Named cases bundling related letters about a person, hiring round or HR workstream. Letters not yet in a matter live on Home: promote them with 'Make this a Matter'."
            : "Named cases bundling related letters about an employer, claim or matter. Letters not yet in a matter live on Home: promote them with 'Make this a Matter'."
        }
        tabs={
          ownMatters.length === 0
            ? undefined
            : [
                { id: "active", label: "Active", count: active.length },
                { id: "closed", label: "Closed", count: closed.length },
                { id: "archived", label: "Archived", count: archived.length },
              ]
        }
        activeTab={tab}
        onTabChange={(id) => setTab(id as typeof tab)}
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
        <div className="rounded-[var(--ds-r-l)] border border-[var(--ds-line)] bg-[var(--ds-surface)] p-10 text-center">
          <div className="mx-auto mb-4 grid size-14 place-items-center rounded-full border border-[var(--ds-line)] bg-[var(--ds-line-2)] text-[var(--ds-muted)]">
            <FolderOpen className="size-5" />
          </div>
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

      {ownMatters.length > 0 && shown.length === 0 && (
        <div className="rounded-[var(--ds-r-l)] bg-[var(--ds-surface-2)] py-10 text-center text-[13px] text-[var(--ds-muted)]">
          {tab === "active" ? "No active matters." : tab === "closed" ? "No closed matters." : "No archived matters."}
        </div>
      )}

      {shown.length > 0 && (
        <div className={cn("grid gap-4 sm:grid-cols-2 xl:grid-cols-3", tab !== "active" && "opacity-90")}>
          {shown.map((m) => (
            <MatterCard
              key={m.id}
              matter={m}
              drafts={allDrafts}
              onOpen={() => nav(`/matters/${m.id}`)}
            />
          ))}
        </div>
      )}
    </PageShell>
  );
}

/* ============================================================================
 * Sub-components
 * ==========================================================================*/

function MatterCard({
  matter,
  drafts,
  onOpen,
}: {
  matter: Matter;
  drafts: Draft[];
  onOpen: () => void;
}) {
  const matterDrafts = useMemo(
    () => draftsInMatter(drafts, matter.id),
    [drafts, matter.id]
  );
  // The card labels this "Last:" and renders its `updatedAt`, so it must be the
  // most-recently-*updated* draft — not the one created last. (draftsInMatter
  // sorts by createdAt ascending, which other callers rely on, so don't reorder
  // it here.)
  const lastActivity = matterDrafts.reduce<Draft | undefined>(
    (a, b) => (b.updatedAt > (a?.updatedAt ?? -Infinity) ? b : a),
    undefined
  );

  const daysToDeadline = matter.deadlineISO
    ? daysUntilDateOnly(matter.deadlineISO)
    : undefined;

  const deadlineUrgent = daysToDeadline !== undefined && daysToDeadline <= 14;
  const deadlinePastDue = daysToDeadline !== undefined && daysToDeadline < 0;

  const [tint, ink] = MATTER_TINT[matter.color];

  return (
    <button
      type="button"
      onClick={onOpen}
      className="group flex min-w-0 flex-col overflow-hidden rounded-[var(--ds-r-l)] border border-[var(--ds-line)] bg-[var(--ds-surface)] text-left transition hover:-translate-y-px hover:border-[var(--ds-line-strong)] hover:shadow-[var(--ds-shadow-m)]"
    >
      {/* 6B tinted top: the matter's colour with a folder and its initial */}
      <div
        className="relative mx-1.5 mt-1.5 grid h-[96px] place-items-center rounded-[calc(var(--ds-r-l)-5px)]"
        style={{ background: tint, color: ink }}
      >
        <FolderOpen className="size-10" strokeWidth={1.3} aria-hidden />
        <span className="ds-title absolute left-3 top-2.5 text-[20px] leading-none" style={{ color: ink }} aria-hidden>
          {matterInitial(matter)}
        </span>
        {matter.deadlineISO && (
          <span
            className={cn(
              "absolute right-2.5 top-2.5 rounded-full bg-[var(--ds-surface)] px-2 py-0.5 text-[11.5px] font-medium",
              deadlinePastDue
                ? "text-[var(--ds-red-fg)]"
                : deadlineUrgent
                ? "text-[var(--ds-amber-fg)]"
                : "text-[var(--ds-body)]"
            )}
            title={matter.deadlineLabel ?? "Deadline"}
          >
            {formatDateOnly(matter.deadlineISO, { day: "numeric", month: "short", year: "numeric" }, "en-GB")}
          </span>
        )}
      </div>

      <div className="flex flex-1 flex-col px-4 pb-3.5 pt-3">
        <h3 className="m-0 text-[14.5px] font-semibold leading-snug text-[var(--ds-ink)]">
          {matter.name}
        </h3>
        {matter.parties?.primaryName && (
          <p className="m-0 mt-0.5 truncate text-[12.5px] text-[var(--ds-muted)]">
            {matter.mode === "employer" ? (
              <UserRound className="-mt-0.5 mr-1 inline size-3" />
            ) : (
              <Briefcase className="-mt-0.5 mr-1 inline size-3" />
            )}
            {matter.parties.primaryName}
            {matter.parties.primaryContext && (
              <span className="text-[var(--ds-subtle)]">, {matter.parties.primaryContext}</span>
            )}
          </p>
        )}

        <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
          <Pill
            tone={matter.status === "active" ? "green" : "muted"}
            label={matter.status === "active" ? "Active" : matter.status === "closed" ? "Closed" : "Archived"}
          />
          {matter.counselReviewed && <Pill tone="amber" label="Counsel-reviewed" />}
          <Pill
            tone="muted"
            label={`${matterDrafts.length} letter${matterDrafts.length === 1 ? "" : "s"}`}
          />
          {deadlineUrgent && !deadlinePastDue && daysToDeadline !== undefined && (
            <Pill
              tone="red"
              label={`${matter.deadlineLabel ?? "Deadline"} in ${daysToDeadline}d`}
            />
          )}
          {deadlinePastDue && daysToDeadline !== undefined && (
            <Pill tone="red" label={`Past due by ${Math.abs(daysToDeadline)}d`} />
          )}
        </div>

        <div className="mt-auto flex items-center gap-2 pt-3 text-[12px] text-[var(--ds-muted)]">
          {lastActivity ? (
            <span className="truncate">
              Last: <span className="text-[var(--ds-body)]">{lastActivity.letterType.replace(/_/g, " ")}</span>,{" "}
              {timeAgo(lastActivity.updatedAt)}
            </span>
          ) : (
            <span>No letters yet in this matter</span>
          )}
          <span className="ml-auto inline-flex shrink-0 items-center gap-1 font-medium text-[var(--ds-ink)] transition group-hover:translate-x-0.5">
            Open <ArrowRight className="size-3" />
          </span>
        </div>
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
    muted: "bg-[var(--ds-chip)] text-[var(--ds-body)]",
  }[tone];
  return (
    <span
      className={cn(
        "inline-flex h-5 items-center rounded-full px-2 text-[11.5px] font-medium",
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
  useEffect(() => {
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
              placeholder={mode === "employer" ? "e.g. Jane Smith, performance" : "e.g. Acme Ltd, constructive dismissal"}
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
                    "grid size-7 place-items-center rounded-full border transition",
                    color === c ? "ring-2 ring-offset-1 ring-[var(--ds-ink)]" : "hover:ring-1 hover:ring-[var(--ds-line-strong)]"
                  )}
                  style={{ background: MATTER_TINT[c][0], borderColor: MATTER_TINT[c][1] }}
                >
                  <span className="size-2 rounded-full" style={{ background: MATTER_TINT[c][1] }} />
                </button>
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
