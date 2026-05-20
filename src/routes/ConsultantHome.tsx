import { useNavigate } from "react-router-dom";
import { Briefcase, CheckCircle2, ExternalLink, Inbox, UserCog } from "lucide-react";
import { useConsultantStore, isProfileComplete } from "@/lib/consultantProfile";

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

  // Until the bookings backend is wired, this is always an empty inbox —
  // but the shell shows what a populated state would look like so the
  // consultant can see the shape.
  const bookings: never[] = [];

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
            <span className="text-[11.5px] text-[var(--ds-muted)]">
              {bookings.length === 0 ? "No requests yet" : `${bookings.length} pending`}
            </span>
          </div>
          {bookings.length === 0 ? (
            <div className="rounded-[10px] border border-dashed border-[var(--ds-line)] px-5 py-10 text-center">
              <p className="text-[13.5px] text-[var(--ds-body)]">
                Your inbox is empty. As soon as an HR team books a review with you,
                it'll land here with the full letter, evidence pack, and timer.
              </p>
              <p className="mt-2 text-[11.5px] text-[var(--ds-muted)]">
                {complete
                  ? "Your card is live now — discovery is automatic."
                  : "Complete your profile to start showing up in search."}
              </p>
            </div>
          ) : null}
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
