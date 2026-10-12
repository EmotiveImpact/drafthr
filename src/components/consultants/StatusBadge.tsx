import type { BookingStatus } from "@/lib/bookings";
import { cn } from "@/lib/utils";

/**
 * Single source of truth for booking-status pills. Previously the
 * consultant inbox and the HR bookings list each defined their own
 * StatusBadge with diverging labels (requested → "New" vs "Pending")
 * for the same status. This one component keeps them consistent.
 *
 * Labels are neutral so they read correctly from both sides of a
 * booking (consultant inbox and HR list).
 *
 * Styled as the 13B status pill: sentence case, a leading dot, soft fill.
 */
const STYLES: Record<BookingStatus, { pill: string; dot: string; label: string }> = {
  requested: {
    pill: "bg-[var(--ds-surface)] text-[var(--ds-amber-fg)] shadow-[inset_0_0_0_1px_var(--ds-amber-dot)]",
    dot: "bg-[var(--ds-amber-dot)]",
    label: "Requested",
  },
  accepted: { pill: "bg-[var(--ds-blue-bg)] text-[var(--ds-blue-fg)]", dot: "bg-[var(--ds-blue-fg)]", label: "Accepted" },
  delivered: { pill: "bg-[var(--ds-green-bg)] text-[var(--ds-green-fg)]", dot: "bg-[var(--ds-green-fg)]", label: "Delivered" },
  completed: { pill: "bg-[var(--ds-chip)] text-[var(--ds-body)]", dot: "bg-[var(--ds-faint)]", label: "Completed" },
  declined: { pill: "bg-[var(--ds-red-bg)] text-[var(--ds-red-fg)]", dot: "bg-[var(--ds-red-fg)]", label: "Declined" },
};

export function StatusBadge({ status, className }: { status: BookingStatus; className?: string }) {
  const s = STYLES[status] ?? STYLES.requested;
  return <Pill className={cn(s.pill, className)} dot={s.dot} label={s.label} />;
}

/** The bare 13B pill, for statuses that are not booking statuses. */
export function Pill({ className, dot, label }: { className?: string; dot?: string; label: string }) {
  return (
    <span
      className={cn(
        "inline-flex h-6 max-w-full flex-shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full px-[9px] text-[12px] font-medium",
        className,
      )}
    >
      {dot && <span aria-hidden className={cn("size-1.5 shrink-0 rounded-full", dot)} />}
      {label}
    </span>
  );
}
