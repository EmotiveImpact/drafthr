/**
 * The matter page's cards (matter mock): the next step strip, the ask box,
 * letter tiles, Evidence, Deadlines (a timeline that includes the tribunal
 * time limit) and History. Everything is drawn from the matter's real
 * letters, tasks and events.
 */
import { useMemo, useRef, useState, type ReactNode } from "react";
import { Link, useNavigate } from "react-router-dom";
import { format } from "date-fns";
import {
  ArrowRight,
  ArrowUp,
  ArrowUpRight,
  CalendarDays,
  FileText,
  Folder,
  FolderMinus,
  Image as ImageIcon,
  Info,
  Library,
  Mail,
  MessageSquare,
  MoreHorizontal,
  Paperclip,
  Plus,
  SlidersHorizontal,
  StickyNote,
} from "lucide-react";
import type { Draft, Employee, EvidenceItem, LetterTypeId, Matter, Task } from "@/lib/letters/types";
import { useDraftStore } from "@/lib/store";
import { useProfileStore, prefillsFromProfile } from "@/lib/profile";
import { getLetterMeta, letterCatalogByMode, type LetterTypeMeta } from "@/lib/letters/catalog";
import { daysUntilDateOnly } from "@/lib/date-only";
import { figureLabelFor, displayModeOf } from "@/lib/evidence";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { StatusPill } from "@/components/journey/ui/StatusPill";
import { Pill } from "@/components/ds";
import { MENU_MOTION, PaperArt } from "@/components/letters/parts";
import { employeeAnswers } from "@/components/employees/model";
import type { LetterRowData } from "@/components/letters/rows";
import { letterLabel, listStatusPill, timelineSentence } from "@/components/letters/letterView";
import { LawChip } from "./parts";
import { shortDay, type DeadlineItem } from "./model";

/* ─── Card frame ─────────────────────────────────────────────────────── */

export function SectionCard({
  title,
  action,
  children,
  className,
  id,
}: {
  title: string;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
  id?: string;
}) {
  return (
    <section id={id} aria-label={title} className={cn("min-w-0 rounded-[16px] border border-[var(--ds-line)] bg-[var(--ds-surface)] px-5 pb-1.5 pt-[18px]", className)}>
      <div className="mb-2 flex items-center justify-between gap-3">
        <h3 className="ds-title m-0 text-[22px] leading-tight">{title}</h3>
        {action}
      </div>
      {children}
    </section>
  );
}

export function CardLink({ onClick, children, to }: { onClick?: () => void; children: ReactNode; to?: string }) {
  const cls =
    "rounded-[6px] px-1 text-[13.5px] text-[var(--ds-ink)] outline-none transition-colors duration-[120ms] hover:underline hover:underline-offset-2 focus-visible:shadow-[var(--ds-focus-ring)]";
  return to ? (
    <Link to={to} className={cls}>
      {children}
    </Link>
  ) : (
    <button type="button" onClick={onClick} className={cls}>
      {children}
    </button>
  );
}

export function SectionHead({ title, sub, action }: { title: string; sub?: string; action?: ReactNode }) {
  return (
    <div className="mb-3.5 flex items-end justify-between gap-3">
      <div className="min-w-0">
        <h2 className="m-0 text-[17px] font-semibold text-[var(--ds-ink)]">{title}</h2>
        {sub && <p className="m-0 mt-[3px] text-[13.5px] text-[var(--ds-muted)]">{sub}</p>}
      </div>
      {action}
    </div>
  );
}

/* ─── Next step strip ────────────────────────────────────────────────── */

/**
 * "Next: <what>" from the matter's next action, else its soonest dated open
 * task (the due date shows only when it belongs to that task). "Open draft"
 * opens the letter still in progress; with none it offers to add a letter.
 */
