import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { ArrowLeft, ArrowUpDown, Check, ChevronDown, Eye, FileText, Info, Plus, SearchX, Store } from "lucide-react";
import { toast } from "sonner";
import type { Consultant } from "@/components/consultants/types";
import { ConsultantCard } from "@/components/consultants/ConsultantCard";
import { BookingSheet } from "@/components/consultants/BookingSheet";
import { ProfileSheet } from "@/components/consultants/ProfileSheet";
import { LetterPicker } from "@/components/consultants/LetterPicker";
import { ExpertSearch, ExpertsHeader, HowItWorks, useWorkspaceName } from "@/components/consultants/ExpertsHeader";
import { useLetterFacts } from "@/components/consultants/letters";
import { BTN_OUTLINE, EmptyPanel } from "@/components/consultants/ui";
import {
  NO_FILTERS,
  PRICE_OPTIONS,
  REVIEWER_OPTIONS,
  SORT_LABELS,
  TURN_OPTIONS,
  applyFilters,
  dayAndTime,
  describeBrowse,
  describeForLetter,
  dtoToConsultant,
  filtersActive,
  listingSpecialties,
  parseDue,
  profileToConsultant,
  shortDay,
  sortExperts,
  specialtiesForLetter,
  type Filters,
  type PriceBand,
  type ReviewerKind,
  type SortKey,
  type TurnBand,
} from "@/components/consultants/market";
import { awaitingPayment } from "@/components/consultants/payments";
import { useConsultantStore, isProfileComplete } from "@/lib/consultantProfile";
import { AUTH_ENABLED, useAuth } from "@/lib/auth";
import { useProfileStore } from "@/lib/profile";
import { canSubmitForReview } from "@/lib/permissions";
import { useDraftStore } from "@/lib/store";
import { useBookingsStore } from "@/lib/bookings";
import { pullMyBookings } from "@/lib/marketplaceSync";
import { getStripeConnectStatus, listMarketplace } from "@/lib/consultantApi";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";

const VISIBLE_SPECIALTIES = 7;
const VIEWER_REASON = "Viewers can't send letters for review";
const CONSULTANT_REASON = "Switch to HR mode to book a review";

/**
 * /consultants — the Experts marketplace (designs `experts`, `mk-market`,
 * `mk-profile`, `mk-book`). One page, two ways in:
 *
 *   browse        the sidebar's Experts page: band with the Find an expert and
 *                 My bookings tabs, the "Booking a review for" strip (the
 *                 letter in context, from ?draft= or chosen here), filters by
 *                 specialty, price and turnaround, cards with Book review,
 *                 and the booking sheet.
 *   for a letter  /consultants?for=<draftId>&due=<ISO>: the review dialog's
 *                 "See all" and "Open the marketplace". Lilac strip naming the
 *                 letter and deadline, Back to the letter, filters with Back by
 *                 and Reviewer, Best match first, cards with Profile and
 *                 Choose, the profile sheet; Choose hands back to the letter.
 *
 * Only real, published experts are listed. A consultant sees the same page to
 * check how they are listed, with their own card, and cannot book.
 */
