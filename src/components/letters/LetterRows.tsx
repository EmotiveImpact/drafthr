/**
 * Compact letter rows for narrow lists (Home's recent letters): the paper
 * icon coloured by type, the name and sub line, the stage bar with the where
 * line, health and when it was last touched, and the row menu. Rows that
 * need you are tinted, as on the Letters page.
 *
 * Layout follows the container width, so the same list reads well in Home's
 * main column and on a phone.
 */
import type { MouseEvent } from "react";
import { Link, useNavigate } from "react-router-dom";
import { cn } from "@/lib/utils";
import type { Draft } from "@/lib/letters/types";
import { StageBar } from "@/components/journey/ui/StageBar";
import { HealthRing } from "@/components/ds";
import { useLetterRows } from "./rows";
import { updatedColumnLabel } from "./letterView";
import { PaperIcon } from "./parts";
import { LetterRowMenu } from "./LettersTable";

const GRID =
  "grid items-center gap-3 grid-cols-[40px_minmax(0,1fr)_28px] " +
  "@[600px]:grid-cols-[40px_minmax(0,1fr)_150px_96px_28px] " +
  "@[900px]:gap-4 @[900px]:grid-cols-[40px_minmax(0,1fr)_170px_110px_96px_28px]";

export function LetterRowsHeader() {
  return (
    <div
      aria-hidden
      className={cn(GRID, "hidden min-h-[30px] border-b border-[var(--ds-line)] px-3 text-[12.5px] font-medium text-[var(--ds-subtle)] @[600px]:grid")}
    >
      <span />
      <span>Letter</span>
      <span>Where it is</span>
      <span>Health</span>
      <span className="hidden @[900px]:block">Updated</span>
      <span />
    </div>
  );
}

export function LetterRows({
  drafts,
  showHeader = true,
  className,
}: {
  drafts: Draft[];
  /** Kept for callers; the viewer's approval rights are read from the profile. */
  viewerCanApprove?: boolean;
  showHeader?: boolean;
  className?: string;
}) {
  const nav = useNavigate();
  const rows = useLetterRows(drafts);
  const now = Date.now();
  const open = (e: MouseEvent, id: string) => {
    if ((e.target as HTMLElement).closest("a,button,[role=menuitem]")) return;
    nav(`/editor/${id}`);
  };
  return (
    <div className={cn("@container w-full min-w-0", className)}>
      {showHeader && <LetterRowsHeader />}
      <ul className="m-0 flex list-none flex-col gap-0.5 p-0 pt-1.5">
        {rows.map((r) => (
          <li
            key={r.id}
            data-letter-id={r.id}
            data-tint={r.journey.needsYou || undefined}
            onClick={(e) => open(e, r.id)}
            className={cn(
              GRID,
              "cursor-pointer rounded-[14px] px-3 py-3 transition-colors duration-[120ms]",
              r.journey.needsYou
                ? "bg-[var(--ds-amber-row)] hover:bg-[var(--ds-amber-row-hover)]"
                : "hover:bg-[var(--ds-hover)] active:bg-[var(--ds-surface-2)]"
            )}
          >
            <PaperIcon tint={r.tint} />
            <span className="min-w-0">
              <Link
                to={`/editor/${r.id}`}
                className="block truncate rounded-[4px] text-[14px] font-medium text-[var(--ds-ink)] outline-none focus-visible:shadow-[var(--ds-focus-ring)]"
              >
                {r.label}
              </Link>
              <span className="mt-px block truncate text-[12.5px] text-[var(--ds-muted)]">
                {[r.recipient, r.subLine].filter(Boolean).join(" · ")}
              </span>
              <span className="mt-1.5 flex items-center gap-2 @[600px]:hidden">
                <StageBar stage={r.journey.stage} tone={r.journey.listTone} label={r.journey.whereLabel} />
              </span>
            </span>
            <span className="hidden min-w-0 @[600px]:block">
              <StageBar stage={r.journey.stage} tone={r.journey.listTone} label={r.journey.whereLabel} />
            </span>
            <span className="hidden @[600px]:flex">
              {r.health != null ? (
                <HealthRing score={r.health} label={`Health ${r.health} of 100`} className="whitespace-nowrap" />
              ) : (
                <span className="text-[13px] text-[var(--ds-faint)]">No score</span>
              )}
            </span>
            <span className="hidden whitespace-nowrap text-[13.5px] text-[var(--ds-muted)] @[900px]:block">
              {updatedColumnLabel(r.updatedAt, now)}
            </span>
            <LetterRowMenu row={r} />
          </li>
        ))}
      </ul>
    </div>
  );
}

/** The drawn paper icon, kept under its old name for callers. */
export { PaperIcon as PaperThumb } from "./parts";