export function NextStrip({
  matter,
  tasks,
  letters,
  onAddLetter,
}: {
  matter: Matter;
  tasks: Task[];
  letters: LetterRowData[];
  onAddLetter: () => void;
}) {
  const nav = useNavigate();
  const soonest = tasks
    .filter((t) => t.status === "open" && t.dueISO)
    .sort((a, b) => (a.dueISO ?? "").localeCompare(b.dueISO ?? ""))[0];
  const label = matter.nextAction?.trim() || soonest?.label;
  if (!label) return null;
  const dueISO = matter.nextAction?.trim() ? undefined : soonest?.dueISO;
  const days = dueISO ? daysUntilDateOnly(dueISO) : undefined;
  const inProgress = letters.filter((l) => l.journey.stage !== "sent").sort((a, b) => b.updatedAt - a.updatedAt)[0];
  return (
    <div className="mb-3.5 flex min-w-0 flex-wrap items-center gap-x-3 gap-y-2 rounded-[12px] border border-[var(--ds-amber-bd)] bg-[var(--ds-amber-soft)] py-2 pl-3.5 pr-2">
      <ArrowRight aria-hidden className="size-4 shrink-0 text-[var(--ds-amber-fg)]" />
      {/* The line takes the full width when the row is narrow (a phone), so
          it wraps once instead of being squeezed beside the date and button. */}
      <p className="m-0 min-w-0 flex-1 basis-[240px] text-[14px] text-[var(--ds-ink)] [overflow-wrap:anywhere]">
        <b className="font-medium">Next:</b> {label}
      </p>
      <span className="ml-auto flex shrink-0 items-center gap-3">
        {dueISO && (
          <span className={cn("whitespace-nowrap text-[12.5px]", days !== undefined && days < 0 ? "text-[var(--ds-red-fg)]" : "text-[var(--ds-amber-fg)]")}>
            {days !== undefined && days < 0 ? `Overdue since ${shortDay(dueISO)}` : `Due ${shortDay(dueISO)}`}
          </span>
        )}
        {inProgress ? (
          <Button variant="outline" size="sm" onClick={() => nav(`/editor/${inProgress.id}`)} title={inProgress.label}>
            Open draft
          </Button>
        ) : (
          <Button variant="outline" size="sm" onClick={onAddLetter}>
            <Plus />
            Add a letter
          </Button>
        )}
      </span>
    </div>
  );
}

/* ─── Letter types ───────────────────────────────────────────────────── */

const STOP = new Set(["a", "an", "and", "the", "to", "for", "of", "on", "in", "my", "me", "i", "we", "our", "about", "with", "from", "that", "this", "need", "want", "write", "draft", "letter", "please", "can", "you", "help", "is", "be", "it", "his", "her", "them", "send", "matter"]);
const words = (s: string) =>
  s
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, " ")
    .split(/[\s-]+/)
    .filter((w) => w.length >= 3 && !STOP.has(w));
const near = (a: string, b: string) => {
  if (a === b) return true;
  const n = Math.min(a.length, b.length, 6);
  return n >= 4 && a.slice(0, n) === b.slice(0, n);
};

/** Rank letter types against free text (title words weigh more). */
export function matchLetterTypes(query: string, catalog: LetterTypeMeta[]): LetterTypeMeta[] {
  const q = words(query);
  if (q.length === 0) return [];
  return catalog
    .map((l) => {
      const short = words(l.shortTitle);
      const title = words(l.title);
      const desc = words(l.description);
      let score = 0;
      for (const w of q) {
        if (short.some((t) => near(w, t))) score += 4;
        else if (title.some((t) => near(w, t))) score += 3;
        else if (desc.some((t) => near(w, t))) score += 1;
      }
      return { l, score };
    })
    .filter((s) => s.score >= 3 || (q.length === 1 && s.score >= 1))
    .sort((a, b) => b.score - a.score)
    .map((s) => s.l);
}

/** Create a letter of `type` linked to the matter and open it. */
/** The employee the matter is about (its subject participant, or the employee named as its primary party). */
export function matterSubject(matter: Matter, employees: Record<string, Employee>): Employee | undefined {
  if (matter.mode !== "employer") return undefined;
  const subj = matter.participants?.find((p) => p.role === "subject" && p.employeeId);
  if (subj?.employeeId && employees[subj.employeeId]) return employees[subj.employeeId];
  const name = matter.parties?.primaryName?.trim().toLowerCase();
  if (!name) return undefined;
  return Object.values(employees).find((e) => e.status !== "left" && e.legalName.trim().toLowerCase() === name);
}

/**
 * Start a letter inside the matter: created with the profile's prefills
 * (and, unless turned off, the subject employee's details), linked to the
 * matter, then opened.
 */
