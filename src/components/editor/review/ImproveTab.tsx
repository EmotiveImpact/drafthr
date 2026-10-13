import { useEffect, useMemo, useState } from "react";
import { motion } from "framer-motion";
import { useNavigate, useParams } from "react-router-dom";
import { ArrowRight, Coins, Loader2, ShieldCheck, Sparkles, Users } from "lucide-react";
import { cn } from "@/lib/utils";
import { useDraftStore } from "@/lib/store";
import { Markdown } from "@/components/editor/Markdown";
import { getBillingStatus } from "@/lib/billing/api";
import { lowestPrice, useExperts } from "@/components/journey/review/experts";
import { money } from "@/components/journey/review/model";
import {
  assembleLetterText,
  runCritique,
  CRITIQUE_LENSES,
  CRITIQUE_CREDIT_COST,
  type CritiqueLens,
  type CritiqueResult,
} from "@/lib/critique";

/**
 * IMPROVE tab — reviewer lanes for getting eyes on the letter before Finalize.
 *
 * - "AI specialist" is a REAL, credit-metered critique: pick a lens, spend one
 *   AI credit, get a structured critique streamed back (see api/store/critique).
 * - "External consultant" routes to the live /consultants marketplace, carrying
 *   the current draft so the booking has letter context.
 * - "Your team" opens the letter's reviewer picker on the team pane (the
 *   same team review the Progress panel sends).
 * - The consultant price is the marketplace's lowest listed price, the same
 *   figure the reviewer picker shows.
 */
export function ImproveTab() {
  const navigate = useNavigate();
  // The review rail renders under /editor/:draftId/review, so the draft id is
  // on the route — carry it to the marketplace so the booking has context.
  const { draftId } = useParams<{ draftId: string }>();

  const browseConsultants = () =>
    navigate(draftId ? `/consultants?draft=${encodeURIComponent(draftId)}` : "/consultants");
  const askTeam = () => draftId && navigate(`/editor/${encodeURIComponent(draftId)}?review=team`);
  const draft = useDraftStore((s) => (draftId ? s.drafts[draftId] : undefined));
  const experts = useExperts(draft, true);
  const cheapest = lowestPrice(experts.all);

  return (
    <motion.div
      initial={{ opacity: 0, y: 4 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.22, ease: [0.32, 0.72, 0, 1] }}
      className="space-y-3"
    >
      <p className="text-[12px] text-[var(--ds-muted)] px-1">
        Optional, recommended for high-stakes letters. Pick a lane.
      </p>

      <AiSpecialistLane draftId={draftId} />

      <ReviewLane
        icon={<Users className="size-4" />}
        title="Your team"
        desc="Send to a colleague in your workspace. They can comment or sign off."
        statLabel="Cost"
        statValue={<>Free</>}
        timeLabel="Returns"
        timeValue="When they're done"
        cta="Ask your team"
        onClick={askTeam}
      />

      <ReviewLane
        icon={<ShieldCheck className="size-4" />}
        title="External consultant"
        desc="Vetted HR / employment specialist. Best for settlements, dismissals, tribunal-bound letters."
        statLabel="From"
        statValue={cheapest ? <>{money(cheapest.price, cheapest.symbol)}</> : experts.status === "loading" ? <>…</> : <>See prices</>}
        timeLabel="SLA"
        timeValue="24–48h"
        cta="Browse consultants"
        onClick={browseConsultants}
        primary
      />
    </motion.div>
  );
}

/**
 * The credit-metered AI critique lane. Pick a lens → spend one credit → render
 * the structured critique. Fetches the credit balance once and updates it from
 * each run's response; a 402 (out of credits) routes to /pricing.
 */
