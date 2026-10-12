import { motion } from "framer-motion";
import { AlertTriangle, XCircle, Zap, ArrowRight } from "lucide-react";
import type { Fix } from "@/lib/finalize/healthChecks";
import { cn } from "@/lib/utils";

/**
 * "Fix this first" — the actionable bridge between the score and the editor.
 *
 * Shows the top N (default 3) ranked fixes sorted by score impact. Each row:
 *   [severity icon] [title + dimension chip · detail]  [+impact]  [Action btn]
 *
 * Style note: a clean white card on the stone tokens with a single amber
 * lightning glyph in the header, near-black action buttons (design 9A).
 *
 * Each action button is a real handler — the consumer owns routing because
 * only the page knows the current draftId. We just say "this check wants
 * the user to land in <route>" and let the consumer compose the URL.
 */
type Props = {
  fixes: Fix[];
  /** Called with the check's actionRoute when the user clicks its CTA. */
  onAction: (fix: Fix) => void;
};

export function FixThisFirst({ fixes, onAction }: Props) {
  if (fixes.length === 0) return null;

  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.28, delay: 0.08, ease: [0.32, 0.72, 0, 1] }}
      className="mt-3.5 overflow-hidden rounded-[var(--ds-r-m)] border border-[var(--ds-line)] bg-[var(--ds-surface)] shadow-[var(--ds-shadow-s)]"
    >
      <div className="flex items-center gap-1.5 px-4 py-2.5 border-b border-[var(--ds-line-2)]">
        <Zap
          className="size-3.5 text-[var(--ds-amber-dot)] shrink-0"
          fill="currentColor"
          strokeWidth={1.5}
        />
        <h3 className="m-0 truncate text-[13.5px] font-semibold text-[var(--ds-ink)]">Fix this first</h3>
        <span
          className="ml-auto shrink-0 whitespace-nowrap text-[11.5px] text-[var(--ds-muted)]"
          title="Sorted by predicted score impact"
        >
          By impact
        </span>
      </div>

      <ul className="m-0 p-0 list-none divide-y divide-[var(--ds-line-2)]">
        {fixes.map((fix, i) => (
          <FixRow key={fix.check.id} fix={fix} index={i} onAction={onAction} />
        ))}
      </ul>
    </motion.div>
  );
}

function FixRow({
  fix,
  index,
  onAction,
}: {
  fix: Fix;
  index: number;
  onAction: (fix: Fix) => void;
}) {
  const isFail = fix.check.severity === "fail";
  const Icon = isFail ? XCircle : AlertTriangle;
  const iconCls = isFail
    ? "bg-[var(--ds-red-bg)] text-[var(--ds-red-fg)]"
    : "bg-[var(--ds-amber-bg)] text-[var(--ds-amber-fg)]";

  return (
    <motion.li
      initial={{ opacity: 0, x: -3 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{
        duration: 0.22,
        delay: 0.15 + index * 0.06,
        ease: [0.32, 0.72, 0, 1],
      }}
      className="flex flex-col gap-2 px-4 sm:px-5 py-3"
    >
      {/* Severity icon + content row — title, chip, detail. */}
      <div className="flex items-start gap-3">
        <span
          className={cn(
            "inline-flex size-7 shrink-0 items-center justify-center rounded-[var(--ds-r-s)]",
            iconCls,
          )}
        >
          <Icon className="size-3.5" strokeWidth={2.4} />
        </span>

        <div className="flex-1 min-w-0">
          {/* Dimension chip dropped — severity icon colour (red = fail,
           * amber = warn) already conveys the gist, and at 300px sidebar
           * the chip pushed the title into ugly wrap territory. */}
          <span className="text-[13px] font-medium leading-tight text-[var(--ds-ink)]">
            {fix.check.label}
          </span>
          {fix.check.detail && (
            <div className="mt-0.5 text-[12px] leading-snug text-[var(--ds-muted)]">
              {fix.check.detail}
            </div>
          )}
        </div>
      </div>

      {/* Impact + CTA row below the description, indented to align past the
       * icon column. Stacks vertically so the layout works at 300px sidebar
       * widths without forcing the title/detail to wrap awkwardly. */}
      <div className="flex items-center justify-end gap-2 ml-10">
        {fix.impact > 0 && (
          <span
            className="ds-mono inline-flex h-7 items-center rounded-[var(--ds-r-s)] bg-[var(--ds-green-bg)] px-2 text-[11.5px] font-medium text-[var(--ds-green-fg)]"
            title={`Fixing this is predicted to add ${fix.impact} to the overall score`}
          >
            +{fix.impact}
          </span>
        )}

        <motion.button
          type="button"
          onClick={() => onAction(fix)}
          whileHover={{ scale: 1.02 }}
          whileTap={{ scale: 0.97 }}
          transition={{ duration: 0.12 }}
          className="inline-flex h-7 items-center gap-1.5 whitespace-nowrap rounded-[var(--ds-r-s)] bg-[var(--ds-accent)] px-3 text-[12px] font-medium text-[var(--ds-on-accent)] transition hover:bg-[var(--ds-accent-hover)]"
        >
          {fix.check.actionLabel ?? "Fix"}
          <ArrowRight className="size-3.5" />
        </motion.button>
      </div>
    </motion.li>
  );
}
