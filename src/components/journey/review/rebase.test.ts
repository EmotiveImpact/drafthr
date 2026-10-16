import { describe, expect, it } from "vitest";
import { rebaseSuggestion, sameText } from "./rebase";

const SAW =
  "<p>At the meeting we discussed your attendance, during which you were absent on three further occasions without telling your manager before your shift.</p>";
const DRAFTHR = SAW.replace(
  "without telling your manager before your shift",
  "without calling your manager before the start of your shift, as the absence procedure requires"
);
const REVIEWER = SAW.replace("your manager", "your manager, as the Attendance Policy requires,");

describe("a reviewer's suggestion replayed on today's text (REVIEW-X29)", () => {
  it("keeps the edit accepted meanwhile and adds only the reviewer's change", () => {
    const r = rebaseSuggestion(SAW, DRAFTHR, REVIEWER);
    expect(r.overlaps).toBe(false);
    expect(r.html).toBe(
      "<p>At the meeting we discussed your attendance, during which you were absent on three further occasions without calling your manager, as the Attendance Policy requires, before the start of your shift, as the absence procedure requires.</p>"
    );
  });

  it("is their suggestion as it stands when the text hasn't changed", () => {
    expect(rebaseSuggestion(SAW, SAW, REVIEWER)).toEqual({ html: REVIEWER, overlaps: false });
  });

  it("says so when their change rewrites the newer words, and keeps their version there", () => {
    const now = SAW.replace("telling your manager before your shift", "calling your manager first");
    // Different words next to each other merge cleanly.
    const apart = rebaseSuggestion(SAW, now, SAW.replace("your manager", "your line manager"));
    expect(apart).toEqual({ html: SAW.replace("telling your manager before your shift", "calling your line manager first"), overlaps: false });
    // The same words changed both ways: theirs, flagged.
    const r = rebaseSuggestion(SAW, now, SAW.replace("telling", "emailing"));
    expect(r.overlaps).toBe(true);
    expect(r.html).toContain("without emailing your manager first.");
  });

  it("makes the same change once", () => {
    expect(rebaseSuggestion(SAW, DRAFTHR, DRAFTHR)).toEqual({ html: DRAFTHR, overlaps: false });
  });

  it("keeps the tags of other paragraphs", () => {
    const base = "<p>One <strong>two</strong> three.</p><p>Four five.</p>";
    const now = "<p>One <strong>two</strong> three.</p><p>Four five six.</p>";
    const theirs = "<p>One <strong>two</strong> three and more.</p><p>Four five.</p>";
    expect(rebaseSuggestion(base, now, theirs).html).toBe("<p>One <strong>two</strong> three and more.</p><p>Four five six.</p>");
  });

  it("compares text without minding the spacing", () => {
    expect(sameText("<p>a  b</p>\n", "<p>a b</p> ")).toBe(true);
    expect(sameText("<p>a b</p>", "<p>a c</p>")).toBe(false);
  });
});
