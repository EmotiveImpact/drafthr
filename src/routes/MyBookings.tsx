import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowLeft, Star, FileText, Sparkles } from "lucide-react";
import { useBookingsStore, type Booking } from "@/lib/bookings";
import type { Consultant } from "@/components/consultants/types";
import { useConsultantStore, isProfileComplete } from "@/lib/consultantProfile";
import { BookingThread } from "@/components/consultants/BookingThread";
import { StatusBadge } from "@/components/consultants/StatusBadge";
import { pullMyBookings, pushBookingRespond } from "@/lib/marketplaceSync";
import { getStripeConnectStatus, startBookingCheckout } from "@/lib/consultantApi";
import { toast } from "sonner";
import { captureMarketplaceScope, isMarketplaceScopeCurrent } from "@/lib/marketplace-scope";

/**
 * /bookings — HR-side bookings list.
 *
 * Mirrors the consultant inbox but from the requester's perspective.
 * Shows every booking the signed-in HR user has placed, grouped by
 * status. Delivered bookings surface a rating widget so the buyer can
 * close the loop on the consultant.
 *
 * Uses the requester-only memory cache populated by the server list endpoint.
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
          photoUrl:
            myProfile.photoUrl ||
            "https://images.unsplash.com/photo-1573497019940-1c28c88b4f3e?w=400&q=80",
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
      <div className="mx-auto max-w-4xl px-4 py-10 sm:px-6 sm:py-12">
        <header className="mb-8">
          <div className="h-3 w-24 animate-pulse rounded bg-[var(--ds-surface-2)]" />
          <div className="mt-3 h-9 w-48 animate-pulse rounded bg-[var(--ds-surface-2)]" />
          <div className="mt-3 h-4 w-80 max-w-full animate-pulse rounded bg-[var(--ds-surface-2)]" />
        </header>
        <div className="space-y-2" aria-hidden>
          {[0, 1, 2].map((i) => (
            <div
              key={i}
              className="h-20 animate-pulse rounded-[10px] border border-[var(--ds-line)] bg-[var(--ds-surface-2)]"
            />
          ))}
        </div>
        <span className="sr-only">Loading your bookings…</span>
      </div>
    );
  }

  if (bookings.length === 0) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-12 sm:px-6 sm:py-16">
        <button
          type="button"
          onClick={() => nav(-1)}
          className="mb-6 inline-flex items-center gap-1.5 text-[12.5px] font-semibold text-[var(--ds-muted)] hover:text-[var(--ds-ink)]"
        >
          <ArrowLeft className="size-3.5" aria-hidden />
          Back
        </button>
        <h1 className="text-[clamp(28px,3.4vw,40px)] font-semibold tracking-[-0.015em] text-[var(--ds-ink)]">
          {loadFailed ? "Couldn't load your bookings." : "No bookings yet."}
        </h1>
        <p className="mt-3 max-w-[60ch] text-[14.5px] leading-relaxed text-[var(--ds-body)]">
          {loadFailed
            ? "Something went wrong fetching your bookings — this doesn't mean they're gone. Check your connection and try again."
            : "Once you've booked a consultant for a review, every request and its status lands here."}
        </p>
        <div className="mt-6 flex gap-2">
          {loadFailed ? (
            <button
              type="button"
              onClick={() => void hydrate()}
              className="inline-flex h-10 items-center gap-2 rounded-[8px] bg-[var(--ds-ink)] px-4 text-[13px] font-semibold text-white shadow-sm transition hover:-translate-y-px hover:shadow-md"
            >
              Try again
            </button>
          ) : (
            <a
              href="/consultants"
              className="inline-flex h-10 items-center gap-2 rounded-[8px] bg-[var(--ds-ink)] px-4 text-[13px] font-semibold text-white shadow-sm transition hover:-translate-y-px hover:shadow-md"
            >
              Browse marketplace
              <Sparkles className="size-3.5" aria-hidden />
            </a>
          )}
        </div>
      </div>
    );
  }

  // Group by status, keeping STATUS_ORDER for the headings.
  const grouped: Record<Booking["status"], Booking[]> = {
    requested: [],
    accepted: [],
    delivered: [],
    completed: [],
    declined: [],
  };
  bookings
    .slice()
    .sort((a, b) => b.bookedAt - a.bookedAt)
    .forEach((b) => {
      // Defensive: a persisted booking with an unknown/legacy status would
      // make grouped[b.status] undefined → .push throws → white screen.
      // The store's migrate normalises these, but guard here too so a
      // stray status can never take the page down.
      (grouped[b.status] ?? grouped.requested).push(b);
    });

  return (
    <div className="mx-auto max-w-4xl px-4 py-10 sm:px-6 sm:py-12">
      <header className="mb-8">
        <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[var(--ds-muted)]">
          Marketplace
        </p>
        <h1 className="mt-2 text-[clamp(28px,3.4vw,40px)] font-semibold tracking-[-0.015em] text-[var(--ds-ink)]">
          My bookings
        </h1>
        <p className="mt-2 max-w-[60ch] text-[14px] leading-relaxed text-[var(--ds-body)]">
          Every review request you've placed, grouped by status. Delivered
          reviews wait for a rating below.
        </p>
      </header>

      <div className="space-y-8">
        {STATUS_ORDER.map((status) => {
          const list = grouped[status];
          if (list.length === 0) return null;
          return (
            <section key={status}>
              <h2 className="mb-3 text-[11.5px] font-semibold uppercase tracking-[0.14em] text-[var(--ds-muted)]">
                {STATUS_LABEL[status]} ({list.length})
              </h2>
              <div className="space-y-2">
                {list.map((b) => (
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
              </div>
            </section>
          );
        })}
      </div>
    </div>
  );
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
  const payingRef = useRef(false);
  const payForReview = async () => {
    const scope = captureMarketplaceScope();
    if (!scope || payingRef.current) return;
    payingRef.current = true;
    setPaying(true);
    let departing = false;
    try {
      const r = await startBookingCheckout(booking.id);
      if (!isMarketplaceScopeCurrent(scope)) return;
      if (r.ok) {
        window.location.assign(r.data.url);
        departing = true;
        return;
      }
      toast.error(r.error || "Couldn't start checkout");
    } finally {
      if (!departing) {
        payingRef.current = false;
        setPaying(false);
      }
    }
  };
  // If the user hits Back from Stripe, the page is restored from the bfcache
  // with paying=true and the button stuck on "Starting…". Reset it on restore.
  useEffect(() => {
    const onShow = (e: PageTransitionEvent) => {
      if (e.persisted) {
        payingRef.current = false;
        setPaying(false);
      }
    };
    window.addEventListener("pageshow", onShow);
    return () => window.removeEventListener("pageshow", onShow);
  }, []);
  const [rating, setRating] = useState(booking.rating ?? 0);
  const [saving, setSaving] = useState(false);
  const savingRef = useRef(false);
  // Hover preview is separate from the committed rating, so mousing over
  // stars doesn't silently change the value the user actually picked.
  const [hoverRating, setHoverRating] = useState(0);
  const submitted = booking.status === "completed";

  const submit = async () => {
    if (rating === 0 || savingRef.current) return;
    savingRef.current = true;
    setSaving(true);
    try {
      await pushBookingRespond(booking.id, "complete", { rating });
    } finally {
      savingRef.current = false;
      setSaving(false);
    }
  };

  // Prefer the server-joined display fields (reliable cross-device), then
  // the matched local card, then a graceful fallback.
  const displayName =
    booking.consultantName ?? consultant?.name ?? `Specialist · ${booking.consultantInitials}`;
  const displayRole = booking.consultantRole ?? consultant?.role ?? "Consultant";
  const displayPhoto = booking.consultantPhotoUrl ?? consultant?.photoUrl;

  return (
    <article className="rounded-[10px] border border-[var(--ds-line)] bg-[var(--ds-surface)] p-4">
      <header className="flex items-start justify-between gap-3">
        <div className="flex items-start gap-3 min-w-0">
          {displayPhoto && (
            <img
              src={displayPhoto}
              alt=""
              className="size-10 rounded-full object-cover border border-[var(--ds-line)] flex-shrink-0"
            />
          )}
          <div className="min-w-0">
            <h3 className="truncate text-[14px] font-semibold text-[var(--ds-ink)]">
              {displayName}
            </h3>
            <p className="mt-0.5 truncate text-[11.5px] text-[var(--ds-muted)]">
              {displayRole}
            </p>
            {booking.matterTitle && (
              <p className="mt-1 text-[12.5px] text-[var(--ds-body)]">
                {booking.matterTitle}
              </p>
            )}
          </div>
        </div>
        <StatusBadge status={booking.status} />
      </header>

      {paymentsOn && booking.status === "accepted" && (
        <div className="mt-3 flex items-center gap-2">
          <button
            type="button"
            onClick={payForReview}
            disabled={paying}
            className="inline-flex h-8 items-center gap-1.5 rounded-[6px] bg-[var(--ds-ink)] px-3 text-[12px] font-semibold text-white transition hover:opacity-90 disabled:opacity-60"
          >
            {paying ? "Starting…" : "Pay for review"}
          </button>
          <span className="text-[11px] text-[var(--ds-muted)]">
            Secure checkout via Stripe.
          </span>
        </div>
      )}

      {booking.responseNote && (
        <p className="mt-3 text-[12.5px] text-[var(--ds-body)] italic">
          Specialist note: {booking.responseNote}
        </p>
      )}

      {booking.deliveryNote && (
        <div className="mt-3 rounded-md border border-[var(--ds-green-fg)]/30 bg-[var(--ds-green-bg)] px-3 py-2">
          <p className="text-[11.5px] font-semibold text-[var(--ds-green-fg)] mb-1">
            Delivered
          </p>
          <p className="text-[12.5px] leading-snug text-[var(--ds-ink)]">
            {booking.deliveryNote}
          </p>
        </div>
      )}

      {booking.status === "delivered" && !submitted && (
        <div className="mt-3 flex items-center gap-3">
          <span className="text-[12px] font-semibold text-[var(--ds-ink)]">
            Rate this review:
          </span>
          <div
            role="radiogroup"
            aria-label="Rate this review out of 5"
            className="flex gap-1"
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
                  disabled={saving}
                  onClick={() => setRating(n)}
                  onMouseEnter={() => setHoverRating(n)}
                  className={`grid size-7 place-items-center rounded-full transition ${
                    filled ? "text-[var(--ds-amber-fg)]" : "text-[var(--ds-subtle)]"
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
            disabled={rating === 0 || saving}
            className="ml-auto inline-flex h-8 items-center gap-1.5 rounded-[6px] bg-[var(--ds-ink)] px-3 text-[12px] font-semibold text-white disabled:opacity-60"
          >
            {saving ? "Saving…" : "Submit"}
          </button>
        </div>
      )}

      {submitted && booking.rating && (
        <div className="mt-3 flex items-center gap-2 text-[12px]">
          <span className="text-[var(--ds-muted)]">Your rating:</span>
          <span className="inline-flex gap-0.5">
            {[1, 2, 3, 4, 5].map((n) => (
              <Star
                key={n}
                className="size-3.5"
                fill={n <= (booking.rating ?? 0) ? "var(--ds-amber-fg)" : "none"}
                color={n <= (booking.rating ?? 0) ? "var(--ds-amber-fg)" : "var(--ds-subtle)"}
                strokeWidth={1.5}
              />
            ))}
          </span>
        </div>
      )}

      {(() => {
        // Prefer the readable local id — the editor store is keyed by it.
        // booking.draftId becomes a server UUID after sync, which the store
        // can't resolve, so fall back to it only when no local id exists.
        const openId = booking.localDraftId ?? booking.draftId;
        if (!openId || openId.startsWith("demo-")) return null;
        return (
          <a
            href={`/editor/${openId}`}
            className="mt-3 inline-flex items-center gap-1.5 text-[11.5px] font-semibold text-[var(--ds-muted)] hover:text-[var(--ds-ink)]"
          >
            <FileText className="size-3.5" aria-hidden />
            Open draft
          </a>
        );
      })()}

      <BookingThread booking={booking} perspective="requester" />
    </article>
  );
}
