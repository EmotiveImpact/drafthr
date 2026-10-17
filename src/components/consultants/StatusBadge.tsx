import type { BookingStatus } from "@/lib/bookings";
import { Pill as DsPill, type PillTone } from "@/components/ds";
import { cn } from "@/lib/utils";

/**
 * Single source of truth for booking-status pills, used on My bookings, the
 * thread panel, the consultant inbox and the booking sheet's preview, so the
 * same status always reads and looks the same from both sides of a booking.
 *
 *   Requested amber   Accepted blue   Delivered green
 *   Completed grey    Declined red
 */
const STYLES: Record<BookingStatus, { tone: PillTone; label: string }> = {
  requested: { tone: "amber", label: "Requested" },
  accepted: { tone: "blue", label: "Accepted" },
  delivered: { tone: "green", label: "Delivered" },
  completed: { tone: "grey", label: "Completed" },
  declined: { tone: "red", label: "Declined" },
};

export function StatusBadge({ status, className }: { status: BookingStatus; className?: string }) {
  const s = STYLES[status] ?? STYLES.requested;
  return (
    <DsPill tone={s.tone} className={cn("shrink-0", className)}>
      {s.label}
    </DsPill>
  );
}

/** A status pill for statuses that are not booking statuses (admin queue). */
export function Pill({ tone, label, className }: { tone: PillTone; label: string; className?: string }) {
  return (
    <DsPill tone={tone} className={cn("shrink-0", className)}>
      {label}
    </DsPill>
  );
}
