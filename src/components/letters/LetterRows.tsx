/**
 * Letter rows with paper thumbnails (design option 13B): a drawn page, the
 * title and recipient, a status pill, a health ring, when it was last touched
 * and the row's Open / Delete menu. Used by the Letters page and by Home.
 *
 * Layout is driven by container width, so the same list reads well in the
 * full Letters page, in Home's main column and on a phone.
 */
import { Link, useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { ArrowUpRight, MoreHorizontal, Trash2 } from "lucide-react";
import { cn } from "@/lib/utils";
import type { Draft } from "@/lib/letters/types";
import { useDraftStore } from "@/lib/store";
import { undeleteDraft } from "@/lib/dual-write";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  categoryLabel,
  letterHealth,
  letterIsLong,
  letterLabel,
  letterParty,
  letterStatus,
  tintForLetterType,
  tintStyle,
  updatedLabel,
  type StatusTone,
  type Tint,
} from "./letterView";

/* Column template per container width. The thumbnail and menu columns are
 * fixed; the letter column takes the rest. */
const GRID =
  "grid items-center gap-3 grid-cols-[40px_minmax(0,1fr)_28px] " +
  "@[600px]:grid-cols-[40px_minmax(0,1fr)_150px_64px_28px] " +
  "@[900px]:gap-4 @[900px]:grid-cols-[44px_minmax(0,1fr)_190px_120px_96px_28px]";

export function LetterRowsHeader() {
  return (
    <div
      aria-hidden
      className={cn(
        GRID,
        "hidden @[600px]:grid min-h-[30px] px-3.5 border-b border-[var(--ds-line)] text-[12px] text-[var(--ds-muted)]"
      )}
    >
      <span />
      <span>Letter</span>
      <span>Status</span>
      <span>Health</span>
      <span className="hidden @[900px]:block text-right">Updated</span>
      <span />
    </div>
  );
}

export function LetterRows({
  drafts,
  viewerCanApprove,
  showHeader = true,
  className,
}: {
  drafts: Draft[];
  viewerCanApprove: boolean;
  showHeader?: boolean;
  className?: string;
}) {
  return (
    <div className={cn("@container w-full min-w-0", className)}>
      {showHeader && <LetterRowsHeader />}
      <ul className="m-0 flex list-none flex-col p-0 pt-1.5">
        {drafts.map((d, i) => (
          <LetterRow key={d.id} draft={d} viewerCanApprove={viewerCanApprove} first={i === 0} />
        ))}
      </ul>
    </div>
  );
}