export function useStartLetterInMatter(matter: Matter) {
  const nav = useNavigate();
  const profile = useProfileStore((s) => s.profile);
  const employees = useDraftStore((s) => s.employees);
  const createDraft = useDraftStore((s) => s.createDraft);
  const assignDraftToMatter = useDraftStore((s) => s.assignDraftToMatter);
  return (type: LetterTypeId, opts: { withSubject?: boolean } = {}) => {
    const answers = {
      ...prefillsFromProfile(profile, matter.mode),
      ...(opts.withSubject === false ? {} : employeeAnswers(matterSubject(matter, employees))),
    };
    const id = createDraft(type, answers, matter.mode);
    assignDraftToMatter(id, matter.id);
    nav(`/editor/${id}`);
  };
}

const QUICK_TYPES = [
  { id: "grievance", label: "Grievance" },
  { id: "appeal", label: "Appeal" },
  { id: "warning", label: "Disciplinary warning" },
  { id: "termination", label: "Termination" },
  { id: "pip_response", label: "PIP response" },
  { id: "offer", label: "Offer letter" },
];

/** "Add a letter to this matter": quick types for the matter's mode and the template library. */
export function AddLetterDialog({ matter, open, onOpenChange }: { matter: Matter; open: boolean; onOpenChange: (v: boolean) => void }) {
  const start = useStartLetterInMatter(matter);
  const prefix = matter.mode === "employer" ? "/hr" : "/me";
  const types = QUICK_TYPES.filter((o) => {
    try {
      return getLetterMeta(o.id as LetterTypeId).mode === matter.mode;
    } catch {
      return false;
    }
  });
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-[520px]">
        <DialogHeader>
          <DialogTitle>Add a letter to this matter</DialogTitle>
          <DialogDescription>Pick a letter type. It will be created and linked to this matter automatically.</DialogDescription>
        </DialogHeader>
        <div className="flex flex-wrap gap-2">
          {types.map((o) => (
            <Button
              key={o.id}
              variant="outline"
              size="sm"
              onClick={() => {
                onOpenChange(false);
                start(o.id as LetterTypeId);
              }}
            >
              <Plus />
              {o.label}
            </Button>
          ))}
        </div>
        <p className="m-0 text-[13.5px] text-[var(--ds-muted)]">
          Or browse the full template library:{" "}
          <Link to={`${prefix}/new`} className="text-[var(--ds-ink)] underline underline-offset-2" onClick={() => onOpenChange(false)}>
            Open template library
          </Link>
        </p>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/* ─── Ask box ────────────────────────────────────────────────────────── */

/**
 * "Ask DraftHR anything about <matter>": matches the request to letter
 * types; picking one (or sending) starts that letter inside the matter, and
 * a request with no match opens the template library.
 */
export function AskBox({
  matter,
  counts,
  onFiles,
  onAddLetter,
}: {
  matter: Matter;
  counts: { letters: number; files: number; deadlines: number };
  onFiles: () => void;
  onAddLetter: () => void;
}) {
  const nav = useNavigate();
  const startLetter = useStartLetterInMatter(matter);
  const employees = useDraftStore((s) => s.employees);
  const subject = matterSubject(matter, employees);
  const [withSubject, setWithSubject] = useState(true);
  const start = (type: LetterTypeId) => startLetter(type, { withSubject });
  const jurisdiction = useProfileStore((s) => s.profile.defaults.jurisdiction);
  const prefix = matter.mode === "employer" ? "/hr" : "/me";
  const [text, setText] = useState("");
  const ta = useRef<HTMLTextAreaElement>(null);
  const catalog = useMemo(
    () =>
      letterCatalogByMode(matter.mode).filter(
        (l) => !(l.jurisdictionScope === "uk_only" && jurisdiction !== "UK") && !(l.jurisdictionScope === "us_only" && jurisdiction !== "US")
      ),
    [matter.mode, jurisdiction]
  );
  const matches = useMemo(() => matchLetterTypes(text, catalog).slice(0, 4), [text, catalog]);
  const typing = text.trim().length > 0;
  const send = () => {
    if (!typing) return;
    if (matches[0]) start(matches[0].id as LetterTypeId);
    else nav(`${prefix}/new`);
  };
  const plural = (n: number, w: string) => `${n} ${n === 1 ? w : `${w}s`}`;

  return (
    <div className="min-w-0">
      <div
        className="cursor-text rounded-[16px] border border-[var(--ds-line)] bg-[var(--ds-surface)] px-[18px] pb-3.5 pt-4 shadow-[var(--ds-shadow-ask)] transition-[border-color] duration-[120ms] focus-within:border-[var(--ds-line-strong)]"
        onClick={(e) => {
          if (!(e.target as HTMLElement).closest("a,button")) ta.current?.focus();
        }}
      >
        <div className="inline-flex max-w-full items-center gap-2.5 rounded-[10px] bg-[var(--ds-surface-2)] py-2 pl-2.5 pr-3">
          <Folder aria-hidden className="size-4 shrink-0 text-[var(--ds-muted)]" />
          <span className="min-w-0">
            <span className="block truncate text-[13px] font-medium text-[var(--ds-ink)]">{matter.name}</span>
            <span className="block truncate text-[12px] text-[var(--ds-muted)]">
              {plural(counts.letters, "letter")} · {plural(counts.files, "file")} · {plural(counts.deadlines, "deadline")}
            </span>
          </span>
        </div>
        <label htmlFor="matter-ask" className="sr-only">
          Ask DraftHR anything about {matter.name}
        </label>
        <div className="relative mx-0.5 mb-4 mt-3">
          {!typing && (
            <span aria-hidden className="pointer-events-none absolute inset-x-0 top-0 truncate text-[16px] leading-[24px] text-[var(--ds-subtle)]">
              Ask DraftHR anything about <span className="text-[var(--ds-ink)]">{matter.name}</span>
            </span>
          )}
          <textarea
            id="matter-ask"
            ref={ta}
            rows={1}
            value={text}
            onChange={(e) => {
              setText(e.target.value);
              const el = e.currentTarget;
              el.style.height = "auto";
              el.style.height = `${Math.min(el.scrollHeight, 160)}px`;
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
                e.preventDefault();
                send();
              }
            }}
            className="relative block min-h-[24px] w-full resize-none border-0 bg-transparent p-0 text-[16px] leading-[24px] text-[var(--ds-ink)] outline-none"
          />
        </div>
        <div className="flex min-w-0 items-center gap-1 text-[13.5px] text-[var(--ds-muted)]">
          <button type="button" aria-label="Add a letter" onClick={onAddLetter} className={ASK_BTN + " w-8 justify-center px-0"}>
            <Plus className="size-4" />
          </button>
          <Link to={`${prefix}/new`} className={ASK_BTN}>
            <Library className="size-[15px]" />
            Templates
          </Link>
          <button type="button" onClick={onFiles} className={ASK_BTN}>
            <Paperclip className="size-[15px]" />
            Files
          </button>
          <span className="flex-1" />
          {subject && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button type="button" aria-label="Letter options" title="Letter options" className={ASK_BTN + " mr-1 w-8 justify-center px-0"}>
                  <SlidersHorizontal className="size-4" />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent collisionPadding={16} align="end" side="top" className={cn("w-[260px]", MENU_MOTION)}>
                <DropdownMenuLabel className="text-[12px] font-normal text-[var(--ds-subtle)]">New letters in this matter</DropdownMenuLabel>
                <DropdownMenuCheckboxItem checked={withSubject} onCheckedChange={(v) => setWithSubject(!!v)} onSelect={(e) => e.preventDefault()}>
                  Fill in {subject.legalName}'s details
                </DropdownMenuCheckboxItem>
              </DropdownMenuContent>
            </DropdownMenu>
          )}
          <button
            type="button"
            onClick={send}
            disabled={!typing}
            aria-label={matches[0] ? `Start ${matches[0].shortTitle}` : "Send"}
            className="grid size-[34px] shrink-0 place-items-center rounded-[9px] bg-[var(--ds-accent)] text-[var(--ds-on-accent)] outline-none transition-colors duration-[120ms] hover:bg-[var(--ds-accent-hover)] active:bg-[var(--ds-accent-press)] focus-visible:shadow-[var(--ds-focus-ring)] disabled:opacity-40"
          >
            <ArrowUp className="size-4" />
          </button>
        </div>
      </div>
      {typing && (
        <div className="mt-2.5 flex min-w-0 flex-wrap items-center gap-1.5" aria-live="polite">
          <span className="mr-1 text-[12.5px] text-[var(--ds-muted)]">{matches.length ? "Start in this matter" : "No close match."}</span>
          {matches.map((l, i) => (
            <button
              key={l.id}
              type="button"
              onClick={() => start(l.id as LetterTypeId)}
              className={cn(
                "inline-flex h-7 max-w-full items-center truncate rounded-full border px-2.5 text-[12.5px] font-medium outline-none transition-colors duration-[120ms] focus-visible:shadow-[var(--ds-focus-ring)]",
                i === 0 ? "border-[var(--ds-line-strong)] bg-[var(--ds-surface)] text-[var(--ds-ink)]" : "border-[var(--ds-line)] text-[var(--ds-body)] hover:bg-[var(--ds-surface-2)]"
              )}
            >
              {l.shortTitle}
            </button>
          ))}
          {matches.length === 0 && (
            <Link to={`${prefix}/new`} className="text-[12.5px] font-medium text-[var(--ds-ink)] underline-offset-2 hover:underline">
              Browse all letter types
            </Link>
          )}
        </div>
      )}
    </div>
  );
}

