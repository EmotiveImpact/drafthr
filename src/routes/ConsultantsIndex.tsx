import { Children, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
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
  // The letter's own specialties, in the order the letter wants them.
  const arrival = useMemo(() => {
    if (!letterMode) return [] as string[];
    return specialtiesForLetter(forDraft)
      .map((w) => tags.find((t) => t.toLowerCase() === w.toLowerCase()))
      .filter((t): t is string => !!t);
  }, [letterMode, forDraft, tags]);
  // Choosing for a letter, its specialties lead the row right after "All"
  // (mk-market), so the preselected chips sit together and stay in view on
  // a phone's sideways row. The order does not change as chips are toggled.
  const rowTags = useMemo(() => [...arrival, ...tags.filter((t) => !arrival.includes(t))], [arrival, tags]);
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
  // The card button that opened a sheet, so closing it puts focus back there.
  const [opener, setOpener] = useState<HTMLElement | null>(null);

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
  // ?expert=<consultantId> (What's next "Ask <expert>", SEND-82): open that
  // expert with the letter carried. Choosing for a letter opens their
  // profile; otherwise their booking sheet. Once, then the param goes.
  const expertParam = !isConsultant ? params.get("expert") : null;
  const expertHandled = useRef<string | null>(null);
  useEffect(() => {
    if (!expertParam || loadState !== "ready" || expertHandled.current === expertParam) return;
    expertHandled.current = expertParam;
    const c = all.find((x) => x.profileId === expertParam);
    if (c) {
      setOpener(null);
      if (letterMode) setProfileFor(c);
      else requestBooking(c);
    }
    const next = new URLSearchParams(params);
    next.delete("expert");
    setParams(next, { replace: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [expertParam, loadState, all, letterMode]);

  const choose = (c: Consultant) => {
    if (actionBlocked || !forId || !c.profileId) return;
    setProfileFor(null);
    // Carry the back-by date the person was choosing for (MARKET-X5), so
    // the reviewer dialog keeps it instead of its own default.
    const due = dueMs != null ? `&due=${encodeURIComponent(new Date(dueMs).toISOString())}` : "";
    navigate(`/editor/${encodeURIComponent(forId)}?review=expert&expert=${encodeURIComponent(c.profileId)}${due}`);
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
          // A description continues after the count; a lone note (". Your
          // top 3 ...") already starts with the full stop that ends the count.
          return words ? (words.startsWith(".") ? words : ` ${words}`) : "";
        })()}
        {myCard && (myCard.pending ? " · your profile is pending review" : " · you are listed")}
      </p>
    ) : (
      <span aria-hidden className="block h-5" />
    );

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div data-page-main className="min-w-0 flex-1 overflow-y-auto">
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
                  <span className="text-[13px] text-[var(--ds-muted)]">
                    {contextFacts?.sent ? "Booking appeal help for" : "Booking a review for"}
                  </span>
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
              <FilterRow label="Specialty" fill>
                <SpecialtyPills
                  tags={rowTags}
                  chosen={specialties}
                  onAll={() => setChosenSpecialties([])}
                  onToggle={toggleSpecialty}
                  moreOpen={moreOpen}
                  onMoreOpen={setMoreOpen}
                />
              </FilterRow>
              {/* Price with Turnaround (or Back by) beside it once the column
                  has room for both on one line, stacked before that. */}
              <div
                className={cn(
                  "flex flex-col gap-2.5",
                  letterMode
                    ? "@[760px]:flex-row @[760px]:items-center @[760px]:gap-[22px]"
                    : "@[1060px]:flex-row @[1060px]:items-center @[1060px]:gap-[22px]",
                )}
              >
                <FilterRow label="Price">
                  {PRICE_OPTIONS.map((o) => (
                    <FilterPill key={o.id} on={price === o.id} onClick={() => setPrice(o.id)}>
                      {o.label}
                    </FilterPill>
                  ))}
                </FilterRow>
                {letterMode ? (
                  <FilterRow label="Back by" inlineAt="mid">
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
                  <FilterRow label="Turnaround" inlineAt="wide">
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
                  onBook={(el) => {
                    setOpener(el);
                    requestBooking(c);
                  }}
                  onProfile={(el) => {
                    setOpener(el);
                    setProfileFor(c);
                  }}
                  onChoose={() => choose(c)}
                />
              ))}
            </div>
          )}
        </div>
      </div>

      {!letterMode && !isConsultant && (
        <BookingSheet
          consultant={bookingFor}
          draftId={bookingDraftId}
          onDraftChange={setContextLetter}
          onClose={() => setBookingFor(null)}
          returnFocusTo={opener}
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
          returnFocusTo={opener}
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

/** One column on phones, two from about 640px windows up to desktop, three
 *  at desktop widths (a 1440 window gives about 1120px). Three is the most,
 *  as in the mock. The two-column step is the content column, not the
 *  window: with the 224px sidebar on from 768 the column is only about 440
 *  to 600px wide, so two columns start at 400px and the cards tighten their
 *  footer below about 250px (ConsultantCard). A phone's column (about 360px)
 *  stays one. */
const GRID = "grid grid-cols-1 gap-4 @[400px]:grid-cols-2 @[960px]:grid-cols-3";

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

/**
 * The specialty pills: "All", the tags, then "+ N more". On desktop the row
 * stays on one line (as in the mock): it shows as many tags as fit, always
 * including the ones already chosen (a letter arrives with its own chosen),
 * and the rest go behind "+ N more". Widths come from a hidden copy of every
 * pill, re-measured when the row resizes. On phones the row scrolls sideways
 * and shows the first few. "Show fewer" folds it back.
 */
function SpecialtyPills({
  tags,
  chosen,
  onAll,
  onToggle,
  moreOpen,
  onMoreOpen,
}: {
  tags: string[];
  chosen: string[];
  onAll: () => void;
  onToggle: (t: string) => void;
  moreOpen: boolean;
  onMoreOpen: (open: boolean) => void;
}) {
  const isOn = useCallback((t: string) => chosen.some((x) => x.toLowerCase() === t.toLowerCase()), [chosen]);
  const rowRef = useRef<HTMLDivElement>(null);
  const measureRef = useRef<HTMLDivElement>(null);
  // How many tags fit beside "All" and "+ N more"; null until measured
  // (phones and the first paint use the fixed count).
  const [fit, setFit] = useState<number | null>(null);
  const chosenNone = chosen.length === 0;

  const visible = useMemo(() => {
    if (moreOpen) return tags;
    const on = tags.filter(isOn);
    const room = Math.max(0, (fit ?? VISIBLE_SPECIALTIES) - on.length);
    const keep = new Set([...on, ...tags.filter((t) => !isOn(t)).slice(0, room)]);
    return tags.filter((t) => keep.has(t));
  }, [tags, isOn, fit, moreOpen]);
  const hidden = tags.length - visible.length;

  useLayoutEffect(() => {
    const row = rowRef.current;
    const measure = measureRef.current;
    if (!row || !measure) return;
    const compute = () => {
      // Phones scroll the row sideways, so there is no line to fit.
      if (!window.matchMedia("(min-width: 640px)").matches) {
        setFit(null);
        return;
      }
      const width = row.clientWidth;
      // The copy holds "All" chosen, "All" not chosen, every tag not chosen,
      // then "+ N more". A chosen pill is wider by its tick and weight.
      const pills = Array.from(measure.children) as HTMLElement[];
      const GAP = 8;
      const allOnW = pills[0]?.offsetWidth ?? 0;
      const allOffW = pills[1]?.offsetWidth ?? 0;
      const onExtra = Math.max(0, allOnW - allOffW);
      const moreW = pills[pills.length - 1]?.offsetWidth ?? 0;
      const tagW = new Map(tags.map((t, i) => [t, (pills[i + 2]?.offsetWidth ?? 0) + (isOn(t) ? onExtra : 0)]));
      const allW = chosenNone ? allOnW : allOffW;
      const total = (list: string[], withMore: boolean) =>
        allW + list.reduce((sum, t) => sum + GAP + (tagW.get(t) ?? 0), 0) + (withMore ? GAP + moreW : 0);
      if (total(tags, false) <= width) {
        setFit(tags.length);
        return;
      }
      const on = tags.filter(isOn);
      const off = tags.filter((t) => !isOn(t));
      let n = 0;
      while (n < off.length && total([...on, ...off.slice(0, n + 1)], true) <= width) n++;
      setFit(on.length + n);
    };
    compute();
    const ro = new ResizeObserver(compute);
    ro.observe(row);
    // Widths change once the web font arrives (the fallback is wider), and
    // that does not resize the row: measure again then.
    const fonts = typeof document !== "undefined" ? document.fonts : undefined;
    let live = true;
    void fonts?.ready.then(() => live && compute());
    fonts?.addEventListener?.("loadingdone", compute);
    return () => {
      live = false;
      ro.disconnect();
      fonts?.removeEventListener?.("loadingdone", compute);
    };
  }, [tags, isOn, chosenNone]);

  return (
    <div ref={rowRef} className="relative flex min-w-0 flex-1 gap-2 max-sm:contents sm:flex-wrap">
      <FilterPill on={chosen.length === 0} onClick={onAll}>
        All
      </FilterPill>
      {visible.map((t) => (
        <FilterPill key={t} on={isOn(t)} onClick={() => onToggle(t)}>
          {t}
        </FilterPill>
      ))}
      {hidden > 0 && (
        <button
          type="button"
          onClick={() => onMoreOpen(true)}
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
          onClick={() => onMoreOpen(false)}
          aria-expanded
          className={cn(PILL, "text-[var(--ds-muted)] hover:bg-[var(--ds-hover)] active:bg-[var(--ds-surface-2)]")}
        >
          Show fewer
        </button>
      )}
      {/* Hidden copy of the pills, for widths. */}
      <div
        ref={measureRef}
        aria-hidden
        inert
        className="pointer-events-none invisible absolute left-0 top-0 flex h-0 gap-2 overflow-hidden whitespace-nowrap max-sm:hidden"
      >
        <span className={cn(PILL, "font-medium")}>
          <Check className="size-[13px]" aria-hidden />
          All
        </span>
        <span className={PILL}>All</span>
        {tags.map((t) => (
          <span key={t} className={PILL}>
            {t}
          </span>
        ))}
        <span className={PILL}>
          <Plus className="size-[13px]" aria-hidden />
          {tags.length} more
        </span>
      </div>
    </div>
  );
}

/** One labelled filter group: label on the left (above on phones), pills
 *  that wrap on desktop and scroll sideways in their own row on phones.
 *
 *  Every row's pills start at the same 76px column while the rows are
 *  stacked; only once Turnaround or Back by sits beside Price on one line
 *  ("inlineAt", the same container widths as the wrapper above) does that
 *  label shrink to its words. When
 *  a short row of pills (Price, Turnaround, Reviewer) cannot fit on one line
 *  beside the sidebar, it breaks evenly into two lines of two rather than
 *  leaving one pill alone on the second line. The specialty row ("fill")
 *  fits its own line with "+ N more" instead. */
const INLINE_LABEL = {
  mid: "@[760px]:mr-1 @[760px]:w-auto",
  wide: "@[1060px]:mr-1 @[1060px]:w-auto",
} as const;

function FilterRow({
  label,
  inlineAt,
  fill = false,
  children,
}: {
  label: string;
  /** Sits beside Price from this content width (its label then shrinks). */
  inlineAt?: keyof typeof INLINE_LABEL;
  /** The pills take the rest of the line (the specialty row measures it). */
  fill?: boolean;
  children: React.ReactNode;
}) {
  const pillsRef = useRef<HTMLDivElement>(null);
  const [split, setSplit] = useState(false);
  useLayoutEffect(() => {
    const box = pillsRef.current;
    if (fill || !box) return;
    const compute = () => {
      // Phones scroll the row sideways, so there is no line to fit.
      if (!window.matchMedia("(min-width: 640px)").matches) {
        setSplit(false);
        return;
      }
      const row = box.parentElement;
      // Beside Price on one line there is room by design (see the wrapper).
      if (row?.parentElement && getComputedStyle(row.parentElement).flexDirection === "row") {
        setSplit(false);
        return;
      }
      const pills = Array.from(box.querySelectorAll("button"));
      const GAP = 8;
      const oneLine = pills.reduce((sum, el) => sum + el.offsetWidth, 0) + GAP * Math.max(0, pills.length - 1);
      // The room the pills have: the row less its label and gap.
      const labelEl = row?.firstElementChild as HTMLElement | null;
      const room = (row?.clientWidth ?? 0) - (labelEl?.offsetWidth ?? 0) - GAP;
      setSplit(pills.length > 2 && oneLine > room + 0.5);
    };
    compute();
    const ro = new ResizeObserver(compute);
    if (box.parentElement) ro.observe(box.parentElement);
    if (box.parentElement?.parentElement) ro.observe(box.parentElement.parentElement);
    const fonts = typeof document !== "undefined" ? document.fonts : undefined;
    let live = true;
    void fonts?.ready.then(() => live && compute());
    fonts?.addEventListener?.("loadingdone", compute);
    return () => {
      live = false;
      ro.disconnect();
      fonts?.removeEventListener?.("loadingdone", compute);
    };
  }, [fill]);

  return (
    <div role="group" aria-label={`Filter by ${label.toLowerCase()}`} className="flex min-w-0 flex-col gap-1.5 sm:flex-row sm:items-start sm:gap-2">
      <span
        aria-hidden
        className={cn("shrink-0 text-[12.5px] text-[var(--ds-subtle)] sm:w-[76px] sm:leading-8", inlineAt && INLINE_LABEL[inlineAt])}
      >
        {label}
      </span>
      <div
        ref={pillsRef}
        data-split={split || undefined}
        className={cn(
          "no-scrollbar -mx-4 flex min-w-0 gap-2 overflow-x-auto px-4 sm:mx-0 sm:flex-wrap sm:overflow-visible sm:px-0",
          fill && "sm:flex-1",
          split && "sm:flex-col",
        )}
      >
        {split ? <SplitPills>{children}</SplitPills> : children}
      </div>
    </div>
  );
}

/** The pills in two even lines (the first half, then the rest). */
function SplitPills({ children }: { children: React.ReactNode }) {
  const items = Children.toArray(children);
  const half = Math.ceil(items.length / 2);
  return (
    <>
      <div className="flex gap-2">{items.slice(0, half)}</div>
      <div className="flex gap-2">{items.slice(half)}</div>
    </>
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

