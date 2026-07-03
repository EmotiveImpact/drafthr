import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { monthsBetween } from "@/lib/store";

// monthsBetween counts COMPLETED months of service (it reads new Date()), so
// the day-of-month matters: an employee only earns the month once the day they
// started rolls around. These thresholds gate statutory rights (e.g. the
// 2-year redundancy-pay line), so a month counted early is a real eligibility
// error, not a cosmetic one.
describe("monthsBetween", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("does not credit the current month until the start day-of-month is reached", () => {
    // Started on the 15th; evaluated on the 1st of the month two years later —
    // two weeks short of the 24-month / 2-year anniversary.
    vi.setSystemTime(new Date(2024, 11, 1, 12, 0, 0)); // 2024-12-01 (local)
    expect(monthsBetween("2022-12-15")).toBe(23);
  });

  it("credits the month exactly on the anniversary day", () => {
    vi.setSystemTime(new Date(2024, 11, 15, 12, 0, 0)); // 2024-12-15 (local)
    expect(monthsBetween("2022-12-15")).toBe(24);
  });

  it("returns 0 for a single day of service (no month completed)", () => {
    vi.setSystemTime(new Date(2024, 1, 1, 12, 0, 0)); // 2024-02-01 (local)
    expect(monthsBetween("2024-01-31")).toBe(0);
  });

  it("credits a month-end start once the shorter month completes", () => {
    // Started 31 March; April has no 31st, so the first service month completes
    // on 30 April. The raw day-of-month comparison would wrongly return 0 here.
    vi.setSystemTime(new Date(2022, 3, 30, 12, 0, 0)); // 2022-04-30 (local)
    expect(monthsBetween("2022-03-31")).toBe(1);
  });

  it("does not credit the month-end start one day early", () => {
    // 29 April is still short of the 30 April completion of the first month.
    vi.setSystemTime(new Date(2022, 3, 29, 12, 0, 0)); // 2022-04-29 (local)
    expect(monthsBetween("2022-03-31")).toBe(0);
  });

  it("credits a Jan-31 start on the leap-Feb boundary (29th)", () => {
    // Started 31 Jan 2022; on 29 Feb 2024 exactly 25 months have completed
    // (Feb has no 31st, so the month completes on its last day).
    vi.setSystemTime(new Date(2024, 1, 29, 12, 0, 0)); // 2024-02-29 (local)
    expect(monthsBetween("2022-01-31")).toBe(25);
  });

  it("counts whole years on the start-of-month boundary", () => {
    vi.setSystemTime(new Date(2024, 11, 1, 12, 0, 0)); // 2024-12-01 (local)
    expect(monthsBetween("2022-12-01")).toBe(24);
  });

  it("never returns negative for a future start date", () => {
    vi.setSystemTime(new Date(2024, 0, 1, 12, 0, 0)); // 2024-01-01 (local)
    expect(monthsBetween("2025-06-01")).toBe(0);
  });

  it("returns 0 for missing or malformed input", () => {
    vi.setSystemTime(new Date(2024, 11, 1, 12, 0, 0));
    expect(monthsBetween(undefined)).toBe(0);
    expect(monthsBetween("not-a-date")).toBe(0);
  });
});
