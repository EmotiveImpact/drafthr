import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Coins, Loader2, Sparkles } from "lucide-react";
import type { Draft } from "@/lib/letters/types";
import { getBillingStatus } from "@/lib/billing/api";
import { assembleLetterText, runCritique, CRITIQUE_CREDIT_COST, CRITIQUE_LENSES, type CritiqueLens } from "@/lib/critique";
import { cn } from "@/lib/utils";
import { useLetterWorkspace } from "./workspace-store";

/** The chat's "a second opinion arrived" event (AIPanel adds it to the thread). */
export const CRITIQUE_EVENT = "drafthr:critique";
export type CritiqueEventDetail = { draftId: string; lensLabel: string; critique: string };

/** What DraftHR is asked once the second opinion is in the chat: turn its
 *  points into edits on the letter (the Edits tab's cards). */
export const CRITIQUE_FOLLOW_UP =
  "Suggest edits for the points in this second opinion that would make the letter stronger. Leave anything that is already fine.";

/**
 * The Progress tab's "Second opinion" (FEAT-114): pick a lens (tribunal
 * counsel, employee advocate, DEI lead), spend one AI credit, and the
 * critique arrives in the Chat tab as a message from DraftHR, which then
 * proposes its points as edits to accept or reject. The credit balance is
 * the real one (billing status); with none left it links to the plans.
 */
export function SecondOpinion({ draft, canRun }: { draft: Draft; canRun: boolean }) {
  const [lens, setLens] = useState<CritiqueLens>("tribunal");
  const [credits, setCredits] = useState<number | null>(null);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<{ msg: string; needCredits?: boolean } | null>(null);

  useEffect(() => {
    let cancelled = false;
    void getBillingStatus().then((s) => {
      if (!cancelled) setCredits(s?.credits ?? 0);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const letterText = useMemo(() => assembleLetterText(draft), [draft]);
  const outOfCredits = credits !== null && credits < CRITIQUE_CREDIT_COST;
  const creditWord = (n: number) => (n === 1 ? "credit" : "credits");

  const run = async () => {
    if (running || !letterText) return;
    setRunning(true);
    setError(null);
    const answers = draft.answers as Record<string, unknown> | undefined;
    const jurisdiction = typeof answers?.jurisdiction === "string" ? answers.jurisdiction : undefined;
    const outcome = await runCritique({ lens, letterText, letterType: draft.letterType, jurisdiction });
    setRunning(false);
    if (!outcome.ok) {
      setError({ msg: outcome.error, needCredits: outcome.needCredits });
      if (outcome.needCredits) setCredits(0);
      return;
    }
    setCredits(outcome.data.creditsRemaining);
    const detail: CritiqueEventDetail = { draftId: draft.id, lensLabel: outcome.data.lensLabel, critique: outcome.data.critique };
    window.dispatchEvent(new CustomEvent(CRITIQUE_EVENT, { detail }));
    // Opens the Chat tab and asks DraftHR to turn the points into edits.
    useLetterWorkspace.getState().handlers.ask?.(CRITIQUE_FOLLOW_UP);
  };

  return (
    <div className="flex flex-col gap-2" data-testid="second-opinion">
      <div className="grid grid-cols-3 gap-1.5" role="radiogroup" aria-label="Second opinion from">
        {CRITIQUE_LENSES.map((l) => {
          const on = lens === l.id;
          return (
            <button
              key={l.id}
              type="button"
              role="radio"
              aria-checked={on}
              onClick={() => setLens(l.id)}
              disabled={running}
              className={cn(
                "min-w-0 rounded-[8px] border px-2 py-1.5 text-left transition-colors duration-[120ms] focus-visible:outline-none focus-visible:shadow-[var(--ds-focus-ring)] disabled:opacity-60",
                on ? "border-[var(--ds-ink)] bg-[var(--ds-surface-2)]" : "border-[var(--ds-line)] bg-[var(--ds-surface)] hover:bg-[var(--ds-hover)]"
              )}
            >
              <span className="block text-[12px] font-medium leading-tight text-[var(--ds-ink)]">{l.label}</span>
            </button>
          );
        })}
      </div>
      {error && (
        <p role="alert" className="m-0 text-[12.5px] leading-snug text-[var(--ds-red-fg)]">
          {error.msg}
        </p>
      )}
      <div className="flex flex-wrap items-center gap-2">
        {outOfCredits || error?.needCredits ? (
          <Link
            to="/pricing"
            className="inline-flex h-7 items-center gap-1.5 rounded-[7px] border border-[var(--ds-line)] bg-[var(--ds-surface)] px-2.5 text-[12.5px] font-medium text-[var(--ds-ink)] transition-colors duration-[120ms] hover:bg-[var(--ds-hover)] focus-visible:outline-none focus-visible:shadow-[var(--ds-focus-ring)]"
          >
            <Coins className="size-3.5" aria-hidden />
            Get AI credits
          </Link>
        ) : (
          <button
            type="button"
            onClick={() => void run()}
            disabled={!canRun || running || !letterText}
            title={!canRun ? "Only people who can edit the letter can ask for one" : undefined}
            className="inline-flex h-7 items-center gap-1.5 rounded-[7px] bg-[var(--ds-accent)] px-2.5 text-[12.5px] font-medium text-[var(--ds-on-accent)] transition-colors duration-[120ms] hover:bg-[var(--ds-accent-hover)] focus-visible:outline-none focus-visible:shadow-[var(--ds-focus-ring)] disabled:pointer-events-none disabled:opacity-50"
          >
            {running ? <Loader2 className="size-3.5 animate-spin" aria-hidden /> : <Sparkles className="size-3.5" aria-hidden />}
            {running ? "Reading the letter…" : `Ask for a second opinion · ${CRITIQUE_CREDIT_COST} ${creditWord(CRITIQUE_CREDIT_COST)}`}
          </button>
        )}
        {credits !== null && (
          <span className="text-[12px] text-[var(--ds-muted)]">
            {credits} {creditWord(credits)} left
          </span>
        )}
      </div>
    </div>
  );
}
