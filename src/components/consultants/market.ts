/**
 * Pure helpers for the Experts marketplace (design mk-market, experts,
 * mk-profile, mk-book): mapping the listing, turnaround and availability in
 * words, the filters, the sorts, the "can it be back by" check, the ranking
 * for a letter and the booking totals. No React and no stores, so it is easy
 * to test.
 *
 * The ranking for a letter mirrors the review dialog's expert pane
 * (src/components/journey/review/experts.ts `rankForLetter` and
 * model.ts `specialtiesFor`), so "Best match" here lists the same three
 * experts in the same order as "Best matches for this letter" there, and the
 * count on arrival equals its "See all <N>".
 */
import type { Draft } from "@/lib/letters/types";
import type { AvailabilityCode, MarketplaceConsultantDTO } from "@/lib/consultantApi";
import type { ConsultantProfile } from "@/lib/consultantProfile";
import type { Consultant } from "./types";

/* ------------------------------------------------------------------ */
/*  Listing                                                            */
/* ------------------------------------------------------------------ */

const SYMBOL: Record<string, "£" | "$" | "€"> = { GBP: "£", USD: "$", EUR: "€" };

/** Map a marketplace API DTO into the card shape. Guards a partial payload. */
export function dtoToConsultant(dto: MarketplaceConsultantDTO): Consultant {
  return {
    profileId: dto.id,
    initials: dto.initials || initialsFrom(dto.fullName),
    name: dto.fullName,
    role: dto.role ?? "",
    rating: Number(dto.rating) || 0,
    reviews: Number(dto.reviews) || 0,
    price: Number(dto.price) || 0,
    currency: SYMBOL[dto.currency] ?? "£",
    sla: dto.sla || "48h",
    avatarFrom: "",
    avatarTo: "",
    photoUrl: dto.photoUrl ?? "",
    specialty: dto.specialty ?? "",
    specialties: dto.specialties ?? [],
    bio: dto.bio ?? "",
    availability: dto.availability,
  };
}

/** The signed-in consultant's own card, only once it is complete. */
export function profileToConsultant(p: ConsultantProfile | null, complete: boolean): Consultant | null {
  if (!p || !complete) return null;
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
    avatarFrom: "",
    avatarTo: "",
    photoUrl: p.photoUrl || "",
    specialty: p.specialty,
    specialties: p.specialties ?? [],
    bio: p.bio,
    availability: p.availability,
    // Only a published profile is discoverable by HR users.
    pending: p.status !== "published",
  };
}

function initialsFrom(name: string | undefined): string {
  const parts = (name ?? "").trim().split(/\s+/).filter(Boolean);
  const last = parts.length > 1 ? parts[parts.length - 1] : "";
  return ((parts[0]?.[0] ?? "") + (last[0] ?? "")).toUpperCase() || "?";
}

/** First name for short labels ("Choose Sarah"). */
export function firstNameOf(name: string | undefined): string {
  return (name ?? "").trim().split(/\s+/)[0] ?? "";
}

/* ------------------------------------------------------------------ */
/*  Turnaround and availability in words                               */
/* ------------------------------------------------------------------ */

const DEFAULT_HOURS = 48;

/**
 * Hours from a turnaround string, taking the upper end of a range, so the
 * promise "Back within 48 hours" is kept for "24-48h". Understands "24h",
 * "24-48h", "48 hours", "3-5 days", "5 days". Null when it cannot tell.
 */
export function slaHours(sla: string | undefined): number | null {
  const s = (sla ?? "").trim().toLowerCase();
  if (!s) return null;
  const m = s.match(/^(\d+(?:\.\d+)?)(?:\s*(?:-|to|–)\s*(\d+(?:\.\d+)?))?\s*(h|hr|hrs|hour|hours|d|day|days|wd|working days?)?$/);
  if (!m) return null;
  const n = Number(m[2] ?? m[1]);
  if (!Number.isFinite(n) || n <= 0) return null;
  const unit = m[3] ?? "h";
  return unit.startsWith("d") || unit.startsWith("w") ? Math.round(n * 24) : Math.round(n);
}