function AiSpecialistLane({ draftId }: { draftId?: string }) {
  const navigate = useNavigate();
  const draft = useDraftStore((s) => (draftId ? s.drafts[draftId] : undefined));

  const [lens, setLens] = useState<CritiqueLens>("tribunal");
  const [credits, setCredits] = useState<number | null>(null);
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState<CritiqueResult | null>(null);
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

  const letterText = useMemo(() => (draft ? assembleLetterText(draft) : ""), [draft]);
  const hasContent = letterText.length > 0;
  const outOfCredits = credits !== null && credits < CRITIQUE_CREDIT_COST;

  const run = async () => {
    if (running || !hasContent) return;
    setRunning(true);
    setError(null);
    const answers = draft?.answers as Record<string, unknown> | undefined;
    const jurisdiction = typeof answers?.jurisdiction === "string" ? answers.jurisdiction : undefined;
    const outcome = await runCritique({
      lens,
      letterText,
      letterType: draft?.letterType,
      jurisdiction,
    });
    if (outcome.ok) {
      setResult(outcome.data);
      setCredits(outcome.data.creditsRemaining);
    } else {
      setError({ msg: outcome.error, needCredits: outcome.needCredits });
      if (outcome.needCredits) setCredits(0);
    }
    setRunning(false);
  };

  return (
    <div className="rounded-lg border border-[var(--ds-line)] bg-[var(--ds-surface)] p-3.5">
      <div className="flex items-start gap-2.5">
        <div className="inline-flex items-center justify-center size-7 rounded-md bg-[var(--ds-line-2)] text-[var(--ds-ink)] shrink-0">
          <Sparkles className="size-4" />
        </div>
        <div className="flex-1 min-w-0">
          <h4 className="text-[13px] font-semibold m-0 mb-0.5 flex items-center gap-1.5">
            AI specialist
            {credits !== null && (
              <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-[var(--ds-muted)] bg-[var(--ds-line-2)] rounded-full px-1.5 py-px">
                <Coins className="size-3" aria-hidden />
                {credits} {credits === 1 ? "credit" : "credits"}
              </span>
            )}
          </h4>
          <p className="text-[11.5px] text-[var(--ds-muted)] m-0 leading-snug">
            Structured critique through a chosen lens. Costs {CRITIQUE_CREDIT_COST}{" "}
            {CRITIQUE_CREDIT_COST === 1 ? "credit" : "credits"} · returns in ~30s.
          </p>
        </div>
      </div>

      {/* Lens picker */}
      <div className="mt-2.5 grid grid-cols-3 gap-1.5" role="radiogroup" aria-label="Critique lens">
        {CRITIQUE_LENSES.map((l) => {
          const active = lens === l.id;
          return (
            <button
              key={l.id}
              type="button"
              role="radio"
              aria-checked={active}
              onClick={() => setLens(l.id)}
              disabled={running}
              className={cn(
                "rounded-md border px-2 py-1.5 text-left transition disabled:opacity-60",
                active
                  ? "border-[var(--ds-ink)] bg-[var(--ds-line-2)]"
                  : "border-[var(--ds-line)] hover:border-[var(--ds-ink)]",
              )}
            >
              <span className="block text-[11px] font-semibold text-[var(--ds-ink)] leading-tight">
                {l.label}
              </span>
              <span className="block text-[9.5px] text-[var(--ds-muted)] leading-tight mt-0.5">
                {l.blurb}
              </span>
            </button>
          );
        })}
      </div>

      {/* Result */}
      {result && (
        <div className="mt-2.5 rounded-md border border-[var(--ds-line)] bg-[var(--ds-line-2)] p-2.5">
          <div className="flex items-center justify-between mb-1">
            <span className="text-[10px] uppercase tracking-wider font-semibold text-[var(--ds-muted)]">
              {result.lensLabel}
            </span>
            <span className="text-[10px] text-[var(--ds-muted)]">
              {result.creditsRemaining} {result.creditsRemaining === 1 ? "credit" : "credits"} left
            </span>
          </div>
          <div className="max-h-72 overflow-y-auto pr-1">
            <Markdown>{result.critique}</Markdown>
          </div>
        </div>
      )}

      {/* Error */}
      {error && (
        <div className="mt-2.5 rounded-md border border-[var(--ds-line)] bg-[var(--ds-red-bg)] p-2.5 text-[11.5px] text-[var(--ds-red-fg)]">
          {error.msg}
          {error.needCredits && (
            <button
              type="button"
              onClick={() => navigate("/pricing")}
              className="ml-1 font-semibold underline"
            >
              Get credits
            </button>
          )}
        </div>
      )}

      {/* Action */}
      {outOfCredits ? (
        <button
          type="button"
          onClick={() => navigate("/pricing")}
          className="mt-2.5 inline-flex items-center justify-center gap-1.5 w-full h-8 px-3 rounded-md text-[12px] font-semibold bg-[var(--ds-ink)] text-white transition hover:opacity-90"
        >
          <Coins className="size-3.5" />
          Get AI credits
        </button>
      ) : (
        <button
          type="button"
          onClick={run}
          disabled={running || !hasContent}
          className={cn(
            "mt-2.5 inline-flex items-center justify-center gap-1.5 w-full h-8 px-3 rounded-md text-[12px] font-semibold transition",
            "bg-[var(--ds-ink)] text-white hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed",
          )}
        >
          {running ? (
            <>
              <Loader2 className="size-3.5 animate-spin" aria-hidden />
              Analysing… ~30s
            </>
          ) : !hasContent ? (
            "Write the letter first"
          ) : result ? (
            <>
              Run again · {CRITIQUE_CREDIT_COST} {CRITIQUE_CREDIT_COST === 1 ? "credit" : "credits"}
            </>
          ) : (
            <>
              <Sparkles className="size-3.5" />
              Critique · {CRITIQUE_CREDIT_COST} {CRITIQUE_CREDIT_COST === 1 ? "credit" : "credits"}
            </>
          )}
        </button>
      )}
    </div>
  );
}

