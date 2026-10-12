import { useState } from "react";
import { Clock, FileText, Star } from "lucide-react";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import type { Consultant } from "@/components/consultants/types";
import { BTN_OUTLINE, BTN_PRIMARY, ExpertAvatar, FIELD, tintFor, tintVars } from "@/components/consultants/ui";
import { useBookingsStore, slaMs, type Booking } from "@/lib/bookings";
import { pushBookingCreate } from "@/lib/marketplaceSync";
import { toServerUuid } from "@/lib/remote-ids";
import { useDraftStore } from "@/lib/store";
import { displayTitleFor } from "@/lib/letters/display";

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
  const recordBooking = useBookingsStore((s) => s.recordBooking);

  const open = !!consultant;
  const draft = useDraftStore((s) => (draftId ? s.drafts[draftId] : undefined));
  const draftTitle = draft ? displayTitleFor(draft) : "Your letter";
  const tint = tintVars(tintFor(consultant?.profileId || consultant?.name || "?"));

  function close() {
    setNote("");
    onClose();
  }

  async function handleConfirm() {
    if (!consultant || submitting) return;
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
      setSubmitting(true);
      // AWAIT the create: the consultant's inbox is server-driven, so a failed
      // POST means they never see the request. Firing this and-forgetting would
      // show a false "Booking confirmed" toast over a booking that never landed.
      const ok = await pushBookingCreate(
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
      setSubmitting(false);
      if (!ok) {
        // pushBookingCreate already rolled back the optimistic local row.
        toast.error("Couldn't send your booking request. Please try again.");
        return;
      }
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
      <DialogContent className="gap-0 overflow-hidden rounded-[var(--ds-r-l)] border-[var(--ds-line)] bg-[var(--ds-surface)] p-0 shadow-[var(--ds-shadow-l)] sm:max-w-[460px]">
        {consultant && (
          <>
            {/* Header: a slim pastel band carrying the expert, as on the 6B card */}
            <DialogHeader className="gap-0 p-1.5 pb-0 text-left">
              <div
                className="flex items-center gap-3.5 rounded-[calc(var(--ds-r-l)-5px)] px-4 py-4"
                style={{ background: tint.bg }}
              >
                <ExpertAvatar
                  photoUrl={consultant.photoUrl}
                  name={consultant.name}
                  initials={consultant.initials}
                  seed={consultant.profileId || consultant.name}
                  size={48}
                  ring
                />
                <div className="min-w-0 pr-6">
                  <DialogTitle className="truncate text-[15px] font-medium leading-tight text-[var(--ds-ink)]">
                    {consultant.name}
                  </DialogTitle>
                  <p className="m-0 mt-0.5 truncate text-[12.5px] text-[var(--ds-body)]">{consultant.role}</p>
                  <p className="m-0 mt-1 inline-flex items-center gap-1 text-[12px] text-[var(--ds-body)]">
                    <Star className="size-3 text-[var(--ds-amber-dot)]" fill="currentColor" strokeWidth={0} aria-hidden />
                    <span className="ds-mono font-medium text-[var(--ds-ink)]">{consultant.rating.toFixed(1)}</span>
                    <span className="text-[var(--ds-muted)]">({consultant.reviews} reviews)</span>
                  </p>
                </div>
              </div>
              <DialogDescription className="sr-only">
                Confirm your booking with {consultant.name} and add optional
                focus notes for the review.
              </DialogDescription>
            </DialogHeader>

            <div className="flex flex-col gap-4 px-5 pb-5 pt-4">
              {consultant.specialty && (
                <p className="m-0 text-[13px] leading-snug text-[var(--ds-body)]">{consultant.specialty}</p>
              )}

              {/* The letter that travels with the booking, as a 4B file chip */}
              <div>
                <p className="m-0 mb-1.5 text-[12px] text-[var(--ds-muted)]">Letter</p>
                {draftId ? (
                  <span className="inline-flex h-7 max-w-full items-center gap-1.5 rounded-[var(--ds-r-s)] border border-[var(--ds-line)] bg-[var(--ds-surface-2)] px-2.5 text-[12.5px] text-[var(--ds-body)]">
                    <FileText className="size-3.5 shrink-0 text-[var(--ds-muted)]" aria-hidden />
                    <span className="truncate">{draftTitle}</span>
                  </span>
                ) : (
                  <p className="m-0 text-[12.5px] text-[var(--ds-muted)]">No letter attached.</p>
                )}
              </div>

              {/* Rate summary. This is the specialist's RATE, not an in-app
               * charge, so we don't dress the booking up as a checkout. */}
              <div className="flex flex-col gap-1.5 rounded-[var(--ds-r-m)] bg-[var(--ds-surface-2)] px-3.5 py-3">
                <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                  <span className="ds-mono text-[17px] font-medium text-[var(--ds-ink)]">
                    {consultant.currency ?? "£"}
                    {consultant.price}
                  </span>
                  <span className="inline-flex items-center gap-1 text-[12.5px] text-[var(--ds-muted)]">
                    <Clock className="size-3" aria-hidden />
                    Expected response in{" "}
                    <strong className="font-medium text-[var(--ds-ink)]">{consultant.sla}</strong>
                  </span>
                </div>
                <span className="text-[12px] leading-snug text-[var(--ds-muted)]">
                  This is the specialist's rate. You won't be charged here. This
                  sends a request and you arrange the fee with them directly.
                </span>
              </div>

              {/* Optional note */}
              <div className="flex flex-col gap-1.5">
                <label htmlFor="booking-note" className="text-[12.5px] font-medium text-[var(--ds-ink)]">
                  Focus notes <span className="font-normal text-[var(--ds-muted)]">(optional)</span>
                </label>
                <textarea
                  id="booking-note"
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  placeholder="What should they focus on? For example, check the redundancy selection criteria."
                  rows={3}
                  className={`${FIELD} resize-none py-2.5 leading-relaxed`}
                />
              </div>
            </div>

            <DialogFooter className="flex-col-reverse gap-2 border-t border-[var(--ds-line)] px-5 py-3.5 sm:flex-row">
              <button type="button" onClick={close} disabled={submitting} className={`${BTN_OUTLINE} h-9 px-3.5`}>
                Cancel
              </button>
              <button type="button" onClick={handleConfirm} disabled={submitting} className={`${BTN_PRIMARY} h-9 px-3.5`}>
                {submitting ? "Sending…" : "Send booking request"}
              </button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