const ASK_BTN =
  "inline-flex h-8 items-center gap-1.5 rounded-[8px] px-2 text-[13.5px] text-[var(--ds-muted)] outline-none transition-colors duration-[120ms] hover:bg-[var(--ds-surface-2)] hover:text-[var(--ds-ink)] active:bg-[var(--ds-surface-3)] focus-visible:shadow-[var(--ds-focus-ring)]";

/* ─── Letter tiles ───────────────────────────────────────────────────── */

function tileLine(r: LetterRowData): string {
  if (r.journey.stage === "sent" && r.sentAt) {
    return [`Sent ${format(r.sentAt, "d MMM")}`, r.formats[0]].filter(Boolean).join(" · ");
  }
  const what = r.journey.stage === "draft" ? "Drafting" : r.journey.stage === "review" ? "In review" : r.journey.stage === "approve" ? "Approval" : "Ready to send";
  return r.health != null ? `${what} · health ${r.health}` : what;
}

export function LetterTiles({ rows, onRemove }: { rows: LetterRowData[]; onRemove: (id: string) => void }) {
  const nav = useNavigate();
  return (
    <ul className="m-0 grid list-none grid-cols-2 gap-2.5 p-0 sm:gap-3.5 xl:grid-cols-3">
      {rows.map((r) => (
        <li key={r.id} className="group/tile relative min-w-0 rounded-[16px] border border-[var(--ds-line)] bg-[var(--ds-surface)] p-1.5 transition-colors duration-[120ms] hover:border-[var(--ds-line-strong)]">
          <PaperArt tint={r.tint} />
          <div className="px-2.5 pb-2.5 pt-3">
            <Link
              to={`/editor/${r.id}`}
              className="block truncate rounded-[4px] text-[14.5px] font-medium text-[var(--ds-ink)] outline-none after:absolute after:inset-0 after:rounded-[16px] focus-visible:after:shadow-[var(--ds-focus-ring)]"
            >
              {r.label}
            </Link>
            <div className="mt-[3px] truncate text-[13px] text-[var(--ds-muted)]">{tileLine(r)}</div>
            <div className="mt-2.5 flex items-center justify-between gap-2">
              <StatusPill tone={listStatusPill(r.journey).tone}>{listStatusPill(r.journey).label}</StatusPill>
              <span className="relative z-[1]">
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <button
                      type="button"
                      aria-label={`Actions for ${r.label}`}
                      className="grid size-7 place-items-center rounded-[8px] text-[var(--ds-faint)] outline-none transition-colors duration-[120ms] hover:bg-[var(--ds-surface-3)] hover:text-[var(--ds-ink)] focus-visible:shadow-[var(--ds-focus-ring)] data-[state=open]:bg-[var(--ds-surface-3)]"
                    >
                      <MoreHorizontal className="size-4" />
                    </button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent collisionPadding={16} align="end" className={cn("w-52", MENU_MOTION)}>
                    <DropdownMenuItem onSelect={() => nav(`/editor/${r.id}`)}>
                      <ArrowUpRight />
                      Open
                    </DropdownMenuItem>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem onSelect={() => onRemove(r.id)}>
                      <FolderMinus />
                      Remove from matter
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </span>
            </div>
          </div>
        </li>
      ))}
    </ul>
  );
}

