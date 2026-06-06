import { describe, it, expect } from "vitest";
import { sanitizeLetterHtml, sanitizeLetterHtmlForExport } from "./sanitize";

describe("sanitizeLetterHtml — data-* attrs SURVIVE (senior sweep B1/B2)", () => {
  // Golden round-trip: USE_PROFILES used to silently strip every data-* attr,
  // which made per-suggestion Accept/Reject a no-op, froze figure re-numbering,
  // and dropped comment anchors. These assertions lock the contract.
  it("keeps suggestion-mark data attrs (data-suggestion-id / data-status / data-suggestion-kind)", () => {
    const out = sanitizeLetterHtml(
      '<p><ins data-suggestion-id="sug_1" data-suggestion-kind="insertion" data-status="accepted" class="ds-suggestion">new clause</ins></p>',
    );
    expect(out).toContain('data-suggestion-id="sug_1"');
    expect(out).toContain('data-status="accepted"');
    expect(out).toContain('data-suggestion-kind="insertion"');
  });

  it("keeps figure/attachment reference ids (data-fig-id / data-att-id)", () => {
    const out = sanitizeLetterHtml(
      '<span class="figure-ref" data-fig-id="e1">[See Fig 1]</span>' +
        '<span class="attachment-ref" data-att-id="a1">[Attachment 1]</span>',
    );
    expect(out).toContain('data-fig-id="e1"');
    expect(out).toContain('data-att-id="a1"');
  });

  it("keeps comment anchors (data-comment-id)", () => {
    const out = sanitizeLetterHtml('<mark data-comment-id="c1">flagged</mark>');
    expect(out).toContain('data-comment-id="c1"');
  });

  it("export sanitiser KEEPS figure-ref ids (needed for exhibit re-numbering) but DROPS suggestion state", () => {
    const out = sanitizeLetterHtmlForExport(
      '<span class="figure-ref" data-fig-id="e1">[See Fig 1]</span>',
    );
    expect(out).toContain('data-fig-id="e1"');
  });
});

describe("sanitizeLetterHtmlForExport — track-changes never reach a file (bug #1)", () => {
  it("removes a residual <ins> with its text (rejected/pending insertion)", () => {
    const out = sanitizeLetterHtmlForExport(
      '<p>Before <ins data-status="rejected">leaked clause</ins> after</p>',
    );
    expect(out).not.toContain("leaked clause");
    expect(out).not.toContain("<ins");
  });

  it("unwraps a residual <del>, keeping its text without strike markup", () => {
    const out = sanitizeLetterHtmlForExport(
      '<p>keep <del data-status="rejected">original</del> end</p>',
    );
    expect(out).toContain("original");
    expect(out).not.toContain("<del");
  });

  it("leaves ordinary prose untouched", () => {
    const out = sanitizeLetterHtmlForExport("<p>Plain <strong>letter</strong> body.</p>");
    expect(out).toContain("Plain");
    expect(out).toContain("<strong>letter</strong>");
  });
});

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
    expect(sanitizeLetterHtml('<a href="/internal/path">ok</a>')).toContain('href="/internal/path"');
    const dangerous = sanitizeLetterHtml('<a href="javascript:alert(1)">x</a>');
    expect(dangerous).not.toContain("javascript:");
  });

  it("strips protocol-relative links", () => {
    const out = sanitizeLetterHtml('<a href="//evil.example/path">x</a>');
    expect(out).not.toContain("href=");
  });

  it("adds noopener noreferrer to links that open a new tab", () => {
    const out = sanitizeLetterHtml('<a href="https://example.com" target="_blank">ok</a>');
    expect(out).toContain('target="_blank"');
    expect(out).toContain('rel="noopener noreferrer"');
  });

  it("preserves inline base64 images (pasted screenshots)", () => {
    const tiny =
      "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkAAIAAAoAAv/lxKUAAAAASUVORK5CYII=";
    const html = `<p>Before</p><img src="${tiny}" alt="screenshot" /><p>After</p>`;
    const out = sanitizeLetterHtml(html);
    expect(out).toContain("<img");
    expect(out).toContain('src="data:image/png;base64,');
    expect(out).toContain('alt="screenshot"');
  });

  it("strips images with non-image data: URIs", () => {
    const evil = sanitizeLetterHtml(
      '<img src="data:text/html;base64,PHNjcmlwdD5hbGVydCgxKTwvc2NyaXB0Pg==" />'
    );
    expect(evil).not.toContain("data:text/html");
  });

  it("strips SVG image payloads", () => {
    const evil = sanitizeLetterHtml(
      '<img src="data:image/svg+xml;base64,PHN2ZyBvbmxvYWQ9YWxlcnQoMSk+" />'
    );
    expect(evil).not.toContain("<img");
    expect(evil).not.toContain("svg+xml");
  });
});
