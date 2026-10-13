import { Link } from "react-router-dom";
import { buttonVariants } from "@/components/ui/button";

/**
 * Sent step of the Progress panel (mock f8): what's next for the matter.
 * Placeholder from the foundation; the send builder owns this file and
 * replaces the body. Props are fixed: { draftId }.
 */
export function SentStage({ draftId }: { draftId: string }) {
  return (
    <div className="flex flex-col gap-2">
      <p className="m-0 text-[13.5px] font-medium text-[var(--ds-ink)]">What's next</p>
      <Link to={`/editor/${draftId}/finalize`} className={buttonVariants({ variant: "outline" })}>
        Download again
      </Link>
    </div>
  );
}
