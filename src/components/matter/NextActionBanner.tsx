import { motion } from "framer-motion";
import { Zap, FileText } from "lucide-react";
import type { Matter, Task } from "@/lib/letters/types";
import { daysUntilDateOnly, formatDateOnly } from "@/lib/date-only";
import { Button } from "@/components/ui/button";

/**
 * Next-action banner — distilled "what needs doing next".
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
      className="rounded-xl border border-[var(--ds-line)] bg-[var(--ds-surface)] p-4 mb-5 flex items-center gap-3 relative overflow-hidden"
    >
      <div
        aria-hidden
        className={
          "absolute left-0 top-0 bottom-0 w-[3px] " +
          (urgent ? "bg-[var(--ds-red-fg)]" : "bg-[var(--ds-amber-fg)]")
        }
      />
      <div className="size-9 rounded-lg grid place-items-center bg-[var(--ds-amber-bg)] text-[var(--ds-amber-fg)] shrink-0">
        <Zap className="size-4" />
      </div>
      <div className="flex-1 min-w-0">
        <div className="text-[10px] uppercase tracking-[0.08em] text-[var(--ds-muted)] font-semibold">
          Next action
        </div>
        <div className="text-[14px] font-medium text-[var(--ds-ink)] mt-0.5 truncate">
          {label}
        </div>
        {dueText && (
          <div
            className={
              "text-[11px] mt-0.5 " +
              (urgent ? "text-[var(--ds-red-fg)]" : "text-[var(--ds-muted)]")
            }
          >
            {dueText}
            {dueISO && (
              <span className="text-[var(--ds-muted)]">
                {" "}
                · {formatDateOnly(dueISO, { dateStyle: "medium" })}
              </span>
            )}
          </div>
        )}
      </div>
      {onGenerate && (
        <Button variant="outline" size="sm" onClick={onGenerate} className="shrink-0">
          <FileText className="size-3.5" />
          <span className="hidden sm:inline">Generate from template</span>
          <span className="sm:hidden">Generate</span>
        </Button>
      )}
    </motion.div>
  );
}
