import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { CircleCheck, Clock, CreditCard, Inbox, Info, MessageSquare, Search, Star, X } from "lucide-react";
import { toast } from "sonner";
import { PillTabs, type PageTab } from "@/components/ds";
import { ExpertsHeader, HowItWorks, useWorkspaceName } from "@/components/consultants/ExpertsHeader";
import { BookingThreadPanel } from "@/components/consultants/BookingThread";
import { StatusBadge } from "@/components/consultants/StatusBadge";
import { SideSheet } from "@/components/consultants/SideSheet";
import {
  BTN_OUTLINE,
  BTN_PRIMARY,
  EmptyPanel,
  ExpertAvatar,
  NoteLine,
  Row,
  RowList,
  RowNote,
} from "@/components/consultants/ui";
import {
  agreedPrice,
  awaitingPayment,
  canRate as canRateBooking,
  checkoutErrorMessage,
  checkoutNote,
  disputeNote,
  isPriority,
  lateRefundNote,
  payLine,
  paymentsOffNote,
  priorityDifference,
  processingNote,
} from "@/components/consultants/payments";
import { dayAndTime, declinedLine, firstNameOf, sentWhen, shortDate } from "@/components/consultants/market";
import { useBookingsStore, type Booking } from "@/lib/bookings";
import { useDraftStore } from "@/lib/store";
import { letterTitle } from "@/components/consultants/letters";
import { pullMyBookings, pushBookingRespond } from "@/lib/marketplaceSync";
import { getStripeConnectStatus, startBookingCheckout } from "@/lib/consultantApi";
import { cn } from "@/lib/utils";

/**
 * /bookings — My bookings, the second tab of the Experts page (design
 * `bookings`). Every review request you've placed, grouped "Needs you"
 * (waiting for you to pay), "In progress" and "Past", with a segmented status
 * filter and a search. Each row has one action: pay, message, open the
 * review, book someone else, or raise a dispute. Clicking a row opens its
 * thread in a panel on the right (a full-screen sheet on phones).
 *
 * Server data (pullMyBookings) merged into the local bookings store. Payment
 * rules are unchanged: Pay for review only shows when Stripe is configured,
 * checkout starts from an accepted (or delivered and unpaid) booking, and
 * rating waits for the payment.
 */

const STATUS_ORDER: Booking["status"][] = ["requested", "accepted", "delivered", "completed", "declined"];
const STATUS_LABEL: Record<Booking["status"], string> = {
  requested: "Requested",
  accepted: "Accepted",
  delivered: "Delivered",
  completed: "Completed",
  declined: "Declined",
};

const DISPUTE_TEXT = "I'd like to raise a dispute about this review. ";

/** Defensive: an unknown or legacy status reads as requested, as the store's
 *  migrate does, so a stray status can never take the page down. */
const statusOf = (b: Booking): Booking["status"] => (STATUS_ORDER.includes(b.status) ? b.status : "requested");

function useIsDesktop(): boolean {
  const q = "(min-width: 768px)";
  const [on, setOn] = useState(() => (typeof window !== "undefined" && window.matchMedia ? window.matchMedia(q).matches : true));
  useEffect(() => {
    if (!window.matchMedia) return;
    const m = window.matchMedia(q);
    const f = () => setOn(m.matches);
    m.addEventListener?.("change", f);
    return () => m.removeEventListener?.("change", f);
  }, []);
  return on;
}

