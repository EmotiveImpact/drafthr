import type { ReactNode } from "react";
import {
  ArrowDownToLine,
  FileText,
  Gavel,
  Scale,
  ShieldCheck,
  Target,
} from "lucide-react";

type SmartRewriteAction = {
  id: string;
  label: string;
  hint: string;
  instruction: string;
  icon: ReactNode;
};

const ACTIONS: SmartRewriteAction[] = [
  {
    id: "tribunal-ready",
    label: "Tribunal-ready",
    hint: "Factual, anchored, no admissions",
    instruction:
      "Rewrite this section to be tribunal-ready: strictly factual, no exaggeration, no admissions, statutory anchors explicit where relevant, and reservation-of-rights wording preserved.",
    icon: <Gavel className="size-3.5" />,
  },
  {
    id: "make-firmer",
    label: "Make firmer",
    hint: "Clearer position, less hedging",
    instruction:
      "Rewrite this section in a firmer and more assertive register. Remove hedging, keep the tone professional, preserve every fact and citation, and do not introduce new allegations.",
    icon: <Target className="size-3.5" />,
  },
  {
    id: "make-neutral",
    label: "Make neutral",
    hint: "Cooler, lower-conflict wording",
    instruction:
      "Rewrite this section in a neutral, lower-conflict register. Keep the legal position intact, remove emotive phrasing, and preserve all dates, names, facts, and requested outcomes.",
    icon: <FileText className="size-3.5" />,
  },
  {
    id: "shorten",
    label: "Shorten",
    hint: "Cut about a third",
    instruction:
      "Shorten this section by about one third. Preserve all material facts, dates, statutory references, and required clauses. Cut repetition, throat-clearing, and non-essential adjectives.",
    icon: <ArrowDownToLine className="size-3.5" />,
  },
  {
    id: "add-legal-basis",
    label: "Add legal basis",
    hint: "Statute and policy anchors",
    instruction:
      "Add the relevant legal or policy basis to this section. Use only authorities that are appropriate to the draft jurisdiction and facts. If uncertain, use [TBD] rather than inventing a citation.",
    icon: <Scale className="size-3.5" />,
  },
  {
    id: "preserve-rights",
    label: "Preserve rights",
    hint: "No waiver, remedies reserved",
    instruction:
      "Add or tighten reservation-of-rights wording for this section. Preserve statutory, contractual, and common-law remedies, avoid waiver language, and keep the drafting proportionate.",
    icon: <ShieldCheck className="size-3.5" />,
  },
];

export function SmartRewriteMenu({
  disabled,
  onRun,
}: {
  disabled?: boolean;
  onRun: (instruction: string) => void;
}) {
  return (
    <div className="grid grid-cols-2 gap-1.5">
      {ACTIONS.map((action) => (
        <button
          key={action.id}
          type="button"
          disabled={disabled}
          onClick={() => onRun(action.instruction)}
          className="min-w-0 rounded-md border border-[var(--ds-line)] bg-[var(--ds-surface)] px-2.5 py-2 text-left transition hover:border-[var(--ds-ink)] hover:bg-[var(--ds-line-2)] disabled:pointer-events-none disabled:opacity-50"
        >
          <span className="flex items-center gap-1.5 text-[12px] font-medium text-[var(--ds-ink)]">
            <span className="shrink-0 text-[var(--ds-muted)]">{action.icon}</span>
            <span className="truncate">{action.label}</span>
          </span>
          <span className="mt-0.5 block truncate text-[10px] text-[var(--ds-muted)]">
            {action.hint}
          </span>
        </button>
      ))}
    </div>
  );
}
