import { describe, expect, it } from "vitest";
import { decideSectionWrite, hasAppMarks, pageFit, plainStyleLabel } from "./PagedlyDocEditor";

/**
 * Locks the Page-view (pagedly) persist guards — the fix for the cross-section
 * data-loss regression (BUGS_AND_FIXES 2026-07-02). pagedly's onChange fans out
 * over EVERY section and its sanitiser strips the app's inline markup, so the
 * write-back must only ever touch a section the user actually edited on the page
 * and never one that (a) is unchanged, (b) is streaming, (c) moved on in the
 * store since mount, or (d) carries comment/figure/suggestion markup.
 */
describe("hasAppMarks", () => {
  it("detects comment anchors, figure refs and suggestion diffs", () => {
    expect(hasAppMarks('<p>Hi <mark data-comment-id="c1">x</mark></p>')).toBe(true);
    expect(hasAppMarks('<span class="figure-ref" data-fig-id="ev1">[See Fig 1]</span>')).toBe(true);
    expect(hasAppMarks('<ins data-suggestion-id="s1" data-status="pending">new</ins>')).toBe(true);
    expect(hasAppMarks("<mark>plain highlight</mark>")).toBe(true);
  });
  it("passes clean prose", () => {
    expect(hasAppMarks("<p>Dear Alex,</p><p>Regards</p>")).toBe(false);
    expect(hasAppMarks("<ul><li>one</li><li>two</li></ul>")).toBe(false);
  });
});

describe("decideSectionWrite", () => {
  const base = { incomingHtml: "<p>new</p>", currentHtml: "<p>old</p>", baselineHtml: "<p>old</p>" };

  it("writes a genuine user edit to a clean, unchanged section", () => {
    expect(decideSectionWrite(base)).toBe("write");
  });

  it("skips no-op re-emits (reflow / remount)", () => {
    expect(decideSectionWrite({ ...base, incomingHtml: "<p>old</p>" })).toBe("noop");
  });

  it("never fights an active AI stream", () => {
    expect(decideSectionWrite({ ...base, currentStatus: "streaming" })).toBe("streaming");
  });

  it("skips a section that changed in the store since mount (external edit wins)", () => {
    // AI / another tab wrote "ai" after we mounted with baseline "old".
    expect(
      decideSectionWrite({ incomingHtml: "<p>page</p>", currentHtml: "<p>ai</p>", baselineHtml: "<p>old</p>" }),
    ).toBe("external");
  });

  it("refuses to overwrite a section carrying app markup (would strip it)", () => {
    expect(
      decideSectionWrite({
        incomingHtml: "<p>edited without the mark</p>",
        currentHtml: '<p>Hi <mark data-comment-id="c1">flagged</mark></p>',
        baselineHtml: '<p>Hi <mark data-comment-id="c1">flagged</mark></p>',
      }),
    ).toBe("marked");
  });

  it("allowMarks:true PERSISTS a marked section (review surface owns the marks)", () => {
    const marked = {
      incomingHtml: '<p>Hi <span data-comment-id="c1">flagged edited</span></p>',
      currentHtml: '<p>Hi <span data-comment-id="c1">flagged</span></p>',
      baselineHtml: '<p>Hi <span data-comment-id="c1">flagged</span></p>',
    };
    expect(decideSectionWrite(marked)).toBe("marked"); // default: refuse
    expect(decideSectionWrite({ ...marked, allowMarks: true })).toBe("write"); // review: keep
  });

  it("allowMarks:true STILL yields to streaming / external / blank guards", () => {
    const marked = '<p>Hi <span data-comment-id="c1">x</span></p>';
    // streaming wins over allowMarks
    expect(
      decideSectionWrite({ incomingHtml: "<p>new</p>", currentHtml: marked, baselineHtml: marked, currentStatus: "streaming", allowMarks: true }),
    ).toBe("streaming");
    // external (store moved since mount) wins over allowMarks
    expect(
      decideSectionWrite({ incomingHtml: "<p>page</p>", currentHtml: marked, baselineHtml: "<p>old</p>", allowMarks: true }),
    ).toBe("external");
    // blank-over-nonempty still refused
    expect(
      decideSectionWrite({ incomingHtml: "", currentHtml: marked, baselineHtml: marked, allowMarks: true }),
    ).toBe("blank");
  });

  it("never blank-overwrites non-empty stored content (reflow artifact)", () => {
    expect(decideSectionWrite({ incomingHtml: "", currentHtml: "<p>real content</p>", baselineHtml: "<p>real content</p>" })).toBe("blank");
  });

  it("allows continuous editing: after a write the baseline advances", () => {
    // Simulate: first edit writes, baseline advances to the written html, second
    // edit off that baseline is still a clean write (not flagged 'external').
    const afterFirst = "<p>new</p>";
    expect(decideSectionWrite({ incomingHtml: "<p>newer</p>", currentHtml: afterFirst, baselineHtml: afterFirst })).toBe("write");
  });
});

/** LETTER-X54: the text style menu's accessible name has no "Heading — Heading". */
describe("plainStyleLabel", () => {
  it("names the menu plainly in a paragraph", () => {
    expect(plainStyleLabel("Heading — Heading")).toBe("Text style");
  });
  it("adds the style in a heading", () => {
    expect(plainStyleLabel("Heading — Heading 2")).toBe("Text style: Heading 2");
  });
  it("leaves a plain label as it is", () => {
    expect(plainStyleLabel("Text style")).toBe("Text style");
    expect(plainStyleLabel("Text style: Heading 1")).toBe("Text style: Heading 1");
  });
});

describe("pageFit", () => {
  it("keeps the A4 layout on a laptop with the side panel open, zoomed to fit", () => {
    // 1024 wide window, side panel open: about 580px of room for the page.
    const f = pageFit(580, false);
    expect(f.phoneWidth).toBeNull();
    expect(f.zoom).toBeCloseTo(564 / 794, 3);
  });
  it("shows the page at full size when it fits", () => {
    expect(pageFit(996, false)).toEqual({ zoom: 1, phoneWidth: null });
  });
  it("narrows the page to the screen only on a phone", () => {
    expect(pageFit(390, true)).toEqual({ zoom: 1, phoneWidth: 374 });
    // A phone turned sideways still has room to zoom the A4 page.
    expect(pageFit(700, true).phoneWidth).toBeNull();
  });
  it("never zooms below 40%", () => {
    expect(pageFit(200, false).zoom).toBe(0.4);
  });
});