function ReviewLane({
  icon,
  title,
  desc,
  statLabel,
  statValue,
  timeLabel,
  timeValue,
  cta,
  onClick,
  primary,
  comingSoon,
}: {
  icon: React.ReactNode;
  title: string;
  desc: string;
  statLabel: string;
  statValue: React.ReactNode;
  timeLabel: string;
  timeValue: React.ReactNode;
  cta?: string;
  onClick?: () => void;
  primary?: boolean;
  comingSoon?: boolean;
}) {
  return (
    <div className="rounded-lg border border-[var(--ds-line)] bg-[var(--ds-surface)] p-3.5">
      <div className="flex items-start gap-2.5">
        <div className="inline-flex items-center justify-center size-7 rounded-md bg-[var(--ds-line-2)] text-[var(--ds-ink)] shrink-0">
          {icon}
        </div>
        <div className="flex-1 min-w-0">
          <h4 className="text-[13px] font-semibold m-0 mb-0.5 flex items-center gap-1.5">
            {title}
            {comingSoon && (
              <span className="text-[9.5px] uppercase tracking-wider font-semibold text-[var(--ds-muted)] bg-[var(--ds-line-2)] rounded-full px-1.5 py-px">
                Coming soon
              </span>
            )}
          </h4>
          <p className="text-[11.5px] text-[var(--ds-muted)] m-0 leading-snug">
            {desc}
          </p>
        </div>
      </div>

      <div className="flex gap-3 px-2.5 py-1.5 bg-[var(--ds-line-2)] rounded-md mt-2.5">
        <div className="flex flex-col">
          <span className="text-[9.5px] uppercase tracking-wider text-[var(--ds-muted)] font-semibold">
            {statLabel}
          </span>
          <span className="text-[11.5px] font-semibold tabular-nums">
            {statValue}
          </span>
        </div>
        <div className="flex flex-col">
          <span className="text-[9.5px] uppercase tracking-wider text-[var(--ds-muted)] font-semibold">
            {timeLabel}
          </span>
          <span className="text-[11.5px] font-semibold tabular-nums">
            {timeValue}
          </span>
        </div>
      </div>

      {comingSoon ? (
        <div
          aria-disabled="true"
          className="mt-2.5 inline-flex items-center justify-center w-full h-8 px-3 rounded-md text-[12px] font-semibold bg-[var(--ds-line-2)] text-[var(--ds-muted)] cursor-not-allowed select-none"
        >
          Coming soon
        </div>
      ) : (
        <button
          type="button"
          onClick={onClick}
          className={cn(
            "mt-2.5 inline-flex h-8 w-full items-center justify-center gap-1.5 rounded-[8px] px-3 text-[12.5px] font-medium transition-colors duration-[120ms] focus-visible:outline-none focus-visible:shadow-[var(--ds-focus-ring)]",
            primary
              ? "bg-[var(--ds-accent)] text-[var(--ds-on-accent)] hover:bg-[var(--ds-accent-hover)] active:bg-[var(--ds-accent-press)]"
              : "border border-[var(--ds-line)] bg-[var(--ds-surface)] text-[var(--ds-ink)] hover:bg-[var(--ds-hover)] active:bg-[var(--ds-surface-3)]",
          )}
        >
          {cta}
          <ArrowRight className="size-3.5" />
        </button>
      )}
    </div>
  );
}
