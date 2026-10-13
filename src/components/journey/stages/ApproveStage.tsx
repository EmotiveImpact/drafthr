import { Button } from "@/components/ui/button";
import { useDraftStore } from "@/lib/store";
import { useJourney } from "@/lib/journey/stage";
import { PersonCard } from "@/components/journey/ui";

/**
 * Approve step of the Progress panel (mock f6). Placeholder from the
 * foundation; the letter builder owns this file and replaces the body.
 * Props are fixed: { draftId }.
 */
export function ApproveStage({ draftId }: { draftId: string }) {
  const journey = useJourney(draftId);
  const submitForReview = useDraftStore((s) => s.submitForReview);
  if (!journey) return null;

  if (journey.tone === "away" || journey.tone === "needs-you") {
    const name = journey.approverName ?? "Approver";
    return (
      <PersonCard
        name={name}
        role="Approver"
        pill={journey.tone === "needs-you" ? { tone: "amber", label: "Needs you" } : { tone: "blue", label: "Waiting" }}
      />
    );
  }

  const action = journey.primaryAction;
  return (
    <div className="flex flex-col gap-2">
      <Button
        onClick={() => submitForReview(draftId)}
        disabled={action?.disabled}
        title={action?.reason}
      >
        Send for approval
      </Button>
      {action?.reason && (
        <p className="m-0 text-[12.5px] text-[var(--ds-muted)]">{action.reason}</p>
      )}
    </div>
  );
}