/* ─── Evidence ───────────────────────────────────────────────────────── */

export type EvidenceRow = { item: EvidenceItem; draft: Draft; label: string };

export function evidenceRows(drafts: Draft[]): EvidenceRow[] {
  return drafts
    .flatMap((d) =>
      (d.evidence ?? []).map((item) => {
        const mode = displayModeOf(item);
        const label =
          mode === "figure" ? figureLabelFor(item, d.evidence ?? []) : mode === "inline" ? "In text" : mode === "attached" ? "Attached" : "Not used";
        return { item, draft: d, label };
      })
    )
    .sort((a, b) => b.item.uploadedAt - a.item.uploadedAt);
}

const KIND_ICON = {
  document: FileText,
  email: Mail,
  screenshot: ImageIcon,
  note: StickyNote,
  calendar: CalendarDays,
} as const;

export function evidenceName(item: EvidenceItem): string {
  return item.filename?.trim() || item.parsedSummary?.trim().slice(0, 60) || item.content.trim().slice(0, 60) || "Untitled evidence";
}

export function EvidenceList({ rows, detailed }: { rows: EvidenceRow[]; detailed?: boolean }) {
  return (
    <ul className="m-0 list-none p-0">
      {rows.map(({ item, draft, label }) => {
        const Icon = KIND_ICON[item.kind] ?? FileText;
        return (
          <li key={`${draft.id}-${item.id}`} className="border-t border-[var(--ds-line-2)] first:border-t-0">
            <Link
              to={`/editor/${draft.id}/evidence`}
              className="-mx-2 flex min-h-[47px] items-center gap-3 rounded-[8px] px-2 py-2 outline-none transition-colors duration-[120ms] hover:bg-[var(--ds-hover)] focus-visible:shadow-[var(--ds-focus-ring)]"
            >
              <span className="grid size-[26px] shrink-0 place-items-center rounded-[8px] bg-[var(--ds-surface-2)] text-[var(--ds-muted)]">
                <Icon className="size-3.5" aria-hidden />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[13.5px] text-[var(--ds-ink)]">{evidenceName(item)}</span>
                {detailed && (
                  <span className="block truncate text-[12px] text-[var(--ds-subtle)]">
                    {letterLabel(draft)} · added {format(item.uploadedAt, "d MMM yyyy")}
                  </span>
                )}
              </span>
              <span className="shrink-0 text-[12px] text-[var(--ds-subtle)]">{label}</span>
            </Link>
          </li>
        );
      })}
    </ul>
  );
}