function LetterRow({
  draft: d,
  viewerCanApprove,
  first,
}: {
  draft: Draft;
  viewerCanApprove: boolean;
  first: boolean;
}) {
  const label = letterLabel(d);
  const party = letterParty(d);
  const cat = categoryLabel(d.letterType);
  const status = letterStatus(d, viewerCanApprove);
  const health = letterHealth(d);
  const attention = status.tone === "warn" && viewerCanApprove;
  const href = `/editor/${d.id}`;

  return (
    <li
      data-attn={attention || undefined}
      className={cn(
        GRID,
        "group/row relative min-h-[66px] rounded-[var(--ds-r-m)] px-3.5 py-[11px] transition-colors",
        "[--row-bg:var(--ds-surface)] data-[attn]:[--row-bg:var(--ds-amber-bg)]",
        "[&:not([data-attn]):hover]:[--row-bg:var(--ds-surface-2)] [&:not([data-attn]):focus-within]:[--row-bg:var(--ds-surface-2)]",
        "hover:bg-[var(--row-bg)] focus-within:bg-[var(--row-bg)] data-[attn]:bg-[var(--row-bg)]"
      )}
    >
      {/* Hairline between rows; it steps aside next to a filled row. */}
      {!first && (
        <span
          aria-hidden
          className="pointer-events-none absolute inset-x-3.5 top-0 border-t border-[var(--ds-line)] group-hover/row:border-transparent group-focus-within/row:border-transparent group-data-[attn]/row:border-transparent [li:hover+li>&]:border-transparent [li:focus-within+li>&]:border-transparent [li[data-attn]+li>&]:border-transparent"
        />
      )}
      <PaperThumb tint={tintForLetterType(d.letterType)} stacked={letterIsLong(d)} />

      <span className="flex min-w-0 flex-col gap-0.5">
        <Link
          to={href}
          className="truncate text-[14px] font-semibold text-[var(--ds-ink)] outline-none after:absolute after:inset-0 after:rounded-[var(--ds-r-m)] after:content-[''] focus-visible:after:ring-2 focus-visible:after:ring-[var(--ds-focus)]"
          title={`${label}, ${party}`}
        >
          {label}
        </Link>
        <span className="truncate text-[12.5px] text-[var(--ds-muted)]">
          {party}
          {cat ? `, ${cat}` : ""}
        </span>
        {/* Narrow rows fold the status into the meta line. */}
        <span className="@[600px]:hidden mt-0.5 inline-flex items-center gap-1.5 text-[12px] text-[var(--ds-muted)]">
          <span aria-hidden className="size-1.5 rounded-full" style={{ background: TONE[status.tone].dot }} />
          {status.label}
          <span className="text-[var(--ds-faint)]">·</span>
          {updatedLabel(d.updatedAt)}
        </span>
      </span>

      <span className="hidden @[600px]:flex min-w-0">
        <StatusPill status={status} />
      </span>

      <span className="hidden @[600px]:flex">
        <HealthRing score={health} />
      </span>

      <span className="hidden @[900px]:block whitespace-nowrap text-right text-[12.5px] text-[var(--ds-muted)]">
        {updatedLabel(d.updatedAt)}
      </span>

      <LetterRowMenu draft={d} label={label} />
    </li>
  );
}

/* ─── Pieces ─────────────────────────────────────────────────────────── */

const TONE: Record<StatusTone, { bg: string; fg: string; dot: string; ring?: string }> = {
  warn: { bg: "var(--ds-surface)", fg: "var(--ds-amber-fg)", dot: "var(--ds-amber-dot)", ring: "var(--ds-amber-dot)" },
  info: { bg: "var(--ds-blue-bg)", fg: "var(--ds-blue-fg)", dot: "var(--ds-blue-fg)" },
  neutral: { bg: "var(--ds-chip)", fg: "var(--ds-body)", dot: "var(--ds-faint)" },
  ok: { bg: "var(--ds-green-bg)", fg: "var(--ds-green-fg)", dot: "var(--ds-green-fg)" },
  danger: { bg: "var(--ds-red-bg)", fg: "var(--ds-red-fg)", dot: "var(--ds-red-fg)" },
};

export function StatusPill({ status }: { status: { label: string; tone: StatusTone } }) {
  const t = TONE[status.tone];
  return (
    <span
      className="inline-flex h-6 max-w-full items-center gap-1.5 truncate rounded-full px-[9px] text-[12px] font-medium whitespace-nowrap"
      style={{
        background: t.bg,
        color: t.fg,
        boxShadow: t.ring ? `inset 0 0 0 1px ${t.ring}` : undefined,
      }}
    >
      <span aria-hidden className="size-1.5 shrink-0 rounded-full" style={{ background: t.dot }} />
      <span className="truncate">{status.label}</span>
    </span>
  );
}

const RING_C = 2 * Math.PI * 10.5;

export function HealthRing({ score }: { score: number | null }) {
  if (score == null) {
    return <span className="whitespace-nowrap text-[12.5px] text-[var(--ds-faint)]">No score</span>;
  }
  const color =
    score < 50 ? "var(--ds-red-fg)" : score < 80 ? "var(--ds-amber-dot)" : "var(--ds-green-fg)";
  return (
    <span
      className="inline-flex items-center gap-[9px] whitespace-nowrap text-[12.5px] text-[var(--ds-muted)]"
      title={`Health ${score} of 100`}
    >
      <svg viewBox="0 0 26 26" className="size-[26px] shrink-0 -rotate-90" aria-hidden>
        <circle
          cx="13"
          cy="13"
          r="10.5"
          fill="none"
          strokeWidth="3"
          className="stroke-[var(--ds-line)] group-data-[attn]/row:stroke-[var(--ds-surface)]"
        />
        <circle
          cx="13"
          cy="13"
          r="10.5"
          fill="none"
          strokeWidth="3"
          strokeLinecap="round"
          stroke={color}
          strokeDasharray={`${((RING_C * score) / 100).toFixed(2)} ${RING_C.toFixed(2)}`}
        />
      </svg>
      <span>
        <span className="ds-mono text-[13px] font-medium text-[var(--ds-ink)]">{score}</span>
        <span className="hidden @[900px]:inline"> / 100</span>
        <span className="sr-only"> out of 100</span>
      </span>
    </span>
  );
}

