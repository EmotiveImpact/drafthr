import { useNavigate, useParams } from "react-router-dom";
import { ArrowLeft, FileText, Lock, ShieldCheck } from "lucide-react";
import { useBookingsStore } from "@/lib/bookings";
import { useDraftStore } from "@/lib/store";

/**
 * /c/review/:bookingId — read-only draft view for a consultant who has
 * accepted a booking that references a draftId.
 *
 * Local-storage scoping: the draftStore lives in HR's browser. A
 * consultant on a different device wouldn't see the actual draft data
 * here yet — they get the matter title, message, and an explanatory
 * empty state. The full cross-tenant share works once the server-side
 * sharing token API lands; this component contract stays.
 *
 * Auth model when the API arrives:
 *   - Booking grants the consultant a scoped read-only token tied to
 *     {draftId, bookingId, expiresAt = deliveredAt + 30 days}.
 *   - Token is verified server-side; never embedded in the URL.
 *   - The endpoint returns only the fields needed for review
 *     (sections, evidence references, audit chain). Employer / employee
 *     PII fields are redacted by default.
 */
export function SharedDraftReview() {
  const nav = useNavigate();
  const { bookingId } = useParams<{ bookingId: string }>();
  const bookings = useBookingsStore((s) => s.bookings);
  const drafts = useDraftStore((s) => s.drafts);

  const booking = bookings.find((b) => b.id === bookingId);
  const draft = booking && booking.draftId ? drafts[booking.draftId] : undefined;

  if (!booking) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-12 sm:px-6 sm:py-16">
        <button
          type="button"
          onClick={() => nav("/c")}
          className="mb-6 inline-flex items-center gap-1.5 text-[12.5px] font-semibold text-[var(--ds-muted)] hover:text-[var(--ds-ink)]"
        >
          <ArrowLeft className="size-3.5" aria-hidden />
          Back to inbox
        </button>
        <h1 className="text-[clamp(24px,3vw,32px)] font-semibold text-[var(--ds-ink)]">Booking not found</h1>
        <p className="mt-3 text-[14px] text-[var(--ds-body)]">
          That booking either doesn't exist or has been withdrawn.
        </p>
      </div>
    );
  }

  if (booking.status !== "accepted" && booking.status !== "delivered" && booking.status !== "completed") {
    return (
      <div className="mx-auto max-w-3xl px-4 py-12 sm:px-6 sm:py-16">
        <button
          type="button"
          onClick={() => nav("/c")}
          className="mb-6 inline-flex items-center gap-1.5 text-[12.5px] font-semibold text-[var(--ds-muted)] hover:text-[var(--ds-ink)]"
        >
          <ArrowLeft className="size-3.5" aria-hidden />
          Back to inbox
        </button>
        <h1 className="text-[clamp(24px,3vw,32px)] font-semibold text-[var(--ds-ink)]">Access not yet granted</h1>
        <p className="mt-3 text-[14px] text-[var(--ds-body)]">
          Draft access opens once you accept the booking. Currently the
          status is <strong>{booking.status}</strong>.
        </p>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-4xl px-4 py-10 sm:px-6 sm:py-12">
      <button
        type="button"
        onClick={() => nav("/c")}
        className="mb-6 inline-flex items-center gap-1.5 text-[12.5px] font-semibold text-[var(--ds-muted)] hover:text-[var(--ds-ink)]"
      >
        <ArrowLeft className="size-3.5" aria-hidden />
        Back to inbox
      </button>

      <header className="mb-6">
        <p className="inline-flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-[0.18em] text-[var(--ds-muted)]">
          <Lock className="size-3" aria-hidden />
          Shared draft · read-only
        </p>
        <h1 className="mt-2 text-[clamp(26px,3.2vw,36px)] font-semibold text-[var(--ds-ink)]">
          {booking.matterTitle ?? "Untitled matter"}
        </h1>
        {booking.message && (
          <p className="mt-3 max-w-[60ch] rounded-md bg-[var(--ds-surface-2)] px-4 py-3 text-[13.5px] leading-relaxed text-[var(--ds-body)]">
            <span className="mr-1 font-semibold text-[var(--ds-ink)]">HR brief:</span>
            {booking.message}
          </p>
        )}
      </header>

      <section className="rounded-[14px] border border-[var(--ds-line)] bg-[var(--ds-surface)] p-6">
        <div className="mb-4 flex items-center gap-2 text-[13px] font-semibold text-[var(--ds-ink)]">
          <FileText className="size-4 text-[var(--ds-muted)]" aria-hidden />
          Draft contents
        </div>
        {draft ? (
          <div className="space-y-4">
            <div className="rounded-md bg-[var(--ds-surface-2)] px-3 py-2 text-[12.5px] text-[var(--ds-body)]">
              <p>
                <strong>Letter type:</strong> {draft.letterType.replace(/_/g, " ")}
              </p>
              <p>
                <strong>Jurisdiction:</strong> {draft.context.jurisdiction ?? "—"}
              </p>
              <p>
                <strong>Mode:</strong> {draft.mode}
              </p>
            </div>
            <div className="prose prose-sm max-w-none">
              {(draft.sections ?? []).map((s) => (
                <article key={s.id} className="mb-4">
                  <h3 className="font-semibold text-[var(--ds-ink)]">{s.title}</h3>
                  <div
                    className="leading-relaxed text-[var(--ds-body)]"
                    dangerouslySetInnerHTML={{ __html: s.html }}
                  />
                </article>
              ))}
            </div>
          </div>
        ) : (
          <div className="rounded-[10px] border border-dashed border-[var(--ds-line)] px-5 py-10 text-center">
            <p className="text-[13.5px] text-[var(--ds-body)]">
              Draft content is not available in this browser. The full
              cross-device share lands when the matter-scoped sharing API
              ships — your accepted booking will then unlock read-only
              access to the sections, evidence, and audit chain.
            </p>
            <p className="mt-3 inline-flex items-center gap-1.5 text-[11.5px] font-semibold text-[var(--ds-muted)]">
              <ShieldCheck className="size-3.5" aria-hidden />
              Access is bookingId-scoped and time-limited.
            </p>
          </div>
        )}
      </section>
    </div>
  );
}
