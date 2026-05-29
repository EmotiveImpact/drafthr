import { useEffect, useState } from "react";
import { Navigate, useNavigate } from "react-router-dom";
import { AlertTriangle, ArrowLeft, CheckCircle2, ShieldAlert, XCircle } from "lucide-react";
import { useConsultantStore } from "@/lib/consultantProfile";
import { useAuth } from "@/lib/auth";

/**
 * /admin/consultants — admin vetting review.
 *
 * MVP: surfaces the signed-in user's own profile (since the localStorage
 * model only knows about one profile per browser) so a privileged admin
 * can simulate the approve/reject decision. When the API is wired in,
 * this becomes a pageable list of every status='pending_review' profile
 * across all tenants.
 *
 * Access control: temporarily relies on a hardcoded admin email list
 * (DRAFTHR_ADMIN_EMAILS, surfaced via VITE_ADMIN_EMAILS at build time).
 * Replace with a proper role check once the server-side admin role
 * lands in tenant_members.
 */

const ADMIN_EMAILS = (
  (import.meta.env.VITE_ADMIN_EMAILS as string | undefined) ?? ""
)
  .split(",")
  .map((s) => s.trim().toLowerCase())
  .filter(Boolean);

export function ConsultantAdminReview() {
  const nav = useNavigate();
  const { user } = useAuth();
  const profile = useConsultantStore((s) => s.profile);
  const saveProfile = useConsultantStore((s) => s.saveProfile);

  // Until we have a proper admin role, gate on email. Replace this with
  // a server-side role check + redirect once tenant_members has an
  // 'admin' enum value.
  const [authedAdmin, setAuthedAdmin] = useState<boolean | null>(null);
  // Reject confirmation state. MUST be declared before any early return —
  // hooks can't run conditionally, and `profile` flipping null→set (via a
  // background pullProfile/saveProfile) would otherwise change the hook
  // count between renders → "rendered more hooks than previous render".
  const [confirmReject, setConfirmReject] = useState(false);
  useEffect(() => {
    // Gate on the admin email allowlist (VITE_ADMIN_EMAILS). The caller's
    // email must be on the list. Empty list = not configured = deny.
    // (This is a client-side gate; the real server-side role check lands
    // with the admin API. It is NOT a security boundary on its own, but
    // it no longer hard-codes `|| true` letting anyone in.)
    const email = user?.email?.toLowerCase() ?? "";
    setAuthedAdmin(ADMIN_EMAILS.length > 0 && ADMIN_EMAILS.includes(email));
  }, [user?.email]);

  if (authedAdmin === null) return null;
  // Not an allowlisted admin → bounce to the home redirect. No flash of
  // admin content.
  if (authedAdmin === false) return <Navigate to="/" replace />;

  if (!profile) {
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
          Consultant review queue
        </h1>
        <p className="mt-3 max-w-[60ch] text-[14.5px] leading-relaxed text-[var(--ds-body)]">
          No profiles awaiting review right now. When a consultant submits
          their card, it lands here for approve / reject. The full
          server-side queue lights up once the API switch is in.
        </p>
      </div>
    );
  }

  const onApprove = () => {
    // Until the API switch, "approve" is a no-op — the profile is already
    // discoverable to anyone visiting /consultants because we list any
    // complete localStorage profile. Once on the API, this becomes
    // PATCH /api/admin/consultant/{id} { status: "published" }.
    saveProfile({ /* no-op */ });
    nav("/admin/consultants");
  };
  const onReject = () => {
    // Equivalent server call: PATCH /api/admin/consultant/{id} { status: "rejected" }
    setConfirmReject(false);
    nav("/admin/consultants");
  };

  return (
    <div className="mx-auto max-w-4xl px-4 py-10 sm:px-6 sm:py-12">
      <header className="mb-8">
        <button
          type="button"
          onClick={() => nav(-1)}
          className="mb-4 inline-flex items-center gap-1.5 text-[12.5px] font-semibold text-[var(--ds-muted)] hover:text-[var(--ds-ink)]"
        >
          <ArrowLeft className="size-3.5" aria-hidden />
          Back
        </button>
        <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[var(--ds-muted)]">
          Admin · Consultant review
        </p>
        <h1 className="mt-2 text-[clamp(28px,3.4vw,40px)] font-semibold tracking-[-0.015em] text-[var(--ds-ink)]">
          Review the next profile.
        </h1>
        <p className="mt-2 max-w-[60ch] text-[14px] leading-relaxed text-[var(--ds-body)]">
          Approve to publish to the public marketplace; reject to send back
          for revision (no notice to other tenants).
        </p>
      </header>

      <article className="rounded-[14px] border border-[var(--ds-line)] bg-[var(--ds-surface)] p-6">
        <header className="flex items-start gap-4">
          {profile.photoUrl ? (
            <img
              src={profile.photoUrl}
              alt=""
              className="size-16 rounded-full object-cover border border-[var(--ds-line)]"
            />
          ) : (
            <div className="grid size-16 place-items-center rounded-full bg-[var(--ds-surface-2)] border border-[var(--ds-line)] text-[18px] font-semibold text-[var(--ds-muted)]">
              {profile.initials}
            </div>
          )}
          <div>
            <h2 className="text-[18px] font-semibold text-[var(--ds-ink)]">{profile.fullName}</h2>
            <p className="text-[12.5px] text-[var(--ds-muted)]">{profile.role}</p>
            <p className="mt-1 text-[12px] text-[var(--ds-muted)]">
              {profile.currency}{profile.price}/hr · SLA {profile.sla}
            </p>
          </div>
        </header>

        <div className="mt-4 border-t border-[var(--ds-line)] pt-4">
          <h3 className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[var(--ds-muted)] mb-1.5">Specialty</h3>
          <p className="text-[13.5px] text-[var(--ds-body)]">{profile.specialty || "—"}</p>
          <h3 className="mt-4 text-[11px] font-semibold uppercase tracking-[0.14em] text-[var(--ds-muted)] mb-1.5">Bio</h3>
          <p className="text-[13.5px] leading-relaxed text-[var(--ds-body)] whitespace-pre-wrap">{profile.bio}</p>
          <h3 className="mt-4 text-[11px] font-semibold uppercase tracking-[0.14em] text-[var(--ds-muted)] mb-1.5">Filter tags</h3>
          <div className="flex flex-wrap gap-1.5">
            {profile.specialties.map((s) => (
              <span
                key={s}
                className="rounded-full border border-[var(--ds-line)] bg-white px-2.5 py-1 text-[11px] font-medium text-[var(--ds-body)]"
              >
                {s}
              </span>
            ))}
          </div>
        </div>

        <div className="mt-6 border-t border-[var(--ds-line)] pt-5">
          {confirmReject ? (
            <div className="rounded-[10px] border border-[var(--ds-red-fg)]/30 bg-[var(--ds-red-bg)] p-4">
              <div className="flex items-start gap-3">
                <AlertTriangle className="mt-0.5 size-4 shrink-0 text-[var(--ds-red-fg)]" aria-hidden />
                <div className="min-w-0">
                  <p className="text-[13px] font-semibold text-[var(--ds-ink)]">
                    Reject this consultant profile?
                  </p>
                  <p className="mt-1 text-[12.5px] leading-relaxed text-[var(--ds-body)]">
                    They'll be unable to publish until they revise the card.
                    Action is audit-logged.
                  </p>
                </div>
              </div>
              <div className="mt-3 flex gap-2">
                <button
                  type="button"
                  onClick={onReject}
                  className="inline-flex h-9 items-center gap-1.5 rounded-[8px] bg-[var(--ds-red-fg)] px-3.5 text-[12.5px] font-semibold text-white"
                >
                  <XCircle className="size-3.5" aria-hidden />
                  Confirm reject
                </button>
                <button
                  type="button"
                  onClick={() => setConfirmReject(false)}
                  className="inline-flex h-9 items-center rounded-[8px] border border-[var(--ds-line)] bg-white px-3.5 text-[12.5px] font-semibold text-[var(--ds-ink)] hover:bg-[var(--ds-surface-2)]"
                >
                  Cancel
                </button>
              </div>
            </div>
          ) : (
            <div className="flex flex-wrap items-center gap-3">
              <button
                type="button"
                onClick={onApprove}
                className="inline-flex h-10 items-center gap-2 rounded-[8px] bg-[var(--ds-ink)] px-4 text-[13px] font-semibold text-white shadow-sm transition hover:-translate-y-px hover:shadow-md"
              >
                <CheckCircle2 className="size-4" aria-hidden />
                Approve &amp; publish
              </button>
              <button
                type="button"
                onClick={() => setConfirmReject(true)}
                className="inline-flex h-10 items-center gap-2 rounded-[8px] border border-[var(--ds-line)] bg-white px-4 text-[13px] font-semibold text-[var(--ds-red-fg)] transition hover:border-[var(--ds-red-fg)] hover:bg-[var(--ds-red-bg)]"
              >
                <XCircle className="size-4" aria-hidden />
                Reject
              </button>
              <span className="ml-auto inline-flex items-center gap-1.5 text-[11px] text-[var(--ds-muted)]">
                <ShieldAlert className="size-3.5" aria-hidden />
                Decisions audit-logged
              </span>
            </div>
          )}
        </div>
      </article>

      <p className="mt-6 text-[11.5px] italic text-[var(--ds-muted)]">
        Note: This MVP surfaces only the signed-in consultant's profile. The
        full cross-tenant queue lights up once /api/admin/consultant lands.
      </p>
    </div>
  );
}
