import { useMemo, useState } from "react";
import { useShallow } from "zustand/react/shallow";
import { useBookingsStore, type Booking } from "@/lib/bookings";
import { isProfileComplete, useConsultantStore } from "@/lib/consultantProfile";
import { Check, Clock, FileText, Inbox, MessageSquareReply, X } from "lucide-react";
import { PillTabs, type PageTab } from "@/components/ds";
import { BookingThread } from "@/components/consultants/BookingThread";
import { StatusBadge } from "@/components/consultants/StatusBadge";
import {
  BTN_GHOST,
  BTN_OUTLINE,
  BTN_PRIMARY,
  FIELD,
  PaperThumb,
  Row,
  RowList,
  RowNote,
  tintFor,
} from "@/components/consultants/ui";
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
 * have on a localStorage booking), with one pill tab per status (2A)
 * over 13B-style rows, and surfaces the accept / decline / mark-delivered
 * actions on each row.
 *
 * Empty state explains discovery is automatic so the consultant
 * understands what to expect after publishing their profile.
 */

const STATUS_LABEL: Record<Booking["status"], string> = {
  requested: "New",
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
  const [activeTab, setActiveTab] = useState<string>("all");

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
      <div className="flex flex-col items-center rounded-[16px] bg-[var(--ds-surface-2)] px-6 py-12 text-center">
        <span className="mb-3 grid size-10 place-items-center rounded-full bg-[var(--ds-surface)] text-[var(--ds-muted)] shadow-[var(--ds-shadow-s)]">
          <Inbox className="size-5" aria-hidden />
        </span>
        <p className="m-0 max-w-[52ch] text-[13.5px] leading-relaxed text-[var(--ds-body)]">
          Your inbox is empty. As soon as an HR team books a review with you,
          it'll land here with the full letter, evidence pack, and timer.
        </p>
        <p className="m-0 mt-2 text-[12.5px] text-[var(--ds-muted)]">
          {/* Never claim the card is live while it is waiting for review. */}
          {profile && isProfileComplete(profile) && profile.status === "published"
            ? "Your card is live now. Discovery is automatic."
            : profile && isProfileComplete(profile)
              ? "Your card is under review. You'll show up in search once it's approved."
              : "Complete your profile to start showing up in search."}
        </p>
      </div>
    );
  }

  const tabs: PageTab[] = [
    { id: "all", label: "All", count: bookings.length },
    ...STATUS_ORDER.filter((s) => grouped[s].length > 0).map((s) => ({
      id: s,
      label: STATUS_LABEL[s],
      count: grouped[s].length,
    })),
  ];
  const tab = tabs.some((t) => t.id === activeTab) ? activeTab : "all";
  const visible =
    tab === "all"
      ? STATUS_ORDER.flatMap((s) => grouped[s])
      : grouped[tab as Booking["status"]];

  return (
    <div>
      <PillTabs tabs={tabs} activeTab={tab} onTabChange={setActiveTab} className="mt-0 mb-3" />
      <RowList>
        {visible.map((b) => (
          <BookingRow key={b.id} booking={b} />
        ))}
      </RowList>
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

  const canRespond = booking.status === "requested" && !showDecline;
  const canDeliver = booking.status === "accepted" && booking.paymentStatus === "paid" && !showDeliver;

  return (
    <Row attention={booking.status === "requested"}>
      <div className="flex items-start gap-3.5 sm:gap-4">
        <PaperThumb tint={tintFor(booking.id)} className="ml-1 mt-0.5" />
        <div className="min-w-0 flex-1">
          <header className="flex flex-wrap items-start justify-between gap-x-4 gap-y-2">
            <div className="min-w-0 flex-1 basis-[200px]">
              <h4 className="m-0 truncate text-[14px] font-medium text-[var(--ds-ink)]">
                {matterTitle}
              </h4>
              <p className="m-0 mt-0.5 flex flex-wrap items-center gap-x-2 text-[12.5px] text-[var(--ds-muted)]">
                <span>Requested {requestedAgo}</span>
                {dueIn && booking.status === "accepted" && (
                  <>
                    <span aria-hidden className="text-[var(--ds-faint)]">·</span>
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

          {(booking.message ||
            booking.responseNote ||
            showDecline ||
            showDeliver ||
            (booking.status === "accepted" && booking.paymentStatus !== "paid") ||
            (booking.status === "delivered" && booking.deliveryNote)) && (
            <div className="mt-2.5 flex flex-col gap-2">
              {booking.message && (
                <RowNote label="From HR" className={booking.status === "requested" ? "bg-[var(--ds-surface)]" : undefined}>
                  {booking.message}
                </RowNote>
              )}

              {booking.responseNote && (
                <p className="m-0 text-[12.5px] text-[var(--ds-muted)]">
                  Your response: {booking.responseNote}
                </p>
              )}

              {showDecline && (
                <div className="flex flex-col gap-2 rounded-[12px] border border-[var(--ds-line)] bg-[var(--ds-surface)] p-3">
                  <textarea
                    value={declineNote}
                    onChange={(e) => setDeclineNote(e.target.value)}
                    placeholder="Brief reason (optional). HR can rebook with a different specialist."
                    aria-label="Reason for declining"
                    rows={2}
                    className={`${FIELD} resize-none py-2`}
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
                      className={`${BTN_PRIMARY} bg-[var(--ds-red-fg)] hover:bg-[var(--ds-red-fg)] hover:brightness-95 active:brightness-90`}
                    >
                      Confirm decline
                    </button>
                    <button type="button" onClick={() => setShowDecline(false)} className={BTN_OUTLINE}>
                      Cancel
                    </button>
                  </div>
                </div>
              )}

              {booking.status === "accepted" && booking.paymentStatus !== "paid" && (
                <p className="m-0 text-[12.5px] text-[var(--ds-muted)]">
                  {booking.paymentStatus === "processing"
                    ? "Payment is processing. You can start once it clears and the draft opens."
                    : booking.paymentStatus === "refunded" ||
                        booking.paymentStatus === "disputed" ||
                        booking.paymentStatus === "dispute_lost"
                      ? "The payment for this booking was refunded or disputed, so work is paused and the draft is closed."
                      : "Waiting for HR to pay. The draft opens and you can start once the booking is paid."}
                </p>
              )}

              {showDeliver && (
                <div className="flex flex-col gap-2 rounded-[12px] border border-[var(--ds-line)] bg-[var(--ds-surface)] p-3">
                  <textarea
                    value={deliveryNote}
                    onChange={(e) => setDeliveryNote(e.target.value)}
                    placeholder="Summary of your review: clauses changed, risks flagged, follow-up needed."
                    aria-label="Delivery summary"
                    rows={3}
                    className={`${FIELD} resize-none py-2`}
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
                      className={BTN_PRIMARY}
                    >
                      Send delivery
                    </button>
                    <button type="button" onClick={() => setShowDeliver(false)} className={BTN_OUTLINE}>
                      Cancel
                    </button>
                  </div>
                </div>
              )}

              {booking.status === "delivered" && booking.deliveryNote && (
                <RowNote tone="green" label="Delivered">
                  {booking.deliveryNote}
                </RowNote>
              )}
            </div>
          )}

          <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
              {canRespond && (
                <>
                  <button
                    type="button"
                    onClick={() => {
                      accept(booking.id);
                      void pushBookingRespond(booking.id, "accept");
                    }}
                    className={BTN_PRIMARY}
                  >
                    <Check className="size-3.5" aria-hidden />
                    Accept
                  </button>
                  <button type="button" onClick={() => setShowDecline(true)} className={BTN_OUTLINE}>
                    <X className="size-3.5" aria-hidden />
                    Decline
                  </button>
                  {/* No "Open draft" link in the requested state: the consultant
                   * hasn't accepted yet, isn't a tenant member, and booking.draftId
                   * is a server UUID — so /editor/:id dead-ends at "Draft not found".
                   * The read-only review surface (/c/review/:id) only exists once the
                   * booking is accepted, which is why it appears in that state below. */}
                </>
              )}
              {canDeliver && (
                <>
                  {/* Open the read-only review surface — scoped to this booking,
                   * not the raw /editor/:id (which is HR-private). */}
                  <button type="button" onClick={() => setShowDeliver(true)} className={BTN_PRIMARY}>
                    <MessageSquareReply className="size-3.5" aria-hidden />
                    Mark delivered
                  </button>
                  <a href={`/c/review/${booking.id}`} className={BTN_GHOST}>
                    <FileText className="size-3.5" aria-hidden />
                    Open draft
                  </a>
                </>
              )}
            <span className={canRespond || canDeliver ? undefined : "-ml-2.5"}>
              <BookingThread
                booking={booking}
                perspective="consultant"
                title="HR"
                subtitle={matterTitle}
                testId={`inbox-messages-${booking.id}`}
              />
            </span>
          </div>
        </div>
      </div>
    </Row>
  );
}

export function relativeTime(ts: number, future = false): string {
  const now = Date.now();
  const diffMs = future ? ts - now : now - ts;
  if (diffMs < 0) return future ? "overdue" : "just now";
  // Floor (not round) so elapsed time falls into the lower bucket — otherwise a
  // 45-second-old timestamp rounds to "1 min ago" instead of "just now", and
  // 90 min shows as "2h ago". (Matches CustomTemplateCard's relative-time.)
  const mins = Math.floor(diffMs / 60000);
  if (mins < 1) return future ? "<1 min" : "just now";
  if (mins < 60) return `${mins} min${future ? "" : " ago"}`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h${future ? "" : " ago"}`;
  const days = Math.floor(hours / 24);
  return `${days}d${future ? "" : " ago"}`;
}
