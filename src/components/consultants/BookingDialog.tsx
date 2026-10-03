import { useRef, useState } from "react";
import { Star } from "lucide-react";
import { toast } from "sonner";
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
import { slaMs, type Booking } from "@/lib/bookings";
import { pushBookingCreate } from "@/lib/marketplaceSync";
import { captureMarketplaceScope, isMarketplaceScopeCurrent } from "@/lib/marketplace-scope";
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
  const [submitting, setSubmitting] = useState(false);
  const submittingRef = useRef(false);
  const requestRef = useRef<{ fingerprint: string; id: string; expectedDeliveryAt: string } | null>(null);

  const open = !!consultant;

  function close() {
    setNote("");
    requestRef.current = null;
    onClose();
  }

  async function handleConfirm() {
    if (!consultant || submittingRef.current) return;
    if (!consultant.profileId) {
      toast.error("This consultant is not available for database-backed bookings.");
      return;
    }
    const scope = captureMarketplaceScope();
    if (!scope) return;
    submittingRef.current = true;
    setSubmitting(true);
    const message = note.trim() || undefined;
    const fingerprint = JSON.stringify([consultant.profileId, draftId, message ?? ""]);
    if (requestRef.current?.fingerprint !== fingerprint) requestRef.current = {
      fingerprint, id: crypto.randomUUID(), expectedDeliveryAt: new Date(Date.now() + slaMs(consultant.sla)).toISOString(),
    };
    let booking: Booking | null;
    try {
      booking = await pushBookingCreate({
        requestId: requestRef.current.id,
        consultantProfileId: consultant.profileId,
        draftId: draftId ? toServerUuid(draftId) : null,
        message,
        expectedDeliveryAt: requestRef.current.expectedDeliveryAt,
      }, consultant.initials, draftId || undefined);
    } finally {
      submittingRef.current = false;
      setSubmitting(false);
    }
    if (!isMarketplaceScopeCurrent(scope)) return;
    if (!booking) {
      toast.error("Your request wasn't confirmed. Check My bookings before sending it again.");
      return;
    }
    close();
    onBooked?.(booking);
  }

  // Reset note when dialog closes via Escape / overlay click.
  function handleOpenChange(isOpen: boolean) {
    if (!isOpen && !submitting) close();
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

              {/* Rate summary. This is the specialist's RATE, not an in-app
               * charge — DraftHR doesn't process the payment, so we don't
               * dress the booking up as a checkout. */}
              <div className="flex flex-col gap-1 px-3 py-2.5 rounded-[8px] bg-[var(--ds-surface-2)] border border-[var(--ds-line)] text-[12px]">
                <div className="flex items-center gap-3">
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
                <span className="text-[11px] text-[var(--ds-muted)] leading-snug">
                  This is the specialist's rate. You won't be charged here —
                  this sends a request and you arrange the fee with them directly.
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
                onClick={close}
                disabled={submitting}
                className="flex-1 sm:flex-none text-[13px]"
              >
                Cancel
              </Button>
              <Button
                onClick={handleConfirm}
                disabled={submitting || !consultant.profileId}
                className="flex-1 sm:flex-none bg-[var(--ds-ink)] text-white hover:-translate-y-px hover:shadow-md text-[13px] font-semibold disabled:opacity-60"
              >
                {submitting ? "Sending…" : "Send booking request"}
              </Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
