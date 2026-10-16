import { describe, expect, it } from "vitest";
import {
  GB_SIX_MONTH_LIMIT_FROM,
  lastDayOfMonthsBeginningWith,
  ukLimitationMonths,
  ukTribunalLimitation,
} from "./tribunal-limitation";

describe("ukLimitationMonths", () => {
  it("switches Great Britain to six months for acts on or after 1 October 2026", () => {
    expect(GB_SIX_MONTH_LIMIT_FROM).toBe("2026-10-01");
    expect(ukLimitationMonths("2026-09-30", "England & Wales")).toBe(3);
    expect(ukLimitationMonths("2026-10-01", "England & Wales")).toBe(6);
    expect(ukLimitationMonths("2026-09-30", "Scotland")).toBe(3);
    expect(ukLimitationMonths("2026-10-01", "Scotland")).toBe(6);
  });

  it("keeps Northern Ireland at three months either side of the change", () => {
    expect(ukLimitationMonths("2026-09-30", "Northern Ireland")).toBe(3);
    expect(ukLimitationMonths("2026-10-01", "Northern Ireland")).toBe(3);
    expect(ukLimitationMonths("2028-01-01", "Northern Ireland")).toBe(3);
  });

  it("treats an unset region as Great Britain", () => {
    expect(ukLimitationMonths("2026-09-30")).toBe(3);
    expect(ukLimitationMonths("2026-10-01")).toBe(6);
  });
});

describe("lastDayOfMonthsBeginningWith (N months less one day)", () => {
  it("ends the day before the corresponding date", () => {
    expect(lastDayOfMonthsBeginningWith("2026-01-10", 3)).toBe("2026-04-09");
    expect(lastDayOfMonthsBeginningWith("2026-10-15", 6)).toBe("2027-04-14");
    expect(lastDayOfMonthsBeginningWith("2027-03-30", 6)).toBe("2027-09-29");
  });

  it("rolls back into the previous month when the act is on the 1st", () => {
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

  it("returns undefined for an invalid date", () => {
    expect(lastDayOfMonthsBeginningWith("2026-02-31", 6)).toBeUndefined();
    expect(lastDayOfMonthsBeginningWith("not-a-date", 6)).toBeUndefined();
  });
});

describe("ukTribunalLimitation", () => {
  it("gives 3 months less one day for the last day before the change", () => {
    const limit = ukTribunalLimitation("2026-09-30", "England & Wales");
    expect(limit?.months).toBe(3);
    expect(limit?.iso).toBe("2026-12-29");
    expect(limit?.basis).toContain("3 months less one day");
    expect(limit?.basis).toContain("before 1 October 2026");
  });

  it("gives 6 months less one day from 1 October 2026 in Great Britain", () => {
    const limit = ukTribunalLimitation("2026-10-01", "Scotland");
    expect(limit?.months).toBe(6);
    expect(limit?.iso).toBe("2027-03-31");
    expect(limit?.basis).toContain("6 months less one day");
    expect(limit?.basis).toContain("Employment Rights Act 2025");
    expect(limit?.basis).toContain("ACAS Early Conciliation");
    expect(limit?.basis).not.toContain("Northern Ireland");
  });

  it("gives 3 months less one day in Northern Ireland after the change", () => {
    const limit = ukTribunalLimitation("2026-10-01", "Northern Ireland");
    expect(limit?.months).toBe(3);
    expect(limit?.iso).toBe("2026-12-31");
    expect(limit?.basis).toContain("Northern Ireland");
    expect(limit?.basis).toContain("Labour Relations Agency");
    expect(limit?.basis).not.toContain("ACAS");
  });

  it("flags the Northern Ireland limit when the region is unset", () => {
    const limit = ukTribunalLimitation("2026-10-15");
    expect(limit?.iso).toBe("2027-04-14");
    expect(limit?.basis).toContain("In Northern Ireland the limit is 3 months less one day");
  });

  it("ignores a time suffix on the act date", () => {
    expect(ukTribunalLimitation("2026-10-01T09:30:00Z", "England & Wales")?.iso).toBe("2027-03-31");
  });

  it("returns undefined for an invalid act date", () => {
    expect(ukTribunalLimitation("2026-02-31", "England & Wales")).toBeUndefined();
    expect(ukTribunalLimitation("", "England & Wales")).toBeUndefined();
  });

  it("writes the basis without em dashes", () => {
    for (const [act, region] of [
      ["2026-09-30", "England & Wales"],
      ["2026-10-01", "England & Wales"],
      ["2026-10-01", undefined],
      ["2026-10-01", "Northern Ireland"],
    ] as const) {
      expect(ukTribunalLimitation(act, region)?.basis).not.toContain("\u2014");
    }
  });
});
