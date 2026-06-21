import { useState } from "react";
import { Star } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import type { Consultant } from "@/components/consultants/types";
import { useBookingsStore, slaMs, type Booking } from "@/lib/bookings";
import { pushBookingCreate } from "@/lib/marketplaceSync";
import { toServerUuid } from "@/lib/remote-ids";
import { cn } from "@/lib/utils";

interface BookingDialogProps {
  /** Consultant to book. When null/undefined the dialog is closed. */
  consultant: Consultant | null | undefined;
  /** Draft context. Empty string allowed (browsing without a draft). */
  draftId: string;
  /** Called when the dialog should close (Cancel or after booking). */
  onClose: () => void;
  /** Called after a booking is successfully recorded. */
  onBooked?: (booking: Booking) => void;
}

export function BookingDialog({
  consultant,
  draftId,
  onClose,
  onBooked,
}: BookingDialogProps) {
  const [note, setNote] = useState("");
  const recordBooking = useBookingsStore((s) => s.recordBooking);

  const open = !!consultant;

  function handleConfirm() {
    if (!consultant) return;
    const message = note.trim() || undefined;
    const booking = recordBooking({
      consultantInitials: consultant.initials,
      // Carry the stable profile id so the HR-side bookings list can match
      // this booking back to the consultant card (name, photo) reliably —
      // initials aren't unique. Undefined for seed consultants.
      consultantProfileId: consultant.profileId,
      draftId,
      // Pass the optional note through to the booking record so the
      // consultant inbox can show "HR: ..." context on the request card.
      message,
      expectedDeliveryAt: Date.now() + slaMs(consultant.sla),
    });
    // Dual-write: mirror the booking to the server, but only when the
    // consultant is a real server-side record (has profileId). The 14
    // hardcoded seed consultants don't exist server-side, so a POST
    // would 404 — we skip the call and keep the booking local-only for
    // them, which is the only honest thing to do.
    if (consultant.profileId) {
      void pushBookingCreate(
        {
          consultantProfileId: consultant.profileId,
          // The draft_id column is a Postgres uuid. Local draft ids are
          // readable strings ("draft_x7k2…"), so map through the same
          // deterministic bridge the dual-write layer uses to write the
          // draft row — otherwise the INSERT 500s (the flagship "book a
          // specialist on this letter" flow silently dead-ended), and the
          // consultant's share-token review couldn't find the draft.
          draftId: draftId ? toServerUuid(draftId) : null,
          message,
          expectedDeliveryAt: new Date(Date.now() + slaMs(consultant.sla)).toISOString(),
        },
        // Pass the optimistic local id so the sync layer can swap it
        // out for the server's UUID once the API responds. Prevents the
        // "same booking shows up twice" duplicate on next hydrate.
        booking.id,
        consultant.initials,
      );
    }
    onClose();
    onBooked?.(booking);
  }

  // Reset note when dialog closes
  function handleOpenChange(isOpen: boolean) {
    if (!isOpen) {
      setNote("");
      onClose();
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-[420px] p-0 overflow-hidden">
        {consultant && (
          <>
            {/* Header */}
            <DialogHeader className="px-5 pt-5 pb-0">
              <div className="flex items-center gap-3 mb-3">
                <img
                  src={consultant.photoUrl}
                  alt={consultant.name}
                  className="size-12 rounded-full object-cover border-2 border-white shadow"
                />
                <div>
                  <DialogTitle className="text-[15px] font-semibold leading-tight text-[var(--ds-ink)]">
                    {consultant.name}
                  </DialogTitle>
                  <p className="text-[11px] text-[var(--ds-muted)] mt-0.5">
                    {consultant.role}
                  </p>
                </div>
              </div>
              <DialogDescription className="sr-only">
                Confirm your booking with {consultant.name} and add optional
                focus notes for the review.
              </DialogDescription>
              {/* Rating row */}
              <div className="flex items-center gap-1.5 text-[11px] mb-2">
                <Star className="size-3 text-[var(--ds-amber-fg)]" fill="currentColor" strokeWidth={0} />
                <span className="font-semibold text-[var(--ds-ink)]">{consultant.rating.toFixed(1)}</span>
                <span className="text-[var(--ds-muted)]">({consultant.reviews} reviews)</span>
              </div>
            </DialogHeader>

            <div className="px-5 pb-4 flex flex-col gap-3">
              {/* Specialty quote */}
              <div
                className={cn(
                  "text-[11.5px] text-[var(--ds-body)] px-3 py-2.5 bg-[var(--ds-canvas)] rounded-[8px] leading-snug",
                  consultant.top && "border-l-2 border-[var(--ds-ink)]",
                )}
              >
                "{consultant.specialty}"
              </div>

              {/* Cost summary */}
              <div className="flex items-center gap-3 px-3 py-2.5 rounded-[8px] bg-[var(--ds-surface-2)] border border-[var(--ds-line)] text-[12px]">
                <span className="font-semibold text-[var(--ds-ink)] text-[16px]">
                  {(consultant.currency ?? "£")}{consultant.price}
                </span>
                <span className="text-[var(--ds-muted)]">·</span>
                <span className="text-[var(--ds-muted)]">
                  Expected response in{" "}
                  <strong className="text-[var(--ds-ink)] font-semibold">
                    {consultant.sla}
                  </strong>
                </span>
              </div>

              {/* Optional note */}
              <div className="flex flex-col gap-1.5">
                <label
                  htmlFor="booking-note"
                  className="text-[12px] font-semibold tracking-[0.01em] text-[var(--ds-ink)]"
                >
                  Focus notes (optional)
                </label>
                <textarea
                  id="booking-note"
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  placeholder="What should they focus on? e.g. 'Check the redundancy selection criteria'"
                  rows={3}
                  className="w-full rounded-[8px] border border-[var(--ds-line)] bg-white px-3 py-2 text-[14px] text-[var(--ds-ink)] placeholder:text-[var(--ds-subtle)] resize-none focus:border-[var(--ds-ink)] focus:outline-none focus:ring-2 focus:ring-[var(--ds-ink)]/10"
                />
              </div>
            </div>

            <DialogFooter className="px-5 pb-5 flex-col-reverse sm:flex-row gap-2">
              <Button
                variant="outline"
                onClick={onClose}
                className="flex-1 sm:flex-none text-[13px]"
              >
                Cancel
              </Button>
              <Button
                onClick={handleConfirm}
                className="flex-1 sm:flex-none bg-[var(--ds-ink)] text-white hover:-translate-y-px hover:shadow-md text-[13px] font-semibold"
              >
                Confirm booking · {(consultant.currency ?? "£")}{consultant.price}
              </Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
