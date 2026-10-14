/**
 * The letters table (f9-letters): tick box, the paper icon with the letter's
 * name and sub line, recipient, matter, where it is (stage bar and where
 * line), health, updated and owner with the row menu. Rows that need you are
 * tinted amber. On phones each letter folds into one stacked row.
 *
 * Used by the Letters page, the matter page's Letters tab and the employee
 * page's Letters tab.
 */
import type { MouseEvent, ReactNode } from "react";
import { Link, useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { ArrowUpRight, Folder, MoreHorizontal, Trash2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { useDraftStore } from "@/lib/store";
import { undeleteDraft } from "@/lib/dual-write";
import { StageBar } from "@/components/journey/ui/StageBar";
import { HealthRing } from "@/components/ds";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import type { LetterRowData } from "./rows";
import { updatedColumnLabel } from "./letterView";
import { Initials, MENU_MOTION, PaperIcon, TickBox } from "./parts";

export type LetterColumn = "select" | "recipient" | "matter" | "where" | "health" | "updated" | "owner";

export type Selection = {
  selected: ReadonlySet<string>;
  toggle: (id: string, on: boolean) => void;
  toggleAll: (on: boolean) => void;
};

/**
 * Column shares of the full table. "Where it is" is wide enough for the
 * longest where lines ("Review · ready to send for review", "Approve · ready
 * to send for approval") on one line at 1440, so every row is the same
 * height (LISTS-X22); the letter column takes whatever is left.
 */
const SHARE: Partial<Record<LetterColumn, number>> = {
  recipient: 14,
  matter: 12,
  where: 22.5,
  health: 10,
  updated: 9,
};
/** The letter column's share of the full table (it is left to fill the rest). */
const LETTER_SHARE = 21;
const FIXED: Partial<Record<LetterColumn, string>> = { select: "40px", owner: "82px" };

/**
 * Widths for the columns a table shows. A table without some columns (the
 * employee page has no Recipient, the matter page no Matter) spreads their
 * share over the columns it keeps, so the row still runs to the menu
 * instead of leaving a gap before it (LISTS-X24).
 */
function columnWidths(order: (LetterColumn | "letter")[]): Record<string, string | undefined> {
  const kept = order.filter((c): c is LetterColumn => c !== "letter" && SHARE[c as LetterColumn] != null);
  const full = LETTER_SHARE + Object.values(SHARE).reduce((a, b) => a + (b ?? 0), 0);
  const present = LETTER_SHARE + kept.reduce((a, c) => a + (SHARE[c] ?? 0), 0);
  const scale = full / present;
  const out: Record<string, string | undefined> = {};
  for (const c of order) {
    if (c === "letter") out[c] = undefined;
    else if (FIXED[c]) out[c] = FIXED[c];
    else if (SHARE[c] != null) out[c] = `${+((SHARE[c] ?? 0) * scale).toFixed(2)}%`;
  }
  return out;
}

const HEAD: Record<LetterColumn | "letter", string> = {
  select: "",
  letter: "Letter",
  recipient: "Recipient",
  matter: "Matter",
  where: "Where it is",
  health: "Health",
  updated: "Updated",
  owner: "Owner",
};

/** Lets StageBar's where line wrap in a narrow column (its label is the last child). */
const WHERE_WRAP = "[&>div:last-child]:whitespace-normal [&>div:last-child]:break-words";

/** "/ 100" in the muted grey, which keeps 4.5:1 on the amber needs-you tint. */
const OUT_OF_MUTED = "[&>span]:text-[var(--ds-muted)]";

/** Clicks on these never open the row's letter. */
const INTERACTIVE = "a,button,input,textarea,select,[role=menuitem],[data-tick],[data-radix-popper-content-wrapper]";

export function LettersTable({
  rows,
  selection,
  columns = ["select", "recipient", "matter", "where", "health", "updated", "owner"],
  dateColumn = "updated",
  menuExtra,
  className,
  ariaLabel = "Letters",
}: {
  rows: LetterRowData[];
  selection?: Selection;
  columns?: LetterColumn[];
  /** "sent" shows when each letter was sent, under a "Sent" heading. */
  dateColumn?: "updated" | "sent";
  /** Extra items in each row's menu (Remove from matter, Restore). */
  menuExtra?: (row: LetterRowData) => ReactNode;
  className?: string;
  ariaLabel?: string;
}) {
  const nav = useNavigate();
  const cols = columns.filter((c) => c !== "select" || !!selection);
  const now = Date.now();
  const ticked = selection ? rows.filter((r) => selection.selected.has(r.id)).length : 0;
  const allState: boolean | "mixed" = ticked === 0 ? false : ticked === rows.length ? true : "mixed";

  const openRow = (e: MouseEvent, id: string) => {
    if ((e.target as HTMLElement).closest(INTERACTIVE)) return;
    if (window.getSelection()?.toString()) return;
    nav(`/editor/${id}`);
  };

  const dateFor = (r: LetterRowData) => updatedColumnLabel(dateColumn === "sent" ? (r.sentAt ?? r.updatedAt) : r.updatedAt, now);
  const order: (LetterColumn | "letter")[] = cols.includes("select") ? ["select", "letter", ...cols.filter((c) => c !== "select")] : ["letter", ...cols];
  const widths = columnWidths(order);

  return (
    <div className={cn("min-w-0", className)}>
      {/* Desktop and tablet: the table. */}
      <table aria-label={ariaLabel} className="hidden w-full table-fixed border-separate border-spacing-0 md:table">
        <colgroup>
          {order.map((c) => (
            <col key={c} style={widths[c] ? { width: widths[c] } : undefined} />
          ))}
        </colgroup>
        <thead>
          <tr>
            {order.map((c) => (
              <th
                key={c}
                scope="col"
                className="whitespace-nowrap border-b border-[var(--ds-line)] px-3 pb-2.5 text-left text-[12.5px] font-medium text-[var(--ds-subtle)]"
              >
                {c === "select" && selection ? (
                  <TickBox checked={allState} onChange={(on) => selection.toggleAll(on)} label={allState === true ? "Clear selection on this page" : "Select every letter on this page"} />
                ) : c === "updated" && dateColumn === "sent" ? (
                  "Sent"
                ) : (
                  HEAD[c]
                )}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="animate-in fade-in-0 duration-200">
          {rows.map((r) => {
            const tint = r.journey.needsYou;
            const on = !!selection?.selected.has(r.id);
            return (
              <tr
                key={r.id}
                data-letter-id={r.id}
                data-tint={tint || undefined}
                data-selected={on || undefined}
                onClick={(e) => openRow(e, r.id)}
                className="group/row cursor-pointer"
              >
                {order.map((c, i) => (
                  <td
                    key={c}
                    className={cn(
                      "border-b px-3 py-3.5 align-middle transition-colors duration-[120ms]",
                      tint
                        ? "border-transparent bg-[var(--ds-amber-row)] group-hover/row:bg-[var(--ds-amber-row-hover)]"
                        : "border-[var(--ds-line-2)] group-hover/row:bg-[var(--ds-hover)] group-data-[selected]/row:bg-[var(--ds-surface-2)]",
                      i === 0 && "rounded-l-[14px]",
                      i === order.length - 1 && "rounded-r-[14px]",
                      c === "owner" && "pr-1.5"
                    )}
                  >
                    <Cell c={c} r={r} on={on} selection={selection} date={dateFor(r)} menuExtra={menuExtra} />
                  </td>
                ))}
              </tr>
            );
          })}
        </tbody>
      </table>

      {/* Phones: one stacked row per letter. */}
      <ul aria-label={ariaLabel} className="m-0 flex list-none flex-col gap-1 p-0 md:hidden">
        {rows.map((r) => {
          const tint = r.journey.needsYou;
          const on = !!selection?.selected.has(r.id);
          return (
            <li
              key={r.id}
              data-letter-id={r.id}
              data-tint={tint || undefined}
              onClick={(e) => openRow(e, r.id)}
              className={cn(
                "flex cursor-pointer items-start gap-2.5 rounded-[14px] px-3 py-3 transition-colors duration-[120ms]",
                tint ? "bg-[var(--ds-amber-row)] active:bg-[var(--ds-amber-row-hover)]" : on ? "bg-[var(--ds-surface-2)]" : "active:bg-[var(--ds-hover)]"
              )}
            >
              {selection && (
                <span className="flex h-[44px] items-center">
                  <TickBox checked={on} onChange={(v) => selection.toggle(r.id, v)} label={`Select ${r.label}`} />
                </span>
              )}
              <PaperIcon tint={r.tint} />
              <div className="min-w-0 flex-1">
                {/* Name and health on the first line, so the stage bar and
                    its where line get the whole width below (one line even
                    for "Review · ready to send for review", LISTS-X22). */}
                <div className="flex min-w-0 items-center justify-between gap-2.5">
                  <Link to={`/editor/${r.id}`} className="block min-w-0 truncate rounded-[4px] text-[14px] font-medium text-[var(--ds-ink)] outline-none focus-visible:shadow-[var(--ds-focus-ring)]">
                    {r.label}
                  </Link>
                  {r.health != null ? (
                    <HealthRing score={r.health} size={20} stroke={2} showOutOf={false} label={`Health ${r.health} of 100`} className="shrink-0 whitespace-nowrap text-[12.5px]" />
                  ) : (
                    <span className="shrink-0 text-[12px] text-[var(--ds-muted)]">No score</span>
                  )}
                </div>
                <div className="mt-0.5 truncate text-[12.5px] text-[var(--ds-muted)]">
                  {[r.recipient, r.subLine].filter(Boolean).join(" · ")}
                </div>
                <StageBar stage={r.journey.stage} tone={r.journey.listTone} label={r.journey.whereLabel} className={cn("mt-2 min-w-0", WHERE_WRAP)} />
              </div>
              <LetterRowMenu row={r} extra={menuExtra?.(r)} />
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function Cell({
  c,
  r,
  on,
  selection,
  date,
  menuExtra,
}: {
  c: LetterColumn | "letter";
  r: LetterRowData;
  on: boolean;
  selection?: Selection;
  date: string;
  menuExtra?: (row: LetterRowData) => ReactNode;
}) {
  switch (c) {
    case "select":
      return selection ? <TickBox checked={on} onChange={(v) => selection.toggle(r.id, v)} label={`Select ${r.label}`} /> : null;
    case "letter":
      return (
        <div className="flex min-w-0 items-center gap-3">
          <PaperIcon tint={r.tint} />
          <div className="min-w-0">
            <Link
              to={`/editor/${r.id}`}
              title={r.label}
              className="block truncate rounded-[4px] text-[14px] font-medium leading-[1.35] text-[var(--ds-ink)] outline-none focus-visible:shadow-[var(--ds-focus-ring)]"
            >
              {r.label}
            </Link>
            {/* One line, like the mock: the full text is in the tooltip. Only the where line wraps. */}
            <div className="mt-px truncate text-[12.5px] text-[var(--ds-muted)]" title={r.subLine}>
              {r.subLine}
            </div>
          </div>
        </div>
      );
    case "recipient":
      return r.recipient ? (
        <div className="flex min-w-0 items-center gap-2.5">
          <Initials name={r.recipient.replace(/^to /, "")} size={28} ring={r.journey.needsYou} />
          <div className="min-w-0">
            <div className="truncate text-[14px] leading-[1.35] text-[var(--ds-ink)]" title={r.recipient}>{r.recipient}</div>
            {r.recipientRole && <div className="truncate text-[12.5px] text-[var(--ds-muted)]" title={r.recipientRole}>{r.recipientRole}</div>}
          </div>
        </div>
      ) : (
        <span className="text-[13.5px] text-[var(--ds-muted)]">No recipient</span>
      );
    case "matter":
      return r.matter ? (
        <Link
          to={`/matters/${r.matter.id}`}
          className="inline-flex max-w-full items-center gap-2 rounded-[4px] text-[13.5px] text-[var(--ds-body)] outline-none hover:text-[var(--ds-ink)] hover:underline hover:underline-offset-2 focus-visible:shadow-[var(--ds-focus-ring)]"
        >
          <Folder aria-hidden className="size-3.5 shrink-0 text-[var(--ds-subtle)]" />
          <span className="truncate" title={r.matter.name}>{r.matter.name}</span>
        </Link>
      ) : (
        <span className="text-[13.5px] text-[var(--ds-muted)]">No matter</span>
      );
    case "where":
      // The where line is the row's key status: let it wrap instead of
      // ending in an ellipsis ("Review · with Claire Booth").
      return <StageBar stage={r.journey.stage} tone={r.journey.listTone} label={r.journey.whereLabel} className={WHERE_WRAP} />;
    case "health":
      return r.health != null ? (
        <HealthRing score={r.health} label={`Health ${r.health} of 100`} className={cn("whitespace-nowrap text-[13.5px]", OUT_OF_MUTED)} />
      ) : (
        <span className="text-[13px] text-[var(--ds-muted)]">No score</span>
      );
    case "updated":
      return <span className="whitespace-nowrap text-[13.5px] text-[var(--ds-muted)]">{date}</span>;
    case "owner":
      return (
        <div className="flex items-center justify-between gap-1">
          <span title={`Owner: ${r.owner.name}`} className="inline-flex">
            <Initials name={r.owner.name} seed={r.owner.seed} size={26} ring={r.journey.needsYou} />
            <span className="sr-only">Owner: {r.owner.name}</span>
          </span>
          <LetterRowMenu row={r} extra={menuExtra?.(r)} />
        </div>
      );
  }
}

/** Open, any extra items, then Delete with a six second undo. */
export function LetterRowMenu({ row, extra }: { row: LetterRowData; extra?: ReactNode }) {
  const nav = useNavigate();
  const deleteDraft = useDraftStore((s) => s.deleteDraft);
  const href = `/editor/${row.id}`;
  const label = row.label;

  const onDelete = () => {
    // Keep the whole draft so Undo restores it exactly; undeleteDraft clears
    // the tombstone so the server copy comes back too.
    const snapshot = useDraftStore.getState().drafts[row.id] ?? row.draft;
    deleteDraft(snapshot.id);
    toast(`Deleted "${label}"`, {
      duration: 6000,
      action: {
        label: "Undo",
        onClick: () => {
          useDraftStore.setState((s) => ({ drafts: { ...s.drafts, [snapshot.id]: snapshot } }));
          undeleteDraft(snapshot.id);
        },
      },
    });
  };

  return (
    <span className="contents" onClick={(e) => e.stopPropagation()}>
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          aria-label={`Actions for ${label}`}
          className="grid size-7 shrink-0 place-items-center rounded-[8px] text-[var(--ds-faint)] outline-none transition-colors duration-[120ms] hover:bg-[var(--ds-surface-3)] hover:text-[var(--ds-ink)] focus-visible:shadow-[var(--ds-focus-ring)] active:bg-[var(--ds-line)] data-[state=open]:bg-[var(--ds-surface-3)] data-[state=open]:text-[var(--ds-ink)]"
        >
          <MoreHorizontal className="size-4" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent collisionPadding={16} align="end" className={cn("w-52", MENU_MOTION)}>
        <DropdownMenuItem onSelect={() => nav(href)}>
          <ArrowUpRight />
          Open
        </DropdownMenuItem>
        {extra}
        <DropdownMenuSeparator />
        <DropdownMenuItem variant="destructive" onSelect={onDelete}>
          <Trash2 />
          Delete
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
    </span>
  );
}