export function ConsultantsIndex() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [params, setParams] = useSearchParams();
  const workspace = useWorkspaceName();

  /* ─── Who is looking ─────────────────────────────────────────── */
  const profileRole = useProfileStore((s) => s.profile.role);
  const workspaceRole = useProfileStore((s) => s.profile.workspaceRole);
  const consultantEnrolled = useConsultantStore((s) => s.enrolled);
  const myProfile = useConsultantStore((s) => s.profile);
  const isConsultant = (profileRole ?? (consultantEnrolled ? "consultant" : null)) === "consultant";
  const viewerOnly = !isConsultant && !canSubmitForReview(workspaceRole);
  const actionBlocked = isConsultant ? CONSULTANT_REASON : viewerOnly ? VIEWER_REASON : undefined;

  /* ─── Which letter ───────────────────────────────────────────── */
  const forId = params.get("for");
  const forDraft = useDraftStore((s) => (forId ? s.drafts[forId] : undefined));
  const letterMode = !!forId && !!forDraft && !isConsultant;
  const unknownLetter = !!forId && !forDraft;
  const dueMs = letterMode ? parseDue(params.get("due")) : null;
  const forFacts = useLetterFacts(letterMode ? forId : null);
  const contextId = !isConsultant ? params.get("draft") ?? "" : "";
  const contextDraft = useDraftStore((s) => (contextId ? s.drafts[contextId] : undefined));
  const contextFacts = useLetterFacts(contextDraft ? contextId : null);
  // The letter the booking sheet opens with: the one in the strip.
  const bookingDraftId = contextDraft ? contextId : "";

  const setContextLetter = (id: string) => {
    const next = new URLSearchParams(params);
    if (id) next.set("draft", id);
    else next.delete("draft");
    setParams(next, { replace: true });
  };

  /* ─── The listing ────────────────────────────────────────────── */
  const [serverConsultants, setServerConsultants] = useState<Consultant[]>([]);
  const [loadState, setLoadState] = useState<"loading" | "ready" | "error">("loading");
  const load = useCallback(async () => {
    setLoadState("loading");
    try {
      const res = await listMarketplace({ limit: 100 });
      if (!res.ok) {
        setLoadState("error");
        return;
      }
      setServerConsultants((res.data.consultants ?? []).map(dtoToConsultant));
      setLoadState("ready");
    } catch {
      setLoadState("error");
    }
  }, []);
  useEffect(() => {
    void load();
  }, [load]);

  /** The consultant's own complete card, so they can see how they appear. */
  const myCard = useMemo(
    () => (isConsultant ? profileToConsultant(myProfile, isProfileComplete(myProfile)) : null),
    [isConsultant, myProfile],
  );
  const all = useMemo(() => {
    const byId = new Map<string, Consultant>();
    serverConsultants.forEach((c) => byId.set(c.profileId ?? c.name, c));
    if (myCard?.profileId && !byId.has(myCard.profileId)) byId.set(myCard.profileId, myCard);
    return Array.from(byId.values());
  }, [serverConsultants, myCard]);
  const tags = useMemo(() => listingSpecialties(all), [all]);

  /* ─── Bookings: the "to pay" badge and "Worked with you before" ── */
  const bookings = useBookingsStore((s) => s.bookings);
  const [paymentsOn, setPaymentsOn] = useState(false);
  useEffect(() => {
    if (isConsultant) return;
    let cancelled = false;
    void pullMyBookings().catch(() => {});
    void getStripeConnectStatus().then((r) => {
      if (!cancelled && r.ok) setPaymentsOn(r.data.configured);
    });
    return () => {
      cancelled = true;
    };
  }, [isConsultant]);
  const toPay = paymentsOn ? bookings.filter(awaitingPayment).length : 0;
  const bookedBefore = useMemo(
    () => new Set(bookings.map((b) => b.consultantProfileId).filter((x): x is string => !!x)),
    [bookings],
  );

  /* ─── Filters ────────────────────────────────────────────────── */
  const arrival = useMemo(() => {
    if (!letterMode) return [] as string[];
    const wanted = specialtiesForLetter(forDraft).map((s) => s.toLowerCase());
    return tags.filter((t) => wanted.includes(t.toLowerCase()));
  }, [letterMode, forDraft, tags]);
  const [chosenSpecialties, setChosenSpecialties] = useState<string[] | null>(null);
  const [query, setQuery] = useState("");
  const [price, setPrice] = useState<PriceBand>("any");
  const [turnaround, setTurnaround] = useState<TurnBand>("any");
  const [backBy, setBackBy] = useState(false);
  const [reviewer, setReviewer] = useState<ReviewerKind>("any");
  const defaultSort: SortKey = letterMode ? "best" : "rating";
  const [sortChoice, setSortChoice] = useState<SortKey | null>(null);
  const sort = sortChoice ?? defaultSort;
  const [moreOpen, setMoreOpen] = useState(false);

  // A new letter (or leaving letter mode) starts from its own defaults.
  useEffect(() => {
    setChosenSpecialties(null);
    setSortChoice(null);
    setBackBy(false);
    setReviewer("any");
  }, [forId, letterMode]);

  const specialties = chosenSpecialties ?? arrival;
  const filters: Filters = {
    ...NO_FILTERS,
    query,
    specialties,
    price,
    turnaround: letterMode ? "any" : turnaround,
    backBy: letterMode && dueMs != null && backBy,
    reviewer: letterMode ? reviewer : "any",
  };
  const wanted = letterMode ? specialtiesForLetter(forDraft) : [];
  const shown = sortExperts(applyFilters(all, filters, { dueMs, bookedBefore }), sort, wanted);
  const dirty =
    filtersActive(filters) && (!letterMode || chosenSpecialties !== null || query !== "" || price !== "any" || backBy || reviewer !== "any");
  const sortDirty = sortChoice !== null && sortChoice !== defaultSort;

  const toggleSpecialty = (t: string) => {
    const cur = specialties;
    const has = cur.some((x) => x.toLowerCase() === t.toLowerCase());
    setChosenSpecialties(has ? cur.filter((x) => x.toLowerCase() !== t.toLowerCase()) : [...cur, t]);
  };
  const clearAll = () => {
    setQuery("");
    setChosenSpecialties([]);
    setPrice("any");
    setTurnaround("any");
    setBackBy(false);
    setReviewer("any");
    setSortChoice(null);
  };

  /* ─── Sheets ─────────────────────────────────────────────────── */
  const [bookingFor, setBookingFor] = useState<Consultant | null>(null);
  const [profileFor, setProfileFor] = useState<Consultant | null>(null);
  const [pickingLetter, setPickingLetter] = useState(false);

  // Booking requires a signed-in account: with auth on and no session, go to
  // sign-in and come back here, never a phantom booking.
  const requestBooking = (c: Consultant) => {
    if (actionBlocked) return;
    if (AUTH_ENABLED && !user) {
      navigate(`/sign-in?redirect=${encodeURIComponent("/consultants")}`);
      return;
    }
    setBookingFor(c);
  };
  const choose = (c: Consultant) => {
    if (actionBlocked || !forId || !c.profileId) return;
    setProfileFor(null);
    navigate(`/editor/${encodeURIComponent(forId)}?review=expert&expert=${encodeURIComponent(c.profileId)}`);
  };

  /* ─── Render ─────────────────────────────────────────────────── */
  const letterTitle = forFacts?.title ?? "";
  const crumbs = letterMode
    ? [{ label: "Letters", href: "/letters" }, { label: letterTitle, href: `/editor/${forId}` }, { label: "Choose an expert" }]
    : [{ label: workspace, href: isConsultant ? "/c" : "/hr" }, { label: "Experts" }];

  const countLine =
    loadState === "ready" && all.length > 0 ? (
      <p className="m-0 min-w-0 text-[13.5px] text-[var(--ds-muted)]" aria-live="polite">
        <b className="font-medium text-[var(--ds-ink)]">
          {shown.length} expert{shown.length === 1 ? "" : "s"}
        </b>
        {(() => {
          const words = letterMode ? describeForLetter(filters, shown.length, sort, dueMs) : describeBrowse(filters);
          return words ? ` ${words}` : "";
        })()}
        {myCard && (myCard.pending ? " · your profile is pending review" : " · you are listed")}
      </p>
    ) : (
      <span aria-hidden className="block h-5" />
    );

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <main className="min-w-0 flex-1 overflow-y-auto">
        <ExpertsHeader
          crumbs={crumbs}
          title={letterMode ? "Choose an expert" : "Experts"}
          lede={
            letterMode
              ? "Pick who reviews this letter. They suggest changes and you decide what to keep."
              : "Book a qualified employment law specialist to check a letter before it goes out."
          }
          actions={
            <>
              <ExpertSearch value={query} onChange={setQuery} />
              <HowItWorks />
            </>
          }
          tab={letterMode || isConsultant ? undefined : "find"}
          toPay={toPay}
        />

        <div className="@container px-4 pb-16 pt-[22px] sm:px-8 md:px-12">
          {/* Context: the letter this is for */}
          {letterMode ? (
            <div className="flex flex-col gap-2.5 rounded-[12px] bg-[var(--ds-lilac-bg)] py-2.5 pl-3.5 pr-3 text-[13.5px] text-[var(--ds-lilac-ink)] sm:flex-row sm:items-center sm:gap-3">
              <div className="flex min-w-0 flex-1 items-start gap-3">
                <Eye className="mt-[3px] size-4 shrink-0 text-[var(--ds-lilac-fg)]" aria-hidden />
                <p className="m-0 min-w-0">
                  <b className="font-medium">Choosing a reviewer for {letterTitle}.</b>
                  {dueMs != null && <> Needs to be back by {dayAndTime(dueMs)}.</>}
                </p>
              </div>
              <button
                type="button"
                onClick={() => navigate(`/editor/${encodeURIComponent(forId!)}`)}
                className="inline-flex h-[30px] shrink-0 items-center justify-center gap-1.5 self-end rounded-[8px] bg-[var(--ds-surface)] px-[11px] text-[13px] font-medium text-[var(--ds-ink)] transition-colors duration-[120ms] hover:bg-[var(--ds-hover)] active:bg-[var(--ds-surface-2)] focus-visible:outline-none focus-visible:shadow-[var(--ds-focus-ring)] sm:self-auto"
              >
                <ArrowLeft className="size-3.5" aria-hidden />
                Back to the letter
              </button>
            </div>
          ) : !isConsultant ? (
            <>
              {unknownLetter && (
                <p className="m-0 mb-2.5 flex items-center gap-2 text-[13px] text-[var(--ds-muted)]">
                  <Info className="size-3.5 shrink-0" aria-hidden />
                  We couldn't find that letter. You can still browse experts and book one for any letter.
                </p>
              )}
              <div className="flex flex-col gap-2.5 rounded-[12px] border border-[var(--ds-line)] bg-[var(--ds-surface)] py-2.5 pl-3.5 pr-3 sm:flex-row sm:items-center sm:gap-3">
                <div className="flex min-w-0 flex-1 flex-wrap items-center gap-x-3 gap-y-2">
                  <span className="text-[13px] text-[var(--ds-muted)]">Booking a review for</span>
                  {contextFacts ? (
                    <span className="inline-flex min-w-0 max-w-full items-center gap-2 rounded-[8px] bg-[var(--ds-surface-2)] px-2.5 py-[5px] text-[13px] font-medium text-[var(--ds-ink)]">
                      <FileText className="size-3.5 shrink-0 text-[var(--ds-muted)]" aria-hidden />
                      <span className="truncate">{contextFacts.title}</span>
                      <span className="shrink-0 text-[12px] font-normal text-[var(--ds-subtle)]">{contextFacts.status}</span>
                    </span>
                  ) : (
                    <span className="text-[13px] text-[var(--ds-subtle)]">No letter chosen yet</span>
                  )}
                </div>
                <button
                  type="button"
                  onClick={() => setPickingLetter(true)}
                  className={cn(BTN_OUTLINE, "h-[30px] self-start rounded-[7px] px-2.5 sm:self-auto")}
                >
                  {contextFacts ? "Change letter" : "Choose a letter"}
                </button>
              </div>
            </>
          ) : null}

          {/* A note when you can browse but not book */}
          {actionBlocked && (
            <p className="m-0 mt-3 flex items-center gap-2 text-[13px] text-[var(--ds-muted)]">
              <Info className="size-3.5 shrink-0" aria-hidden />
              {isConsultant
                ? "You're seeing the marketplace as HR teams do. Switch to HR mode to book a review."
                : "You're a viewer in this workspace, so you can browse experts but can't send a letter for review."}
            </p>
          )}

          {/* Filters */}
          {loadState === "ready" && all.length > 0 && (
            <div className={cn("flex flex-col gap-2.5", letterMode || !isConsultant ? "mt-[18px]" : "mt-1")}>
              <FilterRow label="Specialty">
                <FilterPill on={specialties.length === 0} onClick={() => setChosenSpecialties([])}>
                  All
                </FilterPill>
                {(() => {
                  const visible = moreOpen ? tags : tags.slice(0, VISIBLE_SPECIALTIES);
                  const extra = moreOpen
                    ? []
                    : tags.slice(VISIBLE_SPECIALTIES).filter((t) => specialties.some((s) => s.toLowerCase() === t.toLowerCase()));
                  const hidden = tags.length - visible.length - extra.length;
                  return (
                    <>
                      {[...visible, ...extra].map((t) => (
                        <FilterPill
                          key={t}
                          on={specialties.some((s) => s.toLowerCase() === t.toLowerCase())}
                          onClick={() => toggleSpecialty(t)}
                        >
                          {t}
                        </FilterPill>
                      ))}
                      {hidden > 0 && (
                        <button
                          type="button"
                          onClick={() => setMoreOpen(true)}
                          aria-expanded={false}
                          data-testid="specialty-more"
                          className={cn(PILL, "text-[var(--ds-muted)] hover:bg-[var(--ds-hover)] active:bg-[var(--ds-surface-2)]")}
                        >
                          <Plus className="size-[13px]" aria-hidden />
                          {hidden} more
                        </button>
                      )}
                      {moreOpen && tags.length > VISIBLE_SPECIALTIES && (
                        <button
                          type="button"
                          onClick={() => setMoreOpen(false)}
                          aria-expanded
                          className={cn(PILL, "text-[var(--ds-muted)] hover:bg-[var(--ds-hover)] active:bg-[var(--ds-surface-2)]")}
                        >
                          Show fewer
                        </button>
                      )}
                    </>
                  );
                })()}
              </FilterRow>
              <div className="flex flex-col gap-2.5 xl:flex-row xl:items-center xl:gap-[22px]">
                <FilterRow label="Price">
                  {PRICE_OPTIONS.map((o) => (
                    <FilterPill key={o.id} on={price === o.id} onClick={() => setPrice(o.id)}>
                      {o.label}
                    </FilterPill>
                  ))}
                </FilterRow>
                {letterMode ? (
                  <FilterRow label="Back by" narrow>
                    <FilterPill on={!backBy || dueMs == null} onClick={() => setBackBy(false)}>
                      Any
                    </FilterPill>
                    {dueMs != null && (
                      <FilterPill on={backBy} onClick={() => setBackBy(true)}>
                        {shortDay(dueMs)}
                      </FilterPill>
                    )}
                  </FilterRow>
                ) : (
                  <FilterRow label="Turnaround" narrow>
                    {TURN_OPTIONS.map((o) => (
                      <FilterPill key={o.id} on={turnaround === o.id} onClick={() => setTurnaround(o.id)}>
                        {o.label}
                      </FilterPill>
                    ))}
                  </FilterRow>
                )}
              </div>
              {letterMode && (
                <FilterRow label="Reviewer">
                  {REVIEWER_OPTIONS.map((o) => (
                    <FilterPill key={o.id} on={reviewer === o.id} onClick={() => setReviewer(o.id)}>
                      {o.label}
                    </FilterPill>
                  ))}
                </FilterRow>
              )}
            </div>
          )}

          {/* Results line and sort */}
          <div className="mb-3 mt-6 flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
            {countLine}
            {loadState === "ready" && all.length > 0 && (
              <div className="flex items-center gap-3">
                {(dirty || sortDirty) && (
                  <button type="button" onClick={clearAll} className={cn(BTN_OUTLINE, "h-[30px] rounded-[7px] px-2.5")}>
                    Clear all
                  </button>
                )}
                <SortMenu value={sort} onChange={setSortChoice} withBest={letterMode} />
              </div>
            )}
          </div>

          {/* Grid: loading / error / empty marketplace / no match / cards */}
          {loadState === "loading" ? (
            <div className={GRID} aria-busy="true" aria-label="Loading experts">
              {Array.from({ length: 6 }).map((_, i) => (
                <CardSkeleton key={i} />
              ))}
            </div>
          ) : loadState === "error" ? (
            <EmptyPanel
              icon={<Store />}
              title="We couldn't load the marketplace just now."
              action={
                <button type="button" onClick={() => void load()} className={BTN_OUTLINE}>
                  Try again
                </button>
              }
            />
          ) : all.length === 0 ? (
            <EmptyPanel
              icon={<Store />}
              title="No experts are listed yet."
              body="Qualified employment law specialists will appear here as they join the marketplace. Check back soon."
            />
          ) : shown.length === 0 ? (
            <EmptyPanel
              icon={<SearchX />}
              title="No experts match your filters."
              action={
                <button type="button" onClick={clearAll} className={BTN_OUTLINE}>
                  Clear filters
                </button>
              }
            />
          ) : (
            <div className={cn(GRID, "animate-[ds-fade-in_240ms_ease-out] motion-reduce:animate-none")}>
              {shown.map((c) => (
                <ConsultantCard
                  key={c.profileId ?? c.name}
                  consultant={c}
                  mode={letterMode ? "choose" : "book"}
                  dueMs={dueMs}
                  picked={!!profileFor && profileFor.profileId === c.profileId}
                  disabledReason={
                    actionBlocked ?? (letterMode && !c.profileId ? "This expert can't be chosen yet" : undefined)
                  }
                  onBook={() => requestBooking(c)}
                  onProfile={() => setProfileFor(c)}
                  onChoose={() => choose(c)}
                />
              ))}
            </div>
          )}
        </div>
      </main>

      {!letterMode && !isConsultant && (
        <BookingSheet
          consultant={bookingFor}
          draftId={bookingDraftId}
          onDraftChange={setContextLetter}
          onClose={() => setBookingFor(null)}
          onBooked={(_res, c) =>
            toast.success(`Booking request sent to ${c.name}.`, {
              description: "You'll pay once they accept. It's in My bookings.",
            })
          }
        />
      )}
      {letterMode && (
        <ProfileSheet
          consultant={profileFor}
          dueMs={dueMs}
          onClose={() => setProfileFor(null)}
          onChoose={choose}
          chooseDisabledReason={actionBlocked}
        />
      )}
      {!letterMode && !isConsultant && (
        <LetterPicker
          open={pickingLetter}
          onOpenChange={setPickingLetter}
          selectedId={bookingDraftId}
          onPick={(l) => setContextLetter(l.id)}
        />
      )}
    </div>
  );
}

