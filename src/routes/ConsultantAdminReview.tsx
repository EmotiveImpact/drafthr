import { useCallback, useEffect, useState } from "react";
import { Navigate, useNavigate } from "react-router-dom";
import { ArrowLeft, CheckCircle2, Loader2, ShieldAlert, XCircle } from "lucide-react";
import { getAdminQueue, adminReviewProfile, type AdminProfileDTO } from "@/lib/consultantApi";
import { UnderlineTabs, type PageTab, type PillTone } from "@/components/ds";
import { ExpertsHeader } from "@/components/consultants/ExpertsHeader";
import { Pill } from "@/components/consultants/StatusBadge";
import {
  BTN_GHOST,
  BTN_OUTLINE,
  BTN_PRIMARY,
  Chip,
  ExpertAvatar,
  Row,
  RowList,
} from "@/components/consultants/ui";

const PAGE = "w-full px-4 pb-24 pt-7 sm:px-8 md:px-12";

type AdminTab = "pending" | "published" | "rejected" | "paused" | "suspended" | "all";

/** 2A tabs. "pending" is the server's pending queue; the rest filter the
 *  full list. The tab ids match AdminProfileDTO statuses where they can. */
const ADMIN_TABS: { id: AdminTab; label: string }[] = [
  { id: "pending", label: "Pending" },
  { id: "published", label: "Published" },
  { id: "rejected", label: "Rejected" },
  { id: "paused", label: "Paused" },
  { id: "suspended", label: "Suspended" },
  { id: "all", label: "All" },
];

/** The tab a profile status belongs to: the Pending tab holds the
 *  "pending_review" profiles; every other status has a tab of its own name. */
