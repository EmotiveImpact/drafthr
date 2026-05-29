import { useMemo, useState } from "react";
import { useShallow } from "zustand/react/shallow";
import { useBookingsStore, type Booking } from "@/lib/bookings";
import { useConsultantStore } from "@/lib/consultantProfile";
import { Check, Clock, FileText, MessageSquareReply, X } from "lucide-react";
import { BookingThread } from "@/components/consultants/BookingThread";
import { StatusBadge } from "@/components/consultants/StatusBadge";
import { pushBookingRespond } from "@/lib/marketplaceSync";

/** Stable empty-array reference. bookingsForConsultant builds a fresh
 *  array every call; returning a new `[]` literal from the selector's
 *  false branch would also churn. useShallow compares contents so the
 *  fresh-array case no longer triggers a re-render storm, and this
 *  constant keeps the empty case referentially stable. */
const EMPTY_BOOKINGS: Booking[] = [];

/**
 * Consultant-side bookings inbox. Reads everything addressed to the
 * signed-in consultant (matched by initials — the only stable id we
 * have on a localStorage booking), groups by status, and surfaces the
 * accept / decline / mark-delivered actions inline.
 *
 * Empty state explains discovery is automatic so the consultant
 * understands what to expect after publishing their profile.
 */

const STATUS_LABEL: Record<Booking["status"], string> = {
  requested: "New requests",
  accepted: "In progress",
  delivered: "Delivered",
  completed: "Completed",
  declined: "Declined",
};

const STATUS_ORDER: Booking["status"][] = [
  "requested",
  "accepted",
  "delivered",
  "completed",
  "declined",
];

