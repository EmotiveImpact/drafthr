/**
 * The shared look of the Reports drill-downs (/reports/checks/:id and
 * /reports/matters/:id): the page under the Reports band, a back link on
 * phones, and the Letters-list table header and row styles.
 */
import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import { ChevronLeft } from "lucide-react";
import { format } from "date-fns";

export function DrillShell({ children }: { children: ReactNode }) {
  return <div className="min-w-0">{children}</div>;
}

export function DrillBody({ children }: { children: ReactNode }) {
  return (
    <div className="px-4 pt-4 pb-12 md:px-12 md:pt-[26px]">
      <Link
        to="/reports"
        className="mb-3 inline-flex items-center gap-1 rounded-[6px] text-[13.5px] text-[var(--ds-muted)] transition-colors duration-[120ms] hover:text-[var(--ds-ink)] md:hidden"
      >
        <ChevronLeft className="size-4" aria-hidden />
        Reports
      </Link>
      {children}
    </div>
  );
}

export const DRILL_TH = "border-b border-[var(--ds-line)] px-4 pt-3.5 pb-2.5 text-left text-[12.5px] font-medium text-[var(--ds-subtle)]";
export const DRILL_ROW =
  "relative flex cursor-pointer flex-col gap-1 border-t border-[var(--ds-line-2)] px-4 py-3.5 transition-colors duration-[120ms] first:border-t-0 hover:bg-[var(--ds-hover)] active:bg-[var(--ds-surface-2)] focus:outline-none focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-[var(--ds-focus)] md:table-row md:p-0";

export function lastEdited(ts: number): string {
  return format(new Date(ts), "d MMM yyyy");
}

