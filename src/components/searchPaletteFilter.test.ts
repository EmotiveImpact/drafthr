import { describe, expect, it } from "vitest";
import { paletteFilter } from "./searchPaletteFilter";

describe("paletteFilter", () => {
  it("does not match letters by scattered letters (tour)", () => {
    expect(paletteFilter("seed-draft", "tour", ["Warning letter Jordan Hale UK warning_letter"])).toBe(0);
    expect(paletteFilter("termination", "tour", ["Termination / Dismissal Termination Ending employment for misconduct"])).toBe(0);
  });

  it("ranks the guided tour above everything for 'tour'", () => {
    const tour = paletteFilter("help-tour", "tour", ["Replay the guided tour", "help", "tour", "guide"]);
    expect(tour).toBeGreaterThanOrEqual(0.8);
  });

  it("matches word starts and puts label matches first", () => {
    const label = paletteFilter("page-Calendar", "cal", ["Calendar", "deadlines"]);
    const keyword = paletteFilter("page-Notifications", "dead", ["Notifications", "alerts", "deadlines"]);
    expect(label).toBe(1);
    expect(keyword).toBeGreaterThan(0);
    expect(keyword).toBeLessThan(label);
  });

  it("needs every typed word", () => {
    expect(paletteFilter("x", "offer priya", ["Offer letter Priya Shah UK"])).toBeGreaterThan(0);
    expect(paletteFilter("x", "offer tom", ["Offer letter Priya Shah UK"])).toBe(0);
  });

  it("keeps substring matches (section and comment text)", () => {
    expect(paletteFilter("section-1", "ttend", ["…poor attendance in March…", "Warning letter"])).toBeGreaterThan(0);
  });

  it("matches everything when nothing is typed", () => {
    expect(paletteFilter("x", "  ", ["Anything"])).toBe(1);
  });
});