function tabOf(status: string | undefined): AdminTab | null {
  if (status === "pending_review") return "pending";
  return ADMIN_TABS.some((t) => t.id === status && t.id !== "all") ? (status as AdminTab) : null;
}

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
  // Pending reads the pending-only queue; any other tab reads every profile.
  const [tab, setTab] = useState<AdminTab>("pending");
  const showAll = tab !== "pending";
  // Until the FIRST admin-queue response resolves we don't know whether the
  // caller is an admin, so we render a neutral skeleton rather than the admin
  // header — a non-admin who deep-links here must never see the admin surface
  // paint before the 403 bounces them. (Security board PM-04, 2026-06-10.)
  const [authChecked, setAuthChecked] = useState(false);

  const load = useCallback(async (all: boolean) => {
    setProfiles(null);
    setError(null);
    const res = await getAdminQueue(all);
    if (!res.ok) {
      setAuthChecked(true);
      if (res.status === 403 || res.status === 401) {
        setForbidden(true);
      } else {
        setError(res.error);
        setProfiles([]);
      }
      return;
    }
    setAuthChecked(true);
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

  // Pre-confirmation: neutral, role-agnostic skeleton (no "Admin · Consultant
  // vetting" wording) so the admin surface doesn't reveal itself to a
  // non-admin during the round-trip that ends in a 403 redirect.
  if (!authChecked) {
    return (
      <div className="w-full px-4 pb-24 pt-8 sm:px-8 md:px-12 md:pt-[34px]" aria-busy="true">
        <div className="h-4 w-24 animate-pulse rounded bg-[var(--ds-surface-2)] motion-reduce:animate-none" />
        <div className="mt-4 h-9 w-64 animate-pulse rounded bg-[var(--ds-surface-2)] motion-reduce:animate-none" />
        <div className="mt-8 space-y-3">
          <div className="h-20 animate-pulse rounded-[14px] bg-[var(--ds-surface-2)] motion-reduce:animate-none" />
          <div className="h-20 animate-pulse rounded-[14px] bg-[var(--ds-surface-2)] motion-reduce:animate-none" />
        </div>
      </div>
    );
  }

  // The Pending tab is the server's pending queue; every other tab reads the
  // full list (status=all) and filters it here.
  const visible =
    profiles === null || tab === "pending" || tab === "all"
      ? profiles
      : profiles.filter((p) => tabOf(p.status) === tab);
  const counts = showAll && profiles
    ? Object.fromEntries(
        ADMIN_TABS.map((t) => [
          t.id,
          t.id === "all" ? profiles.length : profiles.filter((p) => tabOf(p.status) === t.id).length,
        ]),
      )
    : null;
  const tabs: PageTab[] = ADMIN_TABS.map((t) => ({
    id: t.id,
    label: t.label,
    count: counts ? counts[t.id] : t.id === "pending" && profiles ? profiles.length : undefined,
  }));

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <ExpertsHeader
        crumbs={[{ label: "Admin" }, { label: "Consultant vetting" }]}
        title={showAll ? "All consultant profiles" : "Review queue"}
        lede="Approve to publish to the public marketplace; reject to hide until the consultant revises. Actions take effect immediately and apply cross-tenant."
        actions={
          <button type="button" onClick={() => nav(-1)} className={`${BTN_GHOST} h-[38px] px-3 text-[14px]`}>
            <ArrowLeft className="size-3.5" aria-hidden />
            Back
          </button>
        }
        bottom={
          <UnderlineTabs
            tabs={tabs}
            activeTab={tab}
            onTabChange={(id) => setTab(id as AdminTab)}
            label="Profile status"
            className="-mb-px mt-[26px]"
          />
        }
      />

      <div className={PAGE}>

      {error && (
        <div
          role="alert"
          className="mb-4 rounded-[12px] bg-[var(--ds-red-bg)] px-4 py-3 text-[13px] text-[var(--ds-red-fg)]"
        >
          {error}
        </div>
      )}

      {visible === null ? (
        <div className="grid place-items-center rounded-[16px] bg-[var(--ds-surface-2)] py-16 text-[var(--ds-muted)]">
          <Loader2 className="size-5 animate-spin" aria-hidden />
          <p className="m-0 mt-2 text-[13px]">Loading queue…</p>
        </div>
      ) : visible.length === 0 ? (
        <div className="flex flex-col items-center rounded-[16px] bg-[var(--ds-surface-2)] px-6 py-14 text-center">
          <span className="mb-3 grid size-10 place-items-center rounded-full bg-[var(--ds-surface)] text-[var(--ds-muted)] shadow-[var(--ds-shadow-s)]">
            <ShieldAlert className="size-5" aria-hidden />
          </span>
          <p className="m-0 text-[14px] text-[var(--ds-body)]">
            {tab === "pending"
              ? "No profiles awaiting review."
              : tab === "all"
                ? "No consultant profiles yet."
                : `No ${ADMIN_TABS.find((t) => t.id === tab)?.label.toLowerCase()} profiles.`}
          </p>
        </div>
      ) : (
        <>
          <RowList>
            {visible.map((p) => (
              <Row key={p.id} attention={p.status === "pending_review"}>
                <div className="flex items-start gap-3.5 sm:gap-4">
                  <ExpertAvatar
                    photoUrl={p.photoUrl}
                    name={p.fullName}
                    initials={p.initials}
                    seed={p.id}
                    size={44}
                  />
                  <div className="min-w-0 flex-1">
                    <header className="flex flex-wrap items-start justify-between gap-x-4 gap-y-2">
                      <div className="min-w-0 flex-1 basis-[220px]">
                        <h2 className="m-0 truncate text-[14px] font-medium text-[var(--ds-ink)]">{p.fullName}</h2>
                        <p className="m-0 mt-0.5 truncate text-[12.5px] text-[var(--ds-muted)]">{p.role}</p>
                        <p className="m-0 mt-1 flex flex-wrap items-center gap-x-2 text-[12.5px] text-[var(--ds-muted)]">
                          {p.email && <span className="min-w-0 truncate">{p.email}</span>}
                          {p.email && <span aria-hidden className="text-[var(--ds-faint)]">·</span>}
                          <span className="ds-mono text-[var(--ds-body)]">
                            {p.currency === "GBP" ? "£" : p.currency === "USD" ? "$" : "€"}
                            {p.price} per review
                          </span>
                          <span aria-hidden className="text-[var(--ds-faint)]">·</span>
                          <span>SLA {p.sla}</span>
                        </p>
                      </div>
                      <div className="flex flex-wrap items-center gap-1.5">
                        <StatusPill status={p.status} />
                        {p.status !== "published" || showAll ? (
                          <>
                            <button
                              type="button"
                              disabled={acting === p.id || p.status === "published"}
                              onClick={() => review(p.id, "approve")}
                              className={`${BTN_PRIMARY} ml-1`}
                            >
                              {acting === p.id ? (
                                <Loader2 className="size-3.5 animate-spin" aria-hidden />
                              ) : (
                                <CheckCircle2 className="size-3.5" aria-hidden />
                              )}
                              {p.status === "published" ? "Published" : "Approve and publish"}
                            </button>
                            <button
                              type="button"
                              disabled={acting === p.id || p.status === "rejected"}
                              onClick={() => review(p.id, "reject")}
                              className={`${BTN_OUTLINE} text-[var(--ds-red-fg)] hover:border-[var(--ds-red-fg)]/40 hover:bg-[var(--ds-red-bg)]`}
                            >
                              <XCircle className="size-3.5" aria-hidden />
                              {p.status === "rejected" ? "Rejected" : "Reject"}
                            </button>
                          </>
                        ) : null}
                      </div>
                    </header>

                    {p.specialty && (
                      <p className="m-0 mt-2.5 text-[13px] font-medium text-[var(--ds-ink)]">{p.specialty}</p>
                    )}
                    <p className="m-0 mt-1 max-w-[72ch] whitespace-pre-wrap text-[13px] leading-relaxed text-[var(--ds-body)]">
                      {p.bio}
                    </p>
                    {(p.specialties?.length ?? 0) > 0 && (
                      <div className="mt-2.5 flex flex-wrap gap-1">
                        {(p.specialties ?? []).map((s) => (
                          <Chip key={s}>{s}</Chip>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              </Row>
            ))}
          </RowList>
        </>
      )}
      </div>
    </div>
  );
}

function StatusPill({ status }: { status: AdminProfileDTO["status"] }) {
  const map: Record<AdminProfileDTO["status"], { tone: PillTone; label: string }> = {
    pending_review: { tone: "amber", label: "Pending" },
    published: { tone: "green", label: "Published" },
    rejected: { tone: "red", label: "Rejected" },
    paused: { tone: "grey", label: "Paused" },
    suspended: { tone: "red", label: "Suspended" },
  };
  const s = map[status] ?? map.pending_review;
  return <Pill tone={s.tone} label={s.label} />;
}
