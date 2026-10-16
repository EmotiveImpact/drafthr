import { cn } from "@/lib/utils";
import { stageIndex, type JourneyStage, type StageTone } from "@/lib/journey/stage";

/**
 * The small four-segment stage bar for list rows (mock f9, "Where it is"):
 * done segments green, the current one black (yours), amber (needs you) or
 * lilac (someone else has it), the rest grey. With `label`, the short line
 * sits under it ("Review · back to you"), coloured to match.
 *
 * Pass the journey's listTone, not tone, so a draft with checks to fix shows
 * amber in lists.
 */
export function StageBar({
  stage,
  tone,
  label,
  className,
}: {
  stage: JourneyStage;
  tone: StageTone;
  label?: string;
  className?: string;
}) {
  const cur = stageIndex(stage);
  const segs = [0, 1, 2, 3];
  return (
    <div data-slot="stage-bar" className={cn("min-w-0", className)}>
      <div aria-hidden className="grid w-[118px] grid-cols-4 gap-[3px]">
        {segs.map((i) => (
          <i
            key={i}
            className={cn(
              "block h-[5px] rounded-[3px]",
              i < cur || tone === "done"
                ? "bg-[var(--ds-green-solid)]"
                : i === cur
                  ? tone === "needs-you"
                    ? "bg-[var(--ds-amber-solid)]"
                    : tone === "away"
                      ? "bg-[var(--ds-lilac-line)]"
                      : "bg-[var(--ds-ink)]"
                  : "bg-[var(--ds-line)]"
            )}
          />
        ))}
      </div>
      {label && (
        <div
          className={cn(
            "mt-1.5 truncate text-[12.5px]",
            tone === "needs-you"
              ? "font-medium text-[var(--ds-amber-fg)]"
              : tone === "away"
                ? "text-[var(--ds-lilac-fg)]"
                : "text-[var(--ds-muted)]"
          )}
        >
          {label}
        </div>
      )}
      {!label && <span className="sr-only">Step {Math.min(cur + 1, 4)} of 4</span>}
    </div>
  );
}