export function ConsultantInbox() {
  const profile = useConsultantStore((s) => s.profile);
  const bookings = useBookingsStore(
    useShallow((s) =>
      profile ? s.bookingsForConsultant(profile.initials, profile.id) : EMPTY_BOOKINGS,
    ),
  );

  const grouped = useMemo(() => {
    const g: Record<Booking["status"], Booking[]> = {
      requested: [],
      accepted: [],
      delivered: [],
      completed: [],
      declined: [],
    };
    bookings.forEach((b) => g[b.status].push(b));
    return g;
  }, [bookings]);

  if (bookings.length === 0) {
    return (
      <div className="rounded-[10px] border border-dashed border-[var(--ds-line)] px-5 py-10 text-center">
        <p className="text-[13.5px] text-[var(--ds-body)]">
          Your inbox is empty. As soon as an HR team books a review with you,
          it'll land here with the full letter, evidence pack, and timer.
        </p>
        <p className="mt-2 text-[11.5px] text-[var(--ds-muted)]">
          {profile
            ? "Your card is live now — discovery is automatic."
            : "Complete your profile to start showing up in search."}
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {STATUS_ORDER.map((status) => {
        const list = grouped[status];
        if (list.length === 0) return null;
        return (
          <section key={status}>
            <h3 className="mb-2 text-[11.5px] font-semibold uppercase tracking-[0.14em] text-[var(--ds-muted)]">
              {STATUS_LABEL[status]} ({list.length})
            </h3>
            <div className="space-y-2">
              {list.map((b) => (
                <BookingRow key={b.id} booking={b} />
              ))}
            </div>
          </section>
        );
      })}
    </div>
  );
}

function BookingRow({ booking }: { booking: Booking }) {
  const accept = useBookingsStore((s) => s.acceptBooking);
  const decline = useBookingsStore((s) => s.declineBooking);
  const deliver = useBookingsStore((s) => s.deliverBooking);
  const [showDecline, setShowDecline] = useState(false);
  const [declineNote, setDeclineNote] = useState("");
  const [showDeliver, setShowDeliver] = useState(false);
  const [deliveryNote, setDeliveryNote] = useState("");

  const matterTitle = booking.matterTitle ?? `Draft #${booking.draftId.slice(0, 8)}`;
  const requestedAgo = relativeTime(booking.bookedAt);
  const dueIn = booking.expectedDeliveryAt
    ? relativeTime(booking.expectedDeliveryAt, true)
    : null;

  return (
    <article className="rounded-[10px] border border-[var(--ds-line)] bg-[var(--ds-surface)] p-4">
      <header className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h4 className="truncate text-[14px] font-semibold text-[var(--ds-ink)]">
            {matterTitle}
          </h4>
          <p className="mt-0.5 text-[11.5px] text-[var(--ds-muted)]">
            Requested {requestedAgo}
            {dueIn && booking.status === "accepted" && (
              <>
                <span className="mx-2">·</span>
                <span className="inline-flex items-center gap-1">
                  <Clock className="size-3" aria-hidden />
                  Due in {dueIn}
                </span>
              </>
            )}
          </p>
        </div>
        <StatusBadge status={booking.status} />
      </header>

      {booking.message && (
        <p className="mt-2 rounded-md bg-[var(--ds-surface-2)] px-3 py-2 text-[12.5px] leading-snug text-[var(--ds-body)]">
          <span className="mr-1 font-semibold text-[var(--ds-ink)]">HR:</span>
          {booking.message}
        </p>
      )}

      {booking.responseNote && (
        <p className="mt-2 text-[11.5px] italic text-[var(--ds-muted)]">
          Your response: {booking.responseNote}
        </p>
      )}

      {booking.status === "requested" && !showDecline && (
        <div className="mt-3 flex gap-2">
          <button
            type="button"
            onClick={() => {
              accept(booking.id);
              void pushBookingRespond(booking.id, "accept");
            }}
            className="inline-flex h-8 items-center gap-1.5 rounded-[6px] bg-[var(--ds-ink)] px-3 text-[12px] font-semibold text-white transition hover:-translate-y-px hover:shadow-md"
          >
            <Check className="size-3.5" aria-hidden />
            Accept
          </button>
          <button
            type="button"
            onClick={() => setShowDecline(true)}
            className="inline-flex h-8 items-center gap-1.5 rounded-[6px] border border-[var(--ds-line)] bg-white px-3 text-[12px] font-semibold text-[var(--ds-ink)] transition hover:border-[var(--ds-subtle)] hover:bg-[var(--ds-surface-2)]"
          >
            <X className="size-3.5" aria-hidden />
            Decline
          </button>
          {booking.draftId && (
            <a
              href={`/editor/${booking.draftId}`}
              className="ml-auto inline-flex h-8 items-center gap-1.5 text-[12px] font-semibold text-[var(--ds-muted)] transition hover:text-[var(--ds-ink)]"
            >
              <FileText className="size-3.5" aria-hidden />
              Open draft
            </a>
          )}
        </div>
      )}

      {showDecline && (
        <div className="mt-3 space-y-2">
          <textarea
            value={declineNote}
            onChange={(e) => setDeclineNote(e.target.value)}
            placeholder="Brief reason (optional) — HR can rebook with a different specialist."
            rows={2}
            className="w-full rounded-[6px] border border-[var(--ds-line)] bg-white px-2.5 py-1.5 text-[12.5px] text-[var(--ds-ink)] placeholder:text-[var(--ds-subtle)] focus:border-[var(--ds-ink)] focus:outline-none focus:ring-2 focus:ring-[var(--ds-ink)]/10"
          />
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => {
                const note = declineNote.trim() || undefined;
                decline(booking.id, note);
                void pushBookingRespond(booking.id, "decline", { note });
                setShowDecline(false);
              }}
              className="inline-flex h-7 items-center rounded-[6px] bg-[var(--ds-red-fg)] px-2.5 text-[11.5px] font-semibold text-white"
            >
              Confirm decline
            </button>
            <button
              type="button"
              onClick={() => setShowDecline(false)}
              className="inline-flex h-7 items-center rounded-[6px] border border-[var(--ds-line)] bg-white px-2.5 text-[11.5px] font-semibold text-[var(--ds-ink)]"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {booking.status === "accepted" && !showDeliver && (
        <div className="mt-3 flex gap-2">
          <button
            type="button"
            onClick={() => setShowDeliver(true)}
            className="inline-flex h-8 items-center gap-1.5 rounded-[6px] bg-[var(--ds-ink)] px-3 text-[12px] font-semibold text-white transition hover:-translate-y-px hover:shadow-md"
          >
            <MessageSquareReply className="size-3.5" aria-hidden />
            Mark delivered
          </button>
          {/* Open the read-only review surface — scoped to this booking,
           * not the raw /editor/:id (which is HR-private). */}
          <a
            href={`/c/review/${booking.id}`}
            className="ml-auto inline-flex h-8 items-center gap-1.5 text-[12px] font-semibold text-[var(--ds-muted)] transition hover:text-[var(--ds-ink)]"
          >
            <FileText className="size-3.5" aria-hidden />
            Open draft
          </a>
        </div>
      )}

      {showDeliver && (
        <div className="mt-3 space-y-2">
          <textarea
            value={deliveryNote}
            onChange={(e) => setDeliveryNote(e.target.value)}
            placeholder="Summary of your review — clauses changed, risks flagged, follow-up needed."
            rows={3}
            className="w-full rounded-[6px] border border-[var(--ds-line)] bg-white px-2.5 py-1.5 text-[12.5px] text-[var(--ds-ink)] placeholder:text-[var(--ds-subtle)] focus:border-[var(--ds-ink)] focus:outline-none focus:ring-2 focus:ring-[var(--ds-ink)]/10"
          />
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => {
                const note = deliveryNote.trim() || undefined;
                deliver(booking.id, note);
                void pushBookingRespond(booking.id, "deliver", { note });
                setShowDeliver(false);
              }}
              disabled={deliveryNote.trim().length < 10}
              className="inline-flex h-7 items-center rounded-[6px] bg-[var(--ds-ink)] px-2.5 text-[11.5px] font-semibold text-white disabled:opacity-60"
            >
              Send delivery
            </button>
            <button
              type="button"
              onClick={() => setShowDeliver(false)}
              className="inline-flex h-7 items-center rounded-[6px] border border-[var(--ds-line)] bg-white px-2.5 text-[11.5px] font-semibold text-[var(--ds-ink)]"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {booking.status === "delivered" && booking.deliveryNote && (
        <p className="mt-2 rounded-md border border-[var(--ds-green-fg)]/30 bg-[var(--ds-green-bg)] px-3 py-2 text-[12.5px] leading-snug text-[var(--ds-ink)]">
          <span className="mr-1 font-semibold text-[var(--ds-green-fg)]">Delivered:</span>
          {booking.deliveryNote}
        </p>
      )}

      <BookingThread booking={booking} perspective="consultant" />
    </article>
  );
}

function relativeTime(ts: number, future = false): string {
  const now = Date.now();
  const diffMs = future ? ts - now : now - ts;
  if (diffMs < 0) return future ? "overdue" : "just now";
  const mins = Math.round(diffMs / 60000);
  if (mins < 1) return future ? "<1 min" : "just now";
  if (mins < 60) return `${mins} min${future ? "" : " ago"}`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours}h${future ? "" : " ago"}`;
  const days = Math.round(hours / 24);
  return `${days}d${future ? "" : " ago"}`;
}
