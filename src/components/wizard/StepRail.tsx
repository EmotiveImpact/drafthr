import { useState, type ReactNode } from "react";
import { ChevronDown, ShieldAlert, ShieldCheck, Sparkles } from "lucide-react";
import { cn } from "@/lib/utils";
import type { TriageResult } from "./Triage";

export type RailStep = { id: string; title: string; summary?: string };

const TRIAGE_TITLE: Record<TriageResult["score"], string> = {
  strong: "Quick check passed",
  moderate: "Proceed, but pin down the gaps",
  weak: "Get advice first",
};

/**
 * The step column on the new letter page (mock `.steps`): "Step N of M" and
 * minutes left, a 4px progress bar, the quick check result, then the step
 * list (done steps ticked with a short summary, the current one outlined,
 * later ones grey) and a dashed last row for the drafting itself. Below
 * 1024px it folds into a strip with the current step and a list toggle.
 */
export function StepRail({
  letterTitle,
  steps,
  stepIndex,
  triage,
  minutesLeft,
  onJump,
  children,
}: {
  letterTitle: string;
  steps: RailStep[];
  /** -1 while the quick check is open. */
  stepIndex: number;
  triage?: { state: "now" | "done"; result?: TriageResult | null };
  minutesLeft: number;
  onJump: (index: number) => void;
  /** Extra blocks under the list (the profile prompt). */
  children?: ReactNode;
}) {
  const [openOnPhone, setOpenOnPhone] = useState(false);

  // Numbered rows: the letter type, the quick check (when it applies), then
  // every question step.
  const total = 1 + (triage ? 1 : 0) + steps.length;
  const current = triage?.state === "now" ? 2 : 1 + (triage ? 1 : 0) + stepIndex + 1;
  const done = current - 1;
  const currentTitle = triage?.state === "now" ? "Quick check before drafting" : steps[stepIndex]?.title ?? "";

  const header = (
    <>
      <div className="mb-2 flex justify-between gap-2 text-[12.5px] text-[var(--ds-subtle)]">
        <span>
          Step {current} of {total}
        </span>
        {minutesLeft >= 1 && <span>{minutesLeft} min left</span>}
      </div>
      <div
        role="progressbar"
        aria-label="Progress"
        aria-valuemin={0}
        aria-valuemax={total}
        aria-valuenow={done}
        className="h-1 overflow-hidden rounded-[4px] bg-[var(--ds-surface-3)]"
      >
        <span
          className="block h-full rounded-[4px] bg-[var(--ds-ink)] transition-[width] duration-500 ease-[var(--ds-ease)] motion-reduce:transition-none"
          style={{ width: `${(done / total) * 100}%` }}
        />
      </div>
    </>
  );

  const triageCard =
    triage?.state === "done" && triage.result ? <TriageCard result={triage.result} /> : null;

  const list = (
    <ol className="m-0 list-none p-0" aria-label="Steps">
      <Row n={1} state="done" title="Letter type" summary={letterTitle} />
      {triage && (
        <Row
          n={2}
          state={triage.state === "now" ? "now" : "done"}
          title="Quick check before drafting"
          summary={triage.state === "done" ? (triage.result ? TRIAGE_TITLE[triage.result.score] : "Skipped") : undefined}
        />
      )}
      {steps.map((s, i) => {
        const state = triage?.state === "now" ? "todo" : i < stepIndex ? "done" : i === stepIndex ? "now" : "todo";
        return (
          <Row
            key={s.id}
            n={1 + (triage ? 1 : 0) + i + 1}
            state={state}
            title={s.title}
            summary={state === "done" ? s.summary : undefined}
            onClick={state === "done" ? () => onJump(i) : undefined}
          />
        );
      })}
      <Row ghost state="todo" title="DraftHR drafts it" summary="Opens in the editor" last />
    </ol>
  );

  return (
    <>
      {/* Desktop column */}
      <nav aria-label="Letter steps" className="hidden lg:block">
        {header}
        <div className="mt-[22px]">
          {triageCard && <div className="mb-[22px]">{triageCard}</div>}
          {list}
        </div>
        {children}
      </nav>

      {/* Phone and tablet strip */}
      {/* On the grey fill the subtle grey is below 4.5:1, so small grey text
       * inside the strip uses the muted grey instead. */}
      <nav
        aria-label="Letter steps"
        className="rounded-[14px] bg-[var(--ds-surface-2)] px-4 py-3 [--ds-subtle:var(--ds-muted)] lg:hidden"
      >
        {header}
        <button
          type="button"
          aria-expanded={openOnPhone}
          onClick={() => setOpenOnPhone((o) => !o)}
          className="mt-2.5 flex min-h-9 w-full items-center justify-between gap-3 text-left"
        >
          <span className="min-w-0">
            <span className="block text-[12.5px] text-[var(--ds-subtle)]">Now</span>
            <span className="block truncate text-[14px] font-medium text-[var(--ds-ink)]">{currentTitle}</span>
          </span>
          <span className="inline-flex shrink-0 items-center gap-1 text-[13px] text-[var(--ds-muted)]">
            {openOnPhone ? "Hide steps" : "All steps"}
            <ChevronDown
              aria-hidden
              className={cn("size-4 transition-transform duration-[180ms] motion-reduce:transition-none", openOnPhone && "rotate-180")}
            />
          </span>
        </button>
        {openOnPhone && (
          <div className="mt-3 border-t border-[var(--ds-line)] pt-3">
            {triageCard && <div className="mb-3">{triageCard}</div>}
            {list}
          </div>
        )}
      </nav>
      <div className="lg:hidden">{children}</div>
    </>
  );
}

