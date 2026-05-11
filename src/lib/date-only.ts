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
  date.setMonth(date.getMonth() + months);
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
