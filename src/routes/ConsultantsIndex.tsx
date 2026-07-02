import { useState, useMemo, useEffect } from "react";
import { useSearchParams, useNavigate } from "react-router-dom";
import { Search, X } from "lucide-react";
import type { Consultant } from "@/components/consultants/types";
import { ConsultantCard } from "@/components/consultants/ConsultantCard";
import { BookingDialog } from "@/components/consultants/BookingDialog";
import { useConsultantStore, isProfileComplete } from "@/lib/consultantProfile";
import { useAuth } from "@/lib/auth";
import { cn } from "@/lib/utils";
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
    photoUrl:
      dto.photoUrl ??
      "https://images.unsplash.com/photo-1573497019940-1c28c88b4f3e?w=400&q=80",
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
    photoUrl: p.photoUrl ||
      // Neutral placeholder so the card renders even before the consultant
      // uploads a photo. Same Unsplash sizing as the hardcoded set.
      "https://images.unsplash.com/photo-1573497019940-1c28c88b4f3e?w=400&q=80",
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
  { value: "price-asc", label: "Price low–high" },
  { value: "price-desc", label: "Price high–low" },
  { value: "sla", label: "SLA fastest first" },
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

  function toggleTag(tag: string) {
    setActiveTags((prev) => {
      const next = new Set(prev);
      if (next.has(tag)) next.delete(tag);
      else next.add(tag);
      return next;
    });
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
      `Booking confirmed — ${c?.name ?? "specialist"} will review your letter within ${c?.sla ?? "24h"}.`,
    );
  }

  return (
    <div className="flex flex-col flex-1 min-h-0 bg-[var(--ds-canvas)]">
      {/* Body. The page no longer renders its own header — the Layout
       * sidebar provides the brand + nav for signed-in users, and the
       * page-internal heading below carries the title. */}
      <main className="flex-1 overflow-y-auto">
        <div className="mx-auto max-w-[980px] px-4 py-8 sm:px-6 pb-24">

          {/* Hero — matches the page-title pattern used across the
           * consultant surface (eyebrow + clamp heading + lede). */}
          <div className="mb-6">
            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[var(--ds-muted)]">
              Marketplace
            </p>
            <h1 className="mt-2 text-[clamp(28px,3.4vw,40px)] font-semibold tracking-[-0.015em] text-[var(--ds-ink)] leading-[1.1]">
              Employment-law specialists
            </h1>
            <p className="text-[14px] text-[var(--ds-body)] mt-2 max-w-prose leading-relaxed">
              Get a qualified specialist on your letter. Most reviews come back
              within 24 hours, at a fraction of what a formal legal instruction
              costs.
            </p>
          </div>

          {/* Filters row */}
          <div className="flex flex-col gap-3 mb-6">
            {/* Search + sort — canonical input recipe (h-40, rounded-8,
             * ring-2 focus) so the toolbar matches every other DraftHR
             * control instead of the bespoke compact h-8 style. */}
            <div className="flex items-center gap-2">
              <div className="relative flex-1 max-w-xs">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-[var(--ds-muted)]" />
                <input
                  type="text"
                  placeholder="Search by name or role…"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  aria-label="Search specialists by name or role"
                  className="w-full h-[40px] pl-9 pr-9 rounded-[8px] border border-[var(--ds-line)] bg-white text-[14px] text-[var(--ds-ink)] placeholder:text-[var(--ds-subtle)] focus:border-[var(--ds-ink)] focus:outline-none focus:ring-2 focus:ring-[var(--ds-ink)]/10"
                />
                {query && (
                  <button
                    type="button"
                    onClick={() => setQuery("")}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[var(--ds-muted)] hover:text-[var(--ds-ink)]"
                    aria-label="Clear search"
                  >
                    <X className="size-3.5" />
                  </button>
                )}
              </div>

              <Select
                value={sortKey}
                onValueChange={(v) => setSortKey(v as SortKey)}
              >
                <SelectTrigger className="h-[40px] w-[170px] rounded-[8px] border-[var(--ds-line)] bg-white text-[14px] text-[var(--ds-ink)]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {SORT_OPTIONS.map((opt) => (
                    <SelectItem key={opt.value} value={opt.value}>
                      {opt.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Tag chips */}
            <div className="flex flex-wrap gap-1.5">
              {ALL_TAGS.map((tag) => (
                <button
                  key={tag}
                  type="button"
                  onClick={() => toggleTag(tag)}
                  className={cn(
                    "text-[11px] font-semibold px-2.5 py-1 rounded-full border transition",
                    activeTags.has(tag)
                      ? "bg-[var(--ds-ink)] text-white border-[var(--ds-ink)]"
                      : "bg-[var(--ds-surface)] text-[var(--ds-muted)] border-[var(--ds-line)] hover:border-[var(--ds-ink)] hover:text-[var(--ds-ink)]",
                  )}
                >
                  {tag}
                </button>
              ))}
              {(activeTags.size > 0 || query) && (
                <button
                  type="button"
                  onClick={clearFilters}
                  className="text-[11px] font-semibold px-2.5 py-1 rounded-full border border-dashed border-[var(--ds-line)] text-[var(--ds-muted)] hover:text-[var(--ds-ink)] transition"
                >
                  Clear all
                </button>
              )}
            </div>
          </div>

          {/* Results count */}
          {loadState === "ready" && ALL_CONSULTANTS.length > 0 && (
            <div className="mb-3 flex flex-wrap items-baseline justify-between gap-3">
              <p className="text-[11.5px] text-[var(--ds-muted)]">
                {filtered.length} of {ALL_CONSULTANTS.length} specialists
                {myCard &&
                  (myCard.pending ? (
                    <span className="ml-1.5 text-[var(--ds-muted)]">· your profile is pending review</span>
                  ) : (
                    <span className="ml-1.5 text-[var(--ds-ink)]">· you are listed</span>
                  ))}
              </p>
            </div>
          )}

          {/* Cards grid — loading / error / empty-marketplace / no-match / cards */}
          {loadState === "loading" ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4" aria-busy>
              {Array.from({ length: 6 }).map((_, i) => (
                <div
                  key={i}
                  className="h-[220px] rounded-[10px] border border-[var(--ds-line)] bg-[var(--ds-surface-2)]/50 animate-pulse"
                />
              ))}
            </div>
          ) : loadState === "error" ? (
            <div className="rounded-[10px] border border-dashed border-[var(--ds-line)] px-5 py-12 text-center">
              <p className="text-[13.5px] text-[var(--ds-body)]">
                We couldn't load the marketplace just now.
              </p>
              <button
                type="button"
                onClick={() => {
                  setLoadState("loading");
                  void listMarketplace()
                    .then((res) => {
                      if (!res.ok) return setLoadState("error");
                      setServerConsultants(res.data.consultants.map(dtoToConsultant));
                      setLoadState("ready");
                    })
                    .catch(() => setLoadState("error"));
                }}
                className="mt-2 text-[12.5px] font-semibold text-[var(--ds-ink)] underline"
              >
                Try again
              </button>
            </div>
          ) : ALL_CONSULTANTS.length === 0 ? (
            <div className="rounded-[10px] border border-dashed border-[var(--ds-line)] px-5 py-12 text-center">
              <p className="text-[13.5px] font-medium text-[var(--ds-ink)]">
                No specialists are listed yet.
              </p>
              <p className="mt-1 text-[12.5px] text-[var(--ds-body)]">
                Qualified employment-law specialists will appear here as they join the
                marketplace. Check back soon.
              </p>
            </div>
          ) : filtered.length > 0 ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {filtered.map((c) => (
                <ConsultantCard
                  key={c.profileId ?? c.initials}
                  consultant={c}
                  onBook={() => requestBooking(c)}
                />
              ))}
            </div>
          ) : (
            <div className="rounded-[10px] border border-dashed border-[var(--ds-line)] px-5 py-12 text-center">
              <p className="text-[13.5px] text-[var(--ds-body)]">
                No specialists match your filters.
              </p>
              <button
                type="button"
                onClick={clearFilters}
                className="mt-2 text-[12.5px] font-semibold text-[var(--ds-ink)] underline"
              >
                Clear filters →
              </button>
            </div>
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
