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
 * Style note: an earlier iteration used an amber gradient background and
 * cream tint that read "highlighter pen" rather than "do this next." This
 * version is a clean white card with a 2px amber top-stripe and a single
 * lightning glyph in the header — same signal, none of the noise.
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
      className="rounded-xl border border-[var(--ds-line)] bg-[var(--ds-surface)] overflow-hidden mt-3.5"
      style={{ borderTop: "2px solid var(--ds-amber-fg)" }}
    >
      <div className="flex items-center gap-2 px-5 py-3 border-b border-[var(--ds-line-2)]">
        <Zap
          className="size-4 text-[var(--ds-amber-fg)]"
          fill="currentColor"
          strokeWidth={1.5}
        />
        <h3 className="text-[14px] font-semibold m-0">Fix this first</h3>
        <span className="ml-auto text-[11px] text-[var(--ds-muted)]">
          Sorted by score impact
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
            "inline-flex items-center justify-center size-7 rounded-md shrink-0",
            iconCls,
          )}
        >
          <Icon className="size-3.5" strokeWidth={2.4} />
        </span>

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-[13px] font-semibold text-[var(--ds-ink)]">
              {fix.check.label}
            </span>
            <span className="inline-flex items-center text-[10px] font-semibold uppercase tracking-wider text-[var(--ds-muted)] bg-[var(--ds-line-2)] px-1.5 py-0.5 rounded">
              {fix.check.dimension}
            </span>
          </div>
          {fix.check.detail && (
            <div className="text-[12px] text-[var(--ds-muted)] mt-0.5 leading-snug">
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
            className="inline-flex items-center h-7 px-2 rounded-md bg-[var(--ds-green-bg)] text-[var(--ds-green-fg)] text-[11px] font-bold tabular-nums"
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
          className="inline-flex items-center gap-1.5 h-7 px-3 rounded-md bg-[var(--ds-ink)] text-white text-[12px] font-semibold hover:opacity-90 transition whitespace-nowrap"
        >
          {fix.check.actionLabel ?? "Fix"}
          <ArrowRight className="size-3.5" />
        </motion.button>
      </div>
    </motion.li>
  );
}
