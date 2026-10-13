import { Check, Eye, PenLine, Send, Stamp, type LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { JOURNEY_STEPS, stageIndex, type JourneyStage, type StageTone } from "@/lib/journey/stage";

const ICONS: Record<string, LucideIcon> = { draft: PenLine, review: Eye, approve: Stamp, send: Send };

/**
 * The four-step tracker at the top of the letter's Progress panel (mocks f1
 * to f8): Draft, Review ("optional"), Approve, Send. Done steps are green
 * ticks joined by a green line; the current step is black when it is yours,
 * amber when it needs you and lilac when someone else has it. "sent" shows
 * every step done. `steps` renames a step for this letter (an employee's own
 * letter has "Sign off" for Approve: journeyStepsFor).
 */
export function StageTracker({
  stage,
  tone,
  steps = JOURNEY_STEPS,
  className,
}: {
  stage: JourneyStage;
  tone: StageTone;
  steps?: typeof JOURNEY_STEPS;
  className?: string;
}) {
  const cur = stageIndex(stage);
  return (
    <ol
      aria-label="Letter progress"
      data-slot="stage-tracker"
      className={cn("m-0 grid list-none grid-cols-4 p-0", className)}
    >
      {steps.map((step, i) => {
        const state = i < cur ? "done" : i === cur ? (tone === "done" ? "done" : tone) : "todo";
        const Icon = ICONS[step.stage];
        const current = i === cur;
        return (
          <li
            key={step.stage}
            data-state={state}
            aria-current={current ? "step" : undefined}
            className="relative flex flex-col items-center gap-1.5 text-[12.5px] text-[var(--ds-subtle)]"
          >
            {i < steps.length - 1 && (
              <span
                aria-hidden
                className={cn(
                  "absolute top-[13px] left-[calc(50%+17px)] right-[calc(-50%+17px)] h-[1.5px] rounded-[2px]",
                  i < cur ? "bg-[var(--ds-green-solid)]" : "bg-[var(--ds-line-strong)]"
                )}
              />
            )}
            <span
              aria-hidden
              className={cn(
                "relative z-[1] grid size-7 place-items-center rounded-full border-[1.5px]",
                state === "done" && "border-[var(--ds-green-solid)] bg-[var(--ds-green-solid)] text-white",
                state === "yours" && "border-[var(--ds-ink)] bg-[var(--ds-ink)] text-white",
                state === "needs-you" &&
                  "border-[var(--ds-amber-ring)] bg-[var(--ds-amber-bg)] text-[var(--ds-amber-fg)] shadow-[0_0_0_4px_color-mix(in_srgb,var(--ds-amber-ring)_18%,transparent)]",
                state === "away" &&
                  "border-[var(--ds-lilac-ring)] bg-[var(--ds-lilac-bg)] text-[var(--ds-lilac-fg)] shadow-[0_0_0_4px_color-mix(in_srgb,var(--ds-lilac-fg)_12%,transparent)]",
                state === "todo" && "border-[var(--ds-line-strong)] bg-[var(--ds-surface)] text-[var(--ds-subtle)]"
              )}
            >
              {state === "done" ? <Check className="size-3" strokeWidth={2.6} /> : <Icon className="size-[13px]" strokeWidth={1.8} />}
            </span>
            <span
              className={cn(
                "flex flex-col items-center leading-[1.2]",
                current && state !== "done" && "font-medium text-[var(--ds-ink)]",
                state === "done" && "text-[var(--ds-muted)]"
              )}
            >
              {step.label}
              {step.optional && (
                <em className="text-[10.5px] font-normal not-italic text-[var(--ds-subtle)]">optional</em>
              )}
              <span className="sr-only">
                {state === "done"
                  ? ", done"
                  : state === "needs-you"
                    ? ", needs you"
                    : state === "away"
                      ? ", with someone else"
                      : current
                        ? ", current step"
                        : ""}
              </span>
            </span>
          </li>
        );
      })}
    </ol>
  );
}
