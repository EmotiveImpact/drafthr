import { motion } from "framer-motion";
import { useNavigate, useParams } from "react-router-dom";
import {
  ArrowRight,
  ShieldCheck,
  Sparkles,
  Users,
} from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * IMPROVE tab — reviewer lanes for getting eyes on the letter before Finalize.
 *
 * Only the "External consultant" lane is wired today: it routes to the live
 * /consultants marketplace (carrying the current draft so the booking has
 * letter context). The "AI specialist" and "Your team" lanes are honest
 * "coming soon" placeholders — they are NOT clickable and charge NOTHING.
 *
 * (Board CPO-01/02/03: the AI lane previously debited credits for a fake 2.5s
 * setTimeout with no model call and no critique view; the consultant lane
 * alerted and misdirected users to a "Consult tab" that isn't mounted; the
 * team lane was an alert stub. The editor's real AI assistant lives in the
 * chat panel — a genuine in-rail critique can be built here later.)
 */
export function ImproveTab() {
  const navigate = useNavigate();
  // The review rail renders under /editor/:draftId/review, so the draft id is
  // on the route — carry it to the marketplace so the booking has context.
  const { draftId } = useParams<{ draftId: string }>();

  const browseConsultants = () =>
    navigate(draftId ? `/consultants?draft=${encodeURIComponent(draftId)}` : "/consultants");

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
        desc="Structured critique through a chosen lens — Tribunal counsel, Employee advocate, or DEI lead."
        statLabel="Cost"
        statValue={<>Credits</>}
        timeLabel="Returns"
        timeValue="~30s"
        comingSoon
      />

      <ReviewLane
        icon={<Users className="size-4" />}
        title="Your team"
        desc="Send to a colleague in your workspace. They can comment or sign off."
        statLabel="Cost"
        statValue={<>Free</>}
        timeLabel="Returns"
        timeValue="Async"
        comingSoon
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
        onClick={browseConsultants}
        primary
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
          <ArrowRight className="size-3.5" />
        </motion.button>
      )}
    </div>
  );
}
