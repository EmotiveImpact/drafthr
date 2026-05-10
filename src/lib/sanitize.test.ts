import { describe, it, expect } from "vitest";
import { sanitizeLetterHtml } from "./sanitize";

describe("sanitizeLetterHtml", () => {
  it("strips script tags", () => {
    const out = sanitizeLetterHtml("<p>Hello</p><script>alert(1)</script>");
    expect(out).not.toContain("<script");
    expect(out).toContain("Hello");
  });

  it("strips on* event handlers", () => {
    const out = sanitizeLetterHtml('<p onclick="alert(1)">Hi</p>');
    expect(out).not.toContain("onclick");
  });

  it("preserves bold, italic, lists, tables", () => {
    const html =
      "<p><strong>Bold</strong> <em>italic</em></p><ul><li>x</li></ul><table><tr><td>y</td></tr></table>";
    const out = sanitizeLetterHtml(html);
    expect(out).toContain("<strong>");
    expect(out).toContain("<em>");
    expect(out).toContain("<ul>");
    expect(out).toContain("<table>");
  });

  it("preserves anchor href but strips javascript: schemes", () => {
    expect(sanitizeLetterHtml('<a href="https://example.com">ok</a>')).toContain('href="https://example.com"');
    const dangerous = sanitizeLetterHtml('<a href="javascript:alert(1)">x</a>');
    expect(dangerous).not.toContain("javascript:");
  });
});
