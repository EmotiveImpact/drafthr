import { motion } from "framer-motion";
import { Zap, FileText } from "lucide-react";
import type { Matter, Task } from "@/lib/letters/types";
import { daysUntilDateOnly, formatDateOnly } from "@/lib/date-only";
import { Button } from "@/components/ui/button";

/**
 * Next-action banner: distilled "what needs doing next".
 *
 * Resolution rules:
 *   1. If matter.nextAction is set, use that as the headline.
 *   2. Else use the soonest-due open task's label.
 *   3. Else render nothing.
 */
export function NextActionBanner({
  matter,
  tasks,
  onGenerate,
}: {
  matter: Matter;
  tasks: Task[];
  onGenerate?: () => void;
}) {
  const soonestOpenTask = tasks
    .filter((t) => t.status === "open" && t.dueISO)
    .sort((a, b) => (a.dueISO ?? "").localeCompare(b.dueISO ?? ""))[0];

  const label = matter.nextAction ?? soonestOpenTask?.label;
  // The deadline must describe the SAME item as the headline. When
  // matter.nextAction supplies the headline, the soonest task's due date
  // belongs to a different item — showing it would caption the next-action
  // text with an unrelated countdown. Only surface a due date when the
  // headline itself came from that task.
  const dueISO = matter.nextAction ? undefined : soonestOpenTask?.dueISO;

  if (!label) return null;

  const days = dueISO ? daysUntilDateOnly(dueISO) : undefined;
  const dueText =
    days === undefined
      ? undefined
      : days < 0
      ? `Overdue by ${Math.abs(days)} day${Math.abs(days) === 1 ? "" : "s"}`
      : days === 0
      ? "Due today"
      : `Due in ${days} day${days === 1 ? "" : "s"}`;

  const urgent = days !== undefined && days <= 3;

  return (
    <motion.div
      initial={{ opacity: 0, y: -4 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25, ease: "easeOut" }}
      className={
        "mb-6 flex flex-wrap items-center gap-3 rounded-[var(--ds-r-l)] p-4 sm:flex-nowrap " +
        (urgent ? "bg-[var(--ds-red-bg)]" : "bg-[var(--ds-amber-bg)]")
      }
    >
      <div
        className={
          "grid size-9 shrink-0 place-items-center rounded-[var(--ds-r-m)] bg-[var(--ds-surface)] " +
          (urgent ? "text-[var(--ds-red-fg)]" : "text-[var(--ds-amber-fg)]")
        }
      >
        <Zap className="size-4" />
      </div>
      <div className="min-w-0 flex-1">
        <div className="text-[12px] font-medium text-[var(--ds-muted)]">Next action</div>
        <div className="mt-0.5 text-[14.5px] font-semibold text-[var(--ds-ink)] [overflow-wrap:anywhere]">
          {label}
        </div>
        {dueText && (
          <div
            className={
              "mt-0.5 text-[12.5px] " +
              (urgent ? "text-[var(--ds-red-fg)]" : "text-[var(--ds-muted)]")
            }
          >
            {dueText}
            {dueISO && (
              <span className="text-[var(--ds-muted)]">
                , {formatDateOnly(dueISO, { dateStyle: "medium" }, "en-GB")}
              </span>
            )}
          </div>
        )}
      </div>
      {onGenerate && (
        <Button variant="outline" size="sm" onClick={onGenerate} className="shrink-0 bg-[var(--ds-surface)]">
          <FileText className="size-3.5" />
          <span className="hidden sm:inline">Generate from template</span>
          <span className="sm:hidden">Generate</span>
        </Button>
      )}
    </motion.div>
  );
}
