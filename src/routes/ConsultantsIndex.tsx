import { useState, useMemo, useEffect } from "react";
import { useSearchParams, useNavigate } from "react-router-dom";
import { FileText, Search, SearchX, Store, X } from "lucide-react";
import type { Consultant } from "@/components/consultants/types";
import { ConsultantCard } from "@/components/consultants/ConsultantCard";
import { BookingDialog } from "@/components/consultants/BookingDialog";
import { useConsultantStore, isProfileComplete } from "@/lib/consultantProfile";
import { useAuth } from "@/lib/auth";
import { PageHeader, type PageTab } from "@/components/ds";
import { BTN_OUTLINE } from "@/components/consultants/ui";
import { useDraftStore } from "@/lib/store";
import { displayTitleFor } from "@/lib/letters/display";
import { toast } from "sonner";
import type { Booking } from "@/lib/bookings";
import { listMarketplace, type MarketplaceConsultantDTO } from "@/lib/consultantApi";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

/**
 * Map the localStorage consultant profile to the marketplace's Consultant
 * shape. Only returns a value when the profile is complete enough to show
 * in search — otherwise users would see their own half-finished card
 * appearing in the public list.
 */
/**
 * Map a marketplace API DTO into the local Consultant shape used by
 * ConsultantCard. The server only ships data fields — avatar gradient
 * + a photo placeholder are filled locally.
 */
function dtoToConsultant(dto: MarketplaceConsultantDTO): Consultant {
  return {
    profileId: dto.id,
    initials: dto.initials,
    name: dto.fullName,
    role: dto.role,
    rating: dto.rating,
    reviews: dto.reviews,
    price: dto.price,
    currency: ({ GBP: "£", USD: "$", EUR: "€" } as const)[dto.currency] ?? "£",
    sla: dto.sla,
    avatarFrom: "from-amber-200",
    avatarTo: "to-amber-300",
    // No stock placeholder: the card shows the expert's initials on a
    // pastel tint when there is no photo.
    photoUrl: dto.photoUrl ?? "",
    // Unvalidated server DTO — specialties may be absent; guard the .slice
    // and the copy so a partial payload can't crash the marketplace list.
    specialty: dto.specialty || `${(dto.specialties ?? []).slice(0, 2).join(" & ")} reviews`,
    specialties: dto.specialties ?? [],
  };
}

function profileToConsultant(p: ReturnType<typeof useConsultantStore.getState>["profile"]): Consultant | null {
  if (!p || !isProfileComplete(p)) return null;
  return {
    profileId: p.id,
    initials: p.initials,
    name: p.fullName,
    role: p.role,
    rating: p.rating,
    reviews: p.reviews,
    price: p.price,
    currency: p.currency,
    sla: p.sla,
    avatarFrom: "from-amber-200",
    avatarTo: "to-amber-300",
    // Initials on a pastel tint stand in until the consultant uploads a photo.
    photoUrl: p.photoUrl || "",
    specialty: p.specialty || `${(p.specialties ?? []).slice(0, 2).join(" & ")} reviews`,
    specialties: p.specialties ?? [],
    // Only a published profile is discoverable by HR users; anything else is a
    // self-preview card that must not badge itself "Live" / "you are listed".
    pending: p.status !== "published",
  };
}

type SortKey = "rating" | "price-asc" | "price-desc" | "sla";

const SORT_OPTIONS: { value: SortKey; label: string }[] = [
  { value: "rating", label: "Rating" },
  { value: "price-asc", label: "Price, low to high" },
  { value: "price-desc", label: "Price, high to low" },
  { value: "sla", label: "Fastest turnaround" },
];

function sortConsultants(list: Consultant[], key: SortKey): Consultant[] {
  return [...list].sort((a, b) => {
    switch (key) {
      case "rating":
        return b.rating - a.rating;
      case "price-asc":
        return a.price - b.price;
      case "price-desc":
        return b.price - a.price;
      case "sla": {
        // Parse hours from sla string — parseSlaHours imported inline
        const hours = (sla: string) => {
          const range = sla.match(/^(\d+)-\d+h$/);
          if (range) return parseInt(range[1], 10);
          const single = sla.match(/^(\d+)h$/);
          return single ? parseInt(single[1], 10) : 24;
        };
        return hours(a.sla) - hours(b.sla);
      }
    }
  });
}

