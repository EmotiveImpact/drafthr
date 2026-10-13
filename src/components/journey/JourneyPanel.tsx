import { useMemo, type ReactNode } from "react";
import { cn } from "@/lib/utils";
import { useDraftStore } from "@/lib/store";
import {
  DIMENSION_LABELS,
  computeHealthScore,
  runHealthChecks,
  type HealthActionRoute,
} from "@/lib/finalize/healthChecks";
import { journeyStepsFor, sendWhatNow, useJourney, type JourneyStage } from "@/lib/journey/stage";
import { SEND_FADE_MS, useSendMoment } from "./ui-store";
import { HealthCard, StageTracker, WhatNow, type HealthFix } from "@/components/journey/ui";
import { DraftStage } from "./stages/DraftStage";
import { ReviewStage } from "./stages/ReviewStage";
import { ApproveStage } from "./stages/ApproveStage";
import { SendStage } from "./stages/SendStage";
import { SentStage } from "./stages/SentStage";
import { ReviewDialogsHost } from "./ReviewDialogsHost";

/**
 * The Progress tab of the letter's side panel (mocks f1 to f8): the
 * four-step tracker, the "what to do now" line, the current stage's own
 * content, then the Letter health card (Draft, Review and Approve only).
 * Also mounts the review dialogs host once.
 *
 * Contract (design/build/phase3/brief.md section 5). Foundation owns it.
 * Each stage's content lives in ./stages/<Stage>Stage.tsx, owned by the
 * builder of that stage.
 */
const STAGES: Record<JourneyStage, (p: { draftId: string }) => ReactNode> = {
  draft: DraftStage,
  review: ReviewStage,
  approve: ApproveStage,
  send: SendStage,
  sent: SentStage,
};

export function JourneyPanel({
  draftId,
  health,
  viewerIsApprover,
  viewerIsReviewer,
  viewerIsAsker,
  className,
}: {
  draftId: string;
  /** Replace the default health card (a node), or hide it (false). */
  health?: ReactNode | false;
  /** The person looking is the approver (Approve shows "Approve"). */
  viewerIsApprover?: boolean;
  /** The person looking is the named teammate reviewer (their own review). */
  viewerIsReviewer?: boolean;
  /** False when someone else asked for the review (read only). */
  viewerIsAsker?: boolean;
  className?: string;
}) {
  const journey = useJourney(draftId, { viewerIsApprover, viewerIsReviewer, viewerIsAsker });
  // A template is never reviewed, approved or sent: no four-step tracker
  // for it, only the drafting checklist and health (LETTER-X24).
  const isTemplate = useDraftStore((s) => !!s.drafts[draftId]?.isTemplateSource);
  const mode = useDraftStore((s) => s.drafts[draftId]?.mode);
  const sections = useDraftStore((s) => s.drafts[draftId]?.sections);
  // Right after sending, the Send step stays on screen for a moment (SentStage);
  // the line above it keeps the Send step's words until both swap (SEND-X36).
  const moment = useSendMoment(draftId);
  if (!journey) return null;
  const Stage = STAGES[journey.stage];
  const sending = journey.stage === "sent" && moment !== "next" && mode !== undefined;
  const whatNow = sending && mode ? sendWhatNow({ mode, sections: sections ?? [] }) : journey.whatNow;
  const showHealth = health !== false && journey.stage !== "send" && journey.stage !== "sent";

  return (
    <div
      data-slot="journey-panel"
      data-stage={journey.stage}
      data-template={isTemplate || undefined}
      className={cn("flex flex-col gap-3.5", className)}
    >
      {!isTemplate && (
        <StageTracker stage={journey.stage} tone={journey.tone} steps={journeyStepsFor(mode ? { mode } : null)} />
      )}
      <WhatNow
        key={sending ? "send-moment" : "now"}
        lead={whatNow.lead}
        detail={whatNow.detail}
        className={cn(
          "transition-opacity ease-out motion-reduce:transition-none",
          sending && moment === "fade" && "opacity-0",
          // What's next fades in with the Sent stage under it.
          journey.stage === "sent" && moment === "next" && "animate-in fade-in-0 duration-300 motion-reduce:animate-none"
        )}
        style={sending ? { transitionDuration: `${SEND_FADE_MS}ms` } : undefined}
      />
      <Stage draftId={draftId} />
      {showHealth && (health ?? <DefaultHealthCard draftId={draftId} stage={journey.stage} locked={journey.locked} />)}
      <ReviewDialogsHost />
    </div>
  );
}

function fixHref(draftId: string, route: HealthActionRoute | undefined): string {
  if (route === "evidence") return `/editor/${draftId}/evidence`;
  if (route === "settings") return "/settings";
  return `/editor/${draftId}`;
}

function DefaultHealthCard({ draftId, stage, locked }: { draftId: string; stage: JourneyStage; locked: boolean }) {
  const draft = useDraftStore((s) => s.drafts[draftId]);
  const data = useMemo(() => {
    if (!draft) return null;
    const checks = runHealthChecks(draft);
    const score = computeHealthScore(checks);
    const fixes: HealthFix[] =
      stage === "draft"
        ? checks
            .filter((c) => c.severity === "fail")
            .slice(0, 3)
            .map((c) => ({
              id: c.id,
              label: c.label,
              detail: c.detail ? `Required · ${c.detail}` : "Required",
              href: fixHref(draftId, c.actionRoute),
              fixLabel: "Fix",
            }))
        : [];
    return { checks, score, fixes };
  }, [draft, draftId, stage]);
  if (!data) return null;
  const { score, fixes } = data;
  const line = locked
    ? stage === "review"
      ? "Locked while it's out for review"
      : "Locked while someone else has it"
    : fixes.length > 0
      ? `Fix ${fixes.length} to send it on`
      : score.oneLiner;
  return (
    <HealthCard
      score={score.score}
      checksCount={score.totalCount}
      line={line}
      dimensions={score.dimensions.map((d) => ({ label: DIMENSION_LABELS[d.dimension], score: d.score }))}
      fixes={fixes}
      checksHref={`/editor/${draftId}/finalize`}
    />
  );
}
