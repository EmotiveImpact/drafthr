import { describe, expect, it } from "vitest";
import { letterSubLine, letterTableLayout, makeMeasure, type LayoutRow, type Measure, type TableColumn } from "./tableLayout";
import { tableWhereLabel } from "./letterView";

/** Roughly Inter: a fixed width per character for each text style. */
const PER_CHAR = { name: 7.6, body: 7.1, small: 6.4, matter: 6.9, where: 6.7, date: 6.9 } as const;
const measure: Measure = (text, style) => text.length * PER_CHAR[style];

const ROWS: LayoutRow[] = [
  {
    label: "Warning letter",
    subLine: "Conduct · 1 check to fix",
    recipient: "Jordan Hale",
    recipientRole: "Warehouse shift lead",
    matter: "Jordan Hale, attendance",
    where: "Draft · 1 check to fix",
    date: "Just now",
  },
  {
    label: "Probation outcome",
    subLine: "Conduct · Dana's changes to decide",
    recipient: "Sam Patel",
    recipientRole: "Customer service advisor",
    where: "Review · back to you",
    date: "40 min ago",
  },
  {
    label: "Return-to-work",
    subLine: "Absence · expert review",
    recipient: "Tom Ellis",
    recipientRole: "Delivery driver",
    matter: "Tom Ellis, return to work",
    where: "Review · with Claire Booth",
    date: "2 hours ago",
  },
];

const ALL: TableColumn[] = ["select", "letter", "recipient", "matter", "where", "health", "updated", "owner"];
const sum = (w: Partial<Record<TableColumn, number>>) => Object.values(w).reduce((a, b) => a + (b ?? 0), 0);

