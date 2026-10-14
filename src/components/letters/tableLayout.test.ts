import { describe, expect, it } from "vitest";
import { letterTableLayout, makeMeasure, type LayoutRow, type Measure, type TableColumn } from "./tableLayout";
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
  });

  it("moves the recipient into the letter's sub line at 1024 instead of cutting names to a letter or two", () => {
    const l = letterTableLayout({ width: 660, columns: ALL, rows: ROWS, measure });
    expect(l.columns).not.toContain("recipient");
    expect(l.recipientInLetter).toBe(true);
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
  });

  it("gives spare room to the recipient's job title first", () => {
    const l = letterTableLayout({ width: 1200, columns: ALL, rows: ROWS, measure });
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