/** Hours to plan with: the parsed turnaround, or 48 when it cannot be read. */
export function planHours(sla: string | undefined): number {
  return slaHours(sla) ?? DEFAULT_HOURS;
}

/** "48 hours", "24 hours", "5 days". Falls back to the expert's own words. */
export function turnaroundWords(sla: string | undefined): string {
  const h = slaHours(sla);
  if (h == null) return (sla ?? "").trim() || "48 hours";
  if (h >= 72 && h % 24 === 0) return `${h / 24} days`;
  return `${h} hour${h === 1 ? "" : "s"}`;
}

/** Short form for the profile stat tile: "48 hrs", "5 days". */
export function turnaroundShort(sla: string | undefined): string {
  const h = slaHours(sla);
  if (h == null) return (sla ?? "").trim() || "48 hrs";
  if (h >= 72 && h % 24 === 0) return `${h / 24} days`;
  return `${h} hrs`;
}

export const AVAILABILITY_WORDS: Record<AvailabilityCode, string> = {
  this_week: "Available this week",
  one_two_weeks: "Available in 1 to 2 weeks",
  three_four_weeks: "Available in 3 to 4 weeks",
  booked: "Booked, not taking new work",
};

/** Availability in words when it misses the deadline (shorter, for the flag). */
const LATE_WORDS: Record<Exclude<AvailabilityCode, "this_week" | "booked">, string> = {
  one_two_weeks: "In 1 to 2 weeks",
  three_four_weeks: "In 3 to 4 weeks",
};

export function availabilityWords(code: AvailabilityCode | undefined): string {
  return AVAILABILITY_WORDS[code ?? "this_week"] ?? AVAILABILITY_WORDS.this_week;
}

/** Can this expert have it back by the due time? Needs to be free this week
 *  and fast enough. With no due date, everyone can. */
export function canMeet(c: Consultant, dueMs: number | null, now = Date.now()): boolean {
  if (dueMs == null) return true;
  if ((c.availability ?? "this_week") !== "this_week") return false;
  return now + planHours(c.sla) * 3600_000 <= dueMs;
}

/** The availability pill on a card or the profile sheet. */
export type AvailabilityPill = { label: string; tone: "live" | "quiet" | "late" | "pending" };

export function availabilityPill(c: Consultant, dueMs: number | null, now = Date.now()): AvailabilityPill {
  if (c.pending) return { label: "Pending review", tone: "pending" };
  const code = c.availability ?? "this_week";
  if (dueMs != null && !canMeet(c, dueMs, now)) {
    if (code === "booked") return { label: availabilityWords(code), tone: "late" };
    // Short form so the flag stays on one line in the band ("In 3 to 4
    // weeks, after your deadline"); the card truncates it with a title if
    // it still does not fit.
    if (code !== "this_week") return { label: `${LATE_WORDS[code]}, after your deadline`, tone: "late" };
    return { label: "Back after your deadline", tone: "late" };
  }
  return code === "this_week"
    ? { label: availabilityWords(code), tone: "live" }
    : { label: availabilityWords(code), tone: "quiet" };
}

/* ------------------------------------------------------------------ */
/*  Dates                                                              */
/* ------------------------------------------------------------------ */

/** A due date from the query string: an ISO date or date-time. Null when missing or bad.
 *  A bare date means the end of the working day (17:00 local). */
export function parseDue(raw: string | null | undefined): number | null {
  const s = (raw ?? "").trim();
  if (!s) return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) {
    const [y, m, d] = s.split("-").map(Number);
    const t = new Date(y, m - 1, d, 17, 0, 0, 0).getTime();
    return Number.isFinite(t) ? t : null;
  }
  if (!/^\d{4}-\d{2}-\d{2}T/.test(s)) return null;
  const t = Date.parse(s);
  return Number.isFinite(t) ? t : null;
}

/** "Thu 15 Oct" */
export function shortDay(ms: number): string {
  return new Date(ms).toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short" }).replace(/,/g, "");
}

/** "Thu 15 Oct, 12:00" */
export function dayAndTime(ms: number): string {
  const time = new Date(ms).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", hour12: false });
  return `${shortDay(ms)}, ${time}`;
}

/** "14:20" */
export function clock(ms: number): string {
  return new Date(ms).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", hour12: false });
}

