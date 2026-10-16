import { describe, expect, it } from "vitest";
import { fitSubLists, subListHeight } from "./sidebarFit";

// Middle-area heights the sidebar actually gets: 480px at 1366x768, 612px at 1440x900.
const HR = { rows: 7, letterRows: 4, matterRows: 3 };

describe("fitSubLists", () => {
  it("keeps both lists open when everything fits (1440x900)", () => {
    expect(fitSubLists({ ...HR, available: 612, prefer: "letters" })).toEqual({ letters: true, matters: true });
  });

  it("folds Matters at 1366x768 so all seven rows stay in view", () => {
    // 7 rows = 292px, letters 144px, matters 110px: 546 > 480.
    expect(fitSubLists({ ...HR, available: 480, prefer: "letters" })).toEqual({ letters: true, matters: false });
  });

  it("keeps the current section's list open on a matter page", () => {
    expect(fitSubLists({ ...HR, available: 480, prefer: "matters" })).toEqual({ letters: false, matters: true });
  });

  it("keeps a long matter list open on a matter page, cut to what fits (FOUNDATION-X15)", () => {
    // 292px of rows leave 188px: five nested rows (four matters and View all).
    expect(fitSubLists({ rows: 7, letterRows: 4, matterRows: 8, available: 480, prefer: "matters" })).toEqual({
      letters: false,
      matters: true,
      matterLimit: 5,
    });
  });

  it("shows both lists on a tall screen with 13 matters, the matters cut to fit", () => {
    // 1440x900: 292 + 144 for Letters leaves 176px, four nested matter rows.
    expect(fitSubLists({ rows: 7, letterRows: 4, matterRows: 13, available: 612, prefer: "letters" })).toEqual({
      letters: true,
      matters: true,
      matterLimit: 4,
    });
  });

  it("never lets an open list push the main rows under the footer", () => {
    for (const available of [480, 540, 612, 700]) {
      for (const matterRows of [1, 3, 8, 13, 30]) {
        for (const keep of [null, "letters", "matters"] as const) {
          const plan = fitSubLists({ rows: 7, letterRows: 4, matterRows, available, prefer: "letters", keep });
          const matters = plan.matters ? subListHeight(plan.matterLimit ?? matterRows) : 0;
          const used = 7 * 40 + 6 * 2 + (plan.letters ? subListHeight(4) : 0) + matters;
          expect(used).toBeLessThanOrEqual(available);
        }
      }
    }
  });

  it("folds both on very short screens", () => {
    expect(fitSubLists({ ...HR, available: 360, prefer: "letters" })).toEqual({ letters: false, matters: false });
  });

  it("leaves both open before the area is measured", () => {
    expect(fitSubLists({ ...HR, available: 0, prefer: "letters" })).toEqual({ letters: true, matters: true });
  });

  it("counts the employee's four rows", () => {
    expect(fitSubLists({ rows: 4, letterRows: 4, matterRows: 3, available: 420, prefer: "letters" })).toEqual({
      letters: true,
      matters: true,
    });
  });
});

describe("fitSubLists with the person's chevrons", () => {
  it("folds Letters when the person opens Matters on a short screen (FOUNDATION-X11)", () => {
    expect(fitSubLists({ ...HR, available: 480, prefer: "letters", keep: "matters" })).toEqual({
      letters: false,
      matters: true,
    });
  });

  it("swaps back when the person reopens Letters", () => {
    expect(fitSubLists({ ...HR, available: 480, prefer: "letters", keep: "letters" })).toEqual({
      letters: true,
      matters: false,
    });
  });

  it("keeps both open on a tall screen whichever was opened last", () => {
    expect(fitSubLists({ ...HR, available: 612, prefer: "letters", keep: "matters" })).toEqual({
      letters: true,
      matters: true,
    });
  });

  it("keeps the list the person opened, cut to what fits when it is too long (FOUNDATION-X15)", () => {
    expect(fitSubLists({ rows: 7, letterRows: 4, matterRows: 12, available: 480, prefer: "letters", keep: "matters" })).toEqual({
      letters: false,
      matters: true,
      matterLimit: 5,
    });
  });

  it("never opens a list the person folded", () => {
    expect(fitSubLists({ ...HR, available: 612, prefer: "letters", want: { letters: false, matters: true } })).toEqual({
      letters: false,
      matters: true,
    });
    expect(fitSubLists({ ...HR, available: 0, prefer: "letters", want: { letters: true, matters: false } })).toEqual({
      letters: true,
      matters: false,
    });
  });

  it("uses the room a folded list leaves for the other one", () => {
    expect(fitSubLists({ ...HR, available: 480, prefer: "letters", want: { letters: false, matters: true } })).toEqual({
      letters: false,
      matters: true,
    });
  });

  it("ignores a kept list the person has since folded", () => {
    expect(
      fitSubLists({ ...HR, available: 480, prefer: "letters", keep: "matters", want: { letters: true, matters: false } })
    ).toEqual({ letters: true, matters: false });
  });
});
