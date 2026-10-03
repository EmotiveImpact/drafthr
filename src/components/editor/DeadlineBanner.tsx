import type { Draft } from "@/lib/letters/types";
import { formatDateOnly } from "@/lib/date-only";
import { getUnverifiedDeadlineReminder, needsFilingDeadlineWarning, UNVERIFIED_DEADLINE_NOTICE } from "@/lib/deadline-reminders";
import { CalendarClock } from "lucide-react";

/**
 * Filing-time warning remains visible even when no date has been calculated.
 * A historical date is a reminder only, never evidence that a claim is in time.
 */
export function DeadlineBanner({ draft }: { draft: Draft }) {
  const deadline = getUnverifiedDeadlineReminder(draft);
  if (!needsFilingDeadlineWarning(draft)) return null;

  return (
    <div className="flex items-start gap-3 rounded-md border border-[var(--ds-line)] bg-[var(--ds-amber-bg)] p-3 text-xs text-[var(--ds-amber-fg)]" role="note">
      <CalendarClock className="size-4 mt-0.5 shrink-0" />
      <div className="leading-relaxed">
        <strong>
          {deadline ? `Unverified reminder: ${formatDate(deadline.iso)}.` : "Check your filing deadline."}
        </strong>{" "}
        {deadline ? UNVERIFIED_DEADLINE_NOTICE : "DraftHR does not calculate legal filing deadlines from an incident date. Confirm the applicable time limits promptly with a qualified adviser; some can be very short."}{" "}
        <span className="opacity-75">
          {draft.context.jurisdiction === "UK" ? (
            <>Check whether Acas early conciliation applies using <a className="underline" href="https://www.acas.org.uk/employment-tribunal-time-limits" target="_blank" rel="noreferrer">current Acas guidance</a>. Do not assume an internal grievance or appeal pauses a filing time limit.</>
          ) : (
            <>Check the applicable agency or court rules, including <a className="underline" href="https://www.eeoc.gov/time-limits-filing-charge" target="_blank" rel="noreferrer">EEOC requirements</a> where relevant. Do not assume an internal grievance or appeal pauses a filing time limit.</>
          )}
        </span>
      </div>
    </div>
  );
}

function formatDate(iso: string): string {
  return formatDateOnly(iso, { day: "numeric", month: "long", year: "numeric" });
}
