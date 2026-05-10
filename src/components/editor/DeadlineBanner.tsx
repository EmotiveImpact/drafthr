import type { Draft } from "@/lib/letters/types";
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
        <span className="opacity-75">
          ACAS Early Conciliation must be lodged before this date — the EC clock can extend the
          limitation by up to 6 weeks.
        </span>
      </div>
    </div>
  );
}

function daysUntil(iso: string): number {
  const target = new Date(iso);
  if (Number.isNaN(target.getTime())) return 9999;
  return Math.floor((target.getTime() - Date.now()) / (1000 * 60 * 60 * 24));
}

function formatDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString(undefined, { day: "numeric", month: "long", year: "numeric" });
}
