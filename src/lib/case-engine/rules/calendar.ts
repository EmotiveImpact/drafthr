import type { IsoDate, UkNation } from "../types.js";

/**
 * Pure date helpers for the rules. Everything works on "YYYY-MM-DD" strings
 * and does its arithmetic in UTC, so the server's time zone and daylight
 * saving never move a date.
 *
 * Helpers that take an IsoDate throw a RangeError for an invalid one: the
 * rules check their inputs with `isIsoDate` before calling them.
 */

const DAY_MS = 86_400_000;
const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;

/** A real calendar date at UTC midnight, or null when `value` is not one. */
export function parseIsoDate(value: string): Date | null {
  const match = ISO_DATE.exec(value);
  if (!match) return null;
  const [y, m, d] = [Number(match[1]), Number(match[2]), Number(match[3])];
  const date = new Date(Date.UTC(y, m - 1, d));
  if (date.getUTCFullYear() !== y || date.getUTCMonth() !== m - 1 || date.getUTCDate() !== d) {
    return null;
  }
  return date;
}

export function isIsoDate(value: unknown): value is IsoDate {
  return typeof value === "string" && parseIsoDate(value) !== null;
}

export function formatIsoDate(date: Date): IsoDate {
  const y = String(date.getUTCFullYear()).padStart(4, "0");
  const m = String(date.getUTCMonth() + 1).padStart(2, "0");
  const d = String(date.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function toDate(iso: IsoDate): Date {
  const date = parseIsoDate(iso);
  if (!date) throw new RangeError(`Not a valid date: ${iso}`);
  return date;
}

function daysInMonth(year: number, monthIndex: number): number {
  return new Date(Date.UTC(year, monthIndex + 1, 0)).getUTCDate();
}

export function addDays(iso: IsoDate, days: number): IsoDate {
  return formatIsoDate(new Date(toDate(iso).getTime() + days * DAY_MS));
}

/**
 * The corresponding date `months` later (or earlier, when negative). Where the
 * target month is too short it clamps to that month's last day, so 31 January
 * plus one month is 28 (or 29) February, never early March.
 */
export function addMonths(iso: IsoDate, months: number): IsoDate {
  const date = toDate(iso);
  const target = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + months, 1));
  const lastDay = daysInMonth(target.getUTCFullYear(), target.getUTCMonth());
  target.setUTCDate(Math.min(date.getUTCDate(), lastDay));
  return formatIsoDate(target);
}

export function addYears(iso: IsoDate, years: number): IsoDate {
  return addMonths(iso, years * 12);
}

/**
 * Last day of a period of `months` months beginning with `start` ("N months
 * less one day"). The period ends the day before the corresponding date; where
 * the end month has no corresponding date it ends on that month's last day
 * (Dodds v Walker [1981] 1 WLR 1027; Pruden v Cunard Ellerman Ltd [1993] IRLR
 * 317, EAT: EDT 31 August, last day 30 November).
 */
export function lastDayOfMonthsBeginningWith(start: IsoDate, months: number): IsoDate {
  const date = toDate(start);
  const day = date.getUTCDate();
  const end = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + months, 1));
  const lastDay = daysInMonth(end.getUTCFullYear(), end.getUTCMonth());
  // Day 1 becomes day 0, which rolls back to the previous month's last day.
  end.setUTCDate(day > lastDay ? lastDay : day - 1);
  return formatIsoDate(end);
}

/**
 * Whole months in the period beginning with `start` and ending with `end`,
 * counting both days: 1 May 2025 to 30 April 2027 is 24.
 */
export function completeMonths(start: IsoDate, end: IsoDate): number {
  const s = toDate(start);
  const e = toDate(end);
  let months =
    (e.getUTCFullYear() - s.getUTCFullYear()) * 12 + (e.getUTCMonth() - s.getUTCMonth()) + 1;
  while (months > 0 && lastDayOfMonthsBeginningWith(start, months) > end) months--;
  return Math.max(months, 0);
}

/** Age in whole years on `date`. Someone born on 29 February turns a year older on 1 March. */
export function ageOn(dateOfBirth: IsoDate, date: IsoDate): number {
  const b = toDate(dateOfBirth);
  const d = toDate(date);
  const beforeBirthday =
    d.getUTCMonth() < b.getUTCMonth() ||
    (d.getUTCMonth() === b.getUTCMonth() && d.getUTCDate() < b.getUTCDate());
  return d.getUTCFullYear() - b.getUTCFullYear() - (beforeBirthday ? 1 : 0);
}

