import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useShallow } from "zustand/react/shallow";
import {
  ArrowRight,
  Banknote,
  CheckCircle2,
  Clock,
  ExternalLink,
  Inbox,
  Percent,
  Sparkles,
  UserCog,
} from "lucide-react";
import { useConsultantStore, isProfileComplete } from "@/lib/consultantProfile";
import { useBookingsStore, type Booking } from "@/lib/bookings";
import { ConsultantInbox } from "@/components/consultants/ConsultantInbox";
import { BTN_LG, BTN_OUTLINE, BTN_PRIMARY } from "@/components/consultants/ui";
import { ExpertsHeader } from "@/components/consultants/ExpertsHeader";
import { pullInbox, pullProfile } from "@/lib/marketplaceSync";
import { cn } from "@/lib/utils";

/** Stable empty ref — see ConsultantInbox for the zustand-v5 rationale. */
const EMPTY_BOOKINGS: Booking[] = [];

/**
 * Indicative value: the rate is charged once per booking (the server's price
 * snapshot), so value is the rate times completed reviews. Real figures come
 * from Stripe transfers once payouts land.
 */
function computeEarnings(
  bookings: Array<{ status: string }>,
  ratePerReview: number,
): { completed: number; pending: number; lifetime: number } {
  const completed = bookings.filter((b) => b.status === "completed").length;
  const pending = bookings.filter((b) => ["accepted", "delivered"].includes(b.status)).length;
  const lifetime = completed * ratePerReview;
  return { completed, pending, lifetime };
}

/** Completed reviews per week over the last eight weeks, oldest first, for
 *  the sparkline on the first stat tile. */
function weeklyCompleted(bookings: Booking[], weeks = 8): number[] {
  const week = 7 * 24 * 60 * 60 * 1000;
  const now = Date.now();
  const out = new Array<number>(weeks).fill(0);
  for (const b of bookings) {
    if (b.status !== "completed") continue;
    const at = b.completedAt ?? b.deliveredAt ?? b.bookedAt;
    const ago = Math.floor((now - at) / week);
    if (ago >= 0 && ago < weeks) out[weeks - 1 - ago] += 1;
  }
  return out;
}

/**
 * /c — Consultant home dashboard.
 *
 *  1. 2A header ("Welcome back") with the profile actions.
 *  2. A tinted card when the profile is incomplete or under review.
 *  3. 7B stat tiles: completed reviews, in progress, value, platform fee.
 *  4. The inbox (tabs per status, 13B rows) beside an "At a glance" card.
 */
