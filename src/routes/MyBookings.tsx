import { PageHeader, type PageTab } from "@/components/ds";
import { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowLeft, Star, FileText, Inbox, Sparkles } from "lucide-react";
import {
  BTN_GHOST,
  BTN_OUTLINE,
  BTN_PRIMARY,
  ExpertAvatar,
  Row,
  RowList,
  RowNote,
} from "@/components/consultants/ui";
import { useBookingsStore, type Booking } from "@/lib/bookings";
import type { Consultant } from "@/components/consultants/types";
import { useConsultantStore, isProfileComplete } from "@/lib/consultantProfile";
import { BookingThread } from "@/components/consultants/BookingThread";
import { StatusBadge } from "@/components/consultants/StatusBadge";
import { pullMyBookings, pushBookingRespond } from "@/lib/marketplaceSync";
import { getStripeConnectStatus, startBookingCheckout } from "@/lib/consultantApi";
import { toast } from "sonner";

/**
 * /bookings — HR-side bookings list.
 *
 * Mirrors the consultant inbox but from the requester's perspective.
 * Shows every booking the signed-in HR user has placed, with one pill tab
 * per status (2A) over 13B-style rows. Delivered bookings surface a rating
 * widget so the buyer can close the loop on the consultant.
 *
 * The localStorage store still drives this — the server-side switch
 * will plug into useBookingsStore later (likely via a useBookingsQuery
 * hook) without changing this component's API.
 */

const STATUS_LABEL: Record<Booking["status"], string> = {
  requested: "Awaiting response",
  accepted: "In progress",
  delivered: "Ready for review",
  completed: "Completed",
  declined: "Declined",
};

const STATUS_ORDER: Booking["status"][] = [
  "delivered", // act on these first
  "requested",
  "accepted",
  "completed",
  "declined",
];

const PAGE = "mx-auto w-full max-w-[1120px] px-4 pb-24 pt-8 sm:px-8 sm:pt-11 lg:px-11";

