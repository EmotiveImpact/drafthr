import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useShallow } from "zustand/react/shallow";
import { Briefcase, CheckCircle2, ExternalLink, Inbox, TrendingUp, UserCog } from "lucide-react";
import { useConsultantStore, isProfileComplete } from "@/lib/consultantProfile";
import { useBookingsStore, type Booking } from "@/lib/bookings";
import { ConsultantInbox } from "@/components/consultants/ConsultantInbox";
import { pullInbox, pullProfile } from "@/lib/marketplaceSync";
import { AppLoadingScreen } from "@/components/AppLoadingScreen";
import { Button } from "@/components/ui/button";

/** Stable empty ref — see ConsultantInbox for the zustand-v5 rationale. */
const EMPTY_BOOKINGS: Booking[] = [];

/** Consultant dashboard using the accepted profile and inbox read models. */
export function ConsultantHome() {
  const nav = useNavigate();
  const profile = useConsultantStore((s) => s.profile);
  const enrolled = useConsultantStore((s) => s.enrolled);
  const profileState = useConsultantStore((s) => s.lastSync.state);
  const inboxState = useBookingsStore((s) => s.inboxState);
  const complete = isProfileComplete(profile);
  // Server moderation status — only "published" profiles actually appear in the
  // marketplace. New sign-ups are "pending_review" until an admin vets them, so
  // we must not claim the card is "live" / discoverable until it really is.
  const published = complete && profile?.status === "published";

  // Hydrate from the server on mount so a consultant who signed up on
  // device A sees their profile + inbox on device B. Profile pull first
  // (so the inbox lookup has the correct user); inbox after.
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        await pullProfile();
        if (cancelled) return;
        await pullInbox();
      } catch (err) {
        // Transport errors are reflected in the profile/inbox error states.
        if (!cancelled) console.warn("[ConsultantHome] hydrate failed", err);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);
  const allBookings = useBookingsStore(
    useShallow((s) =>
      profile ? s.bookingsForConsultant(profile.initials, profile.id) : EMPTY_BOOKINGS,
    ),
  );
  const pendingCount = allBookings.filter((b) => b.status === "requested").length;
  const activeCount = allBookings.filter((b) => b.status === "accepted").length;
  const completedCount = allBookings.filter((b) => b.status === "completed").length;
  const deliveredCount = allBookings.filter((b) => b.status === "delivered").length;
  const activityReady = inboxState === "ready";

  if (!profile && (profileState === "idle" || profileState === "pending")) return <AppLoadingScreen />;
  if (profileState === "error") return <section role="alert" className="mx-auto max-w-5xl px-4 py-10">
    <p>Your consultant profile could not be loaded.</p>
    <Button variant="outline" className="mt-3" onClick={() => void pullProfile().then((ok) => ok && pullInbox())}>Retry</Button>
  </section>;

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
                {!complete
                  ? "Finish your marketplace card."
                  : published
                    ? "Your marketplace card is live."
                    : "Your profile is under review."}
              </h2>
              <p className="mt-1 max-w-[52ch] text-[13.5px] leading-relaxed text-[var(--ds-body)]">
                {!complete
                  ? enrolled
                    ? "Add your specialties, rate, and a short bio — five minutes and you're ready to submit for review."
                    : "Set up your marketplace card so HR teams can find and book you."
                  : published
                    ? "HR teams can find and book you. Edit anytime to change rate, specialties, or bio."
                    : "Your profile is saved. It will appear in the marketplace only while its review status is published."}
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
            {published && (
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
              {activityReady && allBookings.length > 0 && (
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
              {profile?.specialties?.length
                ? profile.specialties.slice(0, 2).join(" · ") + (profile.specialties.length > 2 ? ` +${profile.specialties.length - 2}` : "")
                : <span className="text-[var(--ds-muted)]">None yet</span>}
            </Row>
            <Row label="Reviews">
              {profile?.reviews ?? 0}
            </Row>
          </dl>
        </section>
      </div>

      {/* ─── Review activity ────────────────────────────────────── */}
      <section aria-labelledby="review-activity-heading" className="mt-4 rounded-[14px] border border-[var(--ds-line)] bg-[var(--ds-surface)] p-5">
        <div className="mb-4 flex items-center justify-between">
          <h2 id="review-activity-heading" className="inline-flex items-center gap-2 text-[14px] font-semibold text-[var(--ds-ink)]">
            <TrendingUp className="size-4 text-[var(--ds-muted)]" aria-hidden />
            Review activity
          </h2>
          <span className="text-[11px] italic text-[var(--ds-muted)]">
            {activityReady ? "From saved booking statuses" : inboxState === "error" ? "Activity unavailable · retry the inbox" : "Loading activity…"}
          </span>
        </div>
        <div className="grid gap-4 sm:grid-cols-3">
          <Stat
            label="Completed reviews"
            value={activityReady ? String(completedCount) : "—"}
            sub="Acknowledged by the requester"
          />
          <Stat
            label="In progress"
            value={activityReady ? String(activeCount) : "—"}
            sub="Accepted and not yet delivered"
          />
          <Stat
            label="Awaiting acknowledgement"
            value={activityReady ? String(deliveredCount) : "—"}
            sub="Delivered to the requester"
          />
        </div>
        <p className="mt-4 text-[11.5px] text-[var(--ds-muted)]">
          Review counts are not earnings or payout totals.{" "}
          <button type="button" className="underline underline-offset-2" onClick={() => nav("/c/profile")}>
            Check payout setup in your profile.
          </button>
        </p>
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

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <dt className="text-[11px] uppercase tracking-[0.12em] text-[var(--ds-muted)]">{label}</dt>
      <dd className="text-right text-[var(--ds-ink)] font-medium">{children}</dd>
    </div>
  );
}