export function ConsultantHome() {
  const nav = useNavigate();
  const profile = useConsultantStore((s) => s.profile);
  const enrolled = useConsultantStore((s) => s.enrolled);
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
        // Best-effort hydration — a network failure must not wedge the page;
        // the local store still drives the UI.
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
  const seedSampleBooking = useSeedSampleBooking();
  const pendingCount = allBookings.filter((b) => b.status === "requested").length;
  const activeCount = allBookings.filter((b) => b.status === "accepted").length;
  const earnings = profile
    ? computeEarnings(allBookings, profile.price)
    : { completed: 0, pending: 0, lifetime: 0 };

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <ExpertsHeader
        crumbs={[{ label: "Consultant" }]}
        title={profile?.fullName ? `Welcome back, ${profile.fullName.split(" ")[0]}` : "Welcome to DraftHR"}
        lede="You're signed in as a consultant. HR teams discover you through the marketplace, and DraftHR routes review requests straight to your inbox below."
        actions={
          <>
            {published && (
              <button type="button" onClick={() => nav("/consultants")} className={cn(BTN_OUTLINE, BTN_LG)}>
                View in marketplace
                <ExternalLink className="size-3.5" aria-hidden />
              </button>
            )}
            <button type="button" onClick={() => nav("/c/profile")} className={cn(BTN_PRIMARY, BTN_LG)}>
              {complete ? "Edit profile" : "Set up profile"}
              <ArrowRight className="size-3.5" aria-hidden />
            </button>
          </>
        }
      />

      <div className="w-full px-4 pb-24 pt-7 sm:px-8 md:px-12">
      {/* ─── Profile status ──────────────────────────────────────── */}
      {published ? (
        <p className="m-0 mb-8 inline-flex max-w-full items-start gap-2 text-[13px] leading-relaxed text-[var(--ds-body)]">
          <CheckCircle2 className="mt-[3px] size-3.5 shrink-0 text-[var(--ds-green-fg)]" aria-hidden />
          <span>
            <span className="font-medium text-[var(--ds-ink)]">Your marketplace card is live.</span>{" "}
            HR teams can find and book you. Edit anytime to change rate, specialties, or bio.
          </span>
        </p>
      ) : (
        <section
          className="mb-8 flex items-start gap-3.5 rounded-[14px] px-5 py-4 sm:px-6 sm:py-5"
          style={{
            background: complete ? "var(--ds-tint-lavender)" : "var(--ds-tint-butter)",
          }}
        >
          <span
            className="mt-0.5 grid size-8 shrink-0 place-items-center rounded-full bg-[var(--ds-surface)]/80"
            style={{ color: complete ? "var(--ds-tint-lavender-ink)" : "var(--ds-tint-butter-ink)" }}
            aria-hidden
          >
            {complete ? <Clock className="size-4" /> : <UserCog className="size-4" />}
          </span>
          <div className="min-w-0">
            <h2 className="m-0 text-[14.5px] font-medium text-[var(--ds-ink)]">
              {!complete ? "Finish your marketplace card." : "Your profile is under review."}
            </h2>
            <p className="m-0 mt-1 max-w-[60ch] text-[13px] leading-relaxed text-[var(--ds-body)]">
              {!complete
                ? enrolled
                  ? "Add your specialties, rate, and a short bio. Five minutes and you're ready to submit for review."
                  : "Set up your marketplace card so HR teams can find and book you."
                : "Thanks for completing your profile. Our team is reviewing it. You'll be listed in the marketplace once it's approved, usually within one business day."}
            </p>
          </div>
        </section>
      )}

      {/* ─── 7B stat tiles ──────────────────────────────────────── */}
      <section aria-labelledby="earnings-h" className="mb-10">
        <div className="mb-3 flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
          <h2 id="earnings-h" className="m-0 text-[15px] font-medium text-[var(--ds-ink)]">
            Your reviews
          </h2>
          <span className="text-[12.5px] text-[var(--ds-muted)]">
            Indicative. Real payouts arrive with Stripe Connect.
          </span>
        </div>
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <StatTile
            label="Completed reviews"
            icon={<CheckCircle2 />}
            value={String(earnings.completed)}
            spark={weeklyCompleted(allBookings)}
            foot={earnings.pending > 0 ? `${earnings.pending} in flight` : "No work in flight"}
          />
          <StatTile
            label="In progress"
            icon={<Inbox />}
            value={String(activeCount)}
            foot={pendingCount > 0 ? `${pendingCount} new request${pendingCount === 1 ? "" : "s"}` : "No new requests"}
          />
          <StatTile
            label="Potential value"
            icon={<Banknote />}
            value={
              profile && earnings.completed > 0
                ? `~${profile.currency}${earnings.lifetime.toLocaleString()}`
                : `${profile?.currency ?? "£"}0`
            }
            foot={
              profile && earnings.completed > 0
                ? `Indicative: ${profile.currency}${profile.price} per review × completed reviews`
                : "Tracked once payouts go live"
            }
          />
          <StatTile
            label="Platform fee"
            icon={<Percent />}
            value="12%"
            foot="Planned, applies once payouts launch"
          />
        </div>
      </section>

      {/* ─── Inbox + At a glance ────────────────────────────────── */}
      <div className="grid gap-x-8 gap-y-8 lg:grid-cols-[minmax(0,1fr)_280px]">
        <section aria-labelledby="inbox-h" className="min-w-0" data-testid="consultant-inbox">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
            <h2 id="inbox-h" className="m-0 text-[15px] font-medium text-[var(--ds-ink)]">
              Inbox
            </h2>
            <div className="flex items-center gap-3 text-[12.5px] text-[var(--ds-muted)]">
              {allBookings.length === 0 ? (
                // Dev-only affordance to seed a sample booking while building
                // the inbox. Never shown to real consultants in production, and
                // only once the profile exists (a booking needs a listing).
                import.meta.env.DEV && complete ? (
                  <button
                    type="button"
                    onClick={seedSampleBooking}
                    className="inline-flex h-7 items-center gap-1 rounded-[var(--ds-r-s)] border border-dashed border-[var(--ds-line-strong)] px-2 text-[12px] font-medium text-[var(--ds-muted)] transition-colors duration-[120ms] hover:bg-[var(--ds-hover)] hover:text-[var(--ds-ink)] disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    <Sparkles className="size-3" aria-hidden />
                    Add a sample booking
                  </button>
                ) : null
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

        <aside aria-labelledby="glance-h" className="self-start rounded-[14px] bg-[var(--ds-surface-2)] p-5">
          <h2 id="glance-h" className="m-0 mb-4 text-[14px] font-medium text-[var(--ds-ink)]">
            At a glance
          </h2>
          <dl className="m-0 space-y-3 text-[13px]">
            <Row label="Rate">
              {profile
                ? `${profile.currency}${profile.price} per review`
                : <span className="text-[var(--ds-muted)]">Set in profile</span>}
            </Row>
            <Row label="SLA">{profile?.sla ?? <span className="text-[var(--ds-muted)]">Not set</span>}</Row>
            <Row label="Specialties">
              {profile?.specialties?.length
                ? profile.specialties.slice(0, 2).join(" · ") + (profile.specialties.length > 2 ? ` +${profile.specialties.length - 2}` : "")
                : <span className="text-[var(--ds-muted)]">None yet</span>}
            </Row>
            <Row label="Reviews">
              {profile?.reviews ? profile.reviews : <span className="text-[var(--ds-muted)]">None yet</span>}
            </Row>
          </dl>
        </aside>
      </div>
      </div>
    </div>
  );
}

/** 7B stat tile: label and icon, a big serif number, an optional sparkline,
 *  and a quiet footnote. */
function StatTile({
  label,
  icon,
  value,
  foot,
  spark,
}: {
  label: string;
  icon: React.ReactNode;
  value: string;
  foot?: string;
  spark?: number[];
}) {
  return (
    <div className="flex min-w-0 flex-col rounded-[14px] bg-[var(--ds-surface-2)] px-[18px] pb-[15px] pt-4">
      <div className="flex items-center justify-between gap-2 text-[12.5px] text-[var(--ds-muted)] [&_svg]:size-[15px] [&_svg]:shrink-0">
        <span className="truncate">{label}</span>
        {icon}
      </div>
      <div className="mt-2.5 flex min-h-[42px] items-end justify-between gap-3">
        <span className="ds-title text-[clamp(30px,3.4vw,40px)] leading-none">{value}</span>
        {spark && <Sparkline series={spark} />}
      </div>
      {foot && <p className="m-0 mt-3 text-[12px] leading-snug text-[var(--ds-muted)]">{foot}</p>}
    </div>
  );
}

function Sparkline({ series }: { series: number[] }) {
  const W = 96;
  const H = 34;
  const max = Math.max(1, ...series);
  const step = series.length > 1 ? W / (series.length - 1) : W;
  const pts = series.map((v, i) => [i * step, H - 3 - (v / max) * (H - 6)] as const);
  const d = pts.map(([x, y], i) => `${i ? "L" : "M"}${x.toFixed(1)} ${y.toFixed(1)}`).join(" ");
  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      preserveAspectRatio="none"
      aria-hidden
      className={cn("block h-[34px] w-[96px] max-w-[55%] shrink overflow-visible text-[var(--ds-ink)]")}
    >
      <path d={`${d} L${W} ${H} L0 ${H} Z`} fill="currentColor" opacity={0.05} />
      <path d={d} fill="none" stroke="currentColor" strokeWidth={1.6} strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
    </svg>
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
      consultantProfileId: profile.id,
      draftId: "demo-" + Math.random().toString(36).slice(2, 8),
      matterTitle: "Settlement letter, senior engineer, voluntary exit",
      message:
        "Could you review the settlement clauses? Specifically the without-prejudice wording and the s.111A position. Aiming to send Friday.",
      expectedDeliveryAt: Date.now() + 24 * 60 * 60 * 1000,
    });
  };
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <dt className="text-[12.5px] text-[var(--ds-muted)]">{label}</dt>
      <dd className="m-0 text-right font-medium text-[var(--ds-ink)]">{children}</dd>
    </div>
  );
}
