import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Briefcase, CheckCircle2, ExternalLink, Inbox, Sparkles, TrendingUp, UserCog } from "lucide-react";
import { useConsultantStore, isProfileComplete } from "@/lib/consultantProfile";
import { useBookingsStore, parseSlaHours } from "@/lib/bookings";
import { ConsultantInbox } from "@/components/consultants/ConsultantInbox";
import { pullInbox, pullProfile } from "@/lib/marketplaceSync";

/**
 * Naïve earnings calculation — rate × estimated hours per completed
 * booking, using SLA as a proxy for hours. Real implementation will read
 * actual hours logged + Stripe transfer amounts once payouts land.
 */
function computeEarnings(
  bookings: Array<{ status: string }>,
  ratePerHour: number,
  slaString: string,
): { completed: number; pending: number; lifetime: number } {
  const hoursPerBooking = parseSlaHours(slaString);
  const completed = bookings.filter((b) => b.status === "completed").length;
  const pending = bookings.filter((b) => ["accepted", "delivered"].includes(b.status)).length;
  const lifetime = completed * ratePerHour * hoursPerBooking;
  return { completed, pending, lifetime };
}

/**
 * /c — Consultant home dashboard.
 *
 * Two-card shell:
 *  1. Profile completeness banner (calls out to /c/profile if incomplete).
 *  2. Inbound bookings inbox — empty state for now since the backend booking
 *     pipeline isn't wired up yet. The empty state explicitly tells the
 *     consultant their card is live in the marketplace, so they understand
 *     what's happening behind the scenes.
 *
 * Future work — wire to a real bookings table when the marketplace
 * server-side lands. The component is structured so the only thing
 * that changes is the source of `bookings` (today: empty array; later:
 * fetch from /api/bookings).
 */