/** Whole days from `from` to `to`; negative when `to` is earlier. */
export function daysBetween(from: IsoDate, to: IsoDate): number {
  return Math.round((toDate(to).getTime() - toDate(from).getTime()) / DAY_MS);
}

/** Day of the week: 0 is Sunday, 6 is Saturday. */
export function weekday(iso: IsoDate): number {
  return toDate(iso).getUTCDay();
}

export function isWeekend(iso: IsoDate): boolean {
  const day = weekday(iso);
  return day === 0 || day === 6;
}

export function earlierOf(a: IsoDate, b: IsoDate): IsoDate {
  return a <= b ? a : b;
}

export function laterOf(a: IsoDate, b: IsoDate): IsoDate {
  return a >= b ? a : b;
}

const MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

/** "30 November 2026", for basis text. */
export function formatLongDate(iso: IsoDate): string {
  const date = toDate(iso);
  return `${date.getUTCDate()} ${MONTH_NAMES[date.getUTCMonth()]} ${date.getUTCFullYear()}`;
}

// ---------------------------------------------------------------------------
// Holidays
// ---------------------------------------------------------------------------

/** The years the holiday tables below cover. Outside them no holiday is known. */
export const HOLIDAY_YEARS = { first: 2025, last: 2027 } as const;

export function holidaysKnownFor(iso: IsoDate): boolean {
  const year = toDate(iso).getUTCFullYear();
  return year >= HOLIDAY_YEARS.first && year <= HOLIDAY_YEARS.last;
}

/**
 * UK bank holidays, copied from https://www.gov.uk/bank-holidays.json
 * (fetched 13 October 2026). Substitute days are the dates listed there.
 */
export const UK_BANK_HOLIDAYS: Record<UkNation, readonly IsoDate[]> = {
  "england-wales": [
    "2025-01-01", // New Year's Day
    "2025-04-18", // Good Friday
    "2025-04-21", // Easter Monday
    "2025-05-05", // Early May bank holiday
    "2025-05-26", // Spring bank holiday
    "2025-08-25", // Summer bank holiday
    "2025-12-25", // Christmas Day
    "2025-12-26", // Boxing Day
    "2026-01-01", // New Year's Day
    "2026-04-03", // Good Friday
    "2026-04-06", // Easter Monday
    "2026-05-04", // Early May bank holiday
    "2026-05-25", // Spring bank holiday
    "2026-08-31", // Summer bank holiday
    "2026-12-25", // Christmas Day
    "2026-12-28", // Boxing Day (substitute day)
    "2027-01-01", // New Year's Day
    "2027-03-26", // Good Friday
    "2027-03-29", // Easter Monday
    "2027-05-03", // Early May bank holiday
    "2027-05-31", // Spring bank holiday
    "2027-08-30", // Summer bank holiday
    "2027-12-27", // Christmas Day (substitute day)
    "2027-12-28", // Boxing Day (substitute day)
  ],
  scotland: [
    "2025-01-01", // New Year's Day
    "2025-01-02", // 2nd January
    "2025-04-18", // Good Friday
    "2025-05-05", // Early May bank holiday
    "2025-05-26", // Spring bank holiday
    "2025-08-04", // Summer bank holiday
    "2025-12-01", // St Andrew's Day (substitute day)
    "2025-12-25", // Christmas Day
    "2025-12-26", // Boxing Day
    "2026-01-01", // New Year's Day
    "2026-01-02", // 2nd January
    "2026-04-03", // Good Friday
    "2026-05-04", // Early May bank holiday
    "2026-05-25", // Spring bank holiday
    "2026-06-15", // World Cup bank holiday
    "2026-08-03", // Summer bank holiday
    "2026-11-30", // St Andrew's Day
    "2026-12-25", // Christmas Day
    "2026-12-28", // Boxing Day (substitute day)
    "2027-01-01", // New Year's Day
    "2027-01-04", // 2nd January (substitute day)
    "2027-03-26", // Good Friday
    "2027-05-03", // Early May bank holiday
    "2027-05-31", // Spring bank holiday
    "2027-08-02", // Summer bank holiday
    "2027-11-30", // St Andrew's Day
    "2027-12-27", // Christmas Day (substitute day)
    "2027-12-28", // Boxing Day (substitute day)
  ],
  "northern-ireland": [
    "2025-01-01", // New Year's Day
    "2025-03-17", // St Patrick's Day
    "2025-04-18", // Good Friday
    "2025-04-21", // Easter Monday
    "2025-05-05", // Early May bank holiday
    "2025-05-26", // Spring bank holiday
    "2025-07-14", // Battle of the Boyne (substitute day)
    "2025-08-25", // Summer bank holiday
    "2025-12-25", // Christmas Day
    "2025-12-26", // Boxing Day
    "2026-01-01", // New Year's Day
    "2026-03-17", // St Patrick's Day
    "2026-04-03", // Good Friday
    "2026-04-06", // Easter Monday
    "2026-05-04", // Early May bank holiday
    "2026-05-25", // Spring bank holiday
    "2026-07-13", // Battle of the Boyne (substitute day)
    "2026-08-31", // Summer bank holiday
    "2026-12-25", // Christmas Day
    "2026-12-28", // Boxing Day (substitute day)
    "2027-01-01", // New Year's Day
    "2027-03-17", // St Patrick's Day
    "2027-03-26", // Good Friday
    "2027-03-29", // Easter Monday
    "2027-05-03", // Early May bank holiday
    "2027-05-31", // Spring bank holiday
    "2027-07-12", // Battle of the Boyne
    "2027-08-30", // Summer bank holiday
    "2027-12-27", // Christmas Day (substitute day)
    "2027-12-28", // Boxing Day (substitute day)
  ],
};

