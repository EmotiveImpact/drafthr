import { describe, expect, it } from "vitest";
import {
  addDays,
  addMonths,
  addYears,
  ageOn,
  completeMonths,
  daysBetween,
  formatIsoDate,
  formatLongDate,
  holidaysKnownFor,
  isIsoDate,
  isUkBankHoliday,
  isUsBusinessDay,
  isWorkingDay,
  lastDayOfMonthsBeginningWith,
  nextBusinessDay,
  parseIsoDate,
  UK_BANK_HOLIDAYS,
  US_FEDERAL_HOLIDAYS,
  weekday,
} from "./calendar";

describe("parse and format", () => {
  it("accepts real dates only", () => {
    expect(isIsoDate("2026-10-01")).toBe(true);
    expect(isIsoDate("2028-02-29")).toBe(true);
    expect(isIsoDate("2027-02-29")).toBe(false);
    expect(isIsoDate("2026-02-31")).toBe(false);
    expect(isIsoDate("2026-1-01")).toBe(false);
    expect(isIsoDate("not-a-date")).toBe(false);
    expect(isIsoDate(20261001)).toBe(false);
    expect(parseIsoDate("2026-13-01")).toBeNull();
  });

  it("round-trips through UTC", () => {
    const date = parseIsoDate("2026-03-29");
    expect(date?.toISOString()).toBe("2026-03-29T00:00:00.000Z");
    expect(formatIsoDate(date!)).toBe("2026-03-29");
    expect(formatLongDate("2026-11-30")).toBe("30 November 2026");
  });

  it("throws for an invalid date passed to a helper", () => {
    expect(() => addDays("2026-02-31", 1)).toThrow(RangeError);
    expect(() => lastDayOfMonthsBeginningWith("not-a-date", 6)).toThrow(RangeError);
  });
});

describe("addDays, addMonths, daysBetween", () => {
  it("adds days across months, years and the clock change", () => {
    expect(addDays("2026-10-24", 2)).toBe("2026-10-26");
    expect(addDays("2026-12-31", 1)).toBe("2027-01-01");
    expect(addDays("2026-03-01", -1)).toBe("2026-02-28");
    expect(addDays("2026-11-19", 84)).toBe("2027-02-11");
  });

  it("clamps to the month's last day instead of overflowing", () => {
    expect(addMonths("2026-01-31", 1)).toBe("2026-02-28");
    expect(addMonths("2028-01-31", 1)).toBe("2028-02-29");
    expect(addMonths("2026-11-30", 3)).toBe("2027-02-28");
    expect(addMonths("2026-03-31", -1)).toBe("2026-02-28");
    expect(addMonths("2026-10-15", 6)).toBe("2027-04-15");
    expect(addYears("2028-02-29", 1)).toBe("2029-02-28");
    expect(addYears("2026-11-06", 3)).toBe("2029-11-06");
  });

  it("counts whole days between two dates", () => {
    expect(daysBetween("2026-10-13", "2026-10-13")).toBe(0);
    expect(daysBetween("2026-10-13", "2026-10-27")).toBe(14);
    expect(daysBetween("2026-10-27", "2026-10-13")).toBe(-14);
    expect(daysBetween("2026-03-28", "2026-03-30")).toBe(2);
  });
});

// Ported from tribunal-limitation.test.ts.
describe("lastDayOfMonthsBeginningWith (N months less one day)", () => {
  it("ends the day before the corresponding date", () => {
    expect(lastDayOfMonthsBeginningWith("2026-01-10", 3)).toBe("2026-04-09");
    expect(lastDayOfMonthsBeginningWith("2026-10-15", 6)).toBe("2027-04-14");
    expect(lastDayOfMonthsBeginningWith("2027-03-30", 6)).toBe("2027-09-29");
  });

  it("rolls back into the previous month when the start is on the 1st", () => {
    expect(lastDayOfMonthsBeginningWith("2026-02-01", 3)).toBe("2026-04-30");
    expect(lastDayOfMonthsBeginningWith("2026-10-01", 6)).toBe("2027-03-31");
    expect(lastDayOfMonthsBeginningWith("2027-03-01", 6)).toBe("2027-08-31");
  });

  it("ends on the month's last day when there is no corresponding date", () => {
    // 31 March + 6 months: there is no 31 September, so 30 September.
    expect(lastDayOfMonthsBeginningWith("2027-03-31", 6)).toBe("2027-09-30");
    // Pruden v Cunard Ellerman: EDT 31 August, last day 30 November.
    expect(lastDayOfMonthsBeginningWith("2026-08-31", 3)).toBe("2026-11-30");
    expect(lastDayOfMonthsBeginningWith("2026-11-30", 3)).toBe("2027-02-28");
    expect(lastDayOfMonthsBeginningWith("2026-11-29", 3)).toBe("2027-02-28");
    expect(lastDayOfMonthsBeginningWith("2026-11-28", 3)).toBe("2027-02-27");
  });

  it("handles leap years and year rollover", () => {
    expect(lastDayOfMonthsBeginningWith("2027-08-31", 6)).toBe("2028-02-29");
    expect(lastDayOfMonthsBeginningWith("2027-09-01", 6)).toBe("2028-02-29");
    expect(lastDayOfMonthsBeginningWith("2027-11-29", 3)).toBe("2028-02-28");
    expect(lastDayOfMonthsBeginningWith("2026-12-15", 6)).toBe("2027-06-14");
  });

  it("gives 18 months for the family leave protected period", () => {
    expect(lastDayOfMonthsBeginningWith("2026-06-09", 18)).toBe("2027-12-08");
  });
});