/** "10 Oct" (this year) or "10 Oct 2025". */
export function shortDate(ms: number, now = Date.now()): string {
  const d = new Date(ms);
  const sameYear = d.getFullYear() === new Date(now).getFullYear();
  return d.toLocaleDateString("en-GB", { day: "numeric", month: "short", ...(sameYear ? {} : { year: "numeric" }) });
}

/** A declined booking's note: "Declined 9 Oct: <reason>." with the date when
 *  it was recorded and the reason when the expert gave one. */
export function declinedLine(b: { declinedAt?: number; responseNote?: string }, now = Date.now()): string {
  const when = b.declinedAt ? `Declined ${shortDate(b.declinedAt, now)}` : "Declined";
  const reason = (b.responseNote ?? "").trim().replace(/[.\s]+$/, "");
  return reason ? `${when}: ${reason}.` : `${when}.`;
}

/** "today at 14:20", "yesterday at 09:10", "10 Oct". */
export function sentWhen(ms: number, now = Date.now()): string {
  const d = new Date(ms);
  const today = new Date(now);
  const sameDay = (a: Date, b: Date) =>
    a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
  if (sameDay(d, today)) return `today at ${clock(ms)}`;
  const y = new Date(now - 86400000);
  if (sameDay(d, y)) return `yesterday at ${clock(ms)}`;
  return shortDate(ms, now);
}