describe("letterTableLayout", () => {
  it("gives the matter and where columns what their longest line needs on a wide table", () => {
    const l = letterTableLayout({ width: 1076, columns: ALL, rows: ROWS, measure });
    expect(l.columns).toEqual(ALL);
    expect(l.healthCompact).toBe(false);
    // Folder icon, gap and padding around "Tom Ellis, return to work".
    expect(l.widths.matter).toBeGreaterThanOrEqual(Math.ceil(measure("Tom Ellis, return to work", "matter")) + 42);
    expect(l.widths.where).toBe(Math.ceil(measure("Review · with Claire Booth", "where")) + 20);
    // The letter column takes the rest, and that is at least what its names need.
    expect(1076 - sum(l.widths)).toBeGreaterThanOrEqual(Math.ceil(measure("Probation outcome", "name")) + 70);
  });

  it("drops '/ 100' from the health score before it drops a column", () => {
    const full = letterTableLayout({ width: 4000, columns: ALL, rows: ROWS, measure });
    const needed = sum(full.widths) - (full.widths.recipient ?? 0) + Math.ceil(measure("Jordan Hale", "body")) + 58 + 198;
    const l = letterTableLayout({ width: needed - 20, columns: ALL, rows: ROWS, measure });
    expect(l.columns).toEqual(ALL);
    expect(l.healthCompact).toBe(true);
  });

  it("lets the Matter column go on a 1280 screen rather than cutting every name", () => {
    const l = letterTableLayout({ width: 916, columns: ALL, rows: ROWS, measure });
    expect(l.columns).not.toContain("matter");
    expect(l.columns).toContain("recipient");
    expect(l.columns).toContain("updated");
    expect(l.recipientInLetter).toBe(false);
    // The matter is still in the row, leading the letter's sub line (R1-LETTERS-MATTER-COLUMN-DROPPED).
    expect(l.matterInLetter).toBe(true);
    expect(letterSubLine(ROWS[0], l)).toMatchObject({ matter: "Jordan Hale, attendance", text: "Jordan Hale, attendance · Conduct · 1 check to fix" });
    expect(letterSubLine(ROWS[1], l)).toMatchObject({ matter: undefined, text: "Conduct · Dana's changes to decide" });
  });

  it("moves the recipient into the letter's sub line at 1024 instead of cutting names to a letter or two", () => {
    const l = letterTableLayout({ width: 660, columns: ALL, rows: ROWS, measure });
    expect(l.columns).not.toContain("recipient");
    expect(l.recipientInLetter).toBe(true);
    expect(l.matterInLetter).toBe(true);
    expect(letterSubLine(ROWS[2], l).text).toBe("Tom Ellis · Tom Ellis, return to work · Absence · expert review");
    expect(l.columns).toContain("where");
    expect(l.columns).toContain("health");
    // What is left for the letter column still fits its longest name.
    expect(660 - sum(l.widths)).toBeGreaterThanOrEqual(Math.ceil(measure("Probation outcome", "name")) + 70);
  });

  it("never sets more width than the table has once it has made room", () => {
    for (const width of [1076, 1002, 916, 800, 660]) {
      const l = letterTableLayout({ width, columns: ALL, rows: ROWS, measure });
      expect(sum(l.widths)).toBeLessThanOrEqual(width);
    }
  });

  it("keeps where at its own width on a tab without recipient, so matter is not cut (LISTS-X26)", () => {
    const columns: TableColumn[] = ["letter", "matter", "where", "health", "updated", "owner"];
    const rows = ROWS.map((r) => ({ ...r, where: r.where === "Review · with Claire Booth" ? "Sent · 13 Oct" : r.where }));
    const l = letterTableLayout({ width: 1076, columns, rows, measure });
    expect(l.widths.where).toBe(Math.ceil(measure("Draft · 1 check to fix", "where")) + 20);
    expect(l.widths.matter).toBeGreaterThanOrEqual(Math.ceil(measure("Tom Ellis, return to work", "matter")) + 42);
    expect(l.recipientInLetter).toBe(false);
    expect(l.matterInLetter).toBe(false);
  });

  it("keeps the matter in its column, not the sub line, while the table is wide enough", () => {
    const l = letterTableLayout({ width: 1076, columns: ALL, rows: ROWS, measure });
    expect(l.matterInLetter).toBe(false);
    expect(letterSubLine(ROWS[0], l)).toMatchObject({ matter: undefined, text: "Conduct · 1 check to fix" });
  });

  it("shares spare room so the fewest sub lines and job titles are cut (R1-LETTERS-MATTER-COLUMN-DROPPED)", () => {
    // The widths every column needs, with nothing spare.
    const full = letterTableLayout({ width: 0, columns: ALL, rows: ROWS, measure });
    const base = letterTableLayout({ width: 4000, columns: ALL, rows: ROWS, measure });
    const needs = sum(full.widths) - (full.widths.recipient ?? 0) + Math.ceil(measure("Jordan Hale", "body")) + 58;
    const letterNeed = Math.ceil(measure("Probation outcome", "name")) + 70;
    const short = Math.ceil(measure("Conduct · 1 check to fix", "small")) + 70 - letterNeed;
    const shorter = Math.ceil(measure("Absence · expert review", "small")) + 70 - letterNeed;
    // Room for the two short sub lines, but not for the longest job title as well.
    const width = needs + letterNeed + Math.max(short, shorter) + 4;
    const l = letterTableLayout({ width, columns: ALL, rows: ROWS, measure });
    const letterW = width - sum(l.widths);
    expect(letterW - 70).toBeGreaterThanOrEqual(measure("Conduct · 1 check to fix", "small"));
    expect(letterW - 70).toBeGreaterThanOrEqual(measure("Absence · expert review", "small"));
    expect(base.widths.recipient).toBeGreaterThan(l.widths.recipient ?? 0);
  });

  it("shows a letter's sub line in full before two job titles when they compete for the room", () => {
    const rows: LayoutRow[] = [
      { label: "Offer", subLine: "Hiring · aaaaaaaaaaaaaaaaaaaaaaa", recipient: "Al", recipientRole: "Role long long long long", matter: "M", where: "Draft", date: "Now" },
      { label: "Offer", subLine: "Hiring", recipient: "Al", recipientRole: "Role long long long long", matter: "M", where: "Draft", date: "Now" },
    ];
    const full = letterTableLayout({ width: 0, columns: ALL, rows, measure });
    const letterNeed = Math.ceil(measure("Offer", "name")) + 70;
    const subNeed = 70 + measure(rows[0].subLine, "small");
    const roleRoom = Math.ceil(measure("Role long long long long", "small")) + 58 - (full.widths.recipient ?? 0);
    // Room for the long sub line, or for both job titles, but not for both.
    const spare = Math.ceil(subNeed - letterNeed) + Math.floor(roleRoom / 2);
    const width = sum(full.widths) + letterNeed + spare;
    const l = letterTableLayout({ width, columns: ALL, rows, measure });
    expect(l.widths.recipient).toBe(full.widths.recipient);
    expect(width - sum(l.widths)).toBeGreaterThanOrEqual(subNeed);
  });

  it("gives every job title its room when there is plenty", () => {
    const l = letterTableLayout({ width: 1400, columns: ALL, rows: ROWS, measure });
    expect(l.widths.recipient).toBe(Math.ceil(measure("Customer service advisor", "small")) + 58);
  });

  it("caps one very long name so it cannot push other columns out", () => {
    const rows = [...ROWS, { ...ROWS[0], matter: "A matter whose name goes on and on and on for a very long way" }];
    const l = letterTableLayout({ width: 1076, columns: ALL, rows, measure });
    expect(l.widths.matter).toBeLessThanOrEqual(230);
  });

  it("shows every column at full size before the width is known", () => {
    const l = letterTableLayout({ width: 0, columns: ALL, rows: ROWS, measure });
    expect(l.columns).toEqual(ALL);
    expect(l.healthCompact).toBe(false);
    expect(l.ownerCompact).toBe(false);
  });
});

describe("letterSubLine", () => {
  it("puts the recipient, then the matter, before the usual line", () => {
    const both = { recipientInLetter: true, matterInLetter: true };
    expect(letterSubLine({ ...ROWS[0] }, both)).toEqual({
      text: "Jordan Hale · Jordan Hale, attendance · Conduct · 1 check to fix",
      lead: "Jordan Hale",
      matter: "Jordan Hale, attendance",
      rest: "Conduct · 1 check to fix",
    });
    expect(letterSubLine({ ...ROWS[1] }, both).text).toBe("Sam Patel · Conduct · Dana's changes to decide");
    expect(letterSubLine({ ...ROWS[0] }, { recipientInLetter: false, matterInLetter: false }).text).toBe("Conduct · 1 check to fix");
  });
});

describe("makeMeasure", () => {
  it("estimates from the length where nothing is laid out", () => {
    const { measure: m, done } = makeMeasure(null);
    expect(m("abcd", "name")).toBeGreaterThan(m("ab", "name"));
    done();
  });
});

describe("tableWhereLabel", () => {
  it("shortens the two long ready lines like Send · ready", () => {
    expect(tableWhereLabel("Review · ready to send for review")).toBe("Review · ready");
    expect(tableWhereLabel("Approve · ready to send for approval")).toBe("Approve · ready");
  });

  it("leaves every other line as it is", () => {
    for (const w of ["Send · ready", "Review · back to you", "Approve · with Ruth", "Draft · 2 checks to fix", "Sent · 13 Oct"]) {
      expect(tableWhereLabel(w)).toBe(w);
    }
  });
});