function Row({
  n,
  state,
  title,
  summary,
  onClick,
  ghost,
  last,
}: {
  n?: number;
  state: "done" | "now" | "todo";
  title: string;
  summary?: string;
  onClick?: () => void;
  ghost?: boolean;
  last?: boolean;
}) {
  const circle = (
    <span
      aria-hidden
      className={cn(
        "grid size-[23px] shrink-0 place-items-center rounded-full bg-[var(--ds-surface)] text-[11.5px] font-semibold transition-colors duration-300 motion-reduce:transition-none",
        ghost
          ? "border border-dashed border-[var(--ds-line-strong)] text-[var(--ds-subtle)]"
          : state === "done"
            ? "border border-[var(--ds-ink)] bg-[var(--ds-ink)] text-[var(--ds-on-accent)]"
            : state === "now"
              ? "border-[1.5px] border-[var(--ds-ink)] text-[var(--ds-ink)]"
              : "border border-[var(--ds-line)] text-[var(--ds-subtle)]"
      )}
    >
      {ghost ? (
        <Sparkles className="size-3" />
      ) : state === "done" ? (
        <svg viewBox="0 0 16 16" className="size-[13px]" fill="none">
          <path
            d="M3.5 8.5l3 3 6-7"
            stroke="currentColor"
            strokeWidth="2.2"
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeDasharray="16"
            strokeDashoffset="16"
            className="animate-[ds-draw_0.36s_ease-out_0.12s_forwards] motion-reduce:animate-none motion-reduce:[stroke-dashoffset:0]"
          />
        </svg>
      ) : (
        n
      )}
    </span>
  );
  const label = (
    <span className="min-w-0">
      <span
        className={cn(
          "block text-[14px] leading-[23px]",
          state === "done" ? "text-[var(--ds-ink)]" : state === "now" ? "font-medium text-[var(--ds-ink)]" : "text-[var(--ds-muted)]"
        )}
      >
        {title}
      </span>
      {summary && <span className="mt-px block truncate text-[12.5px] text-[var(--ds-subtle)]">{summary}</span>}
    </span>
  );
  return (
    <li
      aria-current={state === "now" ? "step" : undefined}
      className={cn(
        "relative flex gap-3 pb-5",
        !last &&
          "before:absolute before:bottom-0.5 before:left-[11px] before:top-[26px] before:w-px before:bg-[var(--ds-line)] before:content-['']"
      )}
    >
      {onClick ? (
        <button
          type="button"
          onClick={onClick}
          title={`Back to ${title}`}
          className="-m-1 flex min-w-0 gap-3 rounded-[8px] p-1 text-left transition-colors duration-[120ms] hover:bg-[var(--ds-hover)]"
        >
          {circle}
          {label}
        </button>
      ) : (
        <>
          {circle}
          {label}
        </>
      )}
    </li>
  );
}

const TRIAGE_TONE: Record<TriageResult["score"], string> = {
  strong: "bg-[var(--ds-green-soft)]",
  moderate: "bg-[var(--ds-amber-soft)]",
  weak: "bg-[var(--ds-amber-soft)]",
};

function TriageCard({ result }: { result: TriageResult }) {
  const Icon = result.score === "strong" ? ShieldCheck : ShieldAlert;
  return (
    <div className={cn("flex items-start gap-2.5 rounded-[12px] p-3", TRIAGE_TONE[result.score])}>
      <Icon
        aria-hidden
        className={cn(
          "mt-px size-4 shrink-0",
          result.score === "strong" ? "text-[var(--ds-green-fg)]" : "text-[var(--ds-amber-fg)]"
        )}
      />
      <div className="min-w-0">
        <div className="text-[13px] font-medium text-[var(--ds-ink)]">{TRIAGE_TITLE[result.score]}</div>
        <div className="mt-0.5 text-[12px] leading-[1.4] text-[var(--ds-muted)]">{result.summary}</div>
      </div>
    </div>
  );
}