/** "2 hours ago", "just now", "3 days ago". */
export function agoWords(ms: number, now = Date.now()): string {
  const mins = Math.floor((now - ms) / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins} minute${mins === 1 ? "" : "s"} ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours} hour${hours === 1 ? "" : "s"} ago`;
  const days = Math.floor(hours / 24);
  return `${days} day${days === 1 ? "" : "s"} ago`;
}

/* ------------------------------------------------------------------ */
/*  Ranking for a letter (mirrors the review dialog's expert pane)     */
/* ------------------------------------------------------------------ */

/** Marketplace specialties that fit a letter type (empty: any expert fits). */
export function specialtiesForLetter(draft: Draft | undefined): string[] {
  if (!draft) return [];
  switch (draft.letterType) {
    case "warning":
    case "termination":
    case "probation_outcome":
      return ["Disciplinary", "Performance"];
    case "redundancy":
      return ["Redundancy"];
    case "settlement_cover":
    case "settlement_counter_offer":
      return ["Settlement"];
    case "grievance":
    case "resignation_with_grievance":
      return ["Grievance"];
    case "resignation_constructive":
    case "constructive_dismissal_warning":
      return ["Constructive dismissal", "Grievance"];
    case "flexible_working_request":
      return ["Flexible working"];
    case "whistleblowing":
      return ["Whistleblowing"];
    case "leave_approval":
    case "holiday_request":
      return ["Holiday", "Statutory leave"];
    case "accommodation_request":
      return ["Discrimination"];
    case "pay_dispute":
      return ["Working Time"];
    default:
      return [];
  }
}

const lc = (s: string) => s.trim().toLowerCase();

function fitsFor(wanted: string[]) {
  const w = wanted.map(lc);
  return (c: Consultant) => c.specialties.filter((s) => w.includes(lc(s))).length;
}

/** The best-match comparator for a letter: free first, then the most fitting
 *  specialties, then rating, reviews and price. */
export function bestMatchCompare(wanted: string[]) {
  const fits = fitsFor(wanted);
  return (a: Consultant, b: Consultant) =>
    Number(a.availability === "booked") - Number(b.availability === "booked") ||
    fits(b) - fits(a) ||
    b.rating - a.rating ||
    b.reviews - a.reviews ||
    a.price - b.price;
}

/** Experts who fit a letter, best first (the review dialog's "matching"). */
export function rankForLetter(list: Consultant[], draft: Draft | undefined): Consultant[] {
  const wanted = specialtiesForLetter(draft);
  const fits = fitsFor(wanted);
  const pool = wanted.length ? list.filter((c) => fits(c) > 0) : list.slice();
  return pool.sort(bestMatchCompare(wanted));
}

/* ------------------------------------------------------------------ */
/*  Filters and sorts                                                  */
/* ------------------------------------------------------------------ */

export type PriceBand = "any" | "under150" | "150to300" | "over300";
export type TurnBand = "any" | "24" | "48" | "120";
export type ReviewerKind = "any" | "solicitor" | "cipd" | "before";
export type SortKey = "best" | "rating" | "price-asc" | "price-desc" | "sla";

export const PRICE_OPTIONS: { id: PriceBand; label: string }[] = [
  { id: "any", label: "Any" },
  { id: "under150", label: "Under £150" },
  { id: "150to300", label: "£150 to £300" },
  { id: "over300", label: "Over £300" },
];

export const TURN_OPTIONS: { id: TurnBand; label: string }[] = [
  { id: "any", label: "Any" },
  { id: "24", label: "Within 24 hours" },
  { id: "48", label: "Within 48 hours" },
  { id: "120", label: "Up to 5 days" },
];

export const REVIEWER_OPTIONS: { id: ReviewerKind; label: string }[] = [
  { id: "any", label: "Any" },
  { id: "solicitor", label: "Solicitor" },
  { id: "cipd", label: "Chartered CIPD" },
  { id: "before", label: "Worked with you before" },
];

export const SORT_LABELS: Record<SortKey, string> = {
  best: "Best match",
  rating: "Top rated",
  "price-asc": "Price, low to high",
  "price-desc": "Price, high to low",
  sla: "Fastest turnaround",
};

export type Filters = {
  query: string;
  specialties: string[];
  price: PriceBand;
  turnaround: TurnBand;
  /** Letter mode: only experts who can have it back by the due date. */
  backBy: boolean;
  reviewer: ReviewerKind;
};

export const NO_FILTERS: Filters = {
  query: "",
  specialties: [],
  price: "any",
  turnaround: "any",
  backBy: false,
  reviewer: "any",
};

export function inPriceBand(price: number, band: PriceBand): boolean {
  switch (band) {
    case "under150":
      return price < 150;
    case "150to300":
      return price >= 150 && price <= 300;
    case "over300":
      return price > 300;
    default:
      return true;
  }
}

export function inTurnBand(sla: string, band: TurnBand): boolean {
  if (band === "any") return true;
  const h = slaHours(sla);
  return h != null && h <= Number(band);
}

export function isSolicitor(c: Consultant): boolean {
  return /\b(solicitor|lawyer|barrister|counsel)\b/i.test(c.role);
}

export function isCipd(c: Consultant): boolean {
  return /cipd|chartered/i.test(c.role);
}

export function matchesQuery(c: Consultant, q: string): boolean {
  const s = lc(q);
  if (!s) return true;
  return [c.name, c.role, c.specialty].some((x) => lc(x ?? "").includes(s));
}

export type FilterContext = {
  dueMs: number | null;
  /** Profile ids of experts you have booked before. */
  bookedBefore: Set<string>;
  now?: number;
};

export function applyFilters(list: Consultant[], f: Filters, ctx: FilterContext): Consultant[] {
  const wanted = f.specialties.map(lc);
  return list.filter(
    (c) =>
      matchesQuery(c, f.query) &&
      (wanted.length === 0 || c.specialties.some((s) => wanted.includes(lc(s)))) &&
      inPriceBand(c.price, f.price) &&
      inTurnBand(c.sla, f.turnaround) &&
      (!f.backBy || canMeet(c, ctx.dueMs, ctx.now)) &&
      (f.reviewer === "any" ||
        (f.reviewer === "solicitor" && isSolicitor(c)) ||
        (f.reviewer === "cipd" && isCipd(c)) ||
        (f.reviewer === "before" && !!c.profileId && ctx.bookedBefore.has(c.profileId))),
  );
}

export function sortExperts(list: Consultant[], key: SortKey, wanted: string[] = []): Consultant[] {
  const out = list.slice();
  switch (key) {
    case "best":
      return out.sort(bestMatchCompare(wanted));
    case "rating":
      return out.sort((a, b) => b.rating - a.rating || b.reviews - a.reviews);
    case "price-asc":
      return out.sort((a, b) => a.price - b.price);
    case "price-desc":
      return out.sort((a, b) => b.price - a.price);
    case "sla":
      return out.sort((a, b) => planHours(a.sla) - planHours(b.sla) || b.rating - a.rating);
  }
}

export function filtersActive(f: Filters): boolean {
  return (
    !!f.query.trim() ||
    f.specialties.length > 0 ||
    f.price !== "any" ||
    f.turnaround !== "any" ||
    f.backBy ||
    f.reviewer !== "any"
  );
}

/** Specialties in the listing, most common first, then by name. */
export function listingSpecialties(list: Consultant[]): string[] {
  const counts = new Map<string, { label: string; n: number }>();
  for (const c of list)
    for (const s of c.specialties) {
      const k = lc(s);
      if (!k) continue;
      const cur = counts.get(k);
      if (cur) cur.n += 1;
      else counts.set(k, { label: s.trim(), n: 1 });
    }
  return Array.from(counts.values())
    .sort((a, b) => b.n - a.n || a.label.localeCompare(b.label))
    .map((x) => x.label);
}

const orJoin = (xs: string[]) =>
  xs.length <= 1 ? xs.join("") : `${xs.slice(0, -1).join(", ")} or ${xs[xs.length - 1]}`;

/** The grey words after "<N> experts" in browse mode. */
export function describeBrowse(f: Filters): string {
  const parts: string[] = [];
  if (f.specialties.length) parts.push(`for ${orJoin(f.specialties)}`);
  if (f.price === "under150") parts.push("under £150");
  if (f.price === "150to300") parts.push("from £150 to £300");
  if (f.price === "over300") parts.push("over £300");
  if (f.turnaround === "24") parts.push("back within 24 hours");
  if (f.turnaround === "48") parts.push("back within 48 hours");
  if (f.turnaround === "120") parts.push("back within 5 days");
  if (f.query.trim()) parts.push(`matching "${f.query.trim()}"`);
  return parts.join(", ");
}

/** The grey words after "<N> experts" when choosing for a letter. */
export function describeForLetter(f: Filters, n: number, sort: SortKey, dueMs: number | null): string {
  const parts: string[] = [];
  if (f.specialties.length) parts.push(`for ${orJoin(f.specialties.map(lc))} letters`);
  if (f.price === "under150") parts.push("under £150");
  if (f.price === "150to300") parts.push("from £150 to £300");
  if (f.price === "over300") parts.push("over £300");
  if (f.backBy && dueMs != null) parts.push(`back by ${shortDay(dueMs)}`);
  if (f.reviewer === "solicitor") parts.push("solicitors");
  if (f.reviewer === "cipd") parts.push("Chartered CIPD");
  if (f.reviewer === "before") parts.push("worked with you before");
  if (f.query.trim()) parts.push(`matching "${f.query.trim()}"`);
  // The line follows "<b>N experts</b>": a filter description continues the
  // sentence ("6 experts for disciplinary letters. Your top 3 ..."); with no
  // filters the count ends its own sentence first ("8 experts. Your top 3 ...").
  let line = parts.join(", ");
  const best = sort === "best" && n > 0 ? (n >= 3 ? "Your top 3 match comes first." : "Your best match comes first.") : "";
  if (line) return best ? `${line}. ${best}` : `${line}.`;
  return best ? `. ${best}` : "";
}

/* ------------------------------------------------------------------ */
/*  Money                                                              */
/* ------------------------------------------------------------------ */

/**
 * VAT DraftHR adds on top of the expert's fee. Checkout charges the booking's
 * price snapshot, which is the expert's fee with no VAT added
 * (api/_utils/marketplace-payments.ts `priceSnapshot`), so nothing is added
 * here either: the total the booking sheet shows is what is charged. Set this
 * only together with a server change that charges it.
 */
export const VAT_RATE_CHARGED = 0;

export function money(amount: number, symbol: string = "£"): string {
  return `${symbol}${amount.toLocaleString("en-GB", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export function bookingTotals(price: number) {
  const fee = Math.max(0, price);
  const vat = Math.round(fee * VAT_RATE_CHARGED * 100) / 100;
  return { fee, vat, total: fee + vat, totalPence: Math.round((fee + vat) * 100) };
}