export function ConsultantHome() {
  const nav = useNavigate();
  const profile = useConsultantStore((s) => s.profile);
  const enrolled = useConsultantStore((s) => s.enrolled);
  const complete = isProfileComplete(profile);

  // Hydrate from the server on mount so a consultant who signed up on
  // device A sees their profile + inbox on device B. Profile pull first
  // (so the inbox lookup has the correct user); inbox after.
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      await pullProfile();
      if (cancelled) return;
      await pullInbox();
    })();
    return () => {
      cancelled = true;
    };
  }, []);
  const allBookings = useBookingsStore((s) =>
    profile ? s.bookingsForConsultant(profile.initials) : [],
  );
  const seedSampleBooking = useSeedSampleBooking();
  const pendingCount = allBookings.filter((b) => b.status === "requested").length;
  const activeCount = allBookings.filter((b) => b.status === "accepted").length;
  const earnings = profile
    ? computeEarnings(allBookings, profile.price, profile.sla)
    : { completed: 0, pending: 0, lifetime: 0 };

  return (
    <div className="mx-auto max-w-5xl px-4 py-10 sm:px-6 sm:py-12">
      <div className="mb-8">
        <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[var(--ds-muted)]">
          Consultant
        </p>
        <h1 className="mt-2 text-[clamp(28px,3.4vw,40px)] font-semibold tracking-[-0.015em] text-[var(--ds-ink)]">
          {profile?.fullName ? `Welcome back, ${profile.fullName.split(" ")[0]}.` : "Welcome to DraftHR."}
        </h1>
        <p className="mt-2 max-w-[58ch] text-[14.5px] leading-relaxed text-[var(--ds-body)]">
          You're signed in as a consultant. HR teams discover you via the marketplace,
          and DraftHR routes review requests directly to your inbox below.
        </p>
      </div>

      {/* ─── Profile-completion banner ───────────────────────────── */}
      <section
        className={`mb-6 rounded-[14px] border p-5 sm:p-6 ${
          complete
            ? "border-[var(--ds-line)] bg-[var(--ds-surface)]"
            : "border-[var(--ds-amber-fg)]/30 bg-[var(--ds-amber-bg)]"
        }`}
      >
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-start gap-3">
            <span
              className={`mt-0.5 inline-grid size-9 place-items-center rounded-full ${
                complete
                  ? "bg-[var(--ds-green-bg)] text-[var(--ds-green-fg)]"
                  : "bg-white text-[var(--ds-amber-fg)]"
              }`}
              aria-hidden
            >
              {complete ? <CheckCircle2 className="size-5" /> : <UserCog className="size-5" />}
            </span>
            <div>
              <h2 className="text-[15px] font-semibold text-[var(--ds-ink)]">
                {complete ? "Your marketplace card is live." : "Finish your marketplace card."}
              </h2>
              <p className="mt-1 max-w-[52ch] text-[13.5px] leading-relaxed text-[var(--ds-body)]">
                {complete
                  ? "HR teams can find and book you. Edit anytime to change rate, specialties, or bio."
                  : enrolled
                    ? "Add your specialties, rate, and a short bio — five minutes and you're discoverable on /consultants."
                    : "Set up your marketplace card so HR teams can find and book you."}
              </p>
            </div>
          </div>
          <div className="flex gap-2 sm:flex-shrink-0">
            <button
              type="button"
              onClick={() => nav("/c/profile")}
              className="inline-flex h-9 items-center gap-1.5 rounded-[8px] bg-[var(--ds-ink)] px-3.5 text-[12.5px] font-semibold text-white transition hover:-translate-y-px hover:shadow-md"
            >
              {complete ? "Edit profile" : "Set up profile"}
              <span aria-hidden>→</span>
            </button>
            {complete && (
              <button
                type="button"
                onClick={() => nav("/consultants")}
                className="inline-flex h-9 items-center gap-1.5 rounded-[8px] border border-[var(--ds-line)] bg-white px-3.5 text-[12.5px] font-semibold text-[var(--ds-ink)] transition hover:border-[var(--ds-subtle)] hover:bg-[var(--ds-surface-2)]"
              >
                View in marketplace
                <ExternalLink className="size-3.5" aria-hidden />
              </button>
            )}
          </div>
        </div>
      </section>

      {/* ─── Inbox + Activity grid ──────────────────────────────── */}
      <div className="grid gap-4 sm:grid-cols-3">
        <section className="rounded-[14px] border border-[var(--ds-line)] bg-[var(--ds-surface)] p-5 sm:col-span-2">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="inline-flex items-center gap-2 text-[14px] font-semibold text-[var(--ds-ink)]">
              <Inbox className="size-4 text-[var(--ds-muted)]" aria-hidden />
              Inbox
            </h2>
            <div className="flex items-center gap-3 text-[11.5px] text-[var(--ds-muted)]">
              {allBookings.length === 0 ? (
                <button
                  type="button"
                  onClick={seedSampleBooking}
                  disabled={!complete}
                  title={complete ? undefined : "Complete your profile first"}
                  className="inline-flex items-center gap-1 rounded-md border border-dashed border-[var(--ds-line)] px-2 py-1 text-[11px] font-semibold text-[var(--ds-muted)] transition hover:border-[var(--ds-subtle)] hover:text-[var(--ds-ink)] disabled:cursor-not-allowed disabled:opacity-50"
                >
                  <Sparkles className="size-3" aria-hidden />
                  Add a demo request
                </button>
              ) : (
                <>
                  {pendingCount > 0 && <span>{pendingCount} new</span>}
                  {activeCount > 0 && <span>{activeCount} in progress</span>}
                </>
              )}
            </div>
          </div>
          <ConsultantInbox />
        </section>

        <section className="rounded-[14px] border border-[var(--ds-line)] bg-[var(--ds-surface)] p-5">
          <h2 className="mb-4 inline-flex items-center gap-2 text-[14px] font-semibold text-[var(--ds-ink)]">
            <Briefcase className="size-4 text-[var(--ds-muted)]" aria-hidden />
            At a glance
          </h2>
          <dl className="space-y-3 text-[13px]">
            <Row label="Rate">
              {profile
                ? `${profile.currency}${profile.price}/hr`
                : <span className="text-[var(--ds-muted)]">Set in profile</span>}
            </Row>
            <Row label="SLA">{profile?.sla ?? "—"}</Row>
            <Row label="Specialties">
              {profile?.specialties.length
                ? profile.specialties.slice(0, 2).join(" · ") + (profile.specialties.length > 2 ? ` +${profile.specialties.length - 2}` : "")
                : <span className="text-[var(--ds-muted)]">None yet</span>}
            </Row>
            <Row label="Reviews">
              {profile?.reviews ?? 0}
              <span className="ml-1 text-[var(--ds-muted)]">(new)</span>
            </Row>
          </dl>
        </section>
      </div>

      {/* ─── Earnings card ──────────────────────────────────────── */}
      <section className="mt-4 rounded-[14px] border border-[var(--ds-line)] bg-[var(--ds-surface)] p-5">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="inline-flex items-center gap-2 text-[14px] font-semibold text-[var(--ds-ink)]">
            <TrendingUp className="size-4 text-[var(--ds-muted)]" aria-hidden />
            Earnings
          </h2>
          <span className="text-[11px] italic text-[var(--ds-muted)]">
            Estimated · live payouts when Stripe Connect lands
          </span>
        </div>
        <div className="grid gap-4 sm:grid-cols-3">
          <Stat
            label="Completed reviews"
            value={String(earnings.completed)}
            sub={earnings.pending > 0 ? `${earnings.pending} in flight` : "No work in flight"}
          />
          <Stat
            label="Lifetime earnings"
            value={
              profile
                ? `${profile.currency}${earnings.lifetime.toLocaleString()}`
                : "—"
            }
            sub={
              profile
                ? `at ${profile.currency}${profile.price}/hr × est. hours`
                : "Set a rate to see earnings"
            }
          />
          <Stat
            label="Platform fee"
            value="12%"
            sub="Deducted on each completed booking"
          />
        </div>
      </section>
    </div>
  );
}

function Stat({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div>
      <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[var(--ds-muted)]">
        {label}
      </p>
      <p className="mt-1 font-display text-[28px] font-semibold text-[var(--ds-ink)]" style={{ fontFamily: 'var(--font-display)' }}>
        {value}
      </p>
      {sub && <p className="mt-0.5 text-[11.5px] text-[var(--ds-muted)]">{sub}</p>}
    </div>
  );
}

/**
 * Quality-of-life affordance — drops a sample 'requested' booking into
 * the consultant's inbox so they can exercise the accept / decline /
 * deliver flow before any real HR team has booked them. Only available
 * when the consultant's profile is complete (so the booking carries
 * matching initials).
 */
function useSeedSampleBooking() {
  const profile = useConsultantStore((s) => s.profile);
  const record = useBookingsStore((s) => s.recordBooking);
  return () => {
    if (!profile) return;
    record({
      consultantInitials: profile.initials,
      draftId: "demo-" + Math.random().toString(36).slice(2, 8),
      matterTitle: "Settlement letter — senior engineer, voluntary exit",
      message:
        "Could you review the settlement clauses? Specifically the without-prejudice wording and the s.111A position. Aiming to send Friday.",
      expectedDeliveryAt: Date.now() + 24 * 60 * 60 * 1000,
    });
  };
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <dt className="text-[11px] uppercase tracking-[0.12em] text-[var(--ds-muted)]">{label}</dt>
      <dd className="text-right text-[var(--ds-ink)] font-medium">{children}</dd>
    </div>
  );
}