/** Small drawn page with a dog-ear, stacked when the letter runs long. */
export function PaperThumb({ tint, stacked }: { tint: Tint; stacked?: boolean }) {
  return (
    <span aria-hidden className="relative ml-1 block h-10 w-8" style={tintStyle(tint)}>
      {stacked && (
        <span className="absolute inset-0 translate-x-1 -translate-y-[3px] rotate-[4deg] rounded-[2px] border border-[var(--ds-line-strong)] bg-[var(--ds-surface)]" />
      )}
      <span className="absolute inset-0 flex flex-col gap-[3px] overflow-hidden rounded-[2px] border border-[var(--ds-line-strong)] bg-[var(--ds-surface)] px-[5px] pt-[7px] shadow-[var(--ds-shadow-s)]">
        <span className="mb-px size-1.5 rounded-[1.5px] bg-[var(--tint-ink)]" />
        <span className="h-0.5 w-[70%] rounded-[1px] bg-[var(--ds-line-strong)]" />
        <span className="h-0.5 w-full rounded-[1px] bg-[var(--ds-line)]" />
        <span className="h-0.5 w-[84%] rounded-[1px] bg-[var(--ds-line)]" />
        <span className="h-0.5 w-[60%] rounded-[1px] bg-[var(--ds-line)]" />
        <span className="absolute -top-px -right-px size-[9px] rounded-bl-[2px] bg-[linear-gradient(225deg,var(--row-bg,var(--ds-surface))_50%,var(--ds-line)_50%)] shadow-[-1px_1px_0_var(--ds-line-strong)]" />
      </span>
    </span>
  );
}

/** Open / Delete (with a six second undo), the same actions as the sidebar. */
function LetterRowMenu({ draft, label }: { draft: Draft; label: string }) {
  const nav = useNavigate();
  const deleteDraft = useDraftStore((s) => s.deleteDraft);
  const href = `/editor/${draft.id}`;

  const onDelete = () => {
    // Capture the full draft before deleting so undo can restore it verbatim;
    // restoring re-triggers the dual-write subscription and undeleteDraft
    // clears the tombstone so the server copy comes back too.
    const snapshot = draft;
    deleteDraft(snapshot.id);
    toast(`Deleted "${label}"`, {
      duration: 6000,
      action: {
        label: "Undo",
        onClick: () => {
          useDraftStore.setState((s) => ({
            drafts: { ...s.drafts, [snapshot.id]: snapshot },
          }));
          undeleteDraft(snapshot.id);
        },
      },
    });
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          aria-label={`Actions for ${label}`}
          className="relative z-[1] grid size-7 place-items-center rounded-[var(--ds-r-s)] text-[var(--ds-muted)] transition hover:bg-[var(--ds-surface-3)] hover:text-[var(--ds-ink)] data-[state=open]:bg-[var(--ds-surface-3)] data-[state=open]:text-[var(--ds-ink)] [@media(hover:hover)]:opacity-0 [@media(hover:hover)]:group-hover/row:opacity-100 [@media(hover:hover)]:group-focus-within/row:opacity-100 [@media(hover:hover)]:data-[state=open]:opacity-100"
        >
          <MoreHorizontal className="size-4" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-44 rounded-md">
        <DropdownMenuItem onClick={() => nav(href)} className="gap-2">
          <ArrowUpRight className="size-4" />
          Open
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={onDelete} className="gap-2 text-destructive focus:text-destructive">
          <Trash2 className="size-4" />
          Delete
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
