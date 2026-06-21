import { describe, expect, it } from "vitest";
import {
  addDaysToDateOnly,
  addMonthsToDateOnly,
  daysUntilDateOnly,
  formatDateOnly,
  parseDateOnly,
  todayDateOnly,
} from "./date-only";

describe("date-only helpers", () => {
  it("parses valid date-only strings and rejects impossible dates", () => {
    expect(parseDateOnly("2026-05-11")?.getFullYear()).toBe(2026);
    expect(parseDateOnly("2026-02-31")).toBeNull();
    expect(parseDateOnly("not-a-date")).toBeNull();
  });

  it("adds days and months without UTC date shifts", () => {
    expect(addDaysToDateOnly("2026-03-01", -1)).toBe("2026-02-28");
    expect(addMonthsToDateOnly("2026-01-10", 3)).toBe("2026-04-10");
  });

  it("clamps month-end overflow instead of rolling into the next month", () => {
    // Day doesn't exist in the +N month → clamp to that month's last day,
    // never roll forward (which would push deadlines 1-2 days too late).
    expect(addMonthsToDateOnly("2025-11-30", 3)).toBe("2026-02-28");
    expect(addMonthsToDateOnly("2025-08-31", 3)).toBe("2025-11-30");
    expect(addMonthsToDateOnly("2024-11-30", 3)).toBe("2025-02-28"); // non-leap
    expect(addMonthsToDateOnly("2024-11-29", 3)).toBe("2025-02-28"); // leap-year src
    // Regression: the "3 months less one day" deadline used to overflow to
    // 2026-03-01 (Feb 30 → Mar 2 → −1); with clamping it stays in-month.
    expect(addDaysToDateOnly(addMonthsToDateOnly("2025-11-30", 3), -1)).toBe(
      "2026-02-27",
    );
  });

  it("counts calendar days from the local date", () => {
    const now = new Date(2026, 4, 11, 23, 30);
    expect(todayDateOnly(now)).toBe("2026-05-11");
    expect(daysUntilDateOnly("2026-05-12", now)).toBe(1);
  });

  it("formats date-only values as the requested calendar day", () => {
    expect(
      formatDateOnly(
        "2026-01-01",
        { day: "numeric", month: "short", year: "numeric" },
        "en-GB"
      )
    ).toBe("1 Jan 2026");
  });
});