export function MyBookings() {
  const bookings = useBookingsStore((s) => s.bookings);
  const drafts = useDraftStore((s) => s.drafts);
  const workspace = useWorkspaceName();
  const [params] = useSearchParams();
  const paidId = params.get("paid");
  const desktop = useIsDesktop();

  // True until the first server hydrate resolves: a fresh device shows
  // placeholder rows, not a false "No bookings yet".
  const [hydrating, setHydrating] = useState(true);
  // A failed hydrate must not masquerade as "No bookings yet".
  const [loadFailed, setLoadFailed] = useState(false);
  // Whether Stripe is configured: gates every "Pay" affordance.
  const [paymentsOn, setPaymentsOn] = useState(false);
  const [tab, setTab] = useState<string>("all");
  const [searchOpen, setSearchOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [openId, setOpenId] = useState<string | null>(null);

  const hydrate = useCallback(async () => {
    setHydrating(true);
    setLoadFailed(false);
    const ok = await pullMyBookings();
    setHydrating(false);
    if (!ok) setLoadFailed(true);
  }, []);

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

  // Back from Stripe (?paid=<id>): show that booking, with the state the
  // hydrate above just refreshed. On desktop its thread opens beside it.
  const shownPaid = useRef(false);
  useEffect(() => {
    if (!paidId || hydrating || shownPaid.current) return;
    if (!bookings.some((b) => b.id === paidId)) return;
    shownPaid.current = true;
    if (desktop) setOpenId(paidId);
    requestAnimationFrame(() =>
      document.querySelector(`[data-testid="booking-row-${CSS.escape(paidId)}"]`)?.scrollIntoView({ block: "nearest" }),
    );
  }, [paidId, hydrating, bookings, desktop]);

  const letterOf = useCallback(
    (b: Booking) => {
      // The readable local id opens the letter; the server id can't.
      const id = b.localDraftId ?? b.draftId;
      const draft = id ? drafts[id] : undefined;
      const linkable = !!draft && !id.startsWith("demo-");
      return {
        id: linkable ? id : null,
        title: (draft ? letterTitle(draft) : undefined) ?? b.matterTitle ?? "Review with no letter",
      };
    },
    [drafts],
  );

  const toPay = paymentsOn ? bookings.filter(awaitingPayment).length : 0;
  const counts = useMemo(() => {
    const c = Object.fromEntries(STATUS_ORDER.map((s) => [s, 0])) as Record<Booking["status"], number>;
    for (const b of bookings) c[statusOf(b)] += 1;
    return c;
  }, [bookings]);
  const tabs: PageTab[] = [
    { id: "all", label: "All", count: bookings.length },
    ...STATUS_ORDER.filter((s) => counts[s] > 0).map((s) => ({ id: s, label: STATUS_LABEL[s], count: counts[s] })),
  ];
  const activeTab = tabs.some((t) => t.id === tab) ? tab : "all";

  const q = query.trim().toLowerCase();
  const visible = bookings
    .filter((b) => activeTab === "all" || statusOf(b) === activeTab)
    .filter((b) => {
      if (!q) return true;
      const t = letterOf(b).title.toLowerCase();
      const n = (b.consultantName ?? "").toLowerCase();
      return t.includes(q) || n.includes(q) || (b.matterTitle ?? "").toLowerCase().includes(q);
    })
    .sort((a, b) => b.bookedAt - a.bookedAt);
  const groups: { id: string; label: string; rows: Booking[] }[] = [
    { id: "needs", label: "Needs you", rows: visible.filter((b) => paymentsOn && awaitingPayment(b)) },
    {
      id: "progress",
      label: "In progress",
      rows: visible.filter((b) => !(paymentsOn && awaitingPayment(b)) && ["requested", "accepted", "delivered"].includes(statusOf(b))),
    },
    { id: "past", label: "Past", rows: visible.filter((b) => ["completed", "declined"].includes(statusOf(b))) },
  ].filter((g) => g.rows.length > 0);

  const open = openId ? bookings.find((b) => b.id === openId) ?? null : null;
  const openLetter = open ? letterOf(open) : null;
  const panel = open ? (
    <BookingThreadPanel
      key={open.id}
      booking={open}
      perspective="requester"
      otherName={open.consultantName ?? `Expert ${open.consultantInitials}`}
      otherRole={open.consultantRole}
      otherPhotoUrl={open.consultantPhotoUrl}
      otherSeed={open.consultantProfileId || open.consultantName}
      letterTitle={openLetter?.title}
      letterHref={openLetter?.id ? `/editor/${openLetter.id}` : undefined}
      onClose={() => setOpenId(null)}
      className="h-full"
    />
  ) : null;

  const openThread = (id: string, prefill?: string) => {
    setOpenId(id);
    if (prefill) {
      // Let the panel mount, then hand it the text.
      setTimeout(() => window.dispatchEvent(new CustomEvent("drafthr:thread-prefill", { detail: { bookingId: id, text: prefill } })), 60);
    }
  };

  const firstLoad = hydrating && bookings.length === 0;

  return (
    // At desktop width the page is exactly one screen tall, so the list and
    // the thread panel scroll on their own under the band.
    <div className="flex min-h-0 flex-1 flex-col md:h-dvh md:max-h-dvh">
      <div data-page-main className="flex min-h-0 min-w-0 flex-1 flex-col md:overflow-hidden">
        <ExpertsHeader
          crumbs={[{ label: workspace, href: "/hr" }, { label: "Experts" }]}
          title="Experts"
          lede="Book a qualified employment law specialist to check a letter before it goes out."
          actions={<HowItWorks />}
          tab="bookings"
          toPay={toPay}
        />

        <div className="md:flex md:min-h-0 md:flex-1">
          <section
            aria-label="My bookings"
            className={cn(
              "min-w-0 flex-1 px-4 pb-16 pt-[22px] sm:px-8 md:overflow-y-auto md:pb-[30px] md:pl-12",
              // The content column ends where the band's does (48px in);
              // beside the open thread panel the gap to its border is 32px.
              desktop && panel ? "md:pr-8" : "md:pr-12",
            )}
          >
            {firstLoad ? (
              <BookingsSkeleton />
            ) : bookings.length === 0 ? (
              loadFailed ? (
                <EmptyPanel
                  icon={<Inbox aria-hidden />}
                  title="Couldn't load your bookings."
                  body="Something went wrong fetching your bookings. This doesn't mean they're gone. Check your connection and try again."
                  action={
                    <button type="button" onClick={() => void hydrate()} className={BTN_OUTLINE}>
                      Try again
                    </button>
                  }
                />
              ) : (
                <EmptyPanel
                  icon={<Inbox aria-hidden />}
                  title="No bookings yet."
                  body="Once you've booked an expert for a review, every request and its status lands here."
                  action={
                    <Link to="/consultants" state={{ expertsTab: "bookings" }} className={BTN_PRIMARY}>
                      Find an expert
                    </Link>
                  }
                />
              )
            ) : (
              <div className="animate-in fade-in-0 duration-200 motion-reduce:animate-none">
                <div className="mb-4 flex items-center justify-between gap-3">
                  <PillTabs
                    tabs={tabs}
                    activeTab={activeTab}
                    onTabChange={setTab}
                    className="no-scrollbar mt-0 min-w-0"
                  />
                  {searchOpen ? (
                    <div className="relative w-[190px] shrink-0 max-sm:w-[150px]">
                      <Search aria-hidden className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-[var(--ds-subtle)]" />
                      <input
                        autoFocus
                        type="search"
                        value={query}
                        onChange={(e) => setQuery(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === "Escape") {
                            setQuery("");
                            setSearchOpen(false);
                          }
                        }}
                        placeholder="Letter or expert"
                        aria-label="Search bookings"
                        className="h-9 w-full rounded-[9px] border border-[var(--ds-line)] bg-[var(--ds-surface)] pl-[34px] pr-8 text-[13.5px] text-[var(--ds-ink)] placeholder:text-[var(--ds-subtle)] focus:border-[var(--ds-line-hover)] focus:outline-none focus-visible:shadow-[var(--ds-focus-ring)] [&::-webkit-search-cancel-button]:hidden"
                      />
                      <button
                        type="button"
                        aria-label="Close search"
                        onClick={() => {
                          setQuery("");
                          setSearchOpen(false);
                        }}
                        className="absolute right-1 top-1/2 grid size-7 -translate-y-1/2 place-items-center rounded-[7px] text-[var(--ds-subtle)] transition-colors duration-[120ms] hover:bg-[var(--ds-surface-2)] hover:text-[var(--ds-ink)] focus-visible:outline-none focus-visible:shadow-[var(--ds-focus-ring)]"
                      >
                        <X className="size-3.5" aria-hidden />
                      </button>
                    </div>
                  ) : (
                    <button
                      type="button"
                      aria-label="Search bookings"
                      onClick={() => setSearchOpen(true)}
                      className="grid size-9 shrink-0 place-items-center rounded-[9px] border border-[var(--ds-line)] bg-[var(--ds-surface)] text-[var(--ds-muted)] transition-colors duration-[120ms] hover:border-[var(--ds-line-strong)] hover:bg-[var(--ds-hover)] hover:text-[var(--ds-ink)] active:bg-[var(--ds-surface-2)] focus-visible:outline-none focus-visible:shadow-[var(--ds-focus-ring)]"
                    >
                      <Search className="size-4" aria-hidden />
                    </button>
                  )}
                </div>

                {loadFailed && (
                  <p className="m-0 mb-3 text-[12.5px] text-[var(--ds-muted)]" role="status">
                    Couldn't refresh your bookings. Showing what's saved on this device.{" "}
                    <button type="button" onClick={() => void hydrate()} className="font-medium text-[var(--ds-ink)] underline decoration-[var(--ds-faint)] underline-offset-[3px]">
                      Try again
                    </button>
                  </p>
                )}

                {groups.length === 0 ? (
                  <p className="m-0 py-10 text-center text-[13.5px] text-[var(--ds-muted)]">
                    {q ? `No bookings match "${query.trim()}".` : "No bookings here."}
                  </p>
                ) : (
                  groups.map((g, i) => (
                    <section key={g.id} aria-label={g.label} data-testid={`bookings-group-${g.id}`}>
                      <h2 className={cn("m-0 mb-2 text-[12.5px] font-medium text-[var(--ds-subtle)]", i > 0 && "mt-[18px]")}>{g.label}</h2>
                      <RowList>
                        {g.rows.map((b) => (
                          <BookingRow
                            key={b.id}
                            booking={b}
                            paymentsOn={paymentsOn}
                            letter={letterOf(b)}
                            selected={b.id === openId}
                            onOpen={(prefill) => openThread(b.id, prefill)}
                          />
                        ))}
                      </RowList>
                    </section>
                  ))
                )}
              </div>
            )}
          </section>

          {desktop && panel && (
            <aside aria-label="Conversation" className="hidden w-[360px] shrink-0 border-l border-[var(--ds-line)] md:flex md:min-h-0">
              {panel}
            </aside>
          )}
        </div>
      </div>

      {!desktop && (
        <SideSheet open={!!open} onOpenChange={(o) => !o && setOpenId(null)} label={open ? `Messages with ${open.consultantName ?? "the expert"}` : "Messages"}>
          {panel}
        </SideSheet>
      )}
    </div>
  );
}

