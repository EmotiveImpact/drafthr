import { describe, it, expect } from "vitest";
import { render } from "@testing-library/react";
import { Markdown } from "./Markdown";

/* ============================================================================
 * Markdown renders untrusted AI-chat replies. Regression: a protocol-relative
 * link like [x](//evil.com) previously passed both the DOMPurify
 * ALLOWED_URI_REGEXP and the hardenMarkdownLinks pass (the `\/` alternative
 * matched `//`), rendering a live attacker-controlled link. It must be stripped,
 * while genuine https/relative links survive.
 * ==========================================================================*/

function hrefs(container: HTMLElement): (string | null)[] {
  return Array.from(container.querySelectorAll("a")).map((a) => a.getAttribute("href"));
}

describe("Markdown link hardening", () => {
  it("strips protocol-relative links", () => {
    const { container } = render(<Markdown>{"[click](//evil.example/x)"}</Markdown>);
    // Either the anchor has no href, or its href is not the protocol-relative URL.
    expect(hrefs(container).some((h) => h && h.startsWith("//"))).toBe(false);
  });

  it("keeps safe https, mailto, fragment and absolute-path links", () => {
    const { container } = render(
      <Markdown>{"[a](https://ok.example) [b](mailto:x@y.z) [c](#sec) [d](/internal/path)"}</Markdown>
    );
    const hs = hrefs(container);
    expect(hs).toContain("https://ok.example");
    expect(hs).toContain("mailto:x@y.z");
    expect(hs).toContain("#sec");
    expect(hs).toContain("/internal/path");
  });

  it("strips javascript: links", () => {
    const { container } = render(<Markdown>{"[x](javascript:alert(1))"}</Markdown>);
    expect(hrefs(container).some((h) => h?.toLowerCase().includes("javascript:"))).toBe(false);
  });
});
