const MS_PER_DAY = 86_400_000;

export function parseDateOnly(value: string | undefined): Date | null {
  if (!value) return null;
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(value);
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(year, month - 1, day);
  if (
    date.getFullYear() !== year ||
    date.getMonth() !== month - 1 ||
    date.getDate() !== day
  ) {
    return null;
  }
  return date;
}

export function todayDateOnly(now = new Date()): string {
  return toDateOnly(now);
}

export function toDateOnly(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function addDaysToDateOnly(iso: string, days: number): string {
  const date = parseDateOnly(iso);
  if (!date) return iso;
  date.setDate(date.getDate() + days);
  return toDateOnly(date);
}

export function addMonthsToDateOnly(iso: string, months: number): string {
  const date = parseDateOnly(iso);
  if (!date) return iso;
  // Date.setMonth overflows when the source day doesn't exist in the target
  // month (e.g. Nov 30 + 3mo → "Feb 30" → rolls into Mar 1/2). That silently
  // pushes month-end dates 1-2 days too late, which for any deadline tells
  // users they have MORE time than they do. Clamp to the last valid day.
  // (The UK tribunal limit uses lastDayOfMonthsBeginningWith in
  // tribunal-limitation.ts, which applies the corresponding date rule.)
  const day = date.getDate();
  date.setDate(1); // park on the 1st so the month shift can't overflow
  date.setMonth(date.getMonth() + months);
  const lastDay = new Date(date.getFullYear(), date.getMonth() + 1, 0).getDate();
  date.setDate(Math.min(day, lastDay));
  return toDateOnly(date);
}

export function daysUntilDateOnly(iso: string, now = new Date()): number {
  const date = parseDateOnly(iso);
  if (!date) return 9999;
  return utcDayNumber(date) - utcDayNumber(now);
}

export function formatDateOnly(
  iso: string,
  options: Intl.DateTimeFormatOptions,
  locales?: Intl.LocalesArgument
): string {
  const date = parseDateOnly(iso);
  if (!date) return iso;
  return date.toLocaleDateString(locales, options);
}

function utcDayNumber(date: Date): number {
  return Math.floor(
    Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()) / MS_PER_DAY
  );
}
