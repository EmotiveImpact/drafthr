import { Link } from "react-router-dom";
import { buttonVariants } from "@/components/ui/button";
import { useDraftStore } from "@/lib/store";

/**
 * Send step of the Progress panel (mock f7): how the employee gets the
 * letter. Placeholder from the foundation; the send builder owns this file
 * and replaces the body. Props are fixed: { draftId }.
 */
export function SendStage({ draftId }: { draftId: string }) {
  const name = useDraftStore((s) => {
    const d = s.drafts[draftId];
    return d?.employee?.preferredName || d?.employee?.legalName || "";
  });
  return (
    <div className="flex flex-col gap-2">
      <p className="m-0 text-[13.5px] font-medium text-[var(--ds-ink)]">
        How will {name ? name.split(/\s+/)[0] : "the employee"} get it?
      </p>
      <Link to={`/editor/${draftId}/finalize`} className={buttonVariants()}>
        Download and mark as sent
      </Link>
    </div>
  );
}