const GRID = "grid grid-cols-1 gap-4 @[600px]:grid-cols-2 @[1000px]:grid-cols-3 @[1560px]:grid-cols-4";

const PILL =
  "inline-flex h-8 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full border border-[var(--ds-line)] bg-[var(--ds-surface)] px-3 text-[13px] text-[var(--ds-body)] transition-colors duration-[120ms] focus-visible:outline-none focus-visible:shadow-[var(--ds-focus-ring)]";

function FilterPill({ on, onClick, children }: { on: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      aria-pressed={on}
      onClick={onClick}
      className={cn(
        PILL,
        on
          ? "border-[var(--ds-ink)] bg-[var(--ds-blue-soft)] font-medium text-[var(--ds-ink)] shadow-[inset_0_0_0_0.5px_var(--ds-ink)]"
          : "hover:bg-[var(--ds-hover)] hover:border-[var(--ds-line-strong)] active:bg-[var(--ds-surface-2)]",
      )}
    >
      {on && <Check className="size-[13px]" strokeWidth={2} aria-hidden />}
      {children}
    </button>
  );
}

/** One labelled filter group: label on the left (above on phones), pills
 *  that wrap on desktop and scroll sideways in their own row on phones. */
function FilterRow({ label, narrow = false, children }: { label: string; narrow?: boolean; children: React.ReactNode }) {
  return (
    <div role="group" aria-label={`Filter by ${label.toLowerCase()}`} className="flex min-w-0 flex-col gap-1.5 sm:flex-row sm:items-start sm:gap-2">
      <span
        aria-hidden
        className={cn("shrink-0 text-[12.5px] text-[var(--ds-subtle)] sm:leading-8", narrow ? "sm:mr-1 sm:w-auto" : "sm:w-[76px]")}
      >
        {label}
      </span>
      <div className="no-scrollbar -mx-4 flex min-w-0 gap-2 overflow-x-auto px-4 sm:mx-0 sm:flex-wrap sm:overflow-visible sm:px-0">
        {children}
      </div>
    </div>
  );
}