export function MyBookings() {
  const nav = useNavigate();
  const bookings = useBookingsStore((s) => s.bookings);

  // True until the first server hydrate resolves. On a fresh device the
  // store starts empty, so without this the page flashes "No bookings yet"
  // before the fetched bookings pop in. We render a skeleton during this
  // window instead of the empty state.
  const [hydrating, setHydrating] = useState(true);
  // A failed hydrate must not masquerade as "No bookings yet" on a fresh device
  // — track it so we can show an error + retry instead of a false empty state.
  const [loadFailed, setLoadFailed] = useState(false);
  // Whether the marketplace operator has Stripe configured — gates the "Pay"
  // affordance so it only appears when payments are actually available.
  const [paymentsOn, setPaymentsOn] = useState(false);
  // Selected status tab ("all" or a booking status).
  const [activeTab, setActiveTab] = useState<string>("all");

  const hydrate = useCallback(async () => {
    setHydrating(true);
    setLoadFailed(false);
    const ok = await pullMyBookings();
    setHydrating(false);
    if (!ok) setLoadFailed(true);
  }, []);

  // Hydrate the HR-side bookings list from the server on mount so a
  // booking placed on device A shows up on device B.
  useEffect(() => {
    let cancelled = false;
    void getStripeConnectStatus().then((r) => {
      if (!cancelled && r.ok) setPaymentsOn(r.data.configured);
    });
    void hydrate();
    return () => {
      cancelled = true;
    };
  }, [hydrate]);
  const myProfile = useConsultantStore((s) => s.profile);
  const myCard =
    myProfile && isProfileComplete(myProfile)
      ? ({
          initials: myProfile.initials,
          name: myProfile.fullName,
          role: myProfile.role,
          rating: myProfile.rating,
          reviews: myProfile.reviews,
          price: myProfile.price,
          sla: myProfile.sla,
          avatarFrom: "from-amber-200",
          avatarTo: "to-amber-300",
          // Initials on a tint stand in when there is no photo.
          photoUrl: myProfile.photoUrl || "",
          specialty: myProfile.specialty,
          specialties: myProfile.specialties,
        } as Consultant)
      : null;
  // Only real cards: the signed-in consultant's own (if complete). Booking
  // rows already carry the server-resolved consultantName for display, so no
  // seed lookup is needed.
  const allConsultants = myCard ? [myCard] : [];

  // First-load skeleton: the store is empty but the server fetch is still
  // in flight, so show muted placeholder rows rather than flashing the
  // "No bookings yet" empty state. Once the fetch resolves we fall through
  // to either the real empty state or the list below.
  if (hydrating && bookings.length === 0) {
    return (
      <div className={PAGE}>
        <header className="mb-8">
          <div className="h-3 w-24 animate-pulse rounded bg-[var(--ds-surface-2)]" />
          <div className="mt-3 h-9 w-48 animate-pulse rounded bg-[var(--ds-surface-2)]" />
          <div className="mt-3 h-4 w-80 max-w-full animate-pulse rounded bg-[var(--ds-surface-2)]" />
          <div className="mt-7 h-9 w-[420px] max-w-full animate-pulse rounded-[var(--ds-r-m)] bg-[var(--ds-surface-2)]" />
        </header>
        <div className="space-y-2" aria-hidden>
          {[0, 1, 2].map((i) => (
            <div key={i} className="flex items-center gap-4 px-3.5 py-3.5">
              <div className="size-10 animate-pulse rounded-full bg-[var(--ds-surface-2)]" />
              <div className="flex-1 space-y-2">
                <div className="h-3.5 w-48 animate-pulse rounded bg-[var(--ds-surface-2)]" />
                <div className="h-3 w-72 max-w-full animate-pulse rounded bg-[var(--ds-surface-2)]" />
              </div>
            </div>
          ))}
        </div>
        <span className="sr-only">Loading your bookings…</span>
      </div>
    );
  }

  if (bookings.length === 0) {
    return (
      <div className={PAGE}>
        <PageHeader
          crumbs={[{ label: "Marketplace", href: "/consultants" }, { label: "My bookings" }]}
          title="My bookings"
        />
        <div className="flex flex-col items-center rounded-[var(--ds-r-l)] bg-[var(--ds-surface-2)] px-6 py-16 text-center">
          <span className="mb-3 grid size-10 place-items-center rounded-full bg-[var(--ds-surface)] text-[var(--ds-muted)] shadow-[var(--ds-shadow-s)]">
            <Inbox className="size-5" aria-hidden />
          </span>
          <h2 className="m-0 text-[15px] font-medium text-[var(--ds-ink)]">
            {loadFailed ? "Couldn't load your bookings." : "No bookings yet."}
          </h2>
          <p className="m-0 mt-1.5 max-w-[56ch] text-[13px] leading-relaxed text-[var(--ds-muted)]">
            {loadFailed
              ? "Something went wrong fetching your bookings. This doesn't mean they're gone. Check your connection and try again."
              : "Once you've booked a consultant for a review, every request and its status lands here."}
          </p>
          <div className="mt-5 flex gap-2">
            <button type="button" onClick={() => nav(-1)} className={`${BTN_OUTLINE} h-9 px-3.5`}>
              <ArrowLeft className="size-3.5" aria-hidden />
              Back
            </button>
            {loadFailed ? (
              <button type="button" onClick={() => void hydrate()} className={`${BTN_PRIMARY} h-9 px-3.5`}>
                Try again
              </button>
            ) : (
              <a href="/consultants" className={`${BTN_PRIMARY} h-9 px-3.5`}>
                Browse marketplace
                <Sparkles className="size-3.5" aria-hidden />
              </a>
            )}
          </div>
        </div>
      </div>
    );
  }

  // Order by status (act-on-these-first), newest first within a status.
  const rank = (s: Booking["status"]) => {
    const i = STATUS_ORDER.indexOf(s);
    return i === -1 ? STATUS_ORDER.indexOf("requested") : i;
  };
  const ordered = bookings
    .slice()
    .sort((a, b) => rank(a.status) - rank(b.status) || b.bookedAt - a.bookedAt);
  // Defensive: a persisted booking with an unknown/legacy status falls into
  // "requested", mirroring the store's migrate, so a stray status can never
  // take the page down.
  const statusOf = (b: Booking): Booking["status"] =>
    STATUS_ORDER.includes(b.status) ? b.status : "requested";
  const countFor = (s: Booking["status"]) => ordered.filter((b) => statusOf(b) === s).length;
  const tabs: PageTab[] = [
    { id: "all", label: "All", count: ordered.length },
    ...STATUS_ORDER.filter((s) => countFor(s) > 0).map((s) => ({
      id: s,
      label: STATUS_LABEL[s],
      count: countFor(s),
    })),
  ];
  const tab = tabs.some((t) => t.id === activeTab) ? activeTab : "all";
  const visible = tab === "all" ? ordered : ordered.filter((b) => statusOf(b) === tab);

  return (
    <div className={PAGE}>
      <PageHeader
        crumbs={[{ label: "Marketplace", href: "/consultants" }, { label: "My bookings" }]}
        title="My bookings"
        lede="Every review request you've placed. Delivered reviews wait for your rating."
        actions={
          <a href="/consultants" className={`${BTN_OUTLINE} h-9 px-3.5`}>
            Browse marketplace
          </a>
        }
        tabs={tabs}
        activeTab={tab}
        onTabChange={setActiveTab}
      />

      <RowList>
        {visible.map((b) => (
          <BookingRow
            key={b.id}
            booking={b}
            paymentsOn={paymentsOn}
            consultant={allConsultants.find((c) =>
              // Match by stable profile id first (server bookings),
              // fall back to initials for local-only seed bookings.
              b.consultantProfileId && c.profileId
                ? c.profileId === b.consultantProfileId
                : c.initials === b.consultantInitials,
            )}
          />
        ))}
      </RowList>
    </div>
  );
}