/* ─── Deadlines timeline ─────────────────────────────────────────────── */

export function DeadlineTimeline({ items, showNote = true }: { items: DeadlineItem[]; showNote?: boolean }) {
  const nextIdx = items.findIndex((i) => !i.done && i.kind !== "tribunal" && !!i.iso);
  const hasTribunal = items.some((i) => i.kind === "tribunal");
  return (
    <div>
      <ol className="relative m-0 list-none p-0 pb-1">
        {items.map((it, i) => {
          const law = it.kind === "tribunal";
          const now = i === nextIdx;
          const days = it.iso ? daysUntilDateOnly(it.iso) : undefined;
          return (
            <li key={it.id} className="relative flex gap-3 pb-3.5 last:pb-1">
              {i < items.length - 1 && <span aria-hidden className="absolute bottom-0 left-[5px] top-[18px] w-px bg-[var(--ds-line)]" />}
              <span
                aria-hidden
                className={cn(
                  "relative mt-[5px] size-[11px] shrink-0 rounded-full border-[1.5px]",
                  law
                    ? "border-[var(--ds-red-fg)] bg-[var(--ds-red-bg)]"
                    : it.done
                      ? "border-[var(--ds-ink)] bg-[var(--ds-ink)]"
                      : now
                        ? "border-[var(--ds-amber-dot)] bg-[var(--ds-amber-bg)] shadow-[0_0_0_3px_var(--ds-amber-soft)]"
                        : "border-[var(--ds-line-hover)] bg-[var(--ds-surface)]"
                )}
              />
              <div className="min-w-0 flex-1">
                <div className={cn("flex flex-wrap items-center gap-1.5 text-[14px]", it.done ? "text-[var(--ds-muted)]" : "text-[var(--ds-ink)]")}>
                  {it.title}
                  {it.law && <LawChip>{it.law}</LawChip>}
                </div>
                <div className="mt-[3px] flex flex-wrap items-center gap-x-1.5 gap-y-1 text-[12.5px] text-[var(--ds-muted)]">
                  <span>
                    {it.iso ? (law ? format(new Date(`${it.iso}T12:00:00`), "EEE d MMM yyyy") : shortDay(it.iso)) : null}
                    {it.time ? `, ${it.time}` : ""}
                    {it.iso && it.detail ? " · " : ""}
                    {it.detail}
                  </span>
                  {now && days !== undefined && days >= 0 && (
                    <Pill tone="amber">{days === 0 ? "Today" : `${days} ${days === 1 ? "day" : "days"} left`}</Pill>
                  )}
                </div>
                {it.note && <div className="mt-0.5 text-[12px] text-[var(--ds-subtle)]">{it.note}</div>}
              </div>
            </li>
          );
        })}
      </ol>
      {showNote && hasTribunal && (
        <p className="m-0 mb-3.5 mt-2.5 flex items-center gap-2 rounded-[9px] bg-[var(--ds-surface-2)] px-2.5 py-2 text-[12px] text-[var(--ds-muted)]">
          <Info aria-hidden className="size-3.5 shrink-0" />
          ACAS early conciliation pauses this clock.
        </p>
      )}
    </div>
  );
}