export function isUkBankHoliday(iso: IsoDate, nation: UkNation): boolean {
  return UK_BANK_HOLIDAYS[nation].includes(iso);
}

/** Good Friday, which ERA 1999 s13(6) names on its own as well as being on every gov.uk list. */
export const GOOD_FRIDAYS: readonly IsoDate[] = ["2025-04-18", "2026-04-03", "2027-03-26"];

/** Christmas Day or Good Friday: not working days whether or not they are bank holidays. */
export function isChristmasOrGoodFriday(iso: IsoDate): boolean {
  return iso.endsWith("-12-25") || GOOD_FRIDAYS.includes(iso);
}

/**
 * A working day for the right to be accompanied (ERA 1999 s13(6); ER(NI)O
 * 1999 Art 15(6)): not a Saturday or Sunday, Christmas Day, Good Friday, or a
 * bank holiday in that part of the UK.
 */
export function isWorkingDay(iso: IsoDate, nation: UkNation): boolean {
  if (isWeekend(iso) || isChristmasOrGoodFriday(iso)) return false;
  return !isUkBankHoliday(iso, nation);
}

/**
 * US federal holidays as observed (5 USC 6103): a holiday on a Saturday is
 * observed on the Friday before, and one on a Sunday on the Monday after.
 * 2027-12-31 is the observed New Year's Day 2028.
 */
export const US_FEDERAL_HOLIDAYS: readonly IsoDate[] = [
  "2025-01-01", // New Year's Day
  "2025-01-20", // Birthday of Martin Luther King, Jr.
  "2025-02-17", // Washington's Birthday
  "2025-05-26", // Memorial Day
  "2025-06-19", // Juneteenth
  "2025-07-04", // Independence Day
  "2025-09-01", // Labor Day
  "2025-10-13", // Columbus Day
  "2025-11-11", // Veterans Day
  "2025-11-27", // Thanksgiving Day
  "2025-12-25", // Christmas Day
  "2026-01-01", // New Year's Day
  "2026-01-19", // Birthday of Martin Luther King, Jr.
  "2026-02-16", // Washington's Birthday
  "2026-05-25", // Memorial Day
  "2026-06-19", // Juneteenth
  "2026-07-03", // Independence Day (observed)
  "2026-09-07", // Labor Day
  "2026-10-12", // Columbus Day
  "2026-11-11", // Veterans Day
  "2026-11-26", // Thanksgiving Day
  "2026-12-25", // Christmas Day
  "2027-01-01", // New Year's Day
  "2027-01-18", // Birthday of Martin Luther King, Jr.
  "2027-02-15", // Washington's Birthday
  "2027-05-31", // Memorial Day
  "2027-06-18", // Juneteenth (observed)
  "2027-07-05", // Independence Day (observed)
  "2027-09-06", // Labor Day
  "2027-10-11", // Columbus Day
  "2027-11-11", // Veterans Day
  "2027-11-25", // Thanksgiving Day
  "2027-12-24", // Christmas Day (observed)
  "2027-12-31", // New Year's Day 2028 (observed)
];

export function isUsBusinessDay(iso: IsoDate): boolean {
  return !isWeekend(iso) && !US_FEDERAL_HOLIDAYS.includes(iso);
}

/** `iso` itself when it is a US business day, otherwise the next one. */
export function nextBusinessDay(iso: IsoDate): IsoDate {
  let day = iso;
  while (!isUsBusinessDay(day)) day = addDays(day, 1);
  return day;
}
