import { useCallback, useEffect, useState } from "react";
import { Navigate, useNavigate } from "react-router-dom";
import { ArrowLeft, CheckCircle2, Loader2, ShieldAlert, XCircle } from "lucide-react";
import { getAdminQueue, adminReviewProfile, type AdminProfileDTO } from "@/lib/consultantApi";

/**
 * /admin/consultants — consultant vetting queue.
 *
 * REAL server-backed admin surface. Lists every pending_review consultant
 * profile across all tenants (GET /api/marketplace/admin-queue) and lets
 * an admin approve (publish) or reject each.
 *
 * Access control is enforced SERVER-SIDE: every admin endpoint checks the
 * caller's email against the server-only DRAFTHR_ADMIN_EMAILS allowlist.
 * The client simply renders whatever the server returns and treats a 403
 * as "not an admin" → redirect home. There is no client-side secret here;
 * a non-admin who loads this route just gets a 403 from the API and is
 * bounced.
 */
export function ConsultantAdminReview() {
  const nav = useNavigate();
  const [profiles, setProfiles] = useState<AdminProfileDTO[] | null>(null);
  const [forbidden, setForbidden] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [acting, setActing] = useState<string | null>(null);
  const [showAll, setShowAll] = useState(false);

  const load = useCallback(async (all: boolean) => {
    setProfiles(null);
    setError(null);
    const res = await getAdminQueue(all);
    if (!res.ok) {
      if (res.status === 403 || res.status === 401) {
        setForbidden(true);
      } else {
        setError(res.error);
        setProfiles([]);
      }
      return;
    }
    setProfiles(res.data.profiles);
  }, []);

  useEffect(() => {
    void load(showAll);
  }, [load, showAll]);

  const review = async (id: string, action: "approve" | "reject") => {
    setActing(id);
    const res = await adminReviewProfile(id, action);
    setActing(null);
    if (!res.ok) {
      setError(res.error);
      return;
    }
    // Optimistic: drop the row from the pending view (or update its status
    // in the all view) without a full refetch.
    setProfiles((prev) =>
      prev
        ? showAll
          ? prev.map((p) => (p.id === id ? { ...p, status: res.data.status as AdminProfileDTO["status"] } : p))
          : prev.filter((p) => p.id !== id)
        : prev,
    );
  };

  if (forbidden) return <Navigate to="/" replace />;

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
          Admin · Consultant vetting
        </p>
        <div className="mt-2 flex flex-wrap items-end justify-between gap-3">
          <h1 className="text-[clamp(28px,3.4vw,40px)] font-semibold tracking-[-0.015em] text-[var(--ds-ink)]">
            {showAll ? "All consultant profiles" : "Review queue"}
          </h1>
          <button
            type="button"
            onClick={() => setShowAll((v) => !v)}
            className="inline-flex h-9 items-center rounded-[8px] border border-[var(--ds-line)] bg-white px-3.5 text-[12.5px] font-semibold text-[var(--ds-ink)] transition hover:border-[var(--ds-subtle)] hover:bg-[var(--ds-surface-2)]"
          >
            {showAll ? "Show pending only" : "Show all profiles"}
          </button>
        </div>
        <p className="mt-2 max-w-[60ch] text-[14px] leading-relaxed text-[var(--ds-body)]">
          Approve to publish to the public marketplace; reject to hide until
          the consultant revises. Actions take effect immediately and apply
          cross-tenant.
        </p>
      </header>

      {error && (
        <div
          role="alert"
          className="mb-4 rounded-[8px] border border-[var(--ds-red-fg)]/30 bg-[var(--ds-red-bg)] px-4 py-3 text-[13px] text-[var(--ds-red-fg)]"
        >
          {error}
        </div>
      )}

      {profiles === null ? (
        <div className="grid place-items-center rounded-[14px] border border-[var(--ds-line)] py-16 text-[var(--ds-muted)]">
          <Loader2 className="size-5 animate-spin" aria-hidden />
          <p className="mt-2 text-[13px]">Loading queue…</p>
        </div>
      ) : profiles.length === 0 ? (
        <div className="rounded-[14px] border border-dashed border-[var(--ds-line)] p-10 text-center">
          <ShieldAlert className="mx-auto size-6 text-[var(--ds-muted)]" aria-hidden />
          <p className="mt-2 text-[14px] text-[var(--ds-body)]">
            {showAll ? "No consultant profiles yet." : "No profiles awaiting review."}
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {profiles.map((p) => (
            <article
              key={p.id}
              className="rounded-[14px] border border-[var(--ds-line)] bg-[var(--ds-surface)] p-5"
            >
              <div className="flex items-start gap-4">
                {p.photoUrl ? (
                  <img
                    src={p.photoUrl}
                    alt=""
                    className="size-14 shrink-0 rounded-full object-cover border border-[var(--ds-line)]"
                  />
                ) : (
                  <div className="grid size-14 shrink-0 place-items-center rounded-full bg-[var(--ds-surface-2)] border border-[var(--ds-line)] text-[16px] font-semibold text-[var(--ds-muted)]">
                    {p.initials}
                  </div>
                )}
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <h2 className="text-[16px] font-semibold text-[var(--ds-ink)]">{p.fullName}</h2>
                    <StatusPill status={p.status} />
                  </div>
                  <p className="text-[12.5px] text-[var(--ds-muted)]">{p.role}</p>
                  {p.email && (
                    <p className="mt-0.5 text-[11.5px] text-[var(--ds-muted)]">{p.email}</p>
                  )}
                  <p className="mt-1 text-[12px] text-[var(--ds-muted)]">
                    {p.currency === "GBP" ? "£" : p.currency === "USD" ? "$" : "€"}
                    {p.price}/hr · SLA {p.sla}
                  </p>
                  {p.specialty && (
                    <p className="mt-2 text-[13px] italic text-[var(--ds-body)]">"{p.specialty}"</p>
                  )}
                  <p className="mt-2 whitespace-pre-wrap text-[13px] leading-relaxed text-[var(--ds-body)]">
                    {p.bio}
                  </p>
                  {p.specialties.length > 0 && (
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      {p.specialties.map((s) => (
                        <span
                          key={s}
                          className="rounded-full border border-[var(--ds-line)] bg-white px-2.5 py-1 text-[11px] font-medium text-[var(--ds-body)]"
                        >
                          {s}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              {p.status !== "published" || showAll ? (
                <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-[var(--ds-line)] pt-4">
                  <button
                    type="button"
                    disabled={acting === p.id || p.status === "published"}
                    onClick={() => review(p.id, "approve")}
                    className="inline-flex h-9 items-center gap-1.5 rounded-[8px] bg-[var(--ds-ink)] px-3.5 text-[12.5px] font-semibold text-white transition hover:-translate-y-px hover:shadow-md disabled:opacity-50 disabled:hover:translate-y-0"
                  >
                    {acting === p.id ? (
                      <Loader2 className="size-3.5 animate-spin" aria-hidden />
                    ) : (
                      <CheckCircle2 className="size-3.5" aria-hidden />
                    )}
                    {p.status === "published" ? "Published" : "Approve & publish"}
                  </button>
                  <button
                    type="button"
                    disabled={acting === p.id || p.status === "rejected"}
                    onClick={() => review(p.id, "reject")}
                    className="inline-flex h-9 items-center gap-1.5 rounded-[8px] border border-[var(--ds-line)] bg-white px-3.5 text-[12.5px] font-semibold text-[var(--ds-red-fg)] transition hover:border-[var(--ds-red-fg)] hover:bg-[var(--ds-red-bg)] disabled:opacity-50"
                  >
                    <XCircle className="size-3.5" aria-hidden />
                    {p.status === "rejected" ? "Rejected" : "Reject"}
                  </button>
                </div>
              ) : null}
            </article>
          ))}
        </div>
      )}
    </div>
  );
}

function StatusPill({ status }: { status: AdminProfileDTO["status"] }) {
  const map: Record<AdminProfileDTO["status"], { bg: string; fg: string; label: string }> = {
    pending_review: { bg: "bg-[var(--ds-amber-bg)]", fg: "text-[var(--ds-amber-fg)]", label: "Pending" },
    published: { bg: "bg-[var(--ds-green-bg)]", fg: "text-[var(--ds-green-fg)]", label: "Published" },
    rejected: { bg: "bg-[var(--ds-red-bg)]", fg: "text-[var(--ds-red-fg)]", label: "Rejected" },
    paused: { bg: "bg-[var(--ds-surface-2)]", fg: "text-[var(--ds-muted)]", label: "Paused" },
    suspended: { bg: "bg-[var(--ds-red-bg)]", fg: "text-[var(--ds-red-fg)]", label: "Suspended" },
  };
  const s = map[status] ?? map.pending_review;
  return (
    <span
      className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10.5px] font-semibold uppercase tracking-[0.06em] ${s.bg} ${s.fg}`}
    >
      {s.label}
    </span>
  );
}
