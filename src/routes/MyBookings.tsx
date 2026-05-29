import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowLeft, Star, FileText, Sparkles } from "lucide-react";
import { useBookingsStore, type Booking } from "@/lib/bookings";
import { CONSULTANTS, type Consultant } from "@/components/editor/review/ConsultTab";
import { useConsultantStore, isProfileComplete } from "@/lib/consultantProfile";
import { BookingThread } from "@/components/consultants/BookingThread";
import { pullMyBookings, pushBookingRespond } from "@/lib/marketplaceSync";

/**
 * /bookings — HR-side bookings list.
 *
 * Mirrors the consultant inbox but from the requester's perspective.
 * Shows every booking the signed-in HR user has placed, grouped by
 * status. Delivered bookings surface a rating widget so the buyer can
 * close the loop on the consultant.
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

export function MyBookings() {
  const nav = useNavigate();
  const bookings = useBookingsStore((s) => s.bookings);

  // Hydrate the HR-side bookings list from the server on mount so a
  // booking placed on device A shows up on device B.
  useEffect(() => {
    void pullMyBookings();
  }, []);
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
  const allConsultants = myCard ? [myCard, ...CONSULTANTS] : CONSULTANTS;

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
          No bookings yet.
        </h1>
        <p className="mt-3 max-w-[60ch] text-[14.5px] leading-relaxed text-[var(--ds-body)]">
          Once you've booked a consultant for a review, every request and its
          status lands here.
        </p>
        <div className="mt-6 flex gap-2">
          <a
            href="/consultants"
            className="inline-flex h-10 items-center gap-2 rounded-[8px] bg-[var(--ds-ink)] px-4 text-[13px] font-semibold text-white shadow-sm transition hover:-translate-y-px hover:shadow-md"
          >
            Browse marketplace
            <Sparkles className="size-3.5" aria-hidden />
          </a>
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
    .forEach((b) => grouped[b.status].push(b));

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
}: {
  booking: Booking;
  consultant?: Consultant;
}) {
  const complete = useBookingsStore((s) => s.completeBooking);
  const [rating, setRating] = useState(booking.rating ?? 0);
  const [submitted, setSubmitted] = useState(booking.status === "completed");

  const submit = () => {
    if (rating === 0) return;
    complete(booking.id, rating);
    // Dual-write: mirror the complete + rating to the server.
    void pushBookingRespond(booking.id, "complete", { rating });
    setSubmitted(true);
  };

  return (
    <article className="rounded-[10px] border border-[var(--ds-line)] bg-[var(--ds-surface)] p-4">
      <header className="flex items-start justify-between gap-3">
        <div className="flex items-start gap-3 min-w-0">
          {consultant?.photoUrl && (
            <img
              src={consultant.photoUrl}
              alt=""
              className="size-10 rounded-full object-cover border border-[var(--ds-line)] flex-shrink-0"
            />
          )}
          <div className="min-w-0">
            <h3 className="truncate text-[14px] font-semibold text-[var(--ds-ink)]">
              {consultant?.name ?? `Specialist · ${booking.consultantInitials}`}
            </h3>
            <p className="mt-0.5 truncate text-[11.5px] text-[var(--ds-muted)]">
              {consultant?.role ?? "Consultant"}
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
          <div className="flex gap-1">
            {[1, 2, 3, 4, 5].map((n) => (
              <button
                key={n}
                type="button"
                onClick={() => setRating(n)}
                onMouseEnter={() => setRating(n)}
                className={`grid size-7 place-items-center rounded-full transition ${
                  n <= rating
                    ? "text-[var(--ds-amber-fg)]"
                    : "text-[var(--ds-subtle)] hover:text-[var(--ds-amber-fg)]"
                }`}
                aria-label={`${n} star${n === 1 ? "" : "s"}`}
              >
                <Star
                  className="size-4"
                  fill={n <= rating ? "currentColor" : "none"}
                  strokeWidth={1.5}
                />
              </button>
            ))}
          </div>
          <button
            type="button"
            onClick={submit}
            disabled={rating === 0}
            className="ml-auto inline-flex h-8 items-center gap-1.5 rounded-[6px] bg-[var(--ds-ink)] px-3 text-[12px] font-semibold text-white disabled:opacity-60"
          >
            Submit
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

      {booking.draftId && !booking.draftId.startsWith("demo-") && (
        <a
          href={`/editor/${booking.draftId}`}
          className="mt-3 inline-flex items-center gap-1.5 text-[11.5px] font-semibold text-[var(--ds-muted)] hover:text-[var(--ds-ink)]"
        >
          <FileText className="size-3.5" aria-hidden />
          Open draft
        </a>
      )}

      <BookingThread booking={booking} perspective="requester" />
    </article>
  );
}

function StatusBadge({ status }: { status: Booking["status"] }) {
  const styles: Record<Booking["status"], { bg: string; fg: string; label: string }> = {
    requested: { bg: "bg-[var(--ds-amber-bg)]", fg: "text-[var(--ds-amber-fg)]", label: "Pending" },
    accepted: { bg: "bg-[var(--ds-blue-bg)]", fg: "text-[var(--ds-blue-fg)]", label: "Accepted" },
    delivered: { bg: "bg-[var(--ds-green-bg)]", fg: "text-[var(--ds-green-fg)]", label: "Delivered" },
    completed: { bg: "bg-[var(--ds-surface-2)]", fg: "text-[var(--ds-muted)]", label: "Completed" },
    declined: { bg: "bg-[var(--ds-red-bg)]", fg: "text-[var(--ds-red-fg)]", label: "Declined" },
  };
  const s = styles[status];
  return (
    <span
      className={`inline-flex flex-shrink-0 items-center rounded-full px-2 py-0.5 text-[10.5px] font-semibold uppercase tracking-[0.06em] ${s.bg} ${s.fg}`}
    >
      {s.label}
    </span>
  );
}
