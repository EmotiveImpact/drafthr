import {
  CheckCircle2,
  CircleAlert,
  CircleDashed,
  ShieldCheck,
  Paperclip,
  CalendarClock,
  FileEdit,
  Users,
} from "lucide-react";

/**
 * Shared "All checks" list rendering used by the Health tab. Pulled out so the
 * tab body can compose it next to the score ring + Fix-this-first card while
 * keeping the row markup in one place.
 *
 * The check list comes from the page (it folds quality/compliance/evidence/
 * deadline/counsel/comments into one normalised array) — this component just
 * renders.
 */
export type CheckStatus = "ok" | "warn" | "missing";

export type RailCheckRow = {
  id: string;
  label: string;
  detail: string;
  status: CheckStatus;
  icon: React.ElementType;
  jumpTo?: () => void;
};

// Re-exported so the parent can build rows with any of these icons without
// adding a second lucide import block.
export const CheckIcons = {
  FileEdit,
  CheckCircle2,
  ShieldCheck,
  Paperclip,
  CalendarClock,
  Users,
};

export function AllChecks({ rows }: { rows: RailCheckRow[] }) {
  if (rows.length === 0) {
    return (
      <p className="text-[12px] text-[var(--ds-muted)] px-1">
        No checks to display.
      </p>
    );
  }
  return (
    <ul className="m-0 p-0 list-none space-y-2">
      {rows.map((row) => (
        <CheckRow key={row.id} row={row} />
      ))}
    </ul>
  );
}

function CheckRow({ row }: { row: RailCheckRow }) {
  const Icon = row.icon;
  return (
    <li className="flex items-start gap-2 p-3 rounded-md border border-[var(--ds-line)] bg-[var(--ds-surface)]">
      <span
        className={
          "shrink-0 mt-0.5 size-5 rounded-full grid place-items-center " +
          (row.status === "ok"
            ? "bg-[var(--ds-green-bg)] text-[var(--ds-green-fg)]"
            : row.status === "warn"
              ? "bg-[var(--ds-amber-bg)] text-[var(--ds-amber-fg)]"
              : "bg-[var(--ds-red-bg)] text-[var(--ds-red-fg)]")
        }
      >
        {row.status === "ok" ? (
          <CheckCircle2 className="size-3" />
        ) : row.status === "warn" ? (
          <CircleAlert className="size-3" />
        ) : (
          <CircleDashed className="size-3" />
        )}
      </span>
      <div className="flex-1 min-w-0">
        <div className="flex items-baseline gap-1.5">
          <Icon className="size-3 text-[var(--ds-muted)] shrink-0" />
          <h4 className="text-[12px] font-medium text-[var(--ds-ink)]">
            {row.label}
          </h4>
        </div>
        <p className="text-[11px] text-[var(--ds-body)] mt-0.5 leading-relaxed">
          {row.detail}
        </p>
        {row.jumpTo && (
          <button
            type="button"
            onClick={row.jumpTo}
            className="mt-1 text-[11px] text-[var(--ds-muted)] hover:text-[var(--ds-ink)] hover:underline"
          >
            Fix →
          </button>
        )}
      </div>
    </li>
  );
}