export function ConsultantsIndex() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [searchParams] = useSearchParams();
  const draftId = searchParams.get("draft") ?? "";
  const myProfile = useConsultantStore((s) => s.profile);

  // Booking requires a signed-in account. The marketplace browse is
  // public, but the moment someone tries to book we route them to
  // sign-in with a redirect back here, so a logged-out visitor can never
  // produce a phantom "booking confirmed" toast that goes nowhere.
  const requestBooking = (c: Consultant) => {
    if (!user) {
      navigate(`/sign-in?redirect=${encodeURIComponent("/consultants")}`);
      return;
    }
    setBookingFor(c);
  };

  const [query, setQuery] = useState("");
  const [activeTags, setActiveTags] = useState<Set<string>>(new Set());
  const [sortKey, setSortKey] = useState<SortKey>("rating");
  const [bookingFor, setBookingFor] = useState<Consultant | null>(null);
  /** Real consultants from the server (status='published'). Empty until
   *  the API responds. */
  const [serverConsultants, setServerConsultants] = useState<Consultant[]>([]);
  const [loadState, setLoadState] = useState<"loading" | "ready" | "error">("loading");

  /** The signed-in consultant's own card, included so they can see how
   *  they appear in the marketplace. Null until profile is complete. */
  const myCard = useMemo(() => profileToConsultant(myProfile), [myProfile]);

  // Pull the cross-tenant marketplace from the server on mount so HR teams see
  // every published consultant, regardless of which device they signed up on.
  // Only real, published profiles are shown — no seed/demo data.
  useEffect(() => {
    let cancelled = false;
    setLoadState("loading");
    void listMarketplace()
      .then((res) => {
        if (cancelled) return;
        if (!res.ok) {
          setLoadState("error");
          return;
        }
        setServerConsultants(res.data.consultants.map(dtoToConsultant));
        setLoadState("ready");
      })
      .catch(() => {
        if (!cancelled) setLoadState("error");
      });
    return () => {
      cancelled = true;
    };
  }, []);

  /** All real consultants: server-published profiles, plus the signed-in
   *  consultant's own card (so they can see how they appear). De-duped by
   *  profileId. No hardcoded specialists. */
  const ALL_CONSULTANTS = useMemo(() => {
    const liveById = new Map<string, Consultant>();
    serverConsultants.forEach((c) => c.profileId && liveById.set(c.profileId, c));
    if (myCard?.profileId && !liveById.has(myCard.profileId)) {
      liveById.set(myCard.profileId, myCard);
    }
    return Array.from(liveById.values());
  }, [serverConsultants, myCard]);

  /** Filter chips derived from the specialties actually present in the live
   *  marketplace (was a static list off the old seed set). */
  const ALL_TAGS = useMemo(
    () => Array.from(new Set(ALL_CONSULTANTS.flatMap((c) => c.specialties))).sort(),
    [ALL_CONSULTANTS],
  );

  const filtered = useMemo(() => {
    let list = ALL_CONSULTANTS;

    // Text search over name + role
    if (query.trim()) {
      const q = query.toLowerCase();
      list = list.filter(
        (c) =>
          c.name.toLowerCase().includes(q) ||
          c.role.toLowerCase().includes(q),
      );
    }

    // Tag filter — consultant must have ALL active tags
    if (activeTags.size > 0) {
      list = list.filter((c) =>
        [...activeTags].every((tag) => c.specialties.includes(tag)),
      );
    }

    return sortConsultants(list, sortKey);
    // ALL_CONSULTANTS must be a dep — it changes when the async
    // listMarketplace() fetch resolves; without it, server consultants
    // never appear until the user happens to type or toggle a filter.
  }, [query, activeTags, sortKey, ALL_CONSULTANTS]);

  /** Specialty pill tabs pick one specialty at a time; "All" clears it. */
  function selectTag(tag: string) {
    setActiveTags(tag === ALL_TAB ? new Set() : new Set([tag]));
  }

  function clearFilters() {
    setQuery("");
    setActiveTags(new Set());
    setSortKey("rating");
  }

  function handleBooked(booking: Booking) {
    // Match on the stable profileId when available (initials are neither
    // unique nor stable — see bookings.ts), mirroring MyBookings/bookings.ts.
    // Falling back to initials only when a profileId isn't present.
    const c = ALL_CONSULTANTS.find((x) =>
      booking.consultantProfileId && x.profileId
        ? x.profileId === booking.consultantProfileId
        : x.initials === booking.consultantInitials,
    );
    toast.success(
      `Booking confirmed. ${c?.name ?? "The specialist"} will review your letter within ${c?.sla ?? "24h"}.`,
    );
  }

  const retry = () => {
    setLoadState("loading");
    void listMarketplace()
      .then((res) => {
        if (!res.ok) return setLoadState("error");
        setServerConsultants(res.data.consultants.map(dtoToConsultant));
        setLoadState("ready");
      })
      .catch(() => setLoadState("error"));
  };

  const activeTab = activeTags.size === 1 ? [...activeTags][0] : ALL_TAB;
  const tabs: PageTab[] = [
    { id: ALL_TAB, label: "All", count: ALL_CONSULTANTS.length },
    ...ALL_TAGS.map((tag) => ({
      id: tag,
      label: tag,
      count: ALL_CONSULTANTS.filter((c) => c.specialties.includes(tag)).length,
    })),
  ];

  return (
    <div className="flex flex-col flex-1 min-h-0">
      {/* The Layout sidebar provides the brand and nav; this page renders
       * the 2A header, the toolbar and the 6B expert cards. */}
      <main className="flex-1 overflow-y-auto">
        <div className="mx-auto w-full max-w-[1120px] px-4 pb-24 pt-8 sm:px-8 sm:pt-11 lg:px-11">
          <PageHeader
            crumbs={[{ label: "Marketplace" }]}
            title="Employment-law specialists"
            lede="Get a qualified specialist on your letter. Most reviews come back within 24 hours, at a fraction of what a formal legal instruction costs."
            tabs={loadState === "ready" && ALL_TAGS.length > 0 ? tabs : undefined}
            activeTab={activeTab}
            onTabChange={selectTag}
            className="mb-6"
          />

          {draftId && <DraftBanner draftId={draftId} />}

          {/* Toolbar: result count on the left, search and sort on the right
           * (the 13B list toolbar). */}
          <div className="mb-4 flex flex-wrap items-center justify-between gap-x-4 gap-y-3">
            <p className="m-0 min-w-0 pl-0.5 text-[13px] text-[var(--ds-muted)]">
              {loadState === "ready" && ALL_CONSULTANTS.length > 0 ? (
                <>
                  <span className="ds-mono">{filtered.length}</span> of{" "}
                  <span className="ds-mono">{ALL_CONSULTANTS.length}</span> specialists
                  {myCard &&
                    (myCard.pending ? (
                      <span className="ml-1.5">· your profile is pending review</span>
                    ) : (
                      <span className="ml-1.5 text-[var(--ds-ink)]">· you are listed</span>
                    ))}
                </>
              ) : (
                <span aria-hidden>&nbsp;</span>
              )}
            </p>
            <div className="flex w-full min-w-0 items-center gap-2 sm:w-auto">
              <div className="relative min-w-0 flex-1 sm:w-[240px] sm:flex-none">
                <Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-[var(--ds-muted)]" />
                <input
                  type="text"
                  placeholder="Search by name or role"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  aria-label="Search specialists by name or role"
                  className="h-8 w-full rounded-[var(--ds-r-s)] border border-transparent bg-[var(--ds-surface-2)] pl-8 pr-8 text-[13px] text-[var(--ds-ink)] placeholder:text-[var(--ds-muted)] transition focus:border-[var(--ds-line-strong)] focus:bg-[var(--ds-surface)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ds-focus)]/25"
                />
                {query && (
                  <button
                    type="button"
                    onClick={() => setQuery("")}
                    className="absolute right-2 top-1/2 -translate-y-1/2 text-[var(--ds-muted)] hover:text-[var(--ds-ink)]"
                    aria-label="Clear search"
                  >
                    <X className="size-3.5" />
                  </button>
                )}
              </div>

              <Select value={sortKey} onValueChange={(v) => setSortKey(v as SortKey)}>
                <SelectTrigger
                  aria-label="Sort specialists"
                  className="!h-8 w-auto shrink-0 gap-1.5 rounded-[var(--ds-r-s)] border-[var(--ds-line)] bg-[var(--ds-surface)] px-2.5 text-[13px] text-[var(--ds-ink)] shadow-none"
                >
                  <span className="text-[var(--ds-muted)]">Sort</span>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent align="end">
                  {SORT_OPTIONS.map((opt) => (
                    <SelectItem key={opt.value} value={opt.value}>
                      {opt.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

              {(activeTags.size > 0 || query) && (
                <button type="button" onClick={clearFilters} className={`${BTN_OUTLINE} hidden sm:inline-flex`}>
                  Clear all
                </button>
              )}
            </div>
          </div>

          {/* Cards grid: loading / error / empty marketplace / no match / cards */}
          {loadState === "loading" ? (
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3" aria-busy>
              {Array.from({ length: 6 }).map((_, i) => (
                <div
                  key={i}
                  className="h-[300px] animate-pulse rounded-[var(--ds-r-l)] border border-[var(--ds-line)] bg-[var(--ds-surface)] p-1.5"
                >
                  <div className="h-[128px] rounded-[calc(var(--ds-r-l)-5px)] bg-[var(--ds-surface-2)]" />
                </div>
              ))}
            </div>
          ) : loadState === "error" ? (
            <EmptyPanel
              icon={<Store className="size-5" />}
              title="We couldn't load the marketplace just now."
              action={
                <button type="button" onClick={retry} className={BTN_OUTLINE}>
                  Try again
                </button>
              }
            />
          ) : ALL_CONSULTANTS.length === 0 ? (
            <EmptyPanel
              icon={<Store className="size-5" />}
              title="No specialists are listed yet."
              body="Qualified employment-law specialists will appear here as they join the marketplace. Check back soon."
            />
          ) : filtered.length > 0 ? (
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {filtered.map((c) => (
                <ConsultantCard
                  key={c.profileId ?? c.initials}
                  consultant={c}
                  onBook={() => requestBooking(c)}
                />
              ))}
            </div>
          ) : (
            <EmptyPanel
              icon={<SearchX className="size-5" />}
              title="No specialists match your filters."
              action={
                <button type="button" onClick={clearFilters} className={BTN_OUTLINE}>
                  Clear filters
                </button>
              }
            />
          )}
        </div>
      </main>

      {/* Booking dialog */}
      <BookingDialog
        consultant={bookingFor}
        draftId={draftId}
        onClose={() => setBookingFor(null)}
        onBooked={handleBooked}
      />
    </div>
  );
}

const ALL_TAB = "__all__";

/** Opened from a letter's Review or Finalise step: say which letter the
 *  booking will carry, as a 4B-style file chip. */
function DraftBanner({ draftId }: { draftId: string }) {
  const draft = useDraftStore((s) => s.drafts[draftId]);
  const title = draft ? displayTitleFor(draft) : "Your letter";
  return (
    <div className="mb-6 flex flex-wrap items-center gap-x-3 gap-y-2 rounded-[var(--ds-r-m)] bg-[var(--ds-surface-2)] px-4 py-3">
      <span className="text-[13px] text-[var(--ds-body)]">Booking a review for</span>
      <span className="inline-flex h-7 min-w-0 max-w-full items-center gap-1.5 rounded-[var(--ds-r-s)] border border-[var(--ds-line)] bg-[var(--ds-surface)] px-2.5 text-[12.5px] text-[var(--ds-ink)]">
        <FileText className="size-3.5 shrink-0 text-[var(--ds-muted)]" aria-hidden />
        <span className="truncate">{title}</span>
      </span>
      <span className="text-[12.5px] text-[var(--ds-muted)]">It is attached to your booking request.</span>
    </div>
  );
}

function EmptyPanel({
  icon,
  title,
  body,
  action,
}: {
  icon: React.ReactNode;
  title: string;
  body?: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="flex flex-col items-center rounded-[var(--ds-r-l)] bg-[var(--ds-surface-2)] px-6 py-14 text-center">
      <span className="mb-3 grid size-10 place-items-center rounded-full bg-[var(--ds-surface)] text-[var(--ds-muted)] shadow-[var(--ds-shadow-s)]">
        {icon}
      </span>
      <p className="m-0 text-[14px] font-medium text-[var(--ds-ink)]">{title}</p>
      {body && <p className="m-0 mt-1 max-w-[52ch] text-[13px] leading-relaxed text-[var(--ds-muted)]">{body}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}