/* ─── History ────────────────────────────────────────────────────────── */

export type HistoryEntry = { id: string; ts: number; sentence: string; kind: string; detail?: string; letter: string; draftId: string };

const KIND_LABEL: Record<string, string> = {
  created: "Drafting",
  details_updated: "Details",
  sections_updated: "Drafting",
  section_generated: "Drafting",
  without_prejudice_updated: "Drafting",
  evidence_updated: "Evidence",
  comment_added: "Comment",
  comment_resolved: "Comment",
  comment_deleted: "Comment",
  collaborator_invited: "Team",
  collaborator_removed: "Team",
  collaborator_role_updated: "Team",
  ai_message: "DraftHR",
  ai_applied: "DraftHR",
  ai_cleared: "DraftHR",
  exported: "Export",
  counsel_review: "Review",
  review_submitted: "Approval",
  review_approved: "Approval",
  review_changes_requested: "Approval",
  review_withdrawn: "Approval",
};

export function historyEntries(drafts: Draft[]): HistoryEntry[] {
  const out: HistoryEntry[] = [];
  for (const d of drafts) {
    const letter = letterLabel(d);
    for (const ev of d.timeline ?? []) {
      out.push({
        id: `${d.id}-${ev.id}`,
        ts: ev.createdAt,
        sentence: timelineSentence(ev, letter),
        kind: KIND_LABEL[ev.kind] ?? "Update",
        detail: [ev.sectionTitle, ev.detail].filter(Boolean).join(": ") || undefined,
        letter,
        draftId: d.id,
      });
    }
  }
  return out.sort((a, b) => b.ts - a.ts);
}

export function shortAgo(ts: number): string {
  const s = Math.max(0, Math.floor((Date.now() - ts) / 1000));
  if (s < 60) return "now";
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h`;
  const d = Math.floor(h / 24);
  if (d < 7) return `${d}d`;
  const w = Math.floor(d / 7);
  if (w < 9) return `${w}w`;
  return format(ts, "d MMM");
}

export function HistoryList({ entries, detailed }: { entries: HistoryEntry[]; detailed?: boolean }) {
  return (
    <ol className="m-0 list-none p-0">
      {entries.map((e) => (
        <li key={e.id} className="flex gap-3 py-2.5">
          <MessageSquare aria-hidden className="mt-0.5 size-[15px] shrink-0 text-[var(--ds-subtle)]" />
          <div className="min-w-0 flex-1">
            <Link to={`/editor/${e.draftId}`} className="block rounded-[4px] text-[14px] text-[var(--ds-ink)] outline-none hover:underline hover:underline-offset-2 focus-visible:shadow-[var(--ds-focus-ring)]">
              {e.sentence}
            </Link>
            {detailed && e.detail && <div className="mt-0.5 text-[12.5px] text-[var(--ds-muted)]">{e.detail}</div>}
            <div className="mt-[3px] text-[12.5px] text-[var(--ds-subtle)]">
              {e.kind} · {shortAgo(e.ts)}
            </div>
          </div>
        </li>
      ))}
    </ol>
  );
}
