import { describe, expect, it } from "vitest";
import { diffHtmlAsSuggestion } from "./html-diff";
import { listSuggestionsHtml } from "./suggestion-merge";

const ATTRS = { author: "Claude AI", body: "Make it tribunal-ready" };

describe("diffHtmlAsSuggestion", () => {
  it("identical inputs → no <ins>/<del> marks emitted", () => {
    const html = "<p>Dear Mr Smith.</p><p>This concerns your conduct.</p>";
    const out = diffHtmlAsSuggestion(html, html, ATTRS);
    expect(out).not.toContain("<ins");
    expect(out).not.toContain("<del");
    // Sentences still rendered.
    expect(out).toContain("Dear Mr Smith.");
    expect(out).toContain("This concerns your conduct.");
  });

  it("one sentence added → exactly one <ins>", () => {
    const oldHtml = "<p>This is a warning.</p>";
    const newHtml = "<p>This is a warning. Please respond by Friday.</p>";
    const out = diffHtmlAsSuggestion(oldHtml, newHtml, ATTRS);
    const summaries = listSuggestionsHtml(out);
    expect(summaries).toHaveLength(1);
    expect(summaries[0]).toMatchObject({
      kind: "insertion",
      status: "pending",
      author: "Claude AI",
      body: "Make it tribunal-ready",
    });
    expect(summaries[0].text).toContain("Please respond by Friday.");
  });

  it("one sentence removed → exactly one <del>", () => {
    const oldHtml = "<p>This is a warning. We may escalate.</p>";
    const newHtml = "<p>This is a warning.</p>";
    const out = diffHtmlAsSuggestion(oldHtml, newHtml, ATTRS);
    const summaries = listSuggestionsHtml(out);
    expect(summaries).toHaveLength(1);
    expect(summaries[0].kind).toBe("deletion");
    expect(summaries[0].text).toContain("We may escalate.");
  });

  it("multiple changes → multiple marks with unique ids", () => {
    const oldHtml = "<p>Old sentence one. Common middle. Old sentence three.</p>";
    const newHtml = "<p>New sentence one. Common middle. New sentence three.</p>";
    const out = diffHtmlAsSuggestion(oldHtml, newHtml, ATTRS);
    const summaries = listSuggestionsHtml(out);
    // Two replaced sentences = 2 deletions + 2 insertions.
    expect(summaries.length).toBeGreaterThanOrEqual(4);
    const ids = new Set(summaries.map((s) => s.id));
    expect(ids.size).toBe(summaries.length); // All ids unique.
    expect(out).toContain("Common middle.");
    // Common chunk must NOT be wrapped as a suggestion.
    expect(out).not.toMatch(/<(ins|del)[^>]*>[^<]*Common middle/);
  });

  it("empty old → entire newHtml wrapped in <ins>", () => {
    const out = diffHtmlAsSuggestion("", "<p>Brand new content here.</p>", ATTRS);
    const summaries = listSuggestionsHtml(out);
    expect(summaries).toHaveLength(1);
    expect(summaries[0].kind).toBe("insertion");
    expect(summaries[0].text).toContain("Brand new content here.");
    expect(out).not.toContain("<del");
  });

  it("empty new → entire oldHtml wrapped in <del>", () => {
    const out = diffHtmlAsSuggestion("<p>Going away.</p>", "", ATTRS);
    const summaries = listSuggestionsHtml(out);
    expect(summaries).toHaveLength(1);
    expect(summaries[0].kind).toBe("deletion");
    expect(summaries[0].text).toContain("Going away.");
    expect(out).not.toContain("<ins");
  });

  it("emits status=pending and stamps author / body / createdAt on every mark", () => {
    const out = diffHtmlAsSuggestion(
      "<p>Old.</p>",
      "<p>New.</p>",
      { author: "Reviewer X", authorId: "u_42", body: "tighten" },
    );
    const summaries = listSuggestionsHtml(out);
    expect(summaries.length).toBeGreaterThan(0);
    for (const s of summaries) {
      expect(s.status).toBe("pending");
      expect(s.author).toBe("Reviewer X");
      expect(s.authorId).toBe("u_42");
      expect(s.body).toBe("tighten");
      expect(s.createdAt).toBeGreaterThan(0);
    }
  });

  it("handles multi-paragraph input across <p> blocks", () => {
    const oldHtml =
      "<p>Paragraph one stays the same.</p><p>Paragraph two will change.</p>";
    const newHtml =
      "<p>Paragraph one stays the same.</p><p>Paragraph two is rewritten.</p>";
    const out = diffHtmlAsSuggestion(oldHtml, newHtml, ATTRS);
    const summaries = listSuggestionsHtml(out);
    // Word-level replacement: "will/change." → "is/rewritten." = paired marks.
    const dels = summaries.filter((s) => s.kind === "deletion").map((s) => s.text.trim());
    const inss = summaries.filter((s) => s.kind === "insertion").map((s) => s.text.trim());
    expect(dels.join(" ")).toBe("will change");
    expect(inss.join(" ")).toBe("is rewritten");
    // Paragraph structure preserved: two <p> blocks, marks only in the second.
    expect(out.match(/<p>/g)).toHaveLength(2);
    expect(out).toMatch(/<p>Paragraph one stays the same\.<\/p>/);
  });

  it("WORD granularity: a one-word change marks only that word, not the sentence", () => {
    const out = diffHtmlAsSuggestion(
      "<p>Your last day of service will be 31 August 2026.</p>",
      "<p>Your last day of service will be 29 August 2026.</p>",
      ATTRS,
    );
    const summaries = listSuggestionsHtml(out);
    expect(summaries.filter((s) => s.kind === "deletion").map((s) => s.text.trim())).toEqual(["31"]);
    expect(summaries.filter((s) => s.kind === "insertion").map((s) => s.text.trim())).toEqual(["29"]);
    // The unchanged tail must NOT sit inside a mark.
    expect(out).not.toMatch(/<(ins|del)[^>]*>[^<]*August 2026/);
  });

  it("marks flow INLINE inside the sentence's <p> (no block-per-mark chopping)", () => {
    const out = diffHtmlAsSuggestion(
      "<p>Payment of £6,480 follows your notice period.</p>",
      "<p>Payment of £6,930 follows your notice period.</p>",
      ATTRS,
    );
    // One paragraph containing plain text AND the marks — a real redline.
    expect(out.match(/<p>/g)).toHaveLength(1);
    expect(out).toMatch(/<p>Payment of £6,<del/);
    expect(out).toMatch(/follows your notice period\.<\/p>/);
  });

  it("HTML-escapes user-controlled text + author so injected angles don't break the markup", () => {
    const out = diffHtmlAsSuggestion(
      "<p>Plain.</p>",
      "<p>Plain. Then &lt;script&gt;alert(1)&lt;/script&gt; payload.</p>",
      { author: 'Claude "AI" <ops>' },
    );
    // Encoded entities must round-trip — never as raw <script> tags in the
    // output. We're not building a sanitiser here, but the diff renderer
    // must not introduce XSS by failing to escape.
    expect(out).not.toMatch(/<script>/);
    expect(out).toContain("Claude &quot;AI&quot; &lt;ops&gt;");
  });

  it("a reworded clause reads as the old phrase struck, then the new phrase", () => {
    const out = diffHtmlAsSuggestion(
      "<p>Your call times are not yet complete for the other targets in the guide.</p>",
      "<p>Your call times do not yet meet the standard set out in the guide.</p>",
      ATTRS,
    );
    const summaries = listSuggestionsHtml(out);
    const dels = summaries.filter((s) => s.kind === "deletion").map((s) => s.text.trim());
    const inss = summaries.filter((s) => s.kind === "insertion").map((s) => s.text.trim());
    expect(dels).toEqual(["are not yet complete for the other targets"]);
    expect(inss).toEqual(["do not yet meet the standard set out"]);
    // Struck phrase first, inserted phrase straight after, common text outside.
    expect(out).toMatch(/Your call times <del[^>]*>are not yet complete for the other targets<\/del><ins[^>]*>do not yet meet the standard set out<\/ins> in the guide\./);
  });
});