function BookingsSkeleton() {
  return (
    <div aria-busy="true">
      <div className="mb-4 h-9 w-[420px] max-w-full animate-pulse rounded-[10px] bg-[var(--ds-surface-2)] motion-reduce:animate-none" />
      <div className="mb-2 h-3 w-20 rounded bg-[var(--ds-surface-2)]" />
      <div className="flex flex-col gap-2.5" aria-hidden>
        {[0, 1, 2].map((i) => (
          <div key={i} className="flex items-start gap-3.5 rounded-[14px] border border-[var(--ds-line)] px-4 py-3.5">
            <div className="size-[34px] shrink-0 animate-pulse rounded-full bg-[var(--ds-surface-2)] motion-reduce:animate-none" />
            <div className="flex-1 space-y-2 pt-0.5">
              <div className="h-3.5 w-56 max-w-full rounded bg-[var(--ds-surface-2)]" />
              <div className="h-3 w-40 rounded bg-[var(--ds-surface-2)]" />
              <div className="h-3 w-72 max-w-full rounded bg-[var(--ds-surface-2)]" />
            </div>
          </div>
        ))}
      </div>
      <span className="sr-only">Loading your bookings…</span>
    </div>
  );
}

function BookingRow({
  booking: b,
  paymentsOn,
  letter,
  selected,
  onOpen,
}: {
  booking: Booking;
  paymentsOn: boolean;
  letter: { id: string | null; title: string };
  selected: boolean;
  onOpen: (prefill?: string) => void;
}) {
  const [paying, setPaying] = useState(false);
  const payForReview = async () => {
    setPaying(true);
    const r = await startBookingCheckout(b.id);
    if (r.ok) {
      window.location.assign(r.data.url);
      return;
    }
    // Never the server's own text: it is developer copy.
    toast.error(checkoutErrorMessage(r.status));
    setPaying(false);
  };
  // Back from Stripe with the browser's back button: the page comes from the
  // bfcache with paying=true. Reset it.
  useEffect(() => {
    const onShow = (e: PageTransitionEvent) => {
      if (e.persisted) setPaying(false);
    };
    window.addEventListener("pageshow", onShow);
    return () => window.removeEventListener("pageshow", onShow);
  }, []);

  const complete = useBookingsStore((s) => s.completeBooking);
  const [rating, setRating] = useState(b.rating ?? 0);
  // Hover previews without changing the committed choice.
  const [hoverRating, setHoverRating] = useState(0);
  const [submitted, setSubmitted] = useState(b.status === "completed");
  const submit = async () => {
    if (rating === 0) return;
    complete(b.id, rating);
    setSubmitted(true);
    // Mirror to the server. On failure pushBookingRespond toasts and re-pulls
    // (the booking goes back to "delivered"), so bring the control back.
    const ok = await pushBookingRespond(b.id, "complete", { rating });
    if (!ok) setSubmitted(false);
  };

  const status = statusOf(b);
  const name = b.consultantName ?? `Expert ${b.consultantInitials}`;
  const first = firstNameOf(b.consultantName) || "The expert";
  const needsPay = awaitingPayment(b);
  const payable = paymentsOn && needsPay;
  const rateNow = canRateBooking(b) && !submitted;
  const price = status === "declined" ? "Nothing charged" : agreedPrice(b);
  const processing = processingNote(b);
  const dispute = disputeNote(b);
  const priority = isPriority(b);
  const lateRefund = lateRefundNote(b, "requester");
  const difference = priorityDifference(b);

  // The one action on the right.
  let action: React.ReactNode = null;
  if (payable) {
    action = (
      <button type="button" onClick={payForReview} disabled={paying} className={BTN_PRIMARY}>
        <CreditCard className="size-3.5" aria-hidden />
        {paying ? "Starting…" : "Pay for review"}
      </button>
    );
  } else if (status === "delivered" && letter.id) {
    action = (
      <Link to={`/editor/${letter.id}`} className={BTN_OUTLINE}>
        Open review
      </Link>
    );
  } else if (status === "completed") {
    action = (
      <button
        type="button"
        onClick={() => onOpen(DISPUTE_TEXT)}
        className="rounded-[4px] text-[12.5px] text-[var(--ds-ink)] underline decoration-[var(--ds-faint)] underline-offset-[3px] transition-colors duration-[120ms] hover:decoration-[var(--ds-ink)] focus-visible:outline-none focus-visible:shadow-[var(--ds-focus-ring)]"
      >
        Raise a dispute
      </button>
    );
  } else if (status === "declined") {
    action = (
      <Link to={letter.id ? `/consultants?draft=${encodeURIComponent(letter.id)}` : "/consultants"} className={BTN_OUTLINE}>
        Book someone else
      </Link>
    );
  } else {
    action = (
      <button type="button" onClick={() => onOpen()} aria-label={`Message ${name}`} className={BTN_OUTLINE}>
        <MessageSquare className="size-3.5" aria-hidden />
        Message
      </button>
    );
  }

  // Clicking the row (not one of its controls) opens the thread.
  const onRowClick = (e: React.MouseEvent) => {
    if ((e.target as HTMLElement).closest("a,button,input,textarea,[role=radio]")) return;
    onOpen();
  };

  return (
    <Row
      attention={payable}
      selected={selected}
      onClick={onRowClick}
      data-testid={`booking-row-${b.id}`}
      className="cursor-pointer"
    >
      <div className="flex items-start gap-3.5">
        <ExpertAvatar
          photoUrl={b.consultantPhotoUrl}
          name={b.consultantName}
          initials={b.consultantInitials}
          seed={b.consultantProfileId || name}
          size={34}
          className="text-[12px]"
        />
        <div className="flex min-w-0 flex-1 flex-col gap-x-4 gap-y-2.5 sm:flex-row sm:items-start">
          <div className="min-w-0 flex-1">
            <button
              type="button"
              onClick={() => onOpen()}
              className="block max-w-full truncate rounded-[4px] text-left text-[14px] font-medium leading-[1.35] text-[var(--ds-ink)] focus-visible:outline-none focus-visible:shadow-[var(--ds-focus-ring)]"
            >
              {letter.title}
            </button>
            <p className="m-0 mt-0.5 truncate text-[12.5px] text-[var(--ds-muted)]">
              {name}
              {price && (
                <>
                  <span aria-hidden className="mx-1.5 text-[var(--ds-faint)]">
                    ·
                  </span>
                  {price}
                </>
              )}
              {priority && status !== "declined" && (
                <>
                  <span aria-hidden className="mx-1.5 text-[var(--ds-faint)]">
                    ·
                  </span>
                  Priority
                </>
              )}
            </p>

            <div className="mt-2 flex flex-col gap-1.5 empty:hidden">
              {payable && (
                <NoteLine icon={<CreditCard aria-hidden />}>
                  {payLine(b, first)}
                </NoteLine>
              )}
              {payable && <p className="m-0 pl-[19px] text-[12px] text-[var(--ds-muted)]">{checkoutNote(b)}</p>}
              {!paymentsOn && needsPay && <NoteLine icon={<Info aria-hidden />}>{paymentsOffNote(b)}</NoteLine>}
              {status === "requested" && (
                <NoteLine icon={<Clock aria-hidden />}>
                  Sent {sentWhen(b.bookedAt)}. You'll pay when the expert accepts.
                  {priority ? " It's priority, so it's due back 24 hours after you pay." : ""}
                </NoteLine>
              )}
              {status === "accepted" && b.paymentStatus === "paid" && (
                <NoteLine icon={<Clock aria-hidden />}>
                  Due back by {dayAndTime(b.expectedDeliveryAt)}.
                  {priority && difference ? ` If it's later, ${difference} is refunded to you automatically.` : ""}
                </NoteLine>
              )}
              {lateRefund && <NoteLine icon={<Info aria-hidden />}>{lateRefund}</NoteLine>}
              {processing && <NoteLine icon={<Clock aria-hidden />}>{processing}</NoteLine>}
              {dispute && <NoteLine icon={<Info aria-hidden />}>{dispute}</NoteLine>}
              {status === "delivered" && !needsPay && b.deliveredAt && (
                <NoteLine icon={<CircleCheck aria-hidden />}>Review delivered {shortDate(b.deliveredAt)}</NoteLine>
              )}
              {status === "declined" && (
                <NoteLine icon={<Info aria-hidden />}>
                  {declinedLine(b)} No payment was taken.
                </NoteLine>
              )}
              {status !== "declined" && b.responseNote && <RowNote label="Expert's note">{b.responseNote}</RowNote>}
              {b.deliveryNote && (
                <RowNote tone="green" label="Delivered">
                  {b.deliveryNote}
                </RowNote>
              )}
              {/* Completing needs a paid booking, so rating waits for the payment. */}
              {rateNow && (
                <div className="flex flex-wrap items-center gap-x-2.5 gap-y-2 text-[12.5px] text-[var(--ds-muted)]">
                  <span>Rate this review</span>
                  <div role="radiogroup" aria-label="Rate this review out of 5" className="flex" onMouseLeave={() => setHoverRating(0)}>
                    {[1, 2, 3, 4, 5].map((n) => {
                      const filled = n <= (hoverRating || rating);
                      return (
                        <button
                          key={n}
                          type="button"
                          role="radio"
                          aria-checked={rating === n}
                          aria-label={`${n} star${n === 1 ? "" : "s"}`}
                          onClick={() => setRating(n)}
                          onMouseEnter={() => setHoverRating(n)}
                          className={cn(
                            "grid size-6 place-items-center rounded-[5px] transition-colors duration-[120ms] hover:bg-[var(--ds-surface-2)] focus-visible:outline-none focus-visible:shadow-[var(--ds-focus-ring)]",
                            filled ? "text-[var(--ds-amber-dot)]" : "text-[var(--ds-faint)]",
                          )}
                        >
                          <Star className="size-[15px]" fill={filled ? "currentColor" : "none"} strokeWidth={1.5} />
                        </button>
                      );
                    })}
                  </div>
                  {rating > 0 && (
                    <button type="button" onClick={submit} className={cn(BTN_PRIMARY, "h-7 px-2.5 text-[12.5px]")}>
                      Submit
                    </button>
                  )}
                </div>
              )}
              {submitted && b.rating ? (
                <div className="flex items-center gap-2.5 text-[12.5px] text-[var(--ds-muted)]">
                  <span>You rated</span>
                  <span className="inline-flex gap-px" role="img" aria-label={`${b.rating} out of 5 stars`}>
                    {[1, 2, 3, 4, 5].map((n) => (
                      <Star
                        key={n}
                        className="size-[14px]"
                        fill={n <= (b.rating ?? 0) ? "var(--ds-amber-dot)" : "none"}
                        color={n <= (b.rating ?? 0) ? "var(--ds-amber-dot)" : "var(--ds-faint)"}
                        strokeWidth={1.5}
                        aria-hidden
                      />
                    ))}
                  </span>
                </div>
              ) : null}
            </div>
          </div>
          <div className="flex shrink-0 flex-wrap items-center gap-2.5">
            <StatusBadge status={status} />
            {action}
          </div>
        </div>
      </div>
    </Row>
  );
}
