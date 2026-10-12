import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { ArrowLeft, FileText, Loader2, Lock, ShieldCheck } from "lucide-react";
import { useBookingsStore } from "@/lib/bookings";
import { getSharedDraft, type SharedDraftDTO } from "@/lib/consultantApi";
import { sanitizeLetterHtml } from "@/lib/sanitize";

/**
 * /c/review/:bookingId — read-only draft view for a consultant who has
 * accepted a booking that has been paid for.
 *
 * Resolves the booking's matter-scoped share token via the server
 * endpoint /api/marketplace/shared/<token>. The server enforces:
 *   - the caller's session matches the booking's assigned consultant,
 *   - the token hasn't expired (30-day window from payment),
 *   - the booking is still paid (a refund or dispute withdraws access).
 *
 * Falls back to the local draft store ONLY when the booking has no
 * share token yet (e.g. local-only demo bookings that never got an
 * API accept transition). That fallback path runs only for the booker's
 * own device — cross-device sharing requires the API + token.
 */
export function SharedDraftReview() {
  const nav = useNavigate();
  const { bookingId } = useParams<{ bookingId: string }>();
  const bookings = useBookingsStore((s) => s.bookings);
  const booking = bookings.find((b) => b.id === bookingId);

  const [shared, setShared] = useState<SharedDraftDTO | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Fetch via the share-token endpoint when the booking has one. Try
  // every accepted booking with a stored shareToken first; fall through
  // to a local-render path if the token isn't present (demo / pre-API
  // bookings).
  useEffect(() => {
    let cancelled = false;
    if (!booking) {
      setLoading(false);
      return;
    }
    const token = (booking as unknown as { shareToken?: string | null }).shareToken;
    if (!token) {
      setLoading(false);
      return;
    }
    void getSharedDraft(token).then((res) => {
      if (cancelled) return;
      if (!res.ok) setError(res.error);
      else setShared(res.data);
      setLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, [booking?.id]);

  if (!booking) {
    return (
      <NotFoundShell
        nav={nav}
        title="Booking not found"
        body="That booking either doesn't exist or has been withdrawn."
      />
    );
  }

  if (booking.status !== "accepted" && booking.status !== "delivered" && booking.status !== "completed") {
    return (
      <NotFoundShell
        nav={nav}
        title="Access not yet granted"
        body={
          <>
            Draft access opens once you accept the booking and HR has paid
            for it. Currently the status is <strong>{booking.status}</strong>.
          </>
        }
      />
    );
  }

  const brief = shared?.booking.message ?? booking.message;

  return (
    <div className="mx-auto w-full max-w-[1180px] px-4 py-6 sm:px-8 sm:py-10">
      <BackToInbox nav={nav} />

      <header className="mb-7">
        <p className="m-0 inline-flex items-center gap-1.5 text-[12.5px] text-[var(--ds-muted)]">
          <Lock className="size-3" aria-hidden />
          Shared draft, read only
        </p>
        <h1 className="ds-title m-0 mt-2 text-[clamp(30px,4vw,40px)] leading-[1.1] [overflow-wrap:anywhere]">
          {shared?.booking.matterTitle ?? booking.matterTitle ?? "Untitled matter"}
        </h1>
      </header>

      {/* 14B in read-only mode: the letter in the centre, the brief and the
       * letter facts in the side panel. Phones stack the panel first. */}
      <div className="grid items-start gap-5 lg:grid-cols-[minmax(0,1fr)_320px] lg:gap-8">
        <section
          aria-label="Draft contents"
          className="order-2 min-w-0 rounded-[3px] bg-[var(--ds-surface)] px-6 py-8 shadow-[var(--ds-shadow-m)] ring-1 ring-[var(--ds-line)] sm:px-14 sm:py-12 lg:order-none"
        >
          {loading ? (
            <div className="grid place-items-center px-5 py-10 text-[13px] text-[var(--ds-muted)]">
              <Loader2 className="size-4 animate-spin" aria-hidden />
              <p className="mt-2">Fetching the draft…</p>
            </div>
          ) : shared ? (
            <div>
              {shared.draft.sections.map((s) => (
                <article key={s.id} className="mb-6 last:mb-0">
                  <h3 className="m-0 mb-1.5 text-[12px] font-medium text-[var(--ds-muted)]">{s.title}</h3>
                  <div
                    className="shared-letter"
                    // Defence-in-depth: this is a raw-HTML sink rendered to a
                    // consultant via a share token. Section html is normally
                    // sanitised on write, but an aborted/partial AI stream can
                    // leave raw model deltas at rest — sanitise here so they
                    // can never reach the DOM unescaped.
                    dangerouslySetInnerHTML={{ __html: sanitizeLetterHtml(s.html) }}
                  />
                </article>
              ))}
              <style>{sharedLetterStyles}</style>
            </div>
          ) : (
            <div className="px-2 py-10 text-center">
              <FileText className="mx-auto size-5 text-[var(--ds-faint)]" aria-hidden />
              <p className="m-0 mt-3 text-[13.5px] text-[var(--ds-body)]">
                {error
                  ? error
                  : "Draft access opens once the booking is paid. If HR has just paid, refresh the inbox to pick up the share link."}
              </p>
              <p className="m-0 mt-3 inline-flex items-center gap-1.5 text-[12px] text-[var(--ds-muted)]">
                <ShieldCheck className="size-3.5" aria-hidden />
                Access is booking-scoped and time-limited.
              </p>
            </div>
          )}
        </section>

        <aside aria-label="About this draft" className="order-1 flex min-w-0 flex-col gap-3 lg:order-none lg:sticky lg:top-6">
          {brief && (
            <section className="rounded-[var(--ds-r-l)] bg-[var(--ds-surface-2)] p-4">
              <h2 className="m-0 text-[12.5px] font-medium text-[var(--ds-muted)]">HR brief</h2>
              <p className="m-0 mt-1.5 text-[13.5px] leading-relaxed text-[var(--ds-body)]">{brief}</p>
            </section>
          )}
          {shared && (
            <section className="rounded-[var(--ds-r-l)] border border-[var(--ds-line)] bg-[var(--ds-surface)] p-4">
              <h2 className="m-0 text-[12.5px] font-medium text-[var(--ds-muted)]">Letter</h2>
              <dl className="m-0 mt-2 grid grid-cols-[96px_minmax(0,1fr)] gap-y-2 text-[13px]">
                <dt className="text-[var(--ds-muted)]">Letter type</dt>
                <dd className="m-0 capitalize text-[var(--ds-ink)]">
                  {shared.draft.letterType.replace(/_/g, " ")}
                </dd>
                <dt className="text-[var(--ds-muted)]">Jurisdiction</dt>
                <dd className="m-0 text-[var(--ds-ink)]">{shared.draft.jurisdiction ?? "Not set"}</dd>
                <dt className="text-[var(--ds-muted)]">Mode</dt>
                <dd className="m-0 capitalize text-[var(--ds-ink)]">{shared.draft.mode}</dd>
              </dl>
            </section>
          )}
          <p className="m-0 inline-flex items-start gap-1.5 px-1 text-[12px] leading-relaxed text-[var(--ds-muted)]">
            <ShieldCheck className="mt-0.5 size-3.5 shrink-0" aria-hidden />
            Token-scoped read access. Expires 30 days after payment.
          </p>
        </aside>
      </div>
    </div>
  );
}

const sharedLetterStyles = `
.shared-letter { font-family: var(--font-serif); font-size: 15.5px; line-height: 1.62; color: var(--ds-ink); overflow-wrap: anywhere; }
.shared-letter p { margin: 0 0 0.9em; }
.shared-letter ul, .shared-letter ol { margin: 0 0 0.9em 1.3em; padding: 0; }
.shared-letter h1, .shared-letter h2, .shared-letter h3 { font-weight: 600; margin: 1em 0 0.4em; }
`;

function BackToInbox({ nav }: { nav: ReturnType<typeof useNavigate> }) {
  return (
    <button
      type="button"
      onClick={() => nav("/c")}
      className="mb-5 inline-flex items-center gap-1.5 text-[12.5px] text-[var(--ds-muted)] hover:text-[var(--ds-ink)]"
    >
      <ArrowLeft className="size-3.5" aria-hidden />
      Back to inbox
    </button>
  );
}

function NotFoundShell({
  nav,
  title,
  body,
}: {
  nav: ReturnType<typeof useNavigate>;
  title: string;
  body: React.ReactNode;
}) {
  return (
    <div className="mx-auto max-w-3xl px-4 py-12 sm:px-8 sm:py-16">
      <BackToInbox nav={nav} />
      <h1 className="ds-title m-0 text-[clamp(30px,4vw,40px)] leading-[1.1]">{title}</h1>
      <p className="m-0 mt-3 text-[14px] text-[var(--ds-muted)]">{body}</p>
    </div>
  );
}
