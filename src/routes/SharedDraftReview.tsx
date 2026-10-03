import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { ArrowLeft, FileText, Loader2, Lock, ShieldCheck } from "lucide-react";
import { useBookingsStore } from "@/lib/bookings";
import { getSharedDraft, type SharedDraftDTO } from "@/lib/consultantApi";
import { sanitizeLetterHtml } from "@/lib/sanitize";
import { pullInbox } from "@/lib/marketplaceSync";
import { AppLoadingScreen } from "@/components/AppLoadingScreen";
import { Button } from "@/components/ui/button";

/**
 * /c/review/:bookingId — read-only draft view for a consultant who has
 * accepted a booking.
 *
 * Resolves the booking's matter-scoped share token via the server
 * endpoint /api/marketplace/shared/<token>. The server enforces:
 *   - the caller's session matches the booking's assigned consultant,
 *   - the token hasn't expired (30-day window from acceptance).
 *
 * Reloads the server inbox on direct entry / refresh. Draft access always
 * requires the server's accepted booking and share token, never browser data.
 */
export function SharedDraftReview() {
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    void pullInbox().then((ok) => {
      if (!cancelled) { setFailed(!ok); setLoading(false); }
    });
    return () => { cancelled = true; };
  }, [attempt]);
  if (loading) return <AppLoadingScreen />;
  if (failed) return <section role="alert" className="mx-auto max-w-4xl px-4 py-10">
    <p>Your booking could not be loaded.</p>
    <Button variant="outline" className="mt-3" onClick={() => setAttempt((n) => n + 1)}>Retry</Button>
  </section>;
  return <LoadedSharedDraftReview />;
}

function LoadedSharedDraftReview() {
  const nav = useNavigate();
  const { bookingId } = useParams<{ bookingId: string }>();
  const bookings = useBookingsStore((s) => s.inbox);
  const booking = bookings.find((b) => b.id === bookingId);

  const [shared, setShared] = useState<SharedDraftDTO | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Fetch only through the server-authorized share token.
  useEffect(() => {
    let cancelled = false;
    setShared(null);
    setError(null);
    setLoading(true);
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
  }, [booking?.id, booking?.shareToken]);

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
            Draft access opens once you accept the booking. Currently the
            status is <strong>{booking.status}</strong>.
          </>
        }
      />
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
          {shared?.booking.matterTitle ?? booking.matterTitle ?? "Untitled matter"}
        </h1>
        {(shared?.booking.message ?? booking.message) && (
          <p className="mt-3 max-w-[60ch] rounded-md bg-[var(--ds-surface-2)] px-4 py-3 text-[13.5px] leading-relaxed text-[var(--ds-body)]">
            <span className="mr-1 font-semibold text-[var(--ds-ink)]">HR brief:</span>
            {shared?.booking.message ?? booking.message}
          </p>
        )}
      </header>

      <section className="rounded-[14px] border border-[var(--ds-line)] bg-[var(--ds-surface)] p-6">
        <div className="mb-4 flex items-center gap-2 text-[13px] font-semibold text-[var(--ds-ink)]">
          <FileText className="size-4 text-[var(--ds-muted)]" aria-hidden />
          Draft contents
        </div>
        {loading ? (
          <div className="grid place-items-center px-5 py-10 text-[13px] text-[var(--ds-muted)]">
            <Loader2 className="size-4 animate-spin" aria-hidden />
            <p className="mt-2">Fetching the draft…</p>
          </div>
        ) : shared ? (
          <div className="space-y-4">
            <div className="rounded-md bg-[var(--ds-surface-2)] px-3 py-2 text-[12.5px] text-[var(--ds-body)]">
              <p>
                <strong>Letter type:</strong> {shared.draft.letterType.replace(/_/g, " ")}
              </p>
              <p>
                <strong>Jurisdiction:</strong> {shared.draft.jurisdiction ?? "—"}
              </p>
              <p>
                <strong>Mode:</strong> {shared.draft.mode}
              </p>
            </div>
            <div className="prose prose-sm max-w-none">
              {shared.draft.sections.map((s) => (
                <article key={s.id} className="mb-4">
                  <h3 className="font-semibold text-[var(--ds-ink)]">{s.title}</h3>
                  <div
                    className="leading-relaxed text-[var(--ds-body)]"
                    // Defence-in-depth: this is a raw-HTML sink rendered to a
                    // consultant via a share token. Section html is normally
                    // sanitised on write, but an aborted/partial AI stream can
                    // leave raw model deltas at rest — sanitise here so they
                    // can never reach the DOM unescaped.
                    dangerouslySetInnerHTML={{ __html: sanitizeLetterHtml(s.html) }}
                  />
                </article>
              ))}
            </div>
            <p className="mt-4 inline-flex items-center gap-1.5 text-[11px] text-[var(--ds-muted)]">
              <ShieldCheck className="size-3" aria-hidden />
              Token-scoped read access · expires 30 days after acceptance
            </p>
          </div>
        ) : (
          <div className="rounded-[10px] border border-dashed border-[var(--ds-line)] px-5 py-10 text-center">
            <p className="text-[13.5px] text-[var(--ds-body)]">
              {error
                ? error
                : "Draft access pending. If you've just accepted, refresh the inbox to pick up the share link."}
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
    <div className="mx-auto max-w-3xl px-4 py-12 sm:px-6 sm:py-16">
      <button
        type="button"
        onClick={() => nav("/c")}
        className="mb-6 inline-flex items-center gap-1.5 text-[12.5px] font-semibold text-[var(--ds-muted)] hover:text-[var(--ds-ink)]"
      >
        <ArrowLeft className="size-3.5" aria-hidden />
        Back to inbox
      </button>
      <h1 className="text-[clamp(24px,3vw,32px)] font-semibold text-[var(--ds-ink)]">{title}</h1>
      <p className="mt-3 text-[14px] text-[var(--ds-body)]">{body}</p>
    </div>
  );
}