/** Accepted but not yet paid (or a previous attempt failed): the requester
 *  needs to pay before the specialist can start. A booking delivered before
 *  payment was required is payable too, and can't be completed until it is. */
function isAwaitingPayment(booking: Booking): boolean {
  if (booking.status !== "accepted" && booking.status !== "delivered") return false;
  return !booking.paymentStatus || booking.paymentStatus === "unpaid" || booking.paymentStatus === "failed";
}

/** The agreed price snapshot, formatted, or null when the booking predates it. */
function agreedPrice(booking: Booking): string | null {
  if (!booking.priceAmount || !booking.priceCurrency) return null;
  try {
    return new Intl.NumberFormat("en-GB", {
      style: "currency",
      currency: booking.priceCurrency.toUpperCase(),
    }).format(booking.priceAmount / 100);
  } catch {
    return null;
  }
}

function BookingRow({
  booking,
  consultant,
  paymentsOn,
}: {
  booking: Booking;
  consultant?: Consultant;
  paymentsOn: boolean;
}) {
  const [paying, setPaying] = useState(false);
  const payForReview = async () => {
    setPaying(true);
    const r = await startBookingCheckout(booking.id);
    if (r.ok) {
      window.location.assign(r.data.url);
      return;
    }
    toast.error(r.error || "Couldn't start checkout");
    setPaying(false);
  };
  // If the user hits Back from Stripe, the page is restored from the bfcache
  // with paying=true and the button stuck on "Starting…". Reset it on restore.
  useEffect(() => {
    const onShow = (e: PageTransitionEvent) => {
      if (e.persisted) setPaying(false);
    };
    window.addEventListener("pageshow", onShow);
    return () => window.removeEventListener("pageshow", onShow);
  }, []);
  const complete = useBookingsStore((s) => s.completeBooking);
  const [rating, setRating] = useState(booking.rating ?? 0);
  // Hover preview is separate from the committed rating, so mousing over
  // stars doesn't silently change the value the user actually picked.
  const [hoverRating, setHoverRating] = useState(0);
  const [submitted, setSubmitted] = useState(booking.status === "completed");

  const submit = async () => {
    if (rating === 0) return;
    complete(booking.id, rating);
    setSubmitted(true);
    // Dual-write: mirror the complete + rating to the server. On failure
    // pushBookingRespond already toasts + re-pulls (reverting the store booking
    // to "delivered"), so roll the optimistic `submitted` flag back too —
    // otherwise the rating widget stays permanently hidden and the user can't
    // retry without navigating away.
    const ok = await pushBookingRespond(booking.id, "complete", { rating });
    if (!ok) setSubmitted(false);
  };

  // Prefer the server-joined display fields (reliable cross-device), then
  // the matched local card, then a graceful fallback.
  const displayName =
    booking.consultantName ?? consultant?.name ?? `Specialist · ${booking.consultantInitials}`;
  const displayRole = booking.consultantRole ?? consultant?.role ?? "Consultant";
  const displayPhoto = booking.consultantPhotoUrl ?? consultant?.photoUrl;

  const awaitingPayment = isAwaitingPayment(booking);
  const canRate =
    booking.status === "delivered" &&
    !submitted &&
    (!booking.paymentStatus || booking.paymentStatus === "paid");
  // Prefer the readable local id — the editor store is keyed by it.
  // booking.draftId becomes a server UUID after sync, which the store
  // can't resolve, so fall back to it only when no local id exists.
  const openId = booking.localDraftId ?? booking.draftId;
  const showOpenDraft = Boolean(openId) && !openId.startsWith("demo-");

  const paymentNote =
    booking.status === "accepted" && booking.paymentStatus === "processing"
      ? "Payment processing. Bank payments such as Direct Debit can take a few working days to clear; the specialist starts once it does."
      : null;
  const disputeNote =
    (booking.status === "accepted" || booking.status === "delivered") &&
    (booking.paymentStatus === "refunded" ||
      booking.paymentStatus === "disputed" ||
      booking.paymentStatus === "dispute_lost")
      ? booking.paymentStatus === "refunded"
        ? "This booking was refunded."
        : booking.paymentStatus === "disputed"
          ? "This payment is under dispute, so work on the booking is paused."
          : "This payment was reversed after a dispute."
      : null;

  return (
    <Row attention={(paymentsOn && awaitingPayment) || canRate}>
      <div className="flex items-start gap-3.5 sm:gap-4">
        <ExpertAvatar
          photoUrl={displayPhoto}
          name={booking.consultantName ?? consultant?.name}
          initials={booking.consultantInitials}
          seed={booking.consultantProfileId || displayName}
          size={40}
        />
        <div className="min-w-0 flex-1">
          <header className="flex flex-wrap items-start justify-between gap-x-4 gap-y-2">
            <div className="min-w-0 flex-1 basis-[220px]">
              <h3 className="m-0 truncate text-[14px] font-semibold text-[var(--ds-ink)]">
                {displayName}
              </h3>
              <p className="m-0 mt-0.5 truncate text-[12.5px] text-[var(--ds-muted)]">
                {displayRole}
              </p>
              {booking.matterTitle && (
                <p className="m-0 mt-1 inline-flex max-w-full items-center gap-1.5 text-[12.5px] text-[var(--ds-body)]">
                  <FileText className="size-3.5 shrink-0 text-[var(--ds-muted)]" aria-hidden />
                  <span className="truncate">{booking.matterTitle}</span>
                </p>
              )}
            </div>
            <div className="flex flex-wrap items-center gap-1.5">
              <StatusBadge status={booking.status} className="mr-1" />
              {paymentsOn && awaitingPayment && (
                <button type="button" onClick={payForReview} disabled={paying} className={BTN_PRIMARY}>
                  {paying ? "Starting…" : "Pay for review"}
                </button>
              )}
              {showOpenDraft && (
                <a href={`/editor/${openId}`} className={BTN_GHOST}>
                  <FileText className="size-3.5" aria-hidden />
                  Open draft
                </a>
              )}
              <BookingThread
                booking={booking}
                perspective="requester"
                title={displayName}
                subtitle={booking.matterTitle ?? displayRole}
              />
            </div>
          </header>

          {(paymentNote ||
            disputeNote ||
            awaitingPayment ||
            booking.responseNote ||
            booking.deliveryNote ||
            canRate ||
            (submitted && booking.rating)) && (
            <div className="mt-2.5 flex flex-col gap-2">
              {paymentNote && <p className="m-0 text-[12.5px] text-[var(--ds-muted)]">{paymentNote}</p>}

              {disputeNote && <p className="m-0 text-[12.5px] text-[var(--ds-muted)]">{disputeNote}</p>}

              {!paymentsOn && awaitingPayment && (
                <p className="m-0 text-[12.5px] text-[var(--ds-muted)]">
                  {booking.status === "delivered"
                    ? "Awaiting payment. Online payment isn't available yet, so this booking can't be completed."
                    : "Awaiting payment. Online payment isn't available yet, so the specialist can't start on this booking."}
                </p>
              )}

              {paymentsOn && awaitingPayment && (
                <p className="m-0 text-[12.5px] text-[var(--ds-muted)]">
                  {agreedPrice(booking)
                    ? `${agreedPrice(booking)}, as agreed when you booked. Secure checkout via Stripe.`
                    : "Secure checkout via Stripe."}
                  {booking.paymentStatus === "failed" ? " Your last payment didn't go through." : ""}
                </p>
              )}

              {booking.responseNote && (
                <RowNote label="Specialist note">{booking.responseNote}</RowNote>
              )}

              {booking.deliveryNote && (
                <RowNote tone="green" label="Delivered">
                  {booking.deliveryNote}
                </RowNote>
              )}

              {/* Completing needs a paid booking, so rating waits for the payment. */}
              {canRate && (
                <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
                  <span className="text-[12.5px] font-medium text-[var(--ds-ink)]">
                    Rate this review
                  </span>
                  <div
                    role="radiogroup"
                    aria-label="Rate this review out of 5"
                    className="flex gap-0.5"
                    onMouseLeave={() => setHoverRating(0)}
                  >
                    {[1, 2, 3, 4, 5].map((n) => {
                      const filled = n <= (hoverRating || rating);
                      return (
                        <button
                          key={n}
                          type="button"
                          role="radio"
                          aria-checked={rating === n}
                          onClick={() => setRating(n)}
                          onMouseEnter={() => setHoverRating(n)}
                          className={`grid size-7 place-items-center rounded-[var(--ds-r-s)] transition hover:bg-[var(--ds-surface)] ${
                            filled ? "text-[var(--ds-amber-dot)]" : "text-[var(--ds-faint)]"
                          }`}
                          aria-label={`${n} star${n === 1 ? "" : "s"}`}
                        >
                          <Star
                            className="size-4"
                            fill={filled ? "currentColor" : "none"}
                            strokeWidth={1.5}
                          />
                        </button>
                      );
                    })}
                  </div>
                  <button
                    type="button"
                    onClick={submit}
                    disabled={rating === 0}
                    className={`${BTN_PRIMARY} sm:ml-auto`}
                  >
                    Submit
                  </button>
                </div>
              )}

              {submitted && booking.rating && (
                <div className="flex items-center gap-2 text-[12.5px]">
                  <span className="text-[var(--ds-muted)]">Your rating</span>
                  <span className="inline-flex gap-0.5">
                    {[1, 2, 3, 4, 5].map((n) => (
                      <Star
                        key={n}
                        className="size-3.5"
                        fill={n <= (booking.rating ?? 0) ? "var(--ds-amber-dot)" : "none"}
                        color={n <= (booking.rating ?? 0) ? "var(--ds-amber-dot)" : "var(--ds-faint)"}
                        strokeWidth={1.5}
                      />
                    ))}
                  </span>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </Row>
  );
}
