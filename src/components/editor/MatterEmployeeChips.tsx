import { Link } from "react-router-dom";
import { ChevronRight, FolderOpen, UserRound } from "lucide-react";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { useDraftStore } from "@/lib/store";
import { MATTER_COLOR_CLASSES } from "@/lib/matters";
import type { Draft } from "@/lib/letters/types";

/**
 * Renders the matter breadcrumb chip + employee profile chip above the
 * editor canvas title. Both are no-ops when the underlying records are
 * missing, so this is safe to drop in unconditionally.
 *
 * - Matter chip: colour-dot + name, links to /matters/<id>. md:+ only.
 * - Employee chip: legalName badge, opens a popover with profile +
 *   "View profile" link → /employees/<id>.
 */
export function MatterEmployeeChips({ draft }: { draft: Draft }) {
  const matter = useDraftStore((s) =>
    draft.matterId ? s.matters[draft.matterId] : undefined
  );
  const linkedEmployeeId = (draft.answers as Record<string, unknown>)
    .linkedEmployeeId as string | undefined;
  const employee = useDraftStore((s) =>
    linkedEmployeeId ? s.employees[linkedEmployeeId] : undefined
  );

  if (!matter && !employee) return null;

  return (
    <div className="flex flex-wrap items-center gap-1.5 text-[12px]">
      {matter && (
        <Link
          to={`/matters/${matter.id}`}
          className="hidden md:inline-flex items-center gap-1.5 px-2 h-6 rounded-full border border-[var(--ds-line)] bg-[var(--ds-surface)] hover:bg-[var(--ds-line-2)] transition text-[var(--ds-body)]"
          title={`Matter: ${matter.name}`}
        >
          <span
            className={
              "size-2 rounded-full shrink-0 " +
              MATTER_COLOR_CLASSES[matter.color].dot
            }
            aria-hidden
          />
          <FolderOpen className="size-3 text-[var(--ds-muted)]" />
          <span className="truncate max-w-[200px]">{matter.name}</span>
          <ChevronRight className="size-3 text-[var(--ds-muted)]" />
        </Link>
      )}
      {employee && (
        <Popover>
          <PopoverTrigger asChild>
            <button
              type="button"
              className="inline-flex items-center gap-1.5 px-2 h-6 rounded-full border border-[var(--ds-line)] bg-[var(--ds-surface)] hover:bg-[var(--ds-line-2)] transition text-[var(--ds-body)]"
              title={`Linked employee: ${employee.legalName}`}
            >
              <UserRound className="size-3 text-[var(--ds-muted)]" />
              <span className="truncate max-w-[200px]">{employee.legalName}</span>
            </button>
          </PopoverTrigger>
          <PopoverContent align="start" className="w-72">
            <div className="space-y-2">
              <div className="flex items-start gap-3">
                <div className="size-9 rounded-full bg-[var(--ds-line-2)] grid place-items-center text-[var(--ds-muted)] shrink-0">
                  <UserRound className="size-4" />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="text-[13px] font-semibold text-[var(--ds-ink)] truncate">
                    {employee.legalName}
                  </div>
                  {employee.jobTitle && (
                    <div className="text-[11.5px] text-[var(--ds-muted)] truncate">
                      {[employee.jobTitle, employee.department]
                        .filter(Boolean)
                        .join(" · ")}
                    </div>
                  )}
                  {employee.email && (
                    <div className="text-[11.5px] text-[var(--ds-muted)] truncate">
                      {employee.email}
                    </div>
                  )}
                </div>
              </div>
              <div className="flex items-center gap-2 pt-1">
                <Link
                  to={`/employees/${employee.id}`}
                  className="inline-flex items-center gap-1 text-[12px] font-medium text-[var(--ds-ink)] hover:underline"
                >
                  View profile
                  <ChevronRight className="size-3" />
                </Link>
              </div>
            </div>
          </PopoverContent>
        </Popover>
      )}
    </div>
  );
}