describe("completeMonths and ageOn", () => {
  it("counts the start day in the period", () => {
    expect(completeMonths("2025-05-01", "2027-04-29")).toBe(23);
    expect(completeMonths("2025-05-01", "2027-04-30")).toBe(24);
    expect(completeMonths("2026-01-31", "2026-02-27")).toBe(0);
    expect(completeMonths("2026-01-31", "2026-02-28")).toBe(1);
    expect(completeMonths("2026-10-13", "2026-10-13")).toBe(0);
    expect(completeMonths("2026-10-13", "2026-10-01")).toBe(0);
  });

  it("gives whole years of age", () => {
    expect(ageOn("1985-06-15", "2026-06-14")).toBe(40);
    expect(ageOn("1985-06-15", "2026-06-15")).toBe(41);
    expect(ageOn("2004-02-29", "2026-02-28")).toBe(21);
    expect(ageOn("2004-02-29", "2026-03-01")).toBe(22);
  });
});

describe("weekdays", () => {
  it("numbers days from Sunday", () => {
    expect(weekday("2026-11-29")).toBe(0);
    expect(weekday("2026-11-26")).toBe(4);
    expect(weekday("2026-11-28")).toBe(6);
  });
});

describe("UK bank holidays (gov.uk)", () => {
  it("lists each nation's holidays for 2025 to 2027", () => {
    const perYear = (nation: keyof typeof UK_BANK_HOLIDAYS, year: string) =>
      UK_BANK_HOLIDAYS[nation].filter((d) => d.startsWith(year)).length;
    expect([perYear("england-wales", "2025"), perYear("england-wales", "2026"), perYear("england-wales", "2027")]).toEqual([8, 8, 8]);
    expect([perYear("scotland", "2025"), perYear("scotland", "2026"), perYear("scotland", "2027")]).toEqual([9, 10, 9]);
    expect([perYear("northern-ireland", "2025"), perYear("northern-ireland", "2026"), perYear("northern-ireland", "2027")]).toEqual([10, 10, 10]);
  });

  it("only lists weekdays, in date order", () => {
    for (const list of Object.values(UK_BANK_HOLIDAYS)) {
      for (const day of list) expect([0, 6]).not.toContain(weekday(day));
      expect([...list].sort()).toEqual(list);
    }
  });

  it("knows the days that differ by nation", () => {
    expect(isUkBankHoliday("2026-11-30", "scotland")).toBe(true); // St Andrew's Day
    expect(isUkBankHoliday("2026-11-30", "england-wales")).toBe(false);
    expect(isUkBankHoliday("2026-06-15", "scotland")).toBe(true); // World Cup bank holiday
    expect(isUkBankHoliday("2026-04-06", "scotland")).toBe(false); // no Easter Monday
    expect(isUkBankHoliday("2026-04-06", "england-wales")).toBe(true);
    expect(isUkBankHoliday("2026-07-13", "northern-ireland")).toBe(true); // Boyne, substitute day
    expect(isUkBankHoliday("2026-03-17", "northern-ireland")).toBe(true);
    expect(isUkBankHoliday("2027-01-04", "scotland")).toBe(true); // 2nd January, substitute day
    expect(isUkBankHoliday("2027-12-27", "northern-ireland")).toBe(true);
  });
});

describe("isWorkingDay (ERA 1999 s13(6))", () => {
  it("excludes weekends, Christmas Day, Good Friday and the nation's bank holidays", () => {
    expect(isWorkingDay("2026-11-27", "scotland")).toBe(true);
    expect(isWorkingDay("2026-11-28", "scotland")).toBe(false);
    expect(isWorkingDay("2026-11-30", "scotland")).toBe(false);
    expect(isWorkingDay("2026-11-30", "england-wales")).toBe(true);
    expect(isWorkingDay("2026-04-03", "scotland")).toBe(false);
    expect(isWorkingDay("2026-12-28", "northern-ireland")).toBe(false);
    // Christmas Day is excluded in any year, even beyond the holiday table.
    expect(isWorkingDay("2029-12-25", "england-wales")).toBe(false);
  });

  it("only knows bank holidays for 2025 to 2027", () => {
    expect(holidaysKnownFor("2025-01-01")).toBe(true);
    expect(holidaysKnownFor("2027-12-31")).toBe(true);
    expect(holidaysKnownFor("2028-01-03")).toBe(false);
    expect(isWorkingDay("2028-01-03", "england-wales")).toBe(true);
  });
});

describe("US federal holidays and nextBusinessDay", () => {
  it("lists observed holidays on weekdays", () => {
    expect(US_FEDERAL_HOLIDAYS.filter((d) => d.startsWith("2025"))).toHaveLength(11);
    expect(US_FEDERAL_HOLIDAYS.filter((d) => d.startsWith("2026"))).toHaveLength(11);
    // 2027 also holds 31 December, the observed New Year's Day 2028.
    expect(US_FEDERAL_HOLIDAYS.filter((d) => d.startsWith("2027"))).toHaveLength(12);
    for (const day of US_FEDERAL_HOLIDAYS) expect([0, 6]).not.toContain(weekday(day));
  });

  it("moves weekends and holidays to the next business day", () => {
    expect(nextBusinessDay("2027-05-08")).toBe("2027-05-10"); // Saturday
    expect(nextBusinessDay("2027-09-05")).toBe("2027-09-07"); // Sunday, then Labor Day
    expect(nextBusinessDay("2026-07-03")).toBe("2026-07-06"); // Independence Day observed
    expect(nextBusinessDay("2026-11-26")).toBe("2026-11-27"); // Thanksgiving
    expect(nextBusinessDay("2027-09-02")).toBe("2027-09-02");
    expect(isUsBusinessDay("2027-12-31")).toBe(false);
  });
});
