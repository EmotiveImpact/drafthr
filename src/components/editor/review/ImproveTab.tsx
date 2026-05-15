import { useState } from "react";
import { motion } from "framer-motion";
import {
  ArrowRight,
  Coins,
  ShieldCheck,
  Sparkles,
  Users,
} from "lucide-react";
import { useProfileStore, AI_REVIEW_COST } from "@/lib/profile";
import { cn } from "@/lib/utils";

/**
 * IMPROVE tab — three reviewer lanes for getting eyes on the letter before
 * Finalize. Mirrors the "Independent review" block on Finalize but lives in
 * the rail so the assess → improve → ship flow happens in one place.
 *
 * Handlers are ported from Finalize.tsx (AI critique uses credits + the
 * profile store; team + consultant are stubs). The page passes nothing in;
 * the tab owns its lane state because it's self-contained per Review session.
 */
export function ImproveTab() {
  const credits = useProfileStore((s) => s.profile.credits ?? 0);
  const spendCredits = useProfileStore((s) => s.spendCredits);

  const [aiReviewState, setAiReviewState] = useState<
    "idle" | "running" | "complete" | "low-credits"
  >("idle");

  // Mirrors the Finalize implementation — same store, same cost, same stub
  // ~2.5s simulation so the flow is testable until the real /api/agent
  // critique endpoint is wired in.
  const onAiCritique = () => {
    if (credits < AI_REVIEW_COST) {
      setAiReviewState("low-credits");
      return;
    }
    const ok = spendCredits(AI_REVIEW_COST);
    if (!ok) {
      setAiReviewState("low-credits");
      return;
    }
    setAiReviewState("running");
    setTimeout(() => setAiReviewState("complete"), 2500);
  };

  const aiCta =
    aiReviewState === "running"
      ? "Analysing…"
      : aiReviewState === "complete"
        ? "View critique"
        : aiReviewState === "low-credits"
          ? "Top up credits"
          : "Get AI critique";

  return (
    <motion.div
      initial={{ opacity: 0, y: 4 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.22, ease: [0.32, 0.72, 0, 1] }}
      className="space-y-3"
    >
      <p className="text-[12px] text-[var(--ds-muted)] px-1">
        Optional — recommended for high-stakes letters. Pick a lane.
      </p>

      <ReviewLane
        icon={<Sparkles className="size-4" />}
        title="AI specialist"
        desc="Pick a lens — Tribunal counsel, Employee advocate, or DEI lead. Structured critique in ~30s."
        statLabel="Cost"
        statValue={
          <span className="inline-flex items-center gap-1">
            <Coins className="size-3 text-[var(--ds-amber-fg)]" />
            {AI_REVIEW_COST} credits
          </span>
        }
        timeLabel="Returns"
        timeValue="~30s"
        cta={aiCta}
        loading={aiReviewState === "running"}
        onClick={onAiCritique}
        primary
        footer={
          <span className="text-[10.5px] text-[var(--ds-muted)] inline-flex items-center gap-1">
            <Coins className="size-3" /> {credits} credits available
          </span>
        }
      />

      <ReviewLane
        icon={<Users className="size-4" />}
        title="Your team"
        desc="Send to a colleague in your workspace. They can comment or sign off."
        statLabel="Cost"
        statValue={<>Free</>}
        timeLabel="Returns"
        timeValue="Async"
        cta="Send to teammate"
        onClick={() => alert("Team review — coming soon")}
      />

      <ReviewLane
        icon={<ShieldCheck className="size-4" />}
        title="External consultant"
        desc="Vetted HR / employment specialist. Best for settlements, dismissals, tribunal-bound letters."
        statLabel="From"
        statValue={<>£85</>}
        timeLabel="SLA"
        timeValue="24–48h"
        cta="Browse consultants"
        onClick={() => alert("Consultant marketplace — see the Consult tab")}
      />
    </motion.div>
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
  loading,
  onClick,
  primary,
  footer,
}: {
  icon: React.ReactNode;
  title: string;
  desc: string;
  statLabel: string;
  statValue: React.ReactNode;
  timeLabel: string;
  timeValue: React.ReactNode;
  cta: string;
  loading?: boolean;
  onClick: () => void;
  primary?: boolean;
  footer?: React.ReactNode;
}) {
  return (
    <div className="rounded-lg border border-[var(--ds-line)] bg-[var(--ds-surface)] p-3.5">
      <div className="flex items-start gap-2.5">
        <div className="inline-flex items-center justify-center size-7 rounded-md bg-[var(--ds-line-2)] text-[var(--ds-ink)] shrink-0">
          {icon}
        </div>
        <div className="flex-1 min-w-0">
          <h4 className="text-[13px] font-semibold m-0 mb-0.5">{title}</h4>
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

      <motion.button
        type="button"
        onClick={onClick}
        whileHover={{ scale: 1.02 }}
        whileTap={{ scale: 0.97 }}
        transition={{ duration: 0.12 }}
        className={cn(
          "mt-2.5 inline-flex items-center justify-center gap-1.5 w-full h-8 px-3 rounded-md text-[12px] font-semibold transition",
          primary
            ? "bg-[var(--ds-ink)] text-white hover:opacity-90"
            : "bg-[var(--ds-surface)] text-[var(--ds-ink)] border border-[var(--ds-line)] hover:bg-[var(--ds-line-2)]",
        )}
      >
        {cta}
        {loading ? (
          <motion.span
            animate={{ rotate: 360 }}
            transition={{ repeat: Infinity, duration: 1, ease: "linear" }}
            className="inline-flex"
          >
            <Sparkles className="size-3.5" />
          </motion.span>
        ) : (
          <ArrowRight className="size-3.5" />
        )}
      </motion.button>

      {footer && <div className="mt-2">{footer}</div>}
    </div>
  );
}
