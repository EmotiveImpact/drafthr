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
    // Replacement = one removed + one inserted sentence.
    expect(summaries.filter((s) => s.kind === "deletion")).toHaveLength(1);
    expect(summaries.filter((s) => s.kind === "insertion")).toHaveLength(1);
    expect(out).toContain("Paragraph one stays the same.");
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
});
