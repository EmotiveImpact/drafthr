import type { BookingStatus } from "@/lib/bookings";

/**
 * Single source of truth for booking-status pills. Previously the
 * consultant inbox and the HR bookings list each defined their own
 * StatusBadge with diverging labels (requested → "New" vs "Pending")
 * for the same status. This one component keeps them consistent.
 *
 * Labels are neutral so they read correctly from both sides of a
 * booking (consultant inbox and HR list).
 */
const STYLES: Record<BookingStatus, { bg: string; fg: string; label: string }> = {
  requested: { bg: "bg-[var(--ds-amber-bg)]", fg: "text-[var(--ds-amber-fg)]", label: "Requested" },
  accepted: { bg: "bg-[var(--ds-blue-bg)]", fg: "text-[var(--ds-blue-fg)]", label: "Accepted" },
  delivered: { bg: "bg-[var(--ds-green-bg)]", fg: "text-[var(--ds-green-fg)]", label: "Delivered" },
  completed: { bg: "bg-[var(--ds-surface-2)]", fg: "text-[var(--ds-muted)]", label: "Completed" },
  declined: { bg: "bg-[var(--ds-red-bg)]", fg: "text-[var(--ds-red-fg)]", label: "Declined" },
};

export function StatusBadge({ status }: { status: BookingStatus }) {
  const s = STYLES[status] ?? STYLES.requested;
  return (
    <span
      className={`inline-flex flex-shrink-0 items-center rounded-full px-2 py-0.5 text-[10.5px] font-semibold uppercase tracking-[0.06em] ${s.bg} ${s.fg}`}
    >
      {s.label}
    </span>
  );
}
