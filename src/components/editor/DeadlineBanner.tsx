import type { Draft } from "@/lib/letters/types";
import { daysUntilDateOnly, formatDateOnly } from "@/lib/date-only";
import { CalendarClock } from "lucide-react";

/**
 * Sticky deadline banner shown in employee-mode editors when the user has
 * supplied a date-of-act. Calculates and displays the tribunal/EEOC limitation
 * deadline computed at draft creation time.
 */
export function DeadlineBanner({ draft }: { draft: Draft }) {
  const deadline = draft.context.protectedDeadline;
  if (draft.mode !== "employee" || !deadline) return null;

  const days = daysUntil(deadline.iso);
  const conciliationNote = earlyConciliationNote(draft);
  const tone =
    days < 0
      ? "border-rose-300 bg-rose-50 text-rose-900"
      : days < 14
      ? "border-rose-200 bg-rose-50 text-rose-900"
      : days < 30
      ? "border-amber-200 bg-amber-50 text-amber-900"
      : "border-letter-rule bg-muted/40 text-foreground";

  return (
    <div className={`flex items-start gap-3 rounded-md border p-3 text-xs ${tone}`}>
      <CalendarClock className="size-4 mt-0.5 shrink-0" />
      <div className="leading-relaxed">
        <strong>
          {days < 0
            ? "Tribunal limitation has passed."
            : days < 14
            ? `Tribunal deadline in ${days} days.`
            : days < 30
            ? `Tribunal deadline in ${days} days.`
            : `Tribunal deadline: ${formatDate(deadline.iso)} (${days} days away).`}
        </strong>{" "}
        {deadline.basis}{" "}
        {conciliationNote && <span className="opacity-75">{conciliationNote}</span>}
      </div>
    </div>
  );
}

/**
 * Early conciliation must start before the primary limit expires. It stops
 * the clock while it runs (up to 12 weeks for ACAS notifications from
 * 1 December 2025) and leaves at least a month after the certificate.
 */
function earlyConciliationNote(draft: Draft): string | null {
  if (draft.context.jurisdiction !== "UK") return null;
  if (draft.context.ukRegion === "Northern Ireland") {
    return "Start Labour Relations Agency early conciliation before this date: it extends the time limit while conciliation runs.";
  }
  return "Start ACAS Early Conciliation before this date: the clock stops while conciliation runs (up to 12 weeks) and you then have at least one month from the certificate to file.";
}

function daysUntil(iso: string): number {
  return daysUntilDateOnly(iso);
}

function formatDate(iso: string): string {
  return formatDateOnly(iso, { day: "numeric", month: "long", year: "numeric" });
}