function SortMenu({ value, onChange, withBest }: { value: SortKey; onChange: (k: SortKey) => void; withBest: boolean }) {
  const keys: SortKey[] = withBest
    ? ["best", "rating", "price-asc", "price-desc", "sla"]
    : ["rating", "price-asc", "price-desc", "sla"];
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        aria-label={`Sort specialists: ${SORT_LABELS[value]}`}
        className="inline-flex h-8 items-center gap-1.5 rounded-[8px] px-1.5 text-[13.5px] text-[var(--ds-muted)] transition-colors duration-[120ms] hover:bg-[var(--ds-surface-2)] data-[state=open]:bg-[var(--ds-surface-2)] focus-visible:outline-none focus-visible:shadow-[var(--ds-focus-ring)]"
      >
        <ArrowUpDown className="size-3.5" aria-hidden />
        Sort
        <b className="font-medium text-[var(--ds-ink)]">{SORT_LABELS[value]}</b>
        <ChevronDown className="size-3.5" aria-hidden />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="min-w-[200px]">
        <DropdownMenuRadioGroup value={value} onValueChange={(v) => onChange(v as SortKey)}>
          {keys.map((k) => (
            <DropdownMenuRadioItem key={k} value={k} className="text-[13.5px]">
              {SORT_LABELS[k]}
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function CardSkeleton() {
  return (
    <div aria-hidden className="overflow-hidden rounded-[16px] border border-[var(--ds-line)] bg-[var(--ds-surface)]">
      <div className="relative h-[58px] animate-pulse bg-[var(--ds-surface-2)] motion-reduce:animate-none">
        <span className="absolute left-[18px] top-6 size-[52px] rounded-full border-[3px] border-[var(--ds-surface)] bg-[var(--ds-surface-3)]" />
      </div>
      <div className="space-y-2.5 px-[18px] pb-4 pt-9">
        <div className="h-4 w-40 rounded bg-[var(--ds-surface-2)]" />
        <div className="h-3 w-56 max-w-full rounded bg-[var(--ds-surface-2)]" />
        <div className="flex gap-1.5 pt-1">
          <div className="h-5 w-20 rounded-[6px] bg-[var(--ds-surface-2)]" />
          <div className="h-5 w-16 rounded-[6px] bg-[var(--ds-surface-2)]" />
          <div className="h-5 w-[72px] rounded-[6px] bg-[var(--ds-surface-2)]" />
        </div>
        <div className="h-3 w-28 rounded bg-[var(--ds-surface-2)]" />
      </div>
      <div className="flex items-center justify-between border-t border-[var(--ds-line-2)] px-[18px] py-3">
        <div className="space-y-1.5">
          <div className="h-4 w-24 rounded bg-[var(--ds-surface-2)]" />
          <div className="h-3 w-32 rounded bg-[var(--ds-surface-2)]" />
        </div>
        <div className="h-[34px] w-[104px] rounded-[8px] bg-[var(--ds-surface-2)]" />
      </div>
    </div>
  );
}

